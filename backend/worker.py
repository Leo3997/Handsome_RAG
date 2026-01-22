import os
import sys
from celery import Celery
from config import Config
from services.vector_db import VectorDB
from services.llm_service import LLMService
from services.ingestion_service import IngestionService
from services.kb_service import KnowledgeBaseService

# Add parent directory to path to ensure imports work when running as a module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load and Initialize Config
config = Config()
config.init_app()

# Initialize shared services for worker
llm_service = LLMService(config)
# KnowledgeBaseService requires a vector_db instance for its constructor
base_db = VectorDB(config, embedding_fn=llm_service.get_embedding, kb_id="default")
kb_service = KnowledgeBaseService(config, base_db)

def create_celery():
    celery = Celery(
        'dls_rag_worker',
        broker=config.CELERY_BROKER_URL,
        backend=config.CELERY_RESULT_BACKEND
    )
    return celery

celery_app = create_celery()

@celery_app.task(name="process_file_task", bind=True, max_retries=3)
def process_file_task(self, file_path, kb_id):
    """
    Background task to process an uploaded file.
    """
    filename = os.path.basename(file_path)
    print(f"[*] Task started: Processing {filename} for KB: {kb_id}")
    
    try:
        # Initialize specialized DB and Ingestion service for this task
        # Note: VectorDB connection is established per-task/per-worker
        db = VectorDB(config, embedding_fn=llm_service.get_embedding, kb_id=kb_id)
        service = IngestionService(config, db)
        
        result = service.process_file(file_path)
        
        # Update knowledge base file count
        kb_service.update_file_count(kb_id)
        
        print(f"[+] Task success: {filename} processed.")
        return result
    except Exception as e:
        print(f"[-] Task error for {filename}: {e}")
        # Retry after 60 seconds if it's a transient error
        raise self.retry(exc=e, countdown=60)

if __name__ == '__main__':
    # This allows running the worker directly for debug, 
    # but normally should be started via: celery -A worker.celery_app worker --loglevel=info
    celery_app.start()
