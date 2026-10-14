from pathlib import Path
import fitz
from docx import Document as DocxDocument
from app.config import settings

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}

def extract_pages(filename: str, content: bytes) -> list[tuple[int | None, str]]:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        pages = []
        with fitz.open(stream=content, filetype="pdf") as pdf:
            for i, page in enumerate(pdf):
                text = page.get_text("text").strip()
                if text:
                    pages.append((i + 1, text))
        return pages
    if ext == ".docx":
        import io
        doc = DocxDocument(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return [(None, text)] if text.strip() else []
    if ext == ".txt":
        text = content.decode("utf-8", errors="replace").strip()
        return [(None, text)] if text else []
    raise ValueError("Unsupported file type. Upload PDF, DOCX, or TXT.")

def chunk_pages(pages: list[tuple[int | None, str]]) -> list[tuple[int | None, str]]:
    size = max(200, settings.chunk_size)
    overlap = min(max(0, settings.chunk_overlap), size // 2)
    chunks = []
    for page_number, text in pages:
        text = " ".join(text.split())
        start = 0
        while start < len(text):
            piece = text[start:start + size].strip()
            if piece:
                chunks.append((page_number, piece))
            if start + size >= len(text):
                break
            start += size - overlap
    return chunks
