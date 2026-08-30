"""
Configuration for Zhitu (Atlas). Knowledge base + LLM Q&A + document gen.
"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ----- Knowledge base / embedding -----
DATABASE_PATH = os.path.join(BASE_DIR, "data", "rag.db")
EMBEDDING_DIMENSION = 384  # all-MiniLM-L6-v2

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

TOP_K_RESULTS = 5  # default context chunks sent to the LLM

# ----- Upload -----
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
MAX_UPLOAD_SIZE = 200 * 1024 * 1024  # 200 MB（支持大体积图册 PDF / Excel）
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".md", ".markdown", ".xlsx", ".xls"}

# ----- LLM proxy (optional; client-side defaults win) -----
# Frontend sends api_key / endpoint / model with every request, but we keep a
# fallback here in case the user wants to bake a default into the server.
DEFAULT_LLM_ENDPOINT = os.environ.get("ATLAS_LLM_ENDPOINT", "")
DEFAULT_LLM_API_KEY = os.environ.get("ATLAS_LLM_API_KEY", "")
DEFAULT_LLM_MODEL = os.environ.get("ATLAS_LLM_MODEL", "gpt-4o-mini")
LLM_TIMEOUT = 120  # seconds
LLM_REQUEST_TIMEOUT = 600  # for big doc-generation calls

# ----- Document generation -----
GENERATED_DOC_DIR = os.path.join(BASE_DIR, "generated")
GEN_DOC_FILENAME = "Atlas_Document.docx"

# ----- Housekeeping -----
os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GENERATED_DOC_DIR, exist_ok=True)