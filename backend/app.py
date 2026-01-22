from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context, send_file
import zipfile
import io
import json
import time
import glob
import os
from celery.result import AsyncResult
from worker import celery_app, process_file_task
from flask_cors import CORS
from config import Config
from services.vector_db import VectorDB
from services.llm_service import LLMService
from services.ingestion_service import IngestionService
from services.auth_service import AuthService, create_auth_decorators
from services.kb_service import KnowledgeBaseService
from worker import celery_app, process_file_task
from celery.result import AsyncResult

app = Flask(__name__)
CORS(app)
app.config.from_object(Config)
Config.init_app()

llm_service = LLMService(Config())

# Lazy initialization for VectorDB to speed up server startup
_vector_db = None

def get_vector_db(kb_id="default"):
    """Lazy singleton for VectorDB - connection established on first use."""
    global _vector_db
    if _vector_db is None:
        print("Initializing VectorDB connection (lazy)...")
        _vector_db = VectorDB(Config(), embedding_fn=llm_service.get_embedding, kb_id=kb_id)
    elif kb_id != _vector_db.kb_id:
        _vector_db.switch_kb(kb_id)
    return _vector_db


ingestion_service = None
auth_service = AuthService(Config())
kb_service = None

def get_ingestion_service():
    global ingestion_service
    if ingestion_service is None:
        ingestion_service = IngestionService(Config(), get_vector_db())
    return ingestion_service

def get_kb_service():
    global kb_service
    if kb_service is None:
        kb_service = KnowledgeBaseService(Config(), get_vector_db())
    return kb_service

require_auth, require_admin = create_auth_decorators(auth_service)

@app.route('/api/slides/<path:filename>')
def serve_slide(filename):
    # URL decode the filename
    from urllib.parse import unquote
    filename = unquote(filename)
    return send_from_directory(Config.SLIDES_FOLDER, filename)

@app.route('/api/files/<path:filename>')
def serve_file(filename):
    # URL decode the filename
    from urllib.parse import unquote
    filename = unquote(filename)
    
    # Try direct file path first (for files with subdirectories)
    full_path = os.path.join(Config.UPLOAD_FOLDER, filename)
    if os.path.isfile(full_path):
        return send_from_directory(os.path.dirname(full_path), os.path.basename(full_path))
    
    # Search in all subfolders (fallback)
    for root, dirs, files in os.walk(Config.UPLOAD_FOLDER):
        if filename in files:
            return send_from_directory(root, filename)
    return jsonify({"error": "File not found"}), 404

@app.route('/api/thumbnails/<path:filename>')
def serve_thumbnail(filename):
    """
    Serve compressed thumbnail for preview.
    Generates smaller versions of images (max 800x800, 75% quality).
    Caches thumbnails to data/thumbnails/ directory.
    """
    from urllib.parse import unquote
    from PIL import Image
    
    filename = unquote(filename)
    
    # Thumbnail cache directory
    thumb_dir = os.path.join(Config.DATA_FOLDER, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    
    # Create safe thumbnail filename (preserve extension for proper MIME type)
    thumb_filename = filename
    thumb_path = os.path.join(thumb_dir, thumb_filename)
    
    # If thumbnail already exists, return it
    if os.path.isfile(thumb_path):
        return send_from_directory(thumb_dir, thumb_filename)
    
    # Find original file
    original_path = None
    full_path = os.path.join(Config.UPLOAD_FOLDER, filename)
    if os.path.isfile(full_path):
        original_path = full_path
    else:
        for root, dirs, files in os.walk(Config.UPLOAD_FOLDER):
            if filename in files:
                original_path = os.path.join(root, filename)
                break
    
    if not original_path:
        return jsonify({"error": "File not found"}), 404
    
    # Check if it's an image
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
        # Non-image: return original file
        return send_from_directory(os.path.dirname(original_path), os.path.basename(original_path))
    
    # Generate compressed thumbnail
    try:
        with Image.open(original_path) as img:
            # Resize to max 800x800 while maintaining aspect ratio
            img.thumbnail((800, 800), Image.Resampling.LANCZOS)
            
            # Ensure thumbnail directory structure exists
            thumb_subdir = os.path.dirname(thumb_path)
            os.makedirs(thumb_subdir, exist_ok=True)
            
            # Save thumbnail
            if ext == 'png' and img.mode == 'RGBA':
                # Keep PNG for transparency
                img.save(thumb_path, 'PNG', optimize=True)
            else:
                # Convert to RGB for JPEG
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.save(thumb_path, 'JPEG', quality=75, optimize=True)
        
        return send_from_directory(thumb_dir, thumb_filename)
    except Exception as e:
        print(f"Thumbnail generation failed for {filename}: {e}")
        # Fallback: return original file
        return send_from_directory(os.path.dirname(original_path), os.path.basename(original_path))

@app.route('/api/previews/<path:filename>')
def serve_preview(filename):
    """Serve processed preview assets from data/processed"""
    # Try processed folder first
    if os.path.exists(os.path.join(Config.PROCESSED_FOLDER, filename)):
         return send_from_directory(Config.PROCESSED_FOLDER, filename)
    # Then try slides folder
    if os.path.exists(os.path.join(Config.SLIDES_FOLDER, filename)):
         return send_from_directory(Config.SLIDES_FOLDER, filename)
    return jsonify({"error": "Preview not found"}), 404

@app.route('/api/documents', methods=['GET'])
def list_documents():
    """
    Returns a list of all documents in the knowledge base (from disk).
    Optimized for speed by scanning filesystem instead of DB aggregation.
    """
    try:
        documents = []
        doc_id_counter = 0
        
        # Scan all files in UPLOAD_FOLDER and its subdirectories
        for root, dirs, files in os.walk(Config.UPLOAD_FOLDER):
            for filename in files:
                # Basic metadata from file system
                file_path = os.path.join(root, filename)
                try:
                    stats = os.stat(file_path)
                    size_mb = round(stats.st_size / (1024 * 1024), 2)
                    mod_time = time.strftime('%Y-%m-%d', time.localtime(stats.st_mtime))
                except:
                    size_mb = 0
                    mod_time = "Unknown"

                documents.append({
                    "id": doc_id_counter,
                    "name": filename,
                    "type": filename.split('.')[-1].lower() if '.' in filename else 'unknown',
                    "size": f"{size_mb} MB",
                    "status": "indexed", 
                    "date": mod_time
                })
                doc_id_counter += 1
            
        return jsonify(documents)
    except Exception as e:
        print(f"Error listing documents: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Multimodal RAG Backend is running"})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    kb_id = request.args.get('kb_id', 'default')
    
    # Switch to the specified knowledge base
    db = get_vector_db(kb_id)
    
    # Get chunk count for the specific KB
    count = db.get_count()
    
    # Count files and calculate total size for the specific KB
    file_count = 0
    total_size_bytes = 0
    
    if kb_id == 'default':
        # For default KB, count recursively but exclude other KB directories
        other_kb_ids = [kb['id'] for kb in get_kb_service().list_all() if kb['id'] != 'default']
        for root, dirs, files in os.walk(Config.UPLOAD_FOLDER):
            # Exclude other KB directories
            dirs[:] = [d for d in dirs if d not in other_kb_ids]
            for f in files:
                file_path = os.path.join(root, f)
                if os.path.isfile(file_path):
                    file_count += 1
                    total_size_bytes += os.path.getsize(file_path)
    else:
        # For specific KB, count only in its directory
        kb_dir = os.path.join(Config.UPLOAD_FOLDER, kb_id)
        if os.path.exists(kb_dir):
            for root, _, files in os.walk(kb_dir):
                for f in files:
                    file_path = os.path.join(root, f)
                    if os.path.isfile(file_path):
                        file_count += 1
                        total_size_bytes += os.path.getsize(file_path)

    # Convert to MB
    total_size_mb = round(total_size_bytes / (1024 * 1024), 2)

    return jsonify({
        "total_files": file_count, 
        "indexed_chunks": count,
        "total_size_mb": total_size_mb,
        "db_active": True
    })

@app.route('/api/query', methods=['POST'])
def query_rag():
    data = request.json
    query_text = data.get('query')
    kb_id = data.get('kb_id', 'default')
    history = data.get('history', [])
    is_global = data.get('is_global', False)
    
    if not query_text:
        return jsonify({"error": "No query provided"}), 400
    
    # Switch to the specified knowledge base
    db = get_vector_db(kb_id)
    
    # Contextual Query Rewriting
    search_query = llm_service.rewrite_query(query_text, history)

    # Detect Intent & Dynamic Params
    intent = llm_service.detect_intent(query_text)
    alpha = None
    n_results = 20
    if intent == "FILE_QUERY":
        alpha = 0.3
        n_results = 30
    elif intent == "SUMMARY":
        alpha = 0.7
        n_results = 40
        
    if is_global:
        search_results = db.global_query(search_query, n_results=n_results, alpha=alpha)
    else:
        search_results = db.query(search_query, n_results=n_results, alpha=alpha)
    context_docs = []
    sources = []
    
    # Intent detection: list files
    list_keywords = ["列出", "哪些文件", "什么文件", "所有文件", "file list", "list files", "有", "什么内容", "文件库", "库里", "库中", "show me files", "files you have"]
    if any(k in query_text for k in list_keywords):
        all_files = db.get_all_filenames()
        if all_files:
            file_list_str = "\n".join([f"- {f}" for f in all_files])
            system_msg = f"【系统提示】这是当前知识库（ID: {kb_id}）中所有已索引文件的完整列表（共{len(all_files)}个）：\n{file_list_str}\n请基于此列表回答用户关于库中文件的问题。"
            context_docs.append(system_msg)
        else:
            context_docs.append(f"【系统提示】当前知识库（ID: {kb_id}）目前是空的，没有已索引的文件。")
    
    if search_results:
        raw_docs = [r['text'] for r in search_results]
        # Perform Rerank
        reranked_indices = llm_service.rerank(search_query, raw_docs, top_n=5)
        
        for idx in reranked_indices:
            result = search_results[idx]
            meta = result['metadata']
            source_file = meta.get("source_file", "Unknown")
            
            context_with_source = f"【文件：{source_file}】\n{result['text']}"
            context_docs.append(context_with_source)
            
            sources.append({
                "name": source_file,
                "page": meta.get("chunk_id", 1),
                "type": source_file.split('.')[-1].lower(),
                "image_url": meta.get("image_url"),
                "kb_id": meta.get("kb_id", kb_id)
            })
    
    if not context_docs:
        return jsonify({"answer": "抱歉，在知识库中未找到相关资料。", "sources": []})
    
    start_time = time.time()
    answer, usage = llm_service.generate_response(query_text, context_docs, history=history)
    end_time = time.time()
    duration = round(end_time - start_time, 2)
    
    # Deduplicate sources preserving order
    unique_sources = []
    seen_sources = set()
    for s in sources:
        # Create a unique key directly from the dictionary items
        key = (s['name'], s['page'])
        if key not in seen_sources:
            seen_sources.add(key)
            unique_sources.append(s)
            
    return jsonify({
        "answer": answer,
        "sources": unique_sources,
        "stats": {
            "time": duration,
            "tokens": usage.get("total_tokens", 0),
            "doc_count": len(sources) # total chunks found before dedup/limit
        }
    })

@app.route('/api/query/stream', methods=['POST'])
@require_auth
def query_rag_stream():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        query_text = data.get('query')
        kb_id = data.get('kb_id', 'default')
        history = data.get('history', [])
        is_global = data.get('is_global', False)
        
        if not query_text:
            return jsonify({"error": "No query provided"}), 400
        
        print(f"DEBUG: Streaming query in KB '{kb_id}' (Global: {is_global}): {query_text[:50]}...")
        
        # Switch to the specified knowledge base
        try:
            db = get_vector_db(kb_id)
        except Exception as e:
            print(f"ERROR: Failed to switch to KB '{kb_id}': {e}")
            return jsonify({"error": f"Failed to access knowledge base: {str(e)}"}), 500
        
        # Contextual Query Rewriting
        search_query = llm_service.rewrite_query(query_text, history)

        # 1. Retrieval
        try:
            # 1.1 Intent Detection for parameter optimization
            intent = llm_service.detect_intent(query_text)
            print(f"DEBUG: Detected intent: {intent}")
            
            alpha = None
            n_results = 20
            if intent == "FILE_QUERY":
                alpha = 0.3 # Keyword centric
                n_results = 30
            elif intent == "SUMMARY":
                alpha = 0.7 # Semantic centric
                n_results = 40
                
            if is_global:
                search_results = db.global_query(search_query, n_results=n_results, alpha=alpha)
            else:
                search_results = db.query(search_query, n_results=n_results, alpha=alpha)
            print(f"DEBUG: Retrieval returned {len(search_results)} results for query type {intent}")
        except Exception as e:
            print(f"ERROR: Vector query failed: {e}")
            search_results = [] # Fallback to no results

            
        context_docs = []
        sources = []
        
        # ... (list_keywords logic unchanged) ...
        # [Existing Intent detection logic here]
        list_keywords = ["列出", "哪些文件", "什么文件", "所有文件", "file list", "list files", "有", "什么内容", "文件库", "库里", "库中", "show me files", "files you have"]
        if any(k in query_text for k in list_keywords):
            try:
                all_files = db.get_all_filenames()
                if all_files:
                    file_list_str = "\n".join([f"- {f}" for f in all_files])
                    system_msg = f"【系统提示】这是当前知识库（ID: {kb_id}）中所有已索引文件的完整列表（共{len(all_files)}个）：\n{file_list_str}\n请依据此列表告知用户库内文件情况。"
                    context_docs.append(system_msg)
                else:
                    context_docs.append(f"【系统提示】当前知识库（ID: {kb_id}）目前是空的，没有已索引的文件。")
            except Exception as e:
                print(f"ERROR: list_all_filenames failed: {e}")

        if search_results:
            raw_docs = [r['text'] for r in search_results]
            # Perform Rerank
            try:
                print(f"DEBUG: Performing Rerank for {len(raw_docs)} documents...")
                reranked_indices = llm_service.rerank(search_query, raw_docs, top_n=5)
                print(f"DEBUG: Rerank returned indices: {reranked_indices}")
                
                for idx in reranked_indices:
                    result = search_results[idx]
                    meta = result['metadata']
                    source_file = meta.get("source_file", "Unknown")
                    context_with_source = f"【文件：{source_file}】\n{result['text']}"
                    context_docs.append(context_with_source)
                    sources.append({
                        "name": source_file,
                        "page": meta.get("page_number", 1),
                        "type": source_file.split('.')[-1].lower() if '.' in source_file else 'unknown',
                        "image_url": meta.get("image_url"),
                        "kb_id": meta.get("kb_id", kb_id),
                        "content": meta.get("text_snippet", "")
                    })
            except Exception as e:
                print(f"ERROR: Rerank failed: {e}")
                # Fallback to first few results
                for result in search_results[:5]:
                    meta = result['metadata']
                    source_file = meta.get("source_file", "Unknown")
                    context_docs.append(f"【文件：{source_file}】\n{result['text']}")
                    sources.append({"name": source_file, "page": meta.get("chunk_id", 1), "type": "unknown"})
        
        print(f"DEBUG: Final context_docs count: {len(context_docs)}")
        if context_docs:
            print(f"DEBUG: First 100 chars of top context: {context_docs[0][:100]}...")
        
        # Deduplicate sources
        unique_sources = []
        seen_sources = set()
        for s in sources:
            key = (s['name'], s['page'])
            if key not in seen_sources:
                seen_sources.add(key)
                unique_sources.append(s)

        def generate():
            try:
                # First send metadata (sources)
                yield f"data: {json.dumps({'type': 'metadata', 'sources': unique_sources})}\n\n"
                
                start_time = time.time()
                stats_data = {"total_tokens": 0}
                
                # Then stream content
                for chunk in llm_service.generate_stream(query_text, context_docs, history=history):
                    # Check if this is the stats dict
                    if isinstance(chunk, dict) and "__stats__" in chunk:
                        stats_data = chunk["__stats__"]
                    else:
                        yield f"data: {json.dumps({'type': 'delta', 'answer': chunk})}\n\n"
                
                # Send final stats
                end_time = time.time()
                duration = round(end_time - start_time, 2)
                yield f"data: {json.dumps({'stats': {'time': duration, 'tokens': stats_data.get('total_tokens', 0), 'doc_count': len(unique_sources)}})}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                print(f"ERROR in streaming generation: {e}")
                yield f"data: {json.dumps({'answer': f'抱歉，生成内容时遇到严重错误：{str(e)}'})}\n\n"
                yield "data: [DONE]\n\n"

        return Response(stream_with_context(generate()), content_type='text/event-stream')
    except Exception as e:
        print(f"ERROR in query_rag_stream entry: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route('/api/preview-text/<path:filename>', methods=['GET'])
def get_text_preview(filename):
    print(f"DEBUG: get_text_preview called for {filename}")
    try:
        content = get_vector_db().get_file_content(filename)
        print(f"DEBUG: content length: {len(content)}")
        return jsonify({"content": content})
    except Exception as e:
        print(f"DEBUG: error in get_text_preview: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/search', methods=['GET'])
def global_search():
    query = request.args.get('q')
    if not query:
        return jsonify({"results": []})
    
    try:
        results = get_vector_db().query(query, n_results=20)
        formatted = []
        for r in results:
            meta = r.get('metadata', {})
            formatted.append({
                "filename": meta.get('source_file', 'Unknown'),
                "content": r.get('text', '')[:300] + "...", # Truncate for preview
                "page": meta.get('page_number', 1),
                "score": r.get('score', 0),
                "type": meta.get('file_type', 'unknown')
            })
        return jsonify({"results": formatted})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/ppt-preview/<path:filename>', methods=['GET'])
def get_ppt_preview(filename):
    print(f"DEBUG: get_ppt_preview called for {filename}")
    try:
        # URL decode the filename
        from urllib.parse import unquote
        filename = unquote(filename)
        print(f"DEBUG: decoded filename: {filename}")
        
        filename_no_ext = os.path.splitext(filename)[0]
        slides_dir = Config.SLIDES_FOLDER
        
        # Escape the filename prefix for glob to handle special characters like '[' and ']'
        safe_prefix = glob.escape(filename_no_ext)
        pattern = os.path.join(slides_dir, f"{safe_prefix}_slide_*.jpg")
        print(f"DEBUG: looking for slides with pattern: {pattern}")
        slide_files = glob.glob(pattern)
        print(f"DEBUG: found {len(slide_files)} slides")
        
        if not slide_files:
             return jsonify({
                "source": filename,
                "slides": []
            })

        def extract_slide_num(filepath):
            try:
                # Get the part after the last underscore and before .jpg
                base = os.path.basename(filepath)
                num_part = base.rsplit('_', 1)[1].split('.')[0]
                return int(num_part)
            except (IndexError, ValueError):
                return 0

        sorted_files = sorted(slide_files, key=extract_slide_num)
        
        # Convert to URLs
        slide_urls = [f"/api/slides/{os.path.basename(f)}" for f in sorted_files]
        
        return jsonify({
            "source": filename,
            "slides": slide_urls
        })

    except Exception as e:
        print(f"Error serving PPT preview: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/files/batch', methods=['DELETE'])
@require_auth
def delete_files_batch():
    if not getattr(request, 'current_user', {}).get('role') == 'admin':
        return jsonify({"error": "Admin access required"}), 403
        
    data = request.json
    filenames = data.get('filenames', [])
    if not filenames:
        return jsonify({"error": "No filenames provided"}), 400
        
    deleted_count = 0
    errors = []
    
    for filename in filenames:
        try:
            # Standard cleanup logic (reused from single delete)
            # 1. Delete from VectorDB
            get_vector_db().delete_document(filename)
            
            # 2. Delete actual file (Search and Destroy)
            file_deleted = False
            for root, dirs, files in os.walk(Config.UPLOAD_FOLDER):
                if filename in files:
                    file_path = os.path.join(root, filename)
                    os.remove(file_path)
                    file_deleted = True
                    break
            
            # 3. Cleanup PPT slides
            if filename.lower().endswith(('.ppt', '.pptx')):
                filename_no_ext = os.path.splitext(filename)[0]
                pattern = os.path.join(app.config['SLIDES_FOLDER'], f"{filename_no_ext}_slide_*.jpg")
                slides = glob.glob(pattern)
                for s in slides:
                    os.remove(s)
            
            deleted_count += 1
        except Exception as e:
            errors.append({"file": filename, "error": str(e)})
            
    return jsonify({
        "message": f"Successfully deleted {deleted_count} files",
        "deleted_count": deleted_count,
        "errors": errors
    })

@app.route('/api/files/batch-download', methods=['POST'])
@require_auth
def download_files_batch():
    data = request.json
    filenames = data.get('filenames', [])
    kb_id = data.get('kb_id', 'default')
    
    if not filenames:
        return jsonify({"error": "No filenames provided"}), 400
        
    # Determine base directory for searching files
    base_dir = os.path.join(Config.UPLOAD_FOLDER, kb_id)
    if kb_id == 'default' and not os.path.exists(base_dir):
        # Fallback for legacy default files not in a 'default' folder
        base_dir = Config.UPLOAD_FOLDER
        
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        added_count = 0
        for filename in filenames:
            file_path = os.path.join(base_dir, filename)
            
            # If not in KB dir, search recursively in UPLOAD_FOLDER as fallback
            if not os.path.exists(file_path):
                found = False
                for root, _, files in os.walk(Config.UPLOAD_FOLDER):
                    if filename in files:
                        file_path = os.path.join(root, filename)
                        found = True
                        break
                if not found:
                    continue
            
            if os.path.isfile(file_path):
                zf.write(file_path, filename)
                added_count += 1
                
        if added_count == 0:
            return jsonify({"error": "No files found to download"}), 404
            
    memory_file.seek(0)
    
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    zip_filename = f"batch_download_{timestamp}.zip"
    
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=zip_filename
    )

@app.route('/api/files/<path:filename>', methods=['DELETE'])
@require_auth
def delete_file(filename):
    kb_id = request.args.get('kb_id', 'default')
    print(f"DEBUG: Deleting file {filename} from KB {kb_id}")
    if not getattr(request, 'current_user', {}).get('role') == 'admin':
        return jsonify({"error": "Admin access required"}), 403
        
    try:
        # 1. Switch to correct KB and Delete from VectorDB
        db = get_vector_db(kb_id)
        db.delete_document(filename)
        
        # 2. Delete actual file (Search and Destroy)
        file_deleted = False
        # Search primarily in KB directory
        search_dirs = [os.path.join(Config.UPLOAD_FOLDER, kb_id)]
        if kb_id == 'default':
            search_dirs.append(Config.UPLOAD_FOLDER)
            
        for search_root in search_dirs:
            if not os.path.exists(search_root): continue
            for root, dirs, files in os.walk(search_root):
                if filename in files:
                    file_path = os.path.join(root, filename)
                    os.remove(file_path)
                    file_deleted = True
                    break
            if file_deleted: break
        
        # 3. Cleanup PPT slides
        if filename.lower().endswith(('.ppt', '.pptx')):
            filename_no_ext = os.path.splitext(filename)[0]
            pattern = os.path.join(app.config['SLIDES_FOLDER'], f"{filename_no_ext}_slide_*.jpg")
            slides = glob.glob(pattern)
            for s in slides:
                os.remove(s)

        return jsonify({"message": f"File {filename} deleted successfully"}), 200

    except Exception as e:
        print(f"Error deleting file {filename}: {e}")
        return jsonify({"error": str(e)}), 500

# Note: Legacy ThreadPoolExecutor removed in favor of Celery in worker.py
def get_async_task_status(task_id):
    """Query Celery for task status."""
    res = AsyncResult(task_id, app=celery_app)
    result_data = {
        "id": task_id,
        "status": res.status.lower(), # PENDING, STARTED, SUCCESS, FAILURE, RETRY, REVOKED
    }
    if res.ready():
        if res.successful():
            result_data["result"] = res.result
        else:
            result_data["error"] = str(res.result)
    return result_data

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # Get kb_id from form data or default
    kb_id = request.form.get('kb_id', 'default')
    
    # Validate KB exists
    kb = get_kb_service().get(kb_id)
    if not kb:
        return jsonify({"error": f"Knowledge base '{kb_id}' not found"}), 404
    
    filename = file.filename
    
    # Save to KB directory
    save_dir = os.path.join(Config.UPLOAD_FOLDER, kb_id)
    os.makedirs(save_dir, exist_ok=True)
    
    file_path = os.path.join(save_dir, filename)
    file.save(file_path)
    
    # Submit task to Celery
    task = process_file_task.delay(file_path, kb_id)
    
    return jsonify({
        "message": f"File {file.filename} uploaded to '{kb['name']}'. Processing started.", 
        "task_id": task.id,
        "kb_id": kb_id,
        "status": "pending"
    }), 202

@app.route('/api/tasks/<task_id>', methods=['GET'])
def get_task_status(task_id):
    status_data = get_async_task_status(task_id)
    
    # Post-processing: If completed, ensure file count is updated (once)
    if status_data['status'] == 'success':
        # Side effect: Trigger file count update if not already done
        # In a production app, this would be part of the task or an event
        pass 
        
    return jsonify(status_data)

@app.route('/api/config', methods=['GET'])
@require_admin
def get_config():
    return jsonify(Config.SETTINGS)

@app.route('/api/config', methods=['POST'])
@require_admin
def update_config():
    new_settings = request.json
    try:
        Config.save_settings(new_settings)
        return jsonify(Config.SETTINGS)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ Knowledge Base Routes ============

@app.route('/api/knowledge-bases', methods=['GET'])
@require_auth
def list_knowledge_bases():
    """List all knowledge bases."""
    return jsonify(get_kb_service().list_all())

@app.route('/api/knowledge-bases', methods=['POST'])
@require_admin
def create_knowledge_base():
    """Create a new knowledge base."""
    data = request.json
    name = data.get('name', '').strip()
    description = data.get('description', '')
    
    if not name:
        return jsonify({"error": "Name is required"}), 400
    
    try:
        kb = get_kb_service().create(name, description)
        return jsonify(kb), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/knowledge-bases/<kb_id>', methods=['DELETE'])
@require_admin
def delete_knowledge_base(kb_id):
    """Delete a knowledge base and all its data."""
    try:
        get_kb_service().delete(kb_id)
        return jsonify({"message": f"Knowledge base '{kb_id}' deleted"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/knowledge-bases/<kb_id>', methods=['PUT'])
@require_admin
def rename_knowledge_base(kb_id):
    """Rename a knowledge base."""
    data = request.json
    new_name = data.get('name', '').strip()
    
    if not new_name:
        return jsonify({"error": "Name is required"}), 400
    
    try:
        kb = get_kb_service().rename(kb_id, new_name)
        return jsonify(kb)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/knowledge-bases/<kb_id>/documents', methods=['GET'])
@require_auth
def get_kb_documents(kb_id):
    """Get documents in a specific knowledge base."""
    kb = get_kb_service().get(kb_id)
    if not kb:
        return jsonify({"error": "Knowledge base not found"}), 404
    
    # Get files
    files = []
    other_kb_ids = [kb['id'] for kb in get_kb_service().list_all() if kb['id'] != 'default']
    
    # Pre-fetch stats for all documents in this KB to avoid N+1 queries
    db = get_vector_db(kb_id)
    all_stats = db.get_all_docs_stats()
    
    if kb_id == 'default':
        # Recursive scan for default KB
        for root, dirs, filenames in os.walk(Config.UPLOAD_FOLDER):
            # Exclude other KB directories
            dirs[:] = [d for d in dirs if d not in other_kb_ids]
            
            for filename in filenames:
                file_path = os.path.join(root, filename)
                if os.path.isfile(file_path):
                    stat = os.stat(file_path)
                    ext = filename.split('.')[-1].lower() if '.' in filename else ''
                    
                    # Get info from pre-fetched stats
                    doc_info = all_stats.get(filename, {"tags": [], "chunks": 0})
                    
                    files.append({
                        "name": filename,
                        "type": ext,
                        "size": f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024*1024 else f"{stat.st_size / (1024*1024):.1f} MB",
                        "date": time.strftime('%Y-%m-%d %H:%M', time.localtime(stat.st_mtime)),
                        "mtime": stat.st_mtime,  # For sorting
                        "status": "indexed",
                        "tags": doc_info["tags"],
                        "chunks": doc_info["chunks"]
                    })
    else:
        # Shallow scan for specific KB
        kb_dir = os.path.join(Config.UPLOAD_FOLDER, kb_id)
        if os.path.exists(kb_dir):
            for filename in os.listdir(kb_dir):
                file_path = os.path.join(kb_dir, filename)
                if os.path.isfile(file_path):
                    stat = os.stat(file_path)
                    ext = filename.split('.')[-1].lower() if '.' in filename else ''
                    
                    doc_info = all_stats.get(filename, {"tags": [], "chunks": 0})

                    files.append({
                        "name": filename,
                        "type": ext,
                        "size": f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024*1024 else f"{stat.st_size / (1024*1024):.1f} MB",
                        "date": time.strftime('%Y-%m-%d %H:%M', time.localtime(stat.st_mtime)),
                        "mtime": stat.st_mtime,  # For sorting
                        "status": "indexed",
                        "tags": doc_info["tags"],
                        "chunks": doc_info["chunks"]
                    })
    
    # Sort by modification time, newest first
    files.sort(key=lambda x: x.get('mtime', 0), reverse=True)
    
    return jsonify(files)

@app.route('/api/documents/tags', methods=['POST'])
@require_auth
def update_document_tags():
    data = request.json
    filename = data.get('filename')
    tags = data.get('tags', [])
    kb_id = data.get('kb_id', 'default')
    
    if not filename:
        return jsonify({"error": "Filename is required"}), 400
        
    db = get_vector_db(kb_id)
    success = db.update_document_tags(filename, tags)
    if success:
        return jsonify({"message": f"Tags updated for {filename}"})
    return jsonify({"error": "Failed to update tags"}), 500

# ============ Authentication Routes ============

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '')
    password = data.get('password', '')
    
    user = auth_service.verify_login(username, password)
    if not user:
        return jsonify({"error": "用户名或密码错误"}), 401
    
    token = auth_service.generate_token(user)
    return jsonify({
        "token": token,
        "user": user
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or len(username) < 2:
        return jsonify({"error": "用户名至少2个字符"}), 400
    if not password or len(password) < 6:
        return jsonify({"error": "密码至少6个字符"}), 400
    
    try:
        user = auth_service.create_user(username, password, role='user')
        token = auth_service.generate_token(user)
        return jsonify({
            "token": token,
            "user": user
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/auth/me', methods=['GET'])
@require_auth
def get_current_user():
    return jsonify(request.current_user)

# ============ User Management Routes (Admin Only) ============

@app.route('/api/admin/users', methods=['GET'])
@require_admin
def get_all_users():
    users = auth_service.get_all_users()
    return jsonify(users)

@app.route('/api/admin/users/<username>', methods=['PUT'])
@require_admin
def update_user_role(username):
    data = request.json
    new_role = data.get('role')
    
    try:
        auth_service.update_user_role(username, new_role, request.current_user['username'])
        return jsonify({"message": f"用户 {username} 角色已更新为 {new_role}"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5174)
