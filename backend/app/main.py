from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Depends, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.config import settings
from app.database import Base, engine, get_db
from app.models import Document, Chunk, Conversation, Message
from app.schemas import ChatRequest, ChatResponse, Citation, DocumentOut, ConversationOut, MessageOut, ConversationCreate, ConversationRename
from app.ingestion import SUPPORTED_EXTENSIONS, extract_pages, chunk_pages
from app.embeddings import embed_texts
from app.rag import retrieve, generate_answer

Base.metadata.create_all(bind=engine)
app = FastAPI(title=settings.app_name, version="0.2.0", description="Chat-style enterprise knowledge assistant with grounded document Q&A.")
origins = [x.strip() for x in settings.cors_origins.split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def document_out(doc: Document):
    return {"id": doc.id, "filename": doc.filename, "content_type": doc.content_type, "status": doc.status,
            "chunk_count": doc.chunk_count, "created_at": doc.created_at.isoformat() if doc.created_at else datetime.now(timezone.utc).isoformat()}

def conversation_out(c: Conversation):
    return {"id": c.id, "title": c.title, "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(), "message_count": len(c.messages)}

def message_out(m: Message):
    # Retrieval metadata is retained in PostgreSQL for internal diagnostics, but never sent to the chat client.
    return {"id": m.id, "role": m.role, "content": m.content, "mode": m.mode, "citations": [], "created_at": m.created_at.isoformat()}

@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}

@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        database_status = "ok"
    except Exception as exc:
        print(f"[KnowledgeOS] Database health check failed: {type(exc).__name__}: {exc}")
        database_status = "error"
    return {"status": "ok" if database_status == "ok" else "degraded", "service": "knowledgeos-api",
            "database": database_status, "groq_configured": bool(settings.groq_api_key.strip()), "groq_model": settings.groq_model}

@app.get("/api/documents", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    return [document_out(d) for d in db.query(Document).order_by(Document.id.desc()).all()]

@app.post("/api/documents/upload", response_model=DocumentOut)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = Path(file.filename or "upload.txt").name
    if Path(filename).suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload PDF, DOCX, or TXT.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds the {settings.max_upload_mb} MB upload limit.")
    try:
        pieces = chunk_pages(extract_pages(filename, content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read document: {exc}") from exc
    if not pieces:
        raise HTTPException(status_code=400, detail="No extractable text found. Scanned PDFs require OCR, which is not included.")
    try:
        vectors = embed_texts([piece for _, piece in pieces])
    except Exception as exc:
        print(f"[KnowledgeOS] Embedding failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=503, detail="Embedding model could not be loaded. Check internet access and server logs.") from exc
    doc = Document(filename=filename, content_type=file.content_type or "application/octet-stream", status="processed", chunk_count=len(pieces))
    try:
        db.add(doc); db.flush()
        for index, ((page_number, chunk_text), vector) in enumerate(zip(pieces, vectors)):
            db.add(Chunk(document_id=doc.id, chunk_index=index, text=chunk_text, page_number=page_number, embedding=vector))
        db.commit(); db.refresh(doc)
        return document_out(doc)
    except Exception as exc:
        db.rollback()
        print(f"[KnowledgeOS] Document save failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=500, detail="Document could not be saved to the database.") from exc

@app.delete("/api/documents/{document_id}")
def delete_doc(document_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc: raise HTTPException(status_code=404, detail="Document not found.")
    db.delete(doc); db.commit()
    return {"deleted": True, "document_id": document_id}

@app.get("/api/conversations", response_model=list[ConversationOut])
def list_conversations(db: Session = Depends(get_db)):
    return [conversation_out(c) for c in db.query(Conversation).order_by(Conversation.updated_at.desc()).all()]

@app.post("/api/conversations", response_model=ConversationOut)
def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db)):
    conv = Conversation(title=(payload.title.strip() or "New chat")[:180])
    db.add(conv); db.commit(); db.refresh(conv)
    return conversation_out(conv)

@app.patch("/api/conversations/{conversation_id}")
def rename_conversation(conversation_id: int, payload: ConversationRename, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Chat title cannot be empty.")
    conv.title = title[:180]
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(conv)
    return conversation_out(conv)

@app.get("/api/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def get_conversation_messages(conversation_id: int, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv: raise HTTPException(status_code=404, detail="Conversation not found.")
    return [message_out(m) for m in conv.messages]

@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv: raise HTTPException(status_code=404, detail="Conversation not found.")
    db.delete(conv); db.commit()
    return {"deleted": True, "conversation_id": conversation_id}

@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    question = payload.question.strip()
    if payload.conversation_id is not None:
        conv = db.query(Conversation).filter(Conversation.id == payload.conversation_id).first()
        if not conv: raise HTTPException(status_code=404, detail="Conversation not found.")
    else:
        conv = Conversation(title=question[:70] or "New chat")
        db.add(conv); db.flush()
    # Preserve recent turns so follow-up prompts like "explain the second point" work naturally.
    history = [{"role": m.role, "content": m.content} for m in conv.messages[-8:]]
    db.add(Message(conversation_id=conv.id, role="user", content=question, mode="user", citations=[]))
    try:
        results = retrieve(db, question, payload.top_k)
        answer, mode = generate_answer(question, results, history=history)
    except Exception as exc:
        db.rollback()
        print(f"[KnowledgeOS] Chat failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=503, detail="The knowledge service failed while preparing an answer. Check the backend terminal.") from exc
    citations = [{"document_id": r["document_id"], "filename": r["filename"], "chunk_id": r["chunk_id"],
                  "page_number": r["page_number"], "excerpt": r["text"][:280], "score": round(r["score"], 4)}
                 for r in results if r["score"] >= 0.20]
    db.add(Message(conversation_id=conv.id, role="assistant", content=answer, mode=mode, citations=citations))
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    # Keep source metadata server-side only; the frontend receives the answer, not a source list.
    return ChatResponse(answer=answer, citations=[], mode=mode, conversation_id=conv.id)
