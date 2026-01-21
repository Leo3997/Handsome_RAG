import re

class TextCleaner:
    @staticmethod
    def clean(text: str) -> str:
        if not text:
            return ""
        
        # Normalize horizontal whitespace (spaces, tabs) to single space, BUT preserve newlines
        # 1. Replace tabs with spaces
        text = text.replace('\t', ' ')
        
        # 2. Collapse multiple spaces into one (excluding newlines)
        text = re.sub(r'[ \f\r\t\v]+', ' ', text)
        
        # Normalize multiple newlines to double newline (paragraph break)
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Remove zero-width spaces and other invisible characters
        text = re.sub(r'[\u200b\u200c\u200d\uFEFF]', '', text)

        
        return text.strip()
