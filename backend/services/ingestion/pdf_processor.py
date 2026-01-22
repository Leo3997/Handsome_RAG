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
                    image_path = os.path.join(self.config.SLIDES_FOLDER, image_name)
                    image_url = f"/api/slides/{image_name}"
                    
                    # Optional: Try to render page to image
                    try:
                        # Only try if we have the folder (which we should)
                        img = page.to_image(resolution=72)
                        img.save(image_path, format="JPEG")
                    except Exception as e:
                        # Gracefully fail if rendering is not supported on the system
                        # print(f"  Note: PDF page rendering skipped: {e}")
                        image_url = None
                    
                    results.append({
                        "page_number": page_number,
                        "text_content": text_content,
                        "image_url": image_url,
                        "slide_layout": "standard_page"
                    })
        except Exception as e:
            print(f"Error reading PDF {file_path}: {e}")
            
        return results
