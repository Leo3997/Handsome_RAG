@echo off

start cmd /k "cd backend && venv\Scripts\activate && python app.py"
start cmd /k "cd backend && venv\Scripts\activate && celery -A worker.celery_app worker --loglevel=info -P solo"
start cmd /k "cd frontend && npm run dev"
