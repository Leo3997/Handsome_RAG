import re
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter

class Chunker:
    def __init__(self, chunk_size=800, chunk_overlap=100, embedding_fn=None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.embedding_fn = embedding_fn
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", "。", "！", "？", " ", ""]
        )

    def split_sentences(self, text):
        """Simple regex-based sentence splitter for Chinese/English."""
        # Split by typical sentence enders but keep them
        sentences = re.split(r'(?<=[。！？\?!\n])', text)
        return [s.strip() for s in sentences if s.strip()]

    def cosine_similarity(self, v1, v2):
        if v1 is None or v2 is None: return 0
        v1, v2 = np.array(v1), np.array(v2)
        return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

    def semantic_split(self, text, threshold=0.85):
        """
        Groups sentences into chunks based on semantic similarity.
        """
        if not self.embedding_fn:
            return self.splitter.split_text(text)

        sentences = self.split_sentences(text)
        if len(sentences) < 2:
            return sentences

        # Batch encode sentences
        embeddings = self.embedding_fn(sentences)
        if not embeddings or len(embeddings) != len(sentences):
            return self.splitter.split_text(text)

        chunks = []
        current_chunk_sentences = [sentences[0]]
        
        for i in range(1, len(sentences)):
            sim = self.cosine_similarity(embeddings[i-1], embeddings[i])
            
            # If similarity is low, it's a semantic break
            # OR if the current chunk is getting too big
            current_len = sum(len(s) for s in current_chunk_sentences)
            
            if sim < threshold or current_len > self.chunk_size:
                chunks.append(" ".join(current_chunk_sentences))
                current_chunk_sentences = [sentences[i]]
            else:
                current_chunk_sentences.append(sentences[i])
        
        if current_chunk_sentences:
            chunks.append(" ".join(current_chunk_sentences))
            
        return chunks

    def split_text(self, text: str, mode="semantic"):
        if mode == "semantic":
            try:
                return self.semantic_split(text)
            except Exception as e:
                print(f"Semantic split failed: {e}. Falling back to recursive.")
                return self.splitter.split_text(text)
        return self.splitter.split_text(text)

