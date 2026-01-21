from langchain_text_splitters import RecursiveCharacterTextSplitter

class Chunker:
    def __init__(self, chunk_size=500, chunk_overlap=100):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=[
                "\n\n",
                "\n",
                "。",  # Chinese period
                "！",  # Chinese exclamation mark
                "？",  # Chinese question mark
                " ",
                ""
            ]
        )

    def split_text(self, text: str):
        """
        Splits text into chunks.
        Returns a list of strings.
        """
        return self.splitter.split_text(text)
