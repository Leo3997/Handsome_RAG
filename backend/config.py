import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # API Keys
    DASH_SCOPE_API_KEY = os.getenv("DASH_SCOPE_API_KEY")
    
    # Paths
    BASE_DIR = os.path.dirname(os.path.abspath(__file__)) if os.path.exists('/app') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_FOLDER = os.path.join(BASE_DIR, "data")
    PROCESSED_FOLDER = os.path.join(DATA_FOLDER, "processed")
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "file")
    SLIDES_FOLDER = os.path.join(PROCESSED_FOLDER, "slides")
    
    # Auth
    JWT_SECRET = os.getenv("JWT_SECRET", "dls-rag-secret-change-in-production")
    JWT_EXPIRY_HOURS = 24
    USERS_FILE = os.path.join(BASE_DIR, "users.json")
    
    # Weaviate
    WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "weaviate")
    WEAVIATE_PORT = int(os.getenv("WEAVIATE_PORT", 8080))
    WEAVIATE_GRPC_PORT = int(os.getenv("WEAVIATE_GRPC_PORT", 50051))
    
    # Models
    TEXT_EMBEDDING_MODEL = "m3e-base"  # Local or API-based
    QWEN_LLM_MODEL = "qwen-plus"
    QWEN_VL_MODEL = "qwen-vl-plus"

    @classmethod
    def init_app(cls):
        # Ensure all necessary directories exist
        os.makedirs(cls.DATA_FOLDER, exist_ok=True)
        os.makedirs(cls.PROCESSED_FOLDER, exist_ok=True)
        os.makedirs(cls.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(cls.SLIDES_FOLDER, exist_ok=True)
        cls.load_settings()

    # Settings Persistence
    CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
    
    # Internal state for dynamic settings
    SETTINGS = {
        "llm_provider": "dashscope", # or 'deepseek', 'openai'
        "api_key": os.getenv("DASH_SCOPE_API_KEY", ""),
        "model_name": "qwen-plus",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", # Used for openai-compatible
        "top_k": 60,
        "temperature": 0.5,
        "hybrid_alpha": 0.5  # 0 = BM25 only, 1 = Vector only, 0.5 = Equal weight
    }

    @classmethod
    def load_settings(cls):
        import json
        if os.path.exists(cls.CONFIG_FILE):
             try:
                 with open(cls.CONFIG_FILE, 'r', encoding='utf-8') as f:
                     content = f.read()
                     if content.strip():
                        saved = json.loads(content)
                        cls.SETTINGS.update(saved)
                        # Sync legacy fields for compatibility
                        if cls.SETTINGS.get("llm_provider") == "dashscope":
                             cls.DASH_SCOPE_API_KEY = cls.SETTINGS.get("api_key")
                             cls.QWEN_LLM_MODEL = cls.SETTINGS.get("model_name")
             except Exception as e:
                 print(f"Error loading config.json: {e}")

    @classmethod
    def save_settings(cls, new_settings):
        import json
        cls.SETTINGS.update(new_settings)
        # Sync legacy
        if cls.SETTINGS.get("llm_provider") == "dashscope":
             cls.DASH_SCOPE_API_KEY = cls.SETTINGS.get("api_key")
             cls.QWEN_LLM_MODEL = cls.SETTINGS.get("model_name")
             
        try:
            with open(cls.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(cls.SETTINGS, f, indent=4, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error saving config: {e}")
            raise e
