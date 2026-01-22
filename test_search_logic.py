import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.vector_db import VectorDB
from services.llm_service import LLMService
from config import Config

def test_search():
    cfg = Config()
    llm = LLMService(cfg)
    
    # Target KB where the file is
    kb_id = "2_3142a182"
    db = VectorDB(cfg, embedding_fn=llm.get_embedding, kb_id=kb_id)
    
    queries = [
        "能耗优化代码解析.docx",
        "能耗优化代码解析.docx 文件内容无法查看，需上传文件以获取相关信息"
    ]
    
    for q in queries:
        print(f"\n--- Testing Query: '{q}' ---")
        try:
            results = db.query(q, n_results=5)
            print(f"Total results found: {len(results)}")
            for i, r in enumerate(results):
                meta = r['metadata']
                print(f"{i+1}. Score: {meta.get('score', 0):.4f} | File: {meta.get('source_file')} | Text: {r['text'][:60]}...")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    test_search()
