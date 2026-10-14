# KnowledgeOS — Document-grounded AI workspace

KnowledgeOS is a local-first, ChatGPT-style knowledge assistant. Upload your own documents, ask questions in natural language, and continue conversations across sessions. Document text is extracted and indexed in the backend; the chat UI does **not** display source lists, file excerpts, page numbers, or similarity scores.

## Included features

- ChatGPT-style interface with new chats, persistent chat history, search, open and delete conversations
- Rename conversations, copy assistant answers, and export a conversation to Markdown
- PostgreSQL persistence for documents, extracted chunks, embeddings, conversations, messages, and internal retrieval metadata
- Upload multiple PDF, DOCX, and TXT documents in one action
- Text extraction, chunking with overlap, semantic embeddings, and cosine-similarity retrieval
- Groq-powered grounded responses with conversation context; retrieval/source metadata remains internal
- Document library with search, processing status, chunk counts, and deletion
- Health endpoint and interactive API docs
- Responsive layout; Windows setup without Docker

## Requirements

- Python 3.11
- Node.js 20 or newer
- PostgreSQL 14 or newer, running locally
- A Groq API key for generated answers

## 1. Create the PostgreSQL database

Open **SQL Shell (psql)** or pgAdmin's Query Tool while connected as your PostgreSQL administrator and run:

```sql
CREATE USER knowledgeos WITH PASSWORD 'choose_a_strong_local_password';
CREATE DATABASE knowledgeos OWNER knowledgeos;
```

If the user/database already exists, do not run the creation commands again. In that case, use the existing database credentials in the `.env` file.

## 2. Start the backend (PowerShell)

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Set `DATABASE_URL` and `GROQ_API_KEY` in `backend/.env`. Example (replace the password and add your own key):

```dotenv
APP_NAME=KnowledgeOS
DATABASE_URL=postgresql+psycopg://knowledgeos:choose_a_strong_local_password@localhost:5432/knowledgeos
CORS_ORIGINS=http://localhost:5173
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
MAX_UPLOAD_MB=20
CHUNK_SIZE=900
CHUNK_OVERLAP=150
```

Choose a model currently available to your Groq account. Never put the Groq key in the frontend or commit `.env` to Git.

Then start the API:

```powershell
uvicorn app.main:app --reload
```

- API: http://127.0.0.1:8000
- Health: http://127.0.0.1:8000/health
- API docs: http://127.0.0.1:8000/docs

## 3. Start the frontend in a second terminal

```powershell
cd frontend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open http://localhost:5173.

## Troubleshooting

- **Database connection error:** ensure the PostgreSQL service is running and `DATABASE_URL` contains the correct password, database name, and port.
- **Embedding model download:** the first document upload may need internet access to download `all-MiniLM-L6-v2`.
- **AI answer not generated:** check `GROQ_API_KEY` and `GROQ_MODEL` in `backend/.env`, then restart Uvicorn. Select a model currently available in your Groq account.
- **Scanned PDFs:** the current extractor reads selectable PDF text. OCR for image-only scans is not included.
- **Large corpora:** embeddings are stored as JSON and similarity search is computed in Python. pgvector, background ingestion jobs, and streaming are not included in this local build.

## API endpoints

- `GET /health`
- `GET /api/documents`
- `POST /api/documents/upload` (multipart `file` field)
- `DELETE /api/documents/{document_id}`
- `GET /api/conversations`
- `POST /api/conversations`
- `PATCH /api/conversations/{conversation_id}` (rename)
- `GET /api/conversations/{conversation_id}/messages`
- `DELETE /api/conversations/{conversation_id}`
- `POST /api/chat` with `{ "question": "...", "top_k": 5, "conversation_id": null }`

## Important scope note

This is a functional local prototype, not a production-secure multi-user SaaS. Authentication, user/workspace isolation, pgvector indexing, OCR, streaming responses, and enterprise audit/retention controls still need to be implemented before deployment for real company data.
