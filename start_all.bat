@echo off
docker-compose up -d
start cmd /k "cd backend && venv\Scripts\activate && python app.py"
start cmd /k "cd frontend && npm run dev"
