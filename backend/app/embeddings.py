from functools import lru_cache
import numpy as np
from sentence_transformers import SentenceTransformer
from app.config import settings

@lru_cache(maxsize=1)
def get_model():
    return SentenceTransformer(settings.embedding_model)

def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = get_model().encode(texts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
    return vectors.astype(float).tolist()

def cosine_scores(query_vector: list[float], vectors: list[list[float]]) -> list[float]:
    q = np.asarray(query_vector, dtype=np.float32)
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.size == 0:
        return []
    q_norm = np.linalg.norm(q) or 1.0
    norms = np.linalg.norm(matrix, axis=1)
    denom = np.maximum(norms * q_norm, 1e-12)
    return (matrix @ q) / denom
