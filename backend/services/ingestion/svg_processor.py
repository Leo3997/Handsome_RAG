import xml.etree.ElementTree as ET
import os

class SVGProcessor:
    def __init__(self, config=None):
        self.config = config

    def process(self, file_path):
        """
        Extract text content from SVG file.
        SVG is an XML-based vector image format.
        We extract content from <text>, <title>, and <desc> tags.
        """
        extracted_data = []
        try:
            # SVG can have namespaces, so we need to handle them
            # However, for simple text extraction, we can also use a more direct approach
            tree = ET.parse(file_path)
            root = tree.getroot()
            
            # Find all text elements
            # Common namespaces in SVG
            namespaces = {'svg': 'http://www.w3.org/2000/svg'}
            
            texts = []
            
            # Helper to recursively find text
            def extract_text(element):
                if element.text and element.text.strip():
                    texts.append(element.text.strip())
                for child in element:
                    extract_text(child)
                if element.tail and element.tail.strip():
                    texts.append(element.tail.strip())

            extract_text(root)
            
            full_text = " ".join(texts)
            
            if full_text.strip():
                extracted_data.append({
                    'text_content': full_text,
                    'page_number': 1
                })
                
        except Exception as e:
            print(f"Error processing SVG {file_path}: {e}")
            
        return extracted_data
