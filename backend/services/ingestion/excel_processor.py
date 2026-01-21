import os
import pandas as pd

class ExcelProcessor:
    def __init__(self, config):
        self.config = config

    def process(self, file_path):
        results = []
        filename = os.path.basename(file_path)
        
        try:
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path)
                results.extend(self._process_dataframe(df, filename))
            else:
                xl = pd.ExcelFile(file_path)
                sheets = xl.sheet_names
                for sheet_name in sheets:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    results.extend(self._process_dataframe(df, filename, sheet_name))
        except Exception as e:
            print(f"Error reading Excel/CSV {file_path}: {e}")
            
        return results

    def _process_dataframe(self, df, filename, sheet_name=None):
        results = []
        if df.empty: return results
        chunk_size = 20
        num_chunks = (len(df) // chunk_size) + (1 if len(df) % chunk_size != 0 else 0)
        for i in range(num_chunks):
            start_row = i * chunk_size
            end_row = min((i + 1) * chunk_size, len(df))
            chunk_df = df.iloc[start_row:end_row]
            text_content = chunk_df.to_string(index=False)
            location = f"Sheet: {sheet_name}, Rows: {start_row}-{end_row}" if sheet_name else f"Rows: {start_row}-{end_row}"
            results.append({
                "page_number": i + 1,
                "sheet_name": sheet_name or "default",
                "text_content": f"File: {filename}\n{location}\nContent:\n{text_content}",
                "image_path": "",
                "slide_layout": "spreadsheet_data"
            })
        return results
