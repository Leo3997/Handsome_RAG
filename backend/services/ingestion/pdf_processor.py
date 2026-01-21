import os
import pdfplumber

class PDFProcessor:
    def __init__(self, config):
        self.config = config

    def process(self, file_path):
        results = []
        base_filename = os.path.basename(file_path).replace('.pdf', '')
        
        try:
            with pdfplumber.open(file_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    page_number = i + 1
                    text_content = page.extract_text()
                    
                    if not text_content:
                        text_content = ""

                    image_name = f"{base_filename}_page_{page_number}.jpg"
                    image_path = os.path.join(self.config.PROCESSED_FOLDER, image_name)
                    
                    results.append({
                        "page_number": page_number,
                        "text_content": text_content,
                        "image_path": image_path,
                        "slide_layout": "standard_page"
                    })
        except Exception as e:
            print(f"Error reading PDF {file_path}: {e}")
            
        return results
