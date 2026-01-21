import os
import docx

class WordProcessor:
    def __init__(self, config):
        self.config = config

    def process(self, file_path):
        results = []
        base_filename = os.path.basename(file_path).replace('.docx', '')
        
        try:
            doc = docx.Document(file_path)
            paragraph_group = []
            group_size = 5
            
            for i, para in enumerate(doc.paragraphs):
                if para.text.strip():
                    paragraph_group.append(para.text.strip())
                
                if (i + 1) % group_size == 0 and paragraph_group:
                    page_number = (i // group_size) + 1
                    results.append({
                        "page_number": page_number,
                        "text_content": "\n".join(paragraph_group),
                        "image_path": "",
                        "slide_layout": "word_document"
                    })
                    paragraph_group = []
            
            if paragraph_group:
                page_number = (i // group_size) + 1
                results.append({
                    "page_number": page_number,
                    "text_content": "\n".join(paragraph_group),
                    "image_path": "",
                    "slide_layout": "word_document"
                })

        except Exception as e:
            print(f"Error reading Word {file_path}: {e}")
            
        return results
