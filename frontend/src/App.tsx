import { ChangeEvent, FormEvent, MouseEvent, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { Activity, ArrowUp, BookOpen, Copy, Download, FileText, FileUp, LoaderCircle, MessageSquareText, Pencil, Plus, Search, ShieldCheck, Trash2, UploadCloud, X, PanelLeftClose } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
type Doc = { id: number; filename: string; content_type: string; status: string; chunk_count: number; created_at: string }
type Citation = { document_id: number; filename: string; chunk_id: number; page_number: number | null; excerpt: string; score: number }
type Message = { id?: number; role: 'user' | 'assistant'; content: string; citations?: Citation[]; mode?: string; created_at?: string }
type Conversation = { id: number; title: string; created_at: string; updated_at: string; message_count: number }

export default function App() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'library'>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState<number | string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadDocs() {
    try { const res = await axios.get<Doc[]>(`${API}/api/documents`); setDocs(res.data) }
    catch { setError('Cannot connect to the API. Start the backend and verify your PostgreSQL DATABASE_URL.') }
  }
  async function loadConversations() {
    try { const res = await axios.get<Conversation[]>(`${API}/api/conversations`); setConversations(res.data) }
    catch { setError('Could not load chat history. Check the backend and database connection.') }
  }
  useEffect(() => { void loadDocs(); void loadConversations() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  function newChat() {
    setActiveConversationId(null); setMessages([]); setQuestion(''); setError(''); setActiveTab('chat')
  }
  async function openConversation(conv: Conversation) {
    setActiveTab('chat'); setActiveConversationId(conv.id); setMessages([]); setError('')
    try {
      const res = await axios.get<Message[]>(`${API}/api/conversations/${conv.id}/messages`)
      setMessages(res.data.map(m => ({ ...m, citations: m.citations || [] })))
    } catch { setError('Could not open this conversation.') }
  }
  async function renameConversation(event: MouseEvent, conv: Conversation) {
    event.stopPropagation()
    const title = window.prompt('Rename this chat', conv.title)
    if (title === null || !title.trim() || title.trim() === conv.title) return
    try {
      await axios.patch(`${API}/api/conversations/${conv.id}`, { title: title.trim() })
      await loadConversations()
    } catch { setError('Could not rename this chat.') }
  }

  async function copyAnswer(content: string, key: number | string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessage(key)
      window.setTimeout(() => setCopiedMessage(current => current === key ? null : current), 1600)
    } catch { setError('Could not copy the answer. Check browser clipboard permissions.') }
  }

  function exportConversation() {
    const title = conversations.find(c => c.id === activeConversationId)?.title || 'KnowledgeOS chat'
    const transcript = `# ${title}\n\n${messages.map(m => `## ${m.role === 'user' ? 'You' : 'KnowledgeOS'}\n\n${m.content}`).join('\n\n---\n\n')}\n`
    const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'knowledgeos-chat'}.md`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function removeConversation(event: MouseEvent, conv: Conversation) {
    event.stopPropagation()
    if (!window.confirm(`Delete chat "${conv.title}"?`)) return
    try {
      await axios.delete(`${API}/api/conversations/${conv.id}`)
      if (activeConversationId === conv.id) newChat()
      await loadConversations()
    } catch { setError('Could not delete this conversation.') }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploading(true); setError('')
    try {
      for (const file of files) {
        const body = new FormData(); body.append('file', file)
        await axios.post(`${API}/api/documents/upload`, body, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      await loadDocs()
      setMessages(prev => [...prev, { role: 'assistant', content: `**${files.length} document${files.length > 1 ? 's' : ''} processed successfully.** You can now ask questions about the uploaded content.` }])
      setActiveTab('chat')
    } catch (e) {
      const detail = axios.isAxiosError(e) ? (e.response?.data?.detail || e.message) : 'Upload failed.'
      setError(String(detail))
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    const q = question.trim()
    if (!q || busy) return
    setMessages(prev => [...prev, { role: 'user', content: q }]); setQuestion(''); setBusy(true); setError('')
    try {
      const res = await axios.post(`${API}/api/chat`, { question: q, top_k: 5, conversation_id: activeConversationId })
      setActiveConversationId(res.data.conversation_id)
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer, citations: res.data.citations, mode: res.data.mode }])
      await loadConversations()
    } catch (e) {
      const detail = axios.isAxiosError(e) ? (e.response?.data?.detail || e.message) : 'Request failed.'
      setMessages(prev => [...prev, { role: 'assistant', content: `I couldn't complete that request. ${String(detail)}` }])
    } finally { setBusy(false) }
  }

  async function deleteDoc(doc: Doc) {
    if (!window.confirm(`Delete "${doc.filename}" and its indexed chunks?`)) return
    try { await axios.delete(`${API}/api/documents/${doc.id}`); await loadDocs() }
    catch { setError(`Could not delete ${doc.filename}.`) }
  }

  const filteredDocs = docs.filter(d => d.filename.toLowerCase().includes(search.toLowerCase()))
  const filteredConversations = conversations.filter(c => c.title.toLowerCase().includes(chatSearch.toLowerCase()))
  const suggestions = ['Summarize the uploaded documents', 'What are the key policies and requirements?', 'Find important dates, numbers, and deadlines']

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BookOpen size={21}/></div><div className="brand-copy"><strong>KnowledgeOS</strong><span>ENTERPRISE RAG</span></div><button className="collapse-button" title="Collapse sidebar" onClick={() => setSidebarCollapsed(v => !v)}><PanelLeftClose size={16}/></button></div>
      <button className="new-chat-button" onClick={newChat}><Plus size={17}/> <span>New chat</span></button>
      <button className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><MessageSquareText size={18}/> <span>Knowledge chat</span></button>
      <button className={`nav-item ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}><FileText size={18}/> <span>Document library</span><span className="nav-count">{docs.length}</span></button>
      <div className="history-heading"><span>RECENT CHATS</span><span>{conversations.length}</span></div>
      <div className="history-search"><Search size={14}/><input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search chats" /></div>
      <div className="history-list">
        {filteredConversations.map(conv => <div className={`history-item ${activeConversationId === conv.id ? 'selected' : ''}`} key={conv.id}>
          <button className="history-open" title={conv.title} onClick={() => void openConversation(conv)}><MessageSquareText size={15}/><span>{conv.title}</span></button>
          <button className="history-delete" title="Rename chat" onClick={e => void renameConversation(e, conv)}><Pencil size={13}/></button>
          <button className="history-delete" title="Delete chat" onClick={e => void removeConversation(e, conv)}><Trash2 size={13}/></button>
        </div>)}
        {filteredConversations.length === 0 && <p className="history-empty">{chatSearch ? 'No matching chats' : 'Your chats will appear here'}</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="secure-note"><ShieldCheck size={17}/><div><b>Your workspace</b><span>Local development mode</span></div></div>
        <div className="api-status"><span className="status-dot"/><span>Knowledge API</span><span className="status-label">Connected*</span></div>
        <p className="tiny-note">*Connection is verified when documents load.</p>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div><span className="eyebrow">WORKSPACE / KNOWLEDGE</span><h1>{activeTab === 'chat' ? 'Knowledge assistant' : 'Document library'}</h1></div><div className="top-actions"><span className="environment"><Activity size={14}/> POSTGRESQL WORKSPACE</span>{activeTab === 'chat' && messages.length > 0 && <button className="outline-button export-button" onClick={exportConversation}><Download size={16}/> Export chat</button>}<button className="primary-button" onClick={() => fileRef.current?.click()} disabled={uploading}><Plus size={17}/> Add documents</button><input ref={fileRef} type="file" accept=".pdf,.docx,.txt" multiple hidden onChange={uploadFiles}/></div></header>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
      {activeTab === 'chat' ? <section className="chat-layout">
        {messages.length === 0 && <div className="chat-intro"><div className="intro-icon"><BookOpen size={23}/></div><div><h2>Your documents, one conversation away.</h2><p>Ask questions across your uploaded knowledge base. KnowledgeOS reads your files privately and responds in a natural conversation. Your chats are saved in PostgreSQL.</p></div></div>}
        {messages.length === 0 ? <div className="empty-state"><div className="empty-art"><UploadCloud size={30}/></div><h3>{activeConversationId ? 'No messages in this chat' : 'What would you like to know?'}</h3><p>Upload policies, reports, handbooks, or research documents. KnowledgeOS extracts the text in the background so you can ask questions without seeing source listings in the chat.</p><button className="outline-button" onClick={() => fileRef.current?.click()}><FileUp size={17}/> Upload documents</button><div className="supported">PDF <span/> DOCX <span/> TXT <span/> Up to 20 MB each</div></div> : <div className="conversation">
          {messages.map((m, i) => <div className={`message-row ${m.role}`} key={m.id ?? `${i}-${m.role}`}><div className={`avatar ${m.role}`}>{m.role === 'assistant' ? <BookOpen size={17}/> : 'You'}</div><div className="message-body"><div className="message-label">{m.role === 'assistant' ? 'KNOWLEDGEOS' : 'YOU'}</div><div className="markdown"><ReactMarkdown>{m.content}</ReactMarkdown></div>{m.role === 'assistant' && <div className="message-actions"><button className="copy-answer" onClick={() => void copyAnswer(m.content, m.id ?? i)} title="Copy answer"><Copy size={13}/>{copiedMessage === (m.id ?? i) ? 'Copied' : 'Copy'}</button>{m.mode === 'generation_error' && <span className="answer-mode">Answer service unavailable</span>}{m.mode === 'missing_api_key' && <span className="answer-mode">AI setup required</span>}</div>}</div></div>)}
          {busy && <div className="message-row assistant"><div className="avatar assistant"><BookOpen size={17}/></div><div className="loading-message"><LoaderCircle size={17} className="spin"/> Searching documents and preparing an answer…</div></div>}<div ref={bottomRef}/>
        </div>}
        <div className="composer-area"><div className="suggestions">{suggestions.map(s => <button key={s} onClick={() => setQuestion(s)}>{s}</button>)}</div><form className="composer" onSubmit={sendMessage}><textarea value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }} placeholder="Message KnowledgeOS…" rows={1}/><button type="submit" disabled={!question.trim() || busy} aria-label="Send question"><ArrowUp size={19}/></button></form><div className="composer-foot"><span>Answers are grounded in your indexed documents.</span><span>Enter to send · Shift + Enter for a new line</span></div></div>
      </section> : <section className="library-view"><div className="library-toolbar"><div><h2>Indexed documents</h2><p>Manage source files in your PostgreSQL-backed knowledge base.</p></div><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents"/></div></div>
        {uploading && <div className="upload-progress"><LoaderCircle className="spin" size={18}/> Extracting text and generating embeddings. The first run may download the embedding model.</div>}
        {filteredDocs.length === 0 ? <div className="library-empty"><FileText size={28}/><h3>{docs.length ? 'No matching documents' : 'No documents yet'}</h3><p>Upload PDF, DOCX, or TXT files to build your searchable knowledge base.</p><button className="outline-button" onClick={() => fileRef.current?.click()}><Plus size={16}/> Add documents</button></div> : <div className="doc-table"><div className="doc-table-head"><span>DOCUMENT</span><span>STATUS</span><span>CHUNKS</span><span>ADDED</span><span/></div>{filteredDocs.map(d => <div className="doc-table-row" key={d.id}><div className="doc-name"><div className="file-icon"><FileText size={19}/></div><div><b>{d.filename}</b><small>{d.content_type}</small></div></div><span className="processed"><span/> Processed</span><span className="chunk-count">{d.chunk_count}</span><span className="date">{new Date(d.created_at).toLocaleDateString()}</span><button className="icon-button danger" onClick={() => void deleteDoc(d)} aria-label={`Delete ${d.filename}`}><Trash2 size={16}/></button></div>)}</div>}
      </section>}
      <footer className="footer"><span>KnowledgeOS <span className="footer-dot">·</span> Enterprise knowledge assistant</span><span>Evidence first. Answers you can inspect.</span></footer>
    </main>
    {uploading && <div className="upload-toast"><LoaderCircle size={16} className="spin"/> Processing documents…</div>}
  </div>
}
