# DLS-RAG 2.0: 工业级多模态智能知识库系统

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)

DLS-RAG 是一个基于 **RAG 2.0** 架构的高性能多模态知识库系统。它不仅支持传统文档的深度解析，还集成了语义切片（Semantic Chunking）、父子块检索（Small-to-Big Retrieval）以及混合搜索（Hybrid Search）等前沿 Retrieval-Augmented Generation 技术，旨在为企业提供极致精准的知识检索与问答体验。

---

## ✨ 核心特性

### 🔍 RAG 2.0 搜索架构

- **语义化切片 (Semantic Chunking)**：基于嵌入模型计算句子间的相似度，动态确定切分边界，确保每个分块内容的逻辑完整性。
- **Small-to-Big 检索策略**：
  - **子块 (Children)**：精细粒度切片，用于高精度向量匹配。
  - **父块 (Parent)**：完整段落或页面，在检索命中后自动回捞，为 LLM 提供更丰富的上下文。
- **混合检索 (Hybrid Search)**：结合 Weaviate 的 BM25 关键词检索与 Dense Vector 语义检索，并针对中文进行了分词优化。
- **Rerank 重排序**：集成 DashScope 的 `gte-rerank` 模型，对初步检索结果进行二次精排。

### 🖼️ 多模态文档解析

- **全格式支持**：PPT/PPTX (带预览图)、PDF、Word、Excel、Markdown、TXT。
- **图像识别 (VLM)**：集成 Qwen-VL 等多模态模型，支持 PNG/JPG 图片内容的文字描述生成与检索。
- **SVG 深度解析**：支持 SVG 向量图形的文本提取与索引。

### 🚀 极致用户体验 (Frontend UX)

- **流式响应**：基于 SSE 的实时打字机效果。
- **可视化预览**：PPT 幻灯片逐页预览、PDF 预览、代码高亮渲染。
- **极致性能**：前端使用 **SWR** 进行高效数据缓存与静默更新，配合 **Skeleton Screen** 减少白屏焦虑。
- **异步处理**：长文档上传采用后台异步任务流，支持实时进度反馈。

---

## 🏗️ 技术栈

| 领域                | 技术选型                                           |
| :------------------ | :------------------------------------------------- |
| **LLM / Embedding** | DashScope (Qwen-Max, text-embedding-v2), DeepSeek  |
| **Vector DB**       | Weaviate (支持 Hybrid Search 与 Aggregation)       |
| **Backend**         | Flask, LangChain, Sentence-Transformers            |
| **Frontend**        | React 19, TypeScript, Vite, TailwindCSS, Shadcn UI |
| **State/Cache**     | SWR, React Context                                 |
| **Infrastructure**  | Docker Compose, Windows Batch Scripts              |

---

## 📁 项目结构

```
DLS_RAG/
├── backend/                 # 后端 Python 服务
│   ├── services/
│   │   ├── ingestion/       # 文档解析引擎 (PDF, PPT, Image, SVG...)
│   │   ├── rag/             # RAG 核心算法逻辑
│   │   ├── vector_db.py     # Weaviate 驱动层
│   │   └── llm_service.py   # 模型交互层 (支持 Streaming, Rerank, Rewrite)
│   └── app.py               # API 入口与路由管理
├── frontend/               # 前端 React 应用
│   ├── src/
│   │   ├── components/     # UI 库与业务组件
│   │   ├── hooks/          # 自定义 Hook (useApi, useSWR)
│   │   └── pages/          # 知识库管理、聊天、搜索页面
├── data/                    # 持久化目录 (存储索引后的分块信息及幻灯片预览图)
└── start_all.bat           # 一键启动脚本 (Docker + Backend + Frontend)
```

---

## 🚀 快速开始

### 预备环境

- Python 3.10+ & Node.js 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 步骤 1：启动基础设施

在项目根目录下，使用 Docker 启动向量数据库：

```powershell
docker-compose up -d
```

### 步骤 2：后端环境配置

1. 进入 `backend` 目录，创建并激活虚拟环境：
   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. 安装依赖：
   ```powershell
   pip install -r requirements.txt
   ```
3. 配置 `.env` 文件：
   ```env
   DASHSCOPE_API_KEY=your_key_here
   ```

### 步骤 3：一键启动

在项目根目录运行：

```powershell
.\start_all.bat
```

- 前端地址：`http://localhost:5173`
- 后端地址：`http://localhost:5000`

---

## 📝 路线图 (Roadmap)

- [x] RAG 2.0 Core (Small-to-Big, Semantic Chunking)
- [x] 多模态支持 (Image, SVG, PPT)
- [x] SWR 缓存优化
- [ ] 知识库文件批量导出与备份
- [ ] 引用源高亮定位 (Citations Preview)
- [ ] 多轮对话主题分类管理

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可协议。
