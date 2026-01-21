FROM nginx:alpine

# 复制构建好的前端文件
COPY frontend/dist/ /usr/share/nginx/html/

# 复制nginx配置
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# 暴露端口
EXPOSE 5173

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
