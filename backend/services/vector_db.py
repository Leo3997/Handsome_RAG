import time
import uuid
import weaviate
import weaviate.classes.config as wvc
from weaviate.classes.query import MetadataQuery

class VectorDB:
    def __init__(self, config, embedding_fn=None, kb_id="default"):
        self.config = config
        self.embedding_fn = embedding_fn
        self.kb_id = kb_id
        self.collection_name = f"KB_{kb_id}"
        
        # Connect with retry
        max_retries = 10
        for i in range(max_retries):
            try:
                self.client = weaviate.connect_to_local(
                    host=self.config.WEAVIATE_HOST,
                    port=self.config.WEAVIATE_PORT,
                    grpc_port=self.config.WEAVIATE_GRPC_PORT
                )
                if self.client.is_live():
                    break
            except Exception as e:
                if i == max_retries - 1:
                    raise e
                print(f"Waiting for Weaviate... ({i+1}/{max_retries})")
                time.sleep(3)
        
        self._ensure_collection()

    def _ensure_collection(self):
        if not self.client.collections.exists(self.collection_name):
            self.client.collections.create(
                name=self.collection_name,
                vectorizer_config=None, # Use manual vectors
                properties=[
                    # Use whitespace tokenizer to support our Chinese char-level hack
                    wvc.Property(
                        name="text", 
                        data_type=wvc.DataType.TEXT,
                        tokenization=wvc.Tokenization.WHITESPACE
                    ),
                    wvc.Property(name="source_file", data_type=wvc.DataType.TEXT, skip_vectorization=True),
                    wvc.Property(name="file_type", data_type=wvc.DataType.TEXT, skip_vectorization=True),
                    wvc.Property(name="chunk_id", data_type=wvc.DataType.INT, skip_vectorization=True),
                    wvc.Property(name="doc_id", data_type=wvc.DataType.TEXT, skip_vectorization=True),
                    wvc.Property(name="upload_date", data_type=wvc.DataType.TEXT, skip_vectorization=True),
                    wvc.Property(name="tags", data_type=wvc.DataType.TEXT_ARRAY, skip_vectorization=True),
                    # Small-to-Big metadata
                    wvc.Property(name="is_parent", data_type=wvc.DataType.BOOL, skip_vectorization=True),
                    wvc.Property(name="parent_id", data_type=wvc.DataType.TEXT, skip_vectorization=True),
                ]
            )
        self.collection = self.client.collections.get(self.collection_name)
    
    def _preprocess_chinese(self, text):
        """
        Hack for Chinese support in Weaviate BM25/Hybrid search:
        Inserts spaces between Chinese characters to treat them as individual tokens
        with the 'whitespace' tokenizer.
        Example: "你好123" -> "你 好 123"
        """
        if not text:
            return ""
        import re
        # Insert space between Chinese characters
        # \u4e00-\u9fff is the range for CJK Unified Ideographs
        processed = ""
        for char in text:
            if re.match(r'[\u4e00-\u9fff]', char):
                processed += f" {char} "
            else:
                processed += char
        # Clean up double spaces
        return re.sub(r'\s+', ' ', processed).strip()

    
    def switch_kb(self, kb_id):
        """Switch to a different knowledge base."""
        # Ensure connection is alive
        try:
            if not self.client.is_live():
                self.client.connect()
        except:
             pass # Best effort reconnect
             
        self.kb_id = kb_id
        self.collection_name = f"KB_{kb_id}"
        self._ensure_collection()
    
    def list_all_kbs(self):
        """List all knowledge base collections."""
        try:
            collections = self.client.collections.list_all()
            return [name for name in collections.keys() if name.startswith("KB_")]
        except Exception as e:
            print(f"Error listing KBs: {e}")
            return []
    
    def delete_kb(self, kb_id):
        """Delete a knowledge base collection entirely."""
        try:
            coll_name = f"KB_{kb_id}"
            if self.client.collections.exists(coll_name):
                self.client.collections.delete(coll_name)
                return True
            return False
        except Exception as e:
            print(f"Error deleting KB {kb_id}: {e}")
            return False

    def add_documents(self, documents, metadatas, ids=None):
        """
        Batch import documents.
        documents: list of strings (text content)
        metadatas: list of dicts
        ids: list of strings (optional, but recommended for Weaviate UUIDs)
        """
        if not documents:
            return

        # Fetch vectors if not provided
        vectors = None
        if self.embedding_fn:
            vectors = self.embedding_fn(documents)

        with self.collection.batch.dynamic() as batch:
            for i, doc in enumerate(documents):
                meta = metadatas[i] if i < len(metadatas) else {}
                
                # Prepare properties
                properties = {
                    "text": self._preprocess_chinese(doc),
                    "source_file": meta.get("source_file", ""),
                    "file_type": meta.get("file_type", ""),
                    "chunk_id": int(meta.get("page_number", 0)), 
                    "doc_id": ids[i] if ids and i < len(ids) else str(uuid.uuid4()),
                    "upload_date": meta.get("upload_date", ""),
                    "is_parent": meta.get("is_parent", False),
                    "parent_id": meta.get("parent_id", "")
                }
                
                # Update ID in history if we generated one
                generated_id = properties["doc_id"]
                
                # Add object with vector
                vector = vectors[i] if vectors else None
                batch.add_object(
                    properties=properties,
                    vector=vector,
                    uuid=generated_id
                )
        
        if self.collection.batch.failed_objects:
            print(f"Failed to import {len(self.collection.batch.failed_objects)} objects")
            for fail in self.collection.batch.failed_objects[:2]:
                 print(f"Error: {fail.message}")

    def query(self, query_text, n_results=5, alpha=None):
        """
        Hybrid search (Vector + BM25).
        alpha: 0 = BM25 only, 1 = Vector only, 0.5 = Equal weight.
        If alpha is None, uses value from Config.SETTINGS.
        """
        if alpha is None:
            from config import Config
            alpha = Config.SETTINGS.get("hybrid_alpha", 0.5)
        
        # 1. Preprocess query text for Chinese BM25 matching
        processed_query = self._preprocess_chinese(query_text)
        
        # 2. Manual vectorization if needed for hybrid search in Weaviate
        vector = None
        if alpha > 0 and self.embedding_fn:
            vector = self.embedding_fn(query_text) # Use original text for vectorization

        response = self.collection.query.hybrid(
            query=processed_query,
            vector=vector,
            limit=n_results,
            alpha=alpha,
            return_metadata=MetadataQuery(score=True, distance=True)
        )
        
        results = []
        for obj in response.objects:
            text = obj.properties.get("text", "")
            parent_id = obj.properties.get("parent_id")
            source_file = obj.properties.get("source_file", "Unknown")
            
            # Small-to-Big: If this is a small chunk, fetch its parent for richer context
            if parent_id:
                parent_text = self.fetch_parent(parent_id)
                if parent_text:
                    text = parent_text
            
            results.append({
                "text": text,
                "metadata": {
                    "source_file": source_file,
                    "score": obj.metadata.score,
                    "chunk_id": obj.properties.get("chunk_id", 0),
                    "parent_id": parent_id
                }
            })
            
        # Optional: Deduplicate by parent_id if multiple small chunks hit the same parent
        if len(results) > 1:
            seen_parents = set()
            dedup_results = []
            for r in results:
                p_id = r["metadata"]["parent_id"]
                if p_id:
                    if p_id not in seen_parents:
                        seen_parents.add(p_id)
                        dedup_results.append(r)
                else:
                    dedup_results.append(r)
            return dedup_results
            
        return results

    def delete_collection(self):
        """Clear all data in current knowledge base."""
        self.client.collections.delete(self.collection_name)
        self._ensure_collection()

    def get_all_filenames(self):
        """
        Retrieves all unique source filenames.
        Weaviate aggregation is different from SQL/Chroma.
        This might be expensive on large datasets.
        """
        try:
            # simple aggregation
            response = self.collection.aggregate.over_all(
                group_by="source_file"
            )
            # response is AggregateReturn, need to iterate groups
            filenames = []
            if response.groups:
                 for group in response.groups:
                    if group.grouped_by.value:
                        filenames.append(group.grouped_by.value)
            return sorted(filenames)
        except Exception as e:
            print(f"Error getting filenames: {e}")
            return []
    
    def get_file_content(self, filename):
        try:
             # Filter by source_file
             from weaviate.classes.query import Filter
             response = self.collection.query.fetch_objects(
                filters=Filter.by_property("source_file").equal(filename),
                limit=1000 # Assume max 1000 chunks per file for now
             )
             
             # Sort by chunk_id
             # Assuming chunk_id is something like "file_chunk_1" or just int page_number
             # Our ingestor uses: f"{filename}_{sheet}_chunk_{page}" or similar string
             # Best effort sort
             chunks = sorted(response.objects, key=lambda x: x.properties.get('chunk_id', ''))
             
             # Concatenate text
             full_text = "\n\n".join([obj.properties['text'] for obj in chunks])
             return full_text if full_text else "暂无预览内容 (未索引或纯图片文件)"
             
        except Exception as e:
            print(f"Error fetching file content: {e}")
            return f"Error loading preview: {str(e)}"
    
    def fetch_parent(self, parent_id):
        """Fetches the content of a parent chunk by its ID."""
        try:
             from weaviate.classes.query import Filter
             response = self.collection.query.fetch_objects(
                filters=Filter.by_property("doc_id").equal(parent_id),
                limit=1
             )
             if response.objects:
                 return response.objects[0].properties.get("text")
             return None
        except Exception as e:
            print(f"Error fetching parent {parent_id}: {e}")
            return None

    def delete_document(self, filename):
        """
        Deletes all chunks associated with a source dictionary.
        """
        try:
            from weaviate.classes.query import Filter
            # Delete objects where source_file == filename
            result = self.collection.data.delete_many(
                where=Filter.by_property("source_file").equal(filename)
            )
            print(f"Deleted {result.successful} objects for {filename} from Weaviate.")
            return True
        except Exception as e:
            print(f"Error deleting document {filename}: {e}")
            return False

    def update_document_tags(self, filename, tags):
        """Update tags for all chunks of a document."""
        try:
            # 1. Find all objects for this file
            response = self.collection.query.fetch_objects(
                filters=weaviate.classes.query.Filter.by_property("source_file").equal(filename),
                limit=1000 # Assume file doesn't have > 1000 chunks
            )
            
            # 2. Update each object
            for obj in response.objects:
                self.collection.data.update(
                    uuid=obj.uuid,
                    properties={"tags": tags}
                )
            return True
        except Exception as e:
            print(f"Error updating tags for {filename}: {e}")
            return False

    def get_document_tags(self, filename):
        """Get tags for a document (extracting from first chunk)."""
        try:
            response = self.collection.query.fetch_objects(
                filters=weaviate.classes.query.Filter.by_property("source_file").equal(filename),
                limit=1,
                return_properties=["tags"]
            )
            if response.objects:
                return response.objects[0].properties.get("tags") or []
            return []
        except Exception as e:
            print(f"Error getting tags for {filename}: {e}")
            return []

    def get_all_docs_stats(self):
        """Get chunks count and tags for all documents using aggregation and efficient tagging."""
        stats = {}
        try:
            # 1. Get exact counts for ALL files in one aggregation call
            # This is robust and doesn't suffer from fetch_objects limits
            agg_res = self.collection.aggregate.over_all(
                group_by="source_file",
                total_count=True
            )
            
            for group in agg_res.groups:
                fname = group.grouped_by.value
                if not fname:
                    continue
                
                # Fetch tags for this document (lightweight query)
                tags = self.get_document_tags(fname)
                
                stats[fname] = {
                    "chunks": group.total_count,
                    "tags": tags
                }
                
            return stats
        except Exception as e:
            print(f"Error getting batch stats: {e}")
            return {}

    def get_count(self):
        try:
             # aggregate.over_all(total_count=True) returns AggregateReturn
             # .total_count returns int
             return self.collection.aggregate.over_all(total_count=True).total_count
        except Exception as e:
            print(f"Error getting count: {e}")
            return 0
    
    def close(self):
        self.client.close()
