# 知图 (Atlas) · 本地知识库 + AI 问答 + Word 文档生成

> 一个轻量的本地知识库 RAG 工具，自带在线大模型问答和文档生成。
> 你只提供 API Key，剩下的一切交给「知图」。

**关键词**：RAG · 知识库 · 文档问答 · AI 问答助手 · 向量检索 · 文档生成 · Word 报告 · 本地部署

## 它能做什么

| 功能       | 说明 |
|------------|-----|
| 📚 知识库   | 上传 PDF / DOCX / TXT / Markdown，自动切块 + 向量化（SentenceTransformers + sqlite-vec） |
| 💬 智能问答 | 基于知识库做 RAG，调用任何 OpenAI 兼容接口，**流式输出**，回复里附带引用来源 |
| 📄 文档生成 | 用一句话描述需求，让大模型生成 Markdown 大纲，再渲染成可下载的 `.docx` |

界面是 Apple 官网风格的简洁白底，分三个 Tab：**知识库 / 智能问答 / 文档生成**。
API Key、Endpoint、Model 只存你浏览器的 `localStorage`，不会上传服务器，数据全程本地。

## Quick Start

```bash
git clone https://github.com/Ratman463/Atlas.git
cd Atlas
pip install -r requirements.txt
python main.py
```

打开 **http://localhost:8000**：

1. 点右上角齿轮，填好 **API Endpoint / API Key / Model**（OpenAI、DeepSeek、Moonshot、Together、本地 vLLM 都支持，只要兼容 OpenAI 协议）；
2. 在「知识库」上传几份文档，等向量化完成；
3. 切到「智能问答」直接提问，或切到「文档生成」一键产出 Word。

> 首次启动会自动下载嵌入模型 `all-MiniLM-L6-v2`（约 90 MB），并可换成更好的 `bge-m3` 等。

## 支持的 LLM 服务

| 服务商       | Endpoint 示例 |
|-------------|--------------|
| OpenAI       | `https://api.openai.com/v1` |
| DeepSeek     | `https://api.deepseek.com/v1` |
| Moonshot     | `https://api.moonshot.cn/v1` |
| 通义千问     | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Together     | `https://api.together.xyz/v1` |
| 本地 vLLM    | `http://localhost:8000/v1` |

填到 `/v1` 或完整 `/v1/chat/completions` 都行，后端会自动补全。

## 配置

前端配置存浏览器；`config.py` 提供一些服务器侧兜底常量，可通过环境变量覆盖：

| 环境变量 | 默认 | 说明 |
|---------|------|-----|
| `ATLAS_LLM_ENDPOINT` | 空 | 服务器侧兜底的 LLM endpoint（不强制） |
| `ATLAS_LLM_API_KEY`  | 空 | 服务器侧兜底的 API Key |
| `ATLAS_LLM_MODEL`    | `gpt-4o-mini` | 服务器侧兜底的模型名 |

其他知识库常量（嵌入模型、chunk、Top-K、上传限制）也在 `config.py`。

## 项目结构

```
知图 (Atlas)/
├── main.py            # FastAPI：文档 CRUD / 流式 RAG 问答 / 文档生成
├── config.py          # 全部常量
├── database.py        # sqlite-vec 向量存储
├── embedding.py       # SentenceTransformers + 语义切块 + 文档读取
├── llm.py             # 极简 OpenAI 兼容客户端（普通 + 流式）
├── docgen.py          # Markdown → Word 渲染器
├── static/
│   ├── index.html     # 单页应用（三 Tab）
│   ├── css/main.css   # 苹果风格
│   └── js/main.js     # 全部前端逻辑（上传、流式聊天、生成）
├── data/rag.db        # 向量库（自动创建）
├── uploads/           # 上传的原始文件
└── generated/         # 渲染 Word 的临时目录
```

## API

| 方法    | 路径                              | 说明 |
|---------|-----------------------------------|------|
| `GET`   | `/api/health`                     | 健康检查 |
| `POST`  | `/api/upload`                     | 上传文档并入库 |
| `GET`   | `/api/documents`                  | 列出所有文档 |
| `DELETE`| `/api/documents/{filename}`       | 删除文档（连带向量） |
| `POST`  | `/api/query`                      | 纯向量检索（不调 LLM） |
| `POST`  | `/api/chat`                       | **流式** RAG 问答（SSE） |
| `POST`  | `/api/generate-doc-preview`       | 让 LLM 写 Markdown，返回原文 |
| `POST`  | `/api/generate-doc`               | 写 Markdown → 渲染 `.docx` |

所有 LLM 接口 body 均接受 `api_key / endpoint / model / temperature / max_tokens`。

## License

Apache License 2.0