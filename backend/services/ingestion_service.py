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
        self.chunker = Chunker()

    def process_file(self, file_path):
        """
        Orchestrates the ingestion process:
        1. Identify file type
        2. Extract content using appropriate processor
        3. Clean and Chunk content
        4. Generate embeddings and store in VectorDB
        """
        filename = os.path.basename(file_path)
        ext = filename.split('.')[-1].lower()
        
        file_stats = os.stat(file_path)
        file_size = self._format_size(file_stats.st_size)
        upload_date = datetime.fromtimestamp(file_stats.st_mtime).strftime('%Y-%m-%d')

        documents = []
        metadatas = []
        ids = [] # Weaviate might auto-generate IDs, but we can provide UUIDs if we want. 
                 # For simplicity, we'll let Weaviate handle UUIDs or generate deterministic ones if needed.
                 # Updated VectorDB.add_documents handles ids optionally.

        try:
            extracted_data = []
            
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
            else:
                print(f"Skipping unsupported file type: {ext}")
                return {"status": "skipped", "message": f"Unsupported extension: {ext}"}
            
            # Process extracted data (cleaning + chunking)
            chunk_counter = 0
            for item in extracted_data:
                raw_text = item.get('text_content', '')
                cleaned_text = TextCleaner.clean(raw_text)
                
                if not cleaned_text:
                    continue
                    
                chunks = self.chunker.split_text(cleaned_text)
                
                for i, chunk in enumerate(chunks):
                    documents.append(chunk)
                    
                    # Construct metadata
                    meta = {
                        "source_file": filename,
                        "file_type": file_type,
                        "file_size": file_size,
                        "upload_date": upload_date,
                        "page_number": item.get('page_number', 0),
                        "chunk_index": i,
                        "global_chunk_id": chunk_counter
                        # Note: image_url logic from previous PPT processor might be lost if not stored 
                        # in vector DB, but VectorDB focuses on text search. 
                        # If we need to link back to slide image, we should add it.
                    }
                    if 'image_url' in item:
                        meta['image_url'] = item['image_url']
                        
                    metadatas.append(meta)
                    
                    # Create a deterministic ID? 
                    # user_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"{filename}_{item.get('page_number')}_{i}")
                    # ids.append(str(user_id))
                    ids.append(None) # Let Weaviate decide or VectorDB handle it
                    
                    chunk_counter += 1
            
            if documents:
                self.vector_db.add_documents(documents, metadatas, ids)
                return {"status": "success", "chunks_processed": len(documents)}
            else:
                return {"status": "warning", "message": "No content extracted or text was empty"}

        except Exception as e:
            print(f"Error processing file {filename}: {e}")
            raise e

    def _format_size(self, size_bytes):
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
