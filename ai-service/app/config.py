import os


class Config:
    AI_SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", "")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL = os.getenv(
        "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
    )
    OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4.1-mini")
    LLM_API_KEY = os.getenv("LLM_API_KEY") or OPENROUTER_API_KEY or OPENAI_API_KEY
    LLM_MODEL = os.getenv("LLM_MODEL") or (
        OPENROUTER_MODEL if OPENROUTER_API_KEY else OPENAI_MODEL
    )
    LLM_BASE_URL = os.getenv("LLM_BASE_URL") or (
        OPENROUTER_BASE_URL if OPENROUTER_API_KEY else OPENAI_BASE_URL
    )
    LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "2048"))
    OPENAI_EMBEDDING_API_KEY = os.getenv(
        "OPENAI_EMBEDDING_API_KEY", OPENAI_API_KEY
    )
    OPENAI_EMBEDDING_BASE_URL = os.getenv("OPENAI_EMBEDDING_BASE_URL", "")
    OPENAI_EMBEDDING_MODEL = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )
    EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
    VECTOR_STORE_BACKEND = os.getenv("VECTOR_STORE_BACKEND", "chroma").lower()
    CHROMA_DIR = os.getenv("CHROMA_DIR", "/data/chroma")
    OPENSEARCH_ENDPOINT = os.getenv("OPENSEARCH_ENDPOINT", "")
    OPENSEARCH_INDEX = os.getenv("OPENSEARCH_INDEX", "comconnect-knowledge")
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    RETRIEVAL_LIMIT = int(os.getenv("RETRIEVAL_LIMIT", "8"))
    RETRIEVAL_CANDIDATE_LIMIT = int(
        os.getenv("RETRIEVAL_CANDIDATE_LIMIT", "40")
    )
    RRF_K = int(os.getenv("RRF_K", "60"))
    AI_MODEL_TIMEOUT_SECONDS = float(
        os.getenv("AI_MODEL_TIMEOUT_SECONDS", "60")
    )
    AI_AGENT_RECURSION_LIMIT = int(
        os.getenv("AI_AGENT_RECURSION_LIMIT", "12")
    )
