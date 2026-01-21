# DLS-RAG 系统云服务器部署指南

本指南介绍如何将 DLS-RAG 系统部署到 Linux 云服务器（以 Ubuntu 22.04 为例）。

---

## 📋 前提条件

### 服务器要求

- **操作系统**: Ubuntu 20.04/22.04 LTS（推荐）
- **内存**: ≥ 4GB RAM
- **硬盘**: ≥ 20GB 可用空间
- **开放端口**: 80, 443, 5173（前端）, 5174（后端）, 8080（Weaviate）

### 需要安装的软件

- Docker & Docker Compose
- Python 3.10+
- Nginx（用于反向代理）

---

## 📦 第一步：准备部署文件

### 1.1 在本地构建前端

```bash
cd frontend
npm install
npm run build
```

构建完成后会生成 `dist/` 文件夹。

### 1.2 需要上传的文件清单

将以下文件/文件夹打包上传到服务器：

```
DLS_RAG/
├── backend/                    # 后端代码
│   ├── app.py
│   ├── config.py
│   ├── requirements.txt
│   ├── .env                    # 环境变量（含 API 密钥）
│   ├── services/               # 服务模块
│   └── knowledge_bases.json
├── dist/                       # 前端构建产物
├── file/                       # 知识库文件存储
├── data/                       # 数据目录
├── docker-compose.yml          # Docker 配置
├── knowledge_bases.json        # 知识库配置
├── users.json                  # 用户数据
└── ingest_existing_files.py    # 索引脚本（可选）
```

> [!WARNING]
> **不要上传以下内容：**
>
> - `node_modules/` - 体积过大且不需要
> - `backend/venv/` - 在服务器重新创建
> - `backend/__pycache__/` - Python 缓存
> - `.git/` - Git 版本控制

### 1.3 打包上传

```bash
# 在本地项目根目录执行
tar -czvf dls-rag-deploy.tar.gz \
    backend/app.py \
    backend/config.py \
    backend/requirements.txt \
    backend/.env \
    backend/services \
    backend/knowledge_bases.json \
    dist \
    file \
    data \
    docker-compose.yml \
    knowledge_bases.json \
    users.json \
    ingest_existing_files.py

# 上传到服务器
scp dls-rag-deploy.tar.gz user@your-server:/home/user/
```

---

## 🖥️ 第二步：服务器环境配置

### 2.1 连接服务器并解压

```bash
ssh user@your-server
cd /home/user
tar -xzvf dls-rag-deploy.tar.gz
cd DLS_RAG  # 或你解压后的目录名
```

### 2.2 安装 Docker & Docker Compose

```bash
# 更新包索引
sudo apt update && sudo apt upgrade -y

# 安装 Docker
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker

# 安装 Docker Compose
sudo apt install -y docker-compose

# 将当前用户添加到 docker 组（免 sudo）
sudo usermod -aG docker $USER
newgrp docker
```

### 2.3 安装 Python 环境

```bash
# 安装 Python 3.10 和 pip
sudo apt install -y python3.10 python3.10-venv python3-pip

# 进入后端目录
cd backend

# 创建虚拟环境
python3.10 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2.4 安装 Nginx

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## ⚙️ 第三步：配置服务

### 3.1 修改后端环境变量

编辑 `backend/.env` 文件，确保 API 密钥正确：

```bash
nano backend/.env
```

```env
DASH_SCOPE_API_KEY=your-actual-api-key
JWT_SECRET=your-strong-secret-key
WEAVIATE_HOST=localhost
WEAVIATE_PORT=8080
```

### 3.2 修改后端配置（如需要）

如果服务器 IP 或端口有变化，编辑 `backend/config.py`：

```python
# Weaviate 配置
WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost")
WEAVIATE_PORT = int(os.getenv("WEAVIATE_PORT", 8080))
```

### 3.3 配置 Nginx 反向代理

创建 Nginx 配置文件：

```bash
sudo nano /etc/nginx/sites-available/dls-rag
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 或服务器 IP

    # 前端静态文件
    location / {
        root /home/user/DLS_RAG/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # SSE 流式响应支持
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    # 静态文件（上传的知识库文件）
    location /files/ {
        alias /home/user/DLS_RAG/file/;
    }

    # 处理后的文件（如 PPT 幻灯片图片）
    location /processed/ {
        alias /home/user/DLS_RAG/data/processed/;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/dls-rag /etc/nginx/sites-enabled/
sudo nginx -t  # 测试配置
sudo systemctl reload nginx
```

---

## 🚀 第四步：启动服务

### 4.1 启动 Weaviate 向量数据库

```bash
cd /home/user/DLS_RAG
docker-compose up -d

# 检查是否启动成功
docker ps
# 应该看到 weaviate 容器在运行
```

### 4.2 启动后端服务

**方式一：直接运行（测试用）**

```bash
cd backend
source venv/bin/activate
python app.py
```

**方式二：使用 systemd 服务（生产推荐）**

创建服务文件：

```bash
sudo nano /etc/systemd/system/dls-rag.service
```

写入以下内容：

```ini
[Unit]
Description=DLS-RAG Backend Service
After=network.target docker.service

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/DLS_RAG/backend
Environment="PATH=/home/user/DLS_RAG/backend/venv/bin"
ExecStart=/home/user/DLS_RAG/backend/venv/bin/python app.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable dls-rag
sudo systemctl start dls-rag

# 检查状态
sudo systemctl status dls-rag
```

### 4.3 重新索引知识库（如需要）

如果 `file/` 目录中有现有文件需要索引：

```bash
cd /home/user/DLS_RAG
source backend/venv/bin/activate
python ingest_existing_files.py
```

---

## ✅ 第五步：验证部署

### 5.1 检查各服务状态

```bash
# Weaviate
curl http://localhost:8080/v1/.well-known/ready
# 应返回：{"status":"OK"}

# 后端 API
curl http://localhost:5174/api/health
# 应返回：{"status":"healthy","message":"Multimodal RAG Backend is running"}

# Nginx
curl http://your-server-ip/
# 应返回前端页面
```

### 5.2 访问系统

在浏览器中访问：

```
http://your-server-ip/
```

或使用域名（如已配置）：

```
http://your-domain.com/
```

---

## 🔧 常见问题排查

### 问题 1：后端无法连接 Weaviate

```bash
# 检查 Weaviate 容器状态
docker ps
docker logs <container_id>

# 确保端口可访问
curl http://localhost:8080/v1/.well-known/ready
```

### 问题 2：前端 API 请求 404

检查 Nginx 配置中 `proxy_pass` 地址是否正确，确保后端在 5174 端口运行。

### 问题 3：文件上传失败

```bash
# 检查目录权限
chmod -R 755 /home/user/DLS_RAG/file
chmod -R 755 /home/user/DLS_RAG/data
```

### 问题 4：查看后端日志

```bash
# 如果使用 systemd
sudo journalctl -u dls-rag -f

# 如果直接运行
# 日志会直接输出在终端
```

---

## 📊 服务管理命令速查

| 操作            | 命令                                    |
| --------------- | --------------------------------------- |
| 启动 Weaviate   | `docker-compose up -d`                  |
| 停止 Weaviate   | `docker-compose down`                   |
| 启动后端        | `sudo systemctl start dls-rag`          |
| 停止后端        | `sudo systemctl stop dls-rag`           |
| 重启后端        | `sudo systemctl restart dls-rag`        |
| 查看后端日志    | `sudo journalctl -u dls-rag -f`         |
| 重载 Nginx      | `sudo systemctl reload nginx`           |
| 查看 Nginx 日志 | `sudo tail -f /var/log/nginx/error.log` |

---

## 🔒 安全建议（生产环境）

1. **配置 HTTPS**：使用 Let's Encrypt 免费证书

   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

2. **修改 JWT 密钥**：在 `.env` 中设置强密码

   ```env
   JWT_SECRET=your-very-strong-random-secret-key
   ```

3. **配置防火墙**：

   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

4. **定期备份数据**：
   ```bash
   # 备份知识库文件和用户数据
   tar -czvf backup-$(date +%Y%m%d).tar.gz file/ data/ users.json knowledge_bases.json
   ```

---

## 📝 更新部署

当有代码更新时：

```bash
# 1. 上传新文件

# 2. 重启后端
sudo systemctl restart dls-rag

# 3. 如果前端有更新，替换 dist/ 目录
# Nginx 会自动提供新静态文件，无需重启
```

---

> [!TIP]
> 如需帮助，可查阅项目 README.md 或提交 Issue。
