from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "KnowledgeOS"
    database_url: str = "postgresql+psycopg://knowledgeos:change_this_password@localhost:5432/knowledgeos"
    cors_origins: str = "http://localhost:5173"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    max_upload_mb: int = 20
    chunk_size: int = 900
    chunk_overlap: int = 150
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
