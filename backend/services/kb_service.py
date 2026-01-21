"""
Knowledge Base Management Service
"""
import json
import os
import shutil
from datetime import datetime

KB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'knowledge_bases.json')

class KnowledgeBaseService:
    def __init__(self, config, vector_db):
        self.config = config
        self.vector_db = vector_db
        self._ensure_file()
    
    def _ensure_file(self):
        if not os.path.exists(KB_FILE):
            self._save([{
                "id": "default",
                "name": "默认知识库",
                "description": "系统默认知识库",
                "created_at": datetime.now().isoformat(),
                "file_count": 0
            }])
    
    def _load(self):
        try:
            with open(KB_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []
    
    def _save(self, data):
        with open(KB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def list_all(self):
        """List all knowledge bases with updated file counts."""
        kbs = self._load()
        other_kb_ids = [kb['id'] for kb in kbs if kb['id'] != 'default']
        
        # Update file counts from filesystem
        for kb in kbs:
            kb_id = kb['id']
            if kb_id == 'default':
                # Recursive count for default KB, excluding other KB folders
                file_count = 0
                for root, dirs, files in os.walk(self.config.UPLOAD_FOLDER):
                    # Skip other KB directories
                    dirs[:] = [d for d in dirs if d not in other_kb_ids]
                    file_count += len([f for f in files if os.path.isfile(os.path.join(root, f))])
                kb['file_count'] = file_count
            else:
                kb_dir = os.path.join(self.config.UPLOAD_FOLDER, kb_id)
                if os.path.exists(kb_dir):
                    kb['file_count'] = len([f for f in os.listdir(kb_dir) if os.path.isfile(os.path.join(kb_dir, f))])
                else:
                    kb['file_count'] = 0
        return kbs
    
    def get(self, kb_id):
        """Get a specific knowledge base."""
        kbs = self._load()
        for kb in kbs:
            if kb['id'] == kb_id:
                return kb
        return None
    
    def create(self, name, description=""):
        """Create a new knowledge base."""
        kbs = self._load()
        
        # Generate safe ASCII ID
        import re
        import uuid
        # Only keep alphanumeric and underscore, start with kb_
        safe_name = "".join(re.findall(r'[a-zA-Z0-9]+', name.lower()))
        if not safe_name:
            safe_name = "kb"
        kb_id = f"{safe_name}_{uuid.uuid4().hex[:8]}"
        
        # Ensure uniqueness (though uuid should handle it)
        
        # Create entry
        new_kb = {
            "id": kb_id,
            "name": name,
            "description": description,
            "created_at": datetime.now().isoformat(),
            "file_count": 0
        }
        kbs.append(new_kb)
        self._save(kbs)
        
        # Create files directory
        kb_dir = os.path.join(self.config.UPLOAD_FOLDER, kb_id)
        os.makedirs(kb_dir, exist_ok=True)
        
        # Ensure Weaviate collection exists
        self.vector_db.switch_kb(kb_id)
        
        return new_kb
    
    def delete(self, kb_id):
        """Delete a knowledge base and all its data."""
        if kb_id == "default":
            raise ValueError("Cannot delete default knowledge base")
        
        kbs = self._load()
        kbs = [kb for kb in kbs if kb['id'] != kb_id]
        self._save(kbs)
        
        # Delete files directory
        kb_dir = os.path.join(self.config.UPLOAD_FOLDER, kb_id)
        if os.path.exists(kb_dir):
            shutil.rmtree(kb_dir)
        
        # Delete Weaviate collection
        self.vector_db.delete_kb(kb_id)
        
        return True
    
    def rename(self, kb_id, new_name):
        """Rename a knowledge base."""
        if kb_id == "default":
            raise ValueError("Cannot rename default knowledge base")
        
        kbs = self._load()
        for kb in kbs:
            if kb['id'] == kb_id:
                kb['name'] = new_name
                self._save(kbs)
                return kb
        
        raise ValueError(f"Knowledge base '{kb_id}' not found")
    
    def update_file_count(self, kb_id):
        """Update file count for a knowledge base."""
        kbs = self._load()
        other_kb_ids = [kb['id'] for kb in kbs if kb['id'] != 'default']
        
        for kb in kbs:
            if kb['id'] == kb_id:
                if kb_id == 'default':
                    file_count = 0
                    for root, dirs, files in os.walk(self.config.UPLOAD_FOLDER):
                        dirs[:] = [d for d in dirs if d not in other_kb_ids]
                        file_count += len([f for f in files if os.path.isfile(os.path.join(root, f))])
                    kb['file_count'] = file_count
                else:
                    kb_dir = os.path.join(self.config.UPLOAD_FOLDER, kb_id)
                    if os.path.exists(kb_dir):
                        kb['file_count'] = len([f for f in os.listdir(kb_dir) if os.path.isfile(os.path.join(kb_dir, f))])
                break
        self._save(kbs)
