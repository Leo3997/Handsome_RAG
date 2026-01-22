import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Set environment variables for local script execution
os.environ.setdefault('WEAVIATE_HOST', 'localhost')
os.environ.setdefault('WEAVIATE_PORT', '8081')

# Load environment variables from backend/.env explicitly
from dotenv import load_dotenv
env_path = os.path.join(os.getcwd(), 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"Loaded environment from {env_path}")

from config import Config
from services.vector_db import VectorDB
from services.llm_service import LLMService
from services.ingestion_service import IngestionService

def batch_reindex():
    print("="*40)
    print("  DLS-RAG Batch Re-indexing Tool")
    print("="*40)
    
    Config.init_app()
    config_inst = Config()
    
    # Initialize Core Services with injection pattern
    try:
        print("Initializing services...")
        llm_service = LLMService(config_inst)
        vector_db = VectorDB(config_inst, embedding_fn=llm_service.get_embedding)
        ingestion_service = IngestionService(config_inst, vector_db)
        print("Services initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize services: {e}")
        return

    # Define File Directory
    file_dir = os.path.join(os.getcwd(), 'file')
    if not os.path.exists(file_dir):
        print(f"Error: Directory {file_dir} not found.")
        return

    # Clear existing collection
    print("\n[STEP 1] Clearing existing Weaviate collection...")
    try:
        vector_db.delete_collection()
        print("  Core collection cleared.")
    except Exception as e:
        print(f"  Warning clearing collection: {e}")

    # Walk and Process
    print("\n[STEP 2] Walking through 'file/' directory...")
    success_count = 0
    fail_count = 0
    
    for root, dirs, files in os.walk(file_dir):
        # Skip internal data folders if they happen to be inside file/
        if 'processed' in root or '.git' in root:
            continue
            
        for f in files:
            file_path = os.path.join(root, f)
            print(f"  Indexing: {f}...")
            
            try:
                result = ingestion_service.process_file(file_path)
                status = result.get('status')
                if status == 'success':
                    # Fix: ingestion_service returns 'total_chunks', not 'chunks_processed'
                    chunks = result.get('total_chunks', 0)
                    print(f"    [OK] Extracted and stored {chunks} chunks (Parent + Children).")
                    success_count += 1
                elif status == 'skipped':
                     print(f"    [SKIP] {result.get('message')}")
                else:
                    print(f"    [WARN] {result.get('message')}")
            except Exception as e:
                print(f"    [ERR] Failed: {e}")
                fail_count += 1
    
    # Close connection
    vector_db.close()
    
    print("\n" + "="*40)
    print("Re-indexing Completed.")
    print(f"  Successfully re-indexed: {success_count} files")
    print(f"  Failed:                  {fail_count} files")
    print("="*40)
    print("TIP: You may need to restart the backend service to sync everything.")

if __name__ == "__main__":
    batch_reindex()
