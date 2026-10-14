from pydantic import BaseModel, Field
from typing import Optional

class DocumentOut(BaseModel):
    id: int
    filename: str
    content_type: str
    status: str
    chunk_count: int
    created_at: str

class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=10)
    conversation_id: int | None = None

class Citation(BaseModel):
    document_id: int
    filename: str
    chunk_id: int
    page_number: Optional[int] = None
    excerpt: str
    score: float

class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    mode: str
    conversation_id: int

class ConversationOut(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str
    message_count: int

class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    mode: str
    citations: list[Citation]
    created_at: str

class ConversationCreate(BaseModel):
    title: str = Field(default="New chat", max_length=180)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=180)
