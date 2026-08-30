"""
知图 (Atlas) backend.

Three concerns:
  /api/documents      CRUD for the knowledge base
  /api/chat           Streaming RAG chat: retrieves chunks then streams LLM
  /api/generate-doc   Builds a Markdown outline from the LLM and ships a .docx
"""
from __future__ import annotations

import os
import shutil
from typing import List, Optional
from urllib.parse import quote

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    StreamingResponse,
    Response,
)
from pydantic import BaseModel

import config
from database import get_db
from embedding import get_embedding_engine, DocumentProcessor
from llm import LLMConfig, LLMError, chat, chat_stream, list_models, test_connection, derive_base_url
from docgen import markdown_to_docx


# ----------------------------------------------------------------------------
# Pydantic schemas
# ----------------------------------------------------------------------------
class QueryRequest(BaseModel):
    question: str
    top_k: Optional[int] = config.TOP_K_RESULTS


class ChatRequest(BaseModel):
    question: str
    top_k: Optional[int] = config.TOP_K_RESULTS
    history: Optional[List[dict]] = None
    use_knowledge: bool = True
    temperature: Optional[float] = 0.4
    max_tokens: Optional[int] = None
    system_prompt: Optional[str] = None
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    model: Optional[str] = None


class GenerateDocRequest(BaseModel):
    prompt: str
    title: Optional[str] = "知图 Document"
    top_k: Optional[int] = config.TOP_K_RESULTS
    use_knowledge: bool = True
    temperature: Optional[float] = 0.5
    max_tokens: Optional[int] = 4096
    system_prompt: Optional[str] = None
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    model: Optional[str] = None


class ModelsRequest(BaseModel):
    endpoint: str
    api_key: str


class TestConnectionRequest(BaseModel):
    endpoint: str
    api_key: str
    model: str


class SearchResult(BaseModel):
    id: int
    filename: str
    chunk_index: int
    content: str
    distance: float
    similarity: float


class QueryResponse(BaseModel):
    results: List[SearchResult]
    query: str


class DocumentInfo(BaseModel):
    filename: str
    chunk_count: int
    created_at: str


class UploadResponse(BaseModel):
    message: str
    filename: str
    chunks_added: int


# ----------------------------------------------------------------------------
# FastAPI app
# ----------------------------------------------------------------------------
app = FastAPI(title="Atlas API", description="知图 · 本地知识库 / AI 问答 / 文档生成", version="2.0.0")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
async def startup_event():
    get_db()
    get_embedding_engine()
    print("知图 (Atlas) ready at http://127.0.0.1:8000")


@app.on_event("shutdown")
async def shutdown_event():
    get_db().close()


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "知图", "version": "2.0.0"}


@app.post("/api/models")
async def list_models_endpoint(request: ModelsRequest):
    """Fetch available model ids from the user's OpenAI-compatible endpoint.

    Follows the OpenAI convention: GET {base_url}/models, where base_url is
    derived from the user's chat endpoint (e.g. https://host/v1).
    """
    if not request.endpoint.strip() or not request.api_key.strip():
        raise HTTPException(400, "请先填好 Endpoint 和 API Key")
    try:
        base_url = derive_base_url(request.endpoint)
        models = await list_models(request.endpoint, request.api_key)
    except LLMError as e:
        raise HTTPException(400, str(e))
    if not models:
        raise HTTPException(404, "未获取到任何模型，请检查 Endpoint 是否支持 /models 接口")
    return {
        "models": models,
        "count": len(models),
        "base_url": base_url,
        "request_url": f"{base_url}/models",
    }


@app.post("/api/test")
async def test_connection_endpoint(request: TestConnectionRequest):
    """Ping the endpoint with a 1-token completion to verify credentials."""
    if not request.endpoint.strip() or not request.api_key.strip():
        raise HTTPException(400, "请先填好 Endpoint 和 API Key")
    if not request.model.strip():
        raise HTTPException(400, "请先选择或输入 Model")
    base_url = derive_base_url(request.endpoint)
    try:
        reply = await test_connection(request.endpoint, request.api_key, request.model)
    except LLMError as e:
        raise HTTPException(400, str(e))
    text = reply.strip() if reply else "(模型返回空)"
    return {"ok": True, "message": f"连接成功，模型已响应：{text[:60]}", "base_url": base_url}


# ----------------------------------------------------------------------------
# Knowledge base / documents
# ----------------------------------------------------------------------------
@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type. Allowed: {sorted(config.ALLOWED_EXTENSIONS)}")

    # Enforce size limit while streaming to disk (avoids loading huge files in RAM)
    file_path = None
    size = 0
    try:
        tmp_path = file_path = os.path.join(config.UPLOAD_DIR, ".uploading_tmp")
        with open(tmp_path, "wb") as buffer:
            while True:
                chunk = file.file.read(1024 * 1024)  # 1 MB chunks
                if not chunk:
                    break
                size += len(chunk)
                if size > config.MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        413,
                        f"File too large ({size / 1024 / 1024:.0f} MB). "
                        f"Limit is {config.MAX_UPLOAD_SIZE / 1024 / 1024:.0f} MB.",
                    )
                buffer.write(chunk)
    except HTTPException:
        # cleanup temp file and re-raise
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise
    except Exception as e:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise HTTPException(500, f"Failed to save file: {e}")

    # Avoid path traversal / clobbering: keep a unique safe filename
    safe_name = os.path.basename(file.filename)
    base, ext2 = os.path.splitext(safe_name)
    i = 1
    save_name = safe_name
    while os.path.exists(os.path.join(config.UPLOAD_DIR, save_name)):
        save_name = f"{base}_{i}{ext2}"
        i += 1
    file_path = os.path.join(config.UPLOAD_DIR, save_name)
    os.replace(os.path.join(config.UPLOAD_DIR, ".uploading_tmp"), file_path)

    try:
        text = DocumentProcessor.read_document(file_path)
        if not text.strip():
            raise HTTPException(400, "Document appears to be empty")

        engine = get_embedding_engine()
        chunks_with_embeddings = engine.process_text(text)
        if not chunks_with_embeddings:
            raise HTTPException(400, "No content could be extracted from document")

        db = get_db()
        for idx, (chunk, embedding) in enumerate(chunks_with_embeddings):
            db.insert_document(
                filename=save_name,
                chunk_index=idx,
                content=chunk,
                embedding=embedding,
            )

        return UploadResponse(
            message="Document uploaded and processed successfully",
            filename=save_name,
            chunks_added=len(chunks_with_embeddings),
        )
    except HTTPException:
        # On validation errors (empty doc, no extractable content) also clean up
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise
    except Exception as e:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise HTTPException(500, f"Failed to process document: {e}")


@app.post("/api/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(400, "Question cannot be empty")
    engine = get_embedding_engine()
    query_embedding = engine.embed_text(request.question)
    db = get_db()
    results = db.search_similar(query_embedding, request.top_k)
    return QueryResponse(
        results=[
            SearchResult(
                id=r["id"], filename=r["filename"], chunk_index=r["chunk_index"],
                content=r["content"], distance=r["distance"],
                similarity=1 - r["distance"],
            )
            for r in results
        ],
        query=request.question,
    )


@app.get("/api/documents", response_model=List[DocumentInfo])
async def list_documents():
    db = get_db()
    return [
        DocumentInfo(filename=d["filename"], chunk_count=d["chunk_count"], created_at=d["created_at"])
        for d in db.get_all_documents()
    ]


@app.delete("/api/documents/{filename}")
async def delete_document(filename: str):
    filename = os.path.basename(filename)  # defang path traversal
    db = get_db()
    if not db.delete_document(filename):
        raise HTTPException(404, "Document not found")
    fp = os.path.join(config.UPLOAD_DIR, filename)
    if os.path.exists(fp):
        os.remove(fp)
    return {"message": f"Document '{filename}' deleted"}


# ----------------------------------------------------------------------------
# Helper: build context from the knowledge base
# ----------------------------------------------------------------------------
def _retrieve_context(question: str, top_k: int) -> str:
    engine = get_embedding_engine()
    q_emb = engine.embed_text(question)
    db = get_db()
    results = db.search_similar(q_emb, top_k)
    if not results:
        return ""
    parts = []
    for r in results:
        parts.append(
            f"[来源: {r['filename']} | 相似度: {1 - r['distance']:.3f}]\n{r['content']}"
        )
    return "\n\n---\n\n".join(parts)


def _sse(event: str, data: dict) -> str:
    import json
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ----------------------------------------------------------------------------
# Streaming chat with RAG
# ----------------------------------------------------------------------------
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """SSE stream: context / delta / done events."""
    question = request.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty")

    try:
        cfg = LLMConfig.from_request(
            request.api_key, request.endpoint, request.model,
            temperature=request.temperature, max_tokens=request.max_tokens,
        )
    except LLMError as e:
        raise HTTPException(400, str(e))

    context_text = ""
    if request.use_knowledge:
        context_text = _retrieve_context(question, request.top_k or config.TOP_K_RESULTS)

    default_system = (
        "你是「知图」的知识助手。请根据下方参考资料作答，"
        "并在合适的时候注明出处文件名。"
        "如果资料里没有答案，请如实说明，不要编造。"
        "回答保持简洁、自然、中文优先。"
    )
    system_prompt = (request.system_prompt or "").strip() or default_system

    messages: List[dict] = [{
        "role": "system",
        "content": system_prompt,
    }]
    if context_text:
        messages.append({
            "role": "system",
            "content": f"参考资料：\n\n{context_text}",
        })
    if request.history:
        messages.extend(request.history)
    messages.append({"role": "user", "content": question})

    async def event_source():
        yield _sse("context", {"chunks": 0 if not context_text else (request.top_k or config.TOP_K_RESULTS)})
        full = []
        try:
            async for delta in chat_stream(cfg, messages, max_tokens=request.max_tokens):
                full.append(delta)
                yield _sse("delta", {"content": delta})
        except LLMError as e:
            yield _sse("done", {"error": str(e)})
            return
        yield _sse("done", {"answer": "".join(full)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ----------------------------------------------------------------------------
# Document generation
# ----------------------------------------------------------------------------
@app.post("/api/generate-doc-preview")
async def generate_doc_preview(request: GenerateDocRequest):
    """Let the LLM write Markdown, return it as JSON for the preview panel."""
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Prompt cannot be empty")
    try:
        cfg = LLMConfig.from_request(
            request.api_key, request.endpoint, request.model,
            temperature=request.temperature, max_tokens=request.max_tokens,
        )
    except LLMError as e:
        raise HTTPException(400, str(e))

    context_text = _retrieve_context(prompt, request.top_k or config.TOP_K_RESULTS) if request.use_knowledge else ""

    default_prompt = (
        "你是「知图」的文档撰写助手。请输出 Markdown 格式（不要代码块包裹）。"
        "用 `#` 作主标题，`##` 作章节，`###` 作小节；段落直接写；"
        "可用 `**粗体**`、`*斜体*`、列表、表格。中文，简洁专业，至少 800 字。"
    )
    system_prompt = (request.system_prompt or "").strip() or default_prompt

    messages: List[dict] = [{
        "role": "system",
        "content": system_prompt,
    }]
    if context_text:
        messages.append({"role": "system", "content": f"参考资料：\n\n{context_text}"})
    messages.append({"role": "user", "content": f"文档主题/要求：\n{prompt}"})

    try:
        markdown = await chat(cfg, messages, max_tokens=request.max_tokens)
    except LLMError as e:
        raise HTTPException(502, str(e))
    markdown = _strip_fence(markdown)
    return JSONResponse({"markdown": markdown})


@app.post("/api/generate-doc")
async def generate_doc(request: GenerateDocRequest):
    """Generate Markdown via LLM, render to .docx, return binary."""
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Prompt cannot be empty")

    try:
        cfg = LLMConfig.from_request(
            request.api_key, request.endpoint, request.model,
            temperature=request.temperature, max_tokens=request.max_tokens,
        )
    except LLMError as e:
        raise HTTPException(400, str(e))

    context_text = ""
    if request.use_knowledge:
        context_text = _retrieve_context(prompt, request.top_k or config.TOP_K_RESULTS)

    default_prompt = (
        "你是「知图」的文档撰写助手。用户会给你一个主题和可选的参考资料，"
        "请输出一份结构清晰、可直接转成 Word 的 Markdown 文档。\n"
        "格式约定：\n"
        "- 用 `#` 作为文档主标题（仅一个）；\n"
        "- 用 `##` 作为章节标题，可拆出多个；\n"
        "- 用 `###` 作为小节；\n"
        "- 正文段落直接写；\n"
        "- 重点可用 `**粗体**`、`*斜体*`、`行内代码`；\n"
        "- 列表可用 `-` 或 `1.`；\n"
        "- 如有对比数据可用 GFM 风格表格 `| a | b |`；\n"
        "- 不要输出代码块包裹（```），不要输出 HTML；\n"
        "- 全文用中文，简洁专业；\n"
        "- 内容至少 800 字，宁可详细不要偷懒。"
    )
    system_prompt = (request.system_prompt or "").strip() or default_prompt

    messages: list[dict] = [{
        "role": "system",
        "content": system_prompt,
    }]
    if context_text:
        messages.append({"role": "system", "content": f"参考资料：\n\n{context_text}"})
    messages.append({"role": "user", "content": f"文档主题/要求：\n{prompt}"})

    try:
        markdown = await chat(cfg, messages, max_tokens=request.max_tokens)
    except LLMError as e:
        raise HTTPException(502, str(e))
    markdown = _strip_fence(markdown)

    try:
        doc_bytes = markdown_to_docx(request.title or "Atlas Document", markdown)
    except Exception as e:
        raise HTTPException(500, f"渲染 Word 失败：{e}")

    safe_title = "".join(c for c in (request.title or "Atlas_Document") if c not in '\\/:*?"<>|').strip() or "Atlas_Document"
    filename = f"{safe_title}.docx"

    # HTTP headers only accept latin-1; use RFC 5987 for non-ASCII filenames.
    filename_ascii = filename.encode("ascii", "replace").decode("ascii")
    filename_utf8 = quote(filename)

    return Response(
        content=doc_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename_ascii}"; '
                f"filename*=UTF-8''{filename_utf8}"
            )
        },
    )


def _strip_fence(markdown: str) -> str:
    markdown = markdown.strip()
    if markdown.startswith("```"):
        lines = markdown.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        markdown = "\n".join(lines)
    return markdown


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)