import os
import uuid
from datetime import datetime
from services.ingestion.text_cleaner import TextCleaner
from services.ingestion.chunker import Chunker
from services.ingestion.ppt_processor import PPTProcessor
from services.ingestion.pdf_processor import PDFProcessor
from services.ingestion.word_processor import WordProcessor
from services.ingestion.excel_processor import ExcelProcessor
from services.ingestion.image_processor import ImageProcessor
from services.ingestion.svg_processor import SVGProcessor

class IngestionService:
    def __init__(self, config, vector_db):
        self.config = config
        self.vector_db = vector_db
        # Initialize processors
        self.ppt_processor = PPTProcessor(config)
        self.pdf_processor = PDFProcessor(config)
        self.word_processor = WordProcessor(config)
        self.excel_processor = ExcelProcessor(config)
        self.image_processor = ImageProcessor(config)
        self.svg_processor = SVGProcessor(config)
        
        # Initialize helper modules
        # Initialize helper modules
        self.chunker = Chunker(embedding_fn=self.vector_db.embedding_fn)

    def process_file(self, file_path):
        """
        Orchestrates the ingestion process:
        1. Identify file type
        2. Extract content using appropriate processor
        3. Clean and Semantic-Chunk content (Small-to-Big)
        4. Generate embeddings and store in VectorDB
        """
        filename = os.path.basename(file_path)
        ext = filename.split('.')[-1].lower()
        
        file_stats = os.stat(file_path)
        file_size = self._format_size(file_stats.st_size)
        upload_date = datetime.fromtimestamp(file_stats.st_mtime).strftime('%Y-%m-%d')

        documents = []
        metadatas = []
        ids = []

        try:
            extracted_data = [] # List of {'text_content': str, 'page_number': int, ...}
            
            # ... (File type identification logic, unchanged) ...
            if ext in ['ppt', 'pptx']:
                extracted_data = self.ppt_processor.process(file_path)
                file_type = "ppt"
            elif ext in ['pdf']:
                extracted_data = self.pdf_processor.process(file_path)
                file_type = "pdf"
            elif ext in ['docx']:
                extracted_data = self.word_processor.process(file_path)
                file_type = "docx"
            elif ext in ['xlsx', 'xls', 'csv']:
                extracted_data = self.excel_processor.process(file_path)
                file_type = "excel"
            elif ext in ['png', 'jpg', 'jpeg']:
                extracted_data = self.image_processor.process(file_path)
                file_type = "image"
            elif ext in ['svg']:
                extracted_data = self.svg_processor.process(file_path)
                file_type = "svg"
            elif ext in ['txt', 'md']:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text_content = f.read()
                extracted_data = [{"text_content": text_content, "page_number": 1}]
                file_type = "text"
            else:
                return {"status": "skipped", "message": f"Unsupported extension: {ext}"}
            
            # RAG 2.0: Parent-Child Chunking
            for item in extracted_data:
                raw_text = item.get('text_content', '')
                cleaned_text = TextCleaner.clean(raw_text)
                if not cleaned_text or len(cleaned_text) < 5:
                    continue
                
                # 1. Store the Full Page/Block as Parent
                parent_id = str(uuid.uuid4())
                documents.append(cleaned_text)
                parent_meta = {
                    "source_file": filename,
                    "file_type": file_type,
                    "upload_date": upload_date,
                    "page_number": item.get('page_number', 0),
                    "is_parent": True,
                    "doc_id": parent_id
                }
                if 'image_url' in item: parent_meta['image_url'] = item['image_url']
                metadatas.append(parent_meta)
                ids.append(parent_id)
                
                # 2. Store Semantic Fragments as Children
                # Using semantic mode for better boundaries
                child_chunks = self.chunker.split_text(cleaned_text, mode="semantic")
                
                for i, chunk in enumerate(child_chunks):
                    # Skip if the chunk is identical to parent (no need to double store)
                    if len(child_chunks) == 1 and chunk == cleaned_text:
                        continue
                        
                    documents.append(chunk)
                    child_meta = {
                        "source_file": filename,
                        "file_type": file_type,
                        "upload_date": upload_date,
                        "page_number": item.get('page_number', 0),
                        "chunk_index": i,
                        "is_parent": False,
                        "parent_id": parent_id
                    }
                    if 'image_url' in item: child_meta['image_url'] = item['image_url']
                    metadatas.append(child_meta)
                    ids.append(str(uuid.uuid4()))
            
            if documents:
                self.vector_db.add_documents(documents, metadatas, ids)
                return {"status": "success", "total_chunks": len(documents)}
            else:
                return {"status": "warning", "message": "No content extracted"}

        except Exception as e:
            print(f"Error processing file {filename}: {e}")
            raise e

    def _format_size(self, size_bytes):
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
