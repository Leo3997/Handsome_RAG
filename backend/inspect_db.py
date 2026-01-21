import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import weaviate
from config import Config

def inspect():
    Config.init_app()
    client = weaviate.connect_to_local()
    try:
        c_name = "KB_default"
        # Test the newly refactored get_all_docs_stats
        from services.vector_db import VectorDB
        from services.llm_service import LLMService
        llm = LLMService(Config())
        db = VectorDB(Config(), embedding_fn=llm.get_embedding, kb_id="default")
        
        print("\nTESTING_FETCH_ALL_STATS:")
        stats = db.get_all_docs_stats()
        print(f"FILES_FOUND_IN_DB: {len(stats)}")
        for f, info in list(stats.items())[:10]: # Print first 10
            print(f" - {f}: {info['chunks']} chunks, tags: {info['tags']}")
        
        db.close()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    inspect()
