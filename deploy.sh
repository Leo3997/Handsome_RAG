#!/bin/bash

# 部署脚本
echo "开始部署RAG智能知识库系统..."

# 停止现有服务
echo "停止现有服务..."
docker-compose down

# 杀死占用端口的进程
echo "清理占用端口的进程..."
lsof -ti:5174 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:8080 | xargs kill -9 2>/dev/null

# 构建并启动服务
echo "构建并启动服务..."
docker-compose up --build -d

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

echo "部署完成！"
echo "前端访问地址: http://localhost:5173"
echo "后端API地址: http://localhost:5174"
echo "Weaviate管理界面: http://localhost:8081"

# 显示日志
echo "显示服务日志..."
docker-compose logs -f
