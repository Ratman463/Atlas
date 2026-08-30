"""
Thin OpenAI-compatible client.

The user supplies their own `api_key`, `endpoint`, and `model` from the
frontend; we never persist them. This module wraps httpx so we can do both
regular and streaming chat completions without pulling in the whole openai
SDK (and its pinned httpx hell).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import AsyncIterator, List, Dict, Optional

import httpx

import config


class LLMError(RuntimeError):
    """Raised when the upstream LLM call fails."""


@dataclass
class LLMConfig:
    api_key: str
    endpoint: str
    model: str
    temperature: float = 0.4
    max_tokens: Optional[int] = None

    @staticmethod
    def from_request(
        api_key: Optional[str],
        endpoint: Optional[str],
        model: Optional[str],
        temperature: Optional[float] = 0.4,
        max_tokens: Optional[int] = None,
    ) -> "LLMConfig":
        api_key = (api_key or "").strip() or config.DEFAULT_LLM_API_KEY
        endpoint = (endpoint or "").strip() or config.DEFAULT_LLM_ENDPOINT
        model = (model or "").strip() or config.DEFAULT_LLM_MODEL

        if not api_key:
            raise LLMError("缺少 API Key。请在右上角设置里填好。")
        if not endpoint:
            raise LLMError("缺少 Endpoint。请在右上角设置里填好。")
        if not model:
            raise LLMError("缺少 Model 名称。请在右上角设置里填好。")

        # Normalise endpoint: must end with /chat/completions
        endpoint = endpoint.strip()
        if not endpoint.startswith(("http://", "https://")):
            raise LLMError(f"Endpoint 必须是完整 URL，当前为: {endpoint}")
        if not endpoint.endswith("/chat/completions"):
            if endpoint.endswith("/"):
                endpoint = endpoint + "chat/completions"
            elif endpoint.endswith("/v1"):
                endpoint = endpoint + "/chat/completions"
            elif "/v1/" not in endpoint and not endpoint.endswith("/chat/completions"):
                endpoint = endpoint.rstrip("/") + "/v1/chat/completions"

        return LLMConfig(
            api_key=api_key,
            endpoint=endpoint,
            model=model,
            temperature=float(temperature if temperature is not None else 0.4),
            max_tokens=max_tokens,
        )


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }


def _payload(
    cfg: LLMConfig,
    messages: List[Dict[str, str]],
    *,
    stream: bool,
    max_tokens: Optional[int],
) -> Dict:
    body: Dict = {
        "model": cfg.model,
        "messages": messages,
        "temperature": cfg.temperature,
        "stream": stream,
    }
    tok = max_tokens or cfg.max_tokens
    if tok:
        body["max_tokens"] = tok
    return body


async def chat(cfg: LLMConfig, messages: List[Dict[str, str]],
               max_tokens: Optional[int] = None) -> str:
    """Single-shot chat completion. Returns the assistant message text."""
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
        try:
            resp = await client.post(
                cfg.endpoint,
                headers=_headers(cfg.api_key),
                json=_payload(cfg, messages, stream=False, max_tokens=max_tokens),
            )
        except httpx.HTTPError as e:
            raise LLMError(f"网络错误：{e}") from e

        if resp.status_code >= 400:
            raise LLMError(f"LLM 返回 {resp.status_code}: {resp.text[:500]}")

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise LLMError(f"无法解析 LLM 响应: {data}") from e


async def chat_stream(cfg: LLMConfig, messages: List[Dict[str, str]],
                      max_tokens: Optional[int] = None) -> AsyncIterator[str]:
    """Stream chat completion. Yields content deltas as plain strings."""
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
        try:
            async with client.stream(
                "POST",
                cfg.endpoint,
                headers=_headers(cfg.api_key),
                json=_payload(cfg, messages, stream=True, max_tokens=max_tokens),
            ) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise LLMError(
                        f"LLM 返回 {resp.status_code}: {body.decode('utf-8', 'ignore')[:500]}"
                    )
                async for raw_line in resp.aiter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.strip()
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        evt = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    try:
                        delta = evt["choices"][0]["delta"].get("content")
                    except (KeyError, IndexError):
                        delta = None
                    if delta:
                        yield delta
        except httpx.HTTPError as e:
            raise LLMError(f"网络错误：{e}") from e


def derive_base_url(endpoint: str) -> str:
    """Derive the API base URL (used for GET /models) from a chat endpoint.

    Follows the OpenAI-compatible convention: model list lives at
    `GET {base_url}/models` where base_url is what you pass to the SDK, e.g.
    `https://api.deepseek.com/v1` or `https://api.openai.com/v1`.

    Input examples:
      https://host/v1/chat/completions  -> https://host/v1
      https://host/v1                   -> https://host/v1
      https://host/chat/completions     -> https://host
      https://host/                     -> https://host/v1 (assume /v1)
    """
    url = endpoint.strip().rstrip("/")
    if url.endswith("/chat/completions"):
        url = url[: -len("/chat/completions")]
    # Bare host: most OpenAI-compatible gateways expose /v1/models
    if url.count("/") == 2 and "/v1" not in url:
        url = url + "/v1"
    return url


async def list_models(endpoint: str, api_key: str) -> List[str]:
    """Fetch available model ids from an OpenAI-compatible /models endpoint."""
    api_key = (api_key or "").strip() or config.DEFAULT_LLM_API_KEY
    endpoint = (endpoint or "").strip() or config.DEFAULT_LLM_ENDPOINT
    if not api_key or not endpoint:
        raise LLMError("请先填好 Endpoint 和 API Key 再获取模型列表。")

    base = derive_base_url(endpoint)
    url = base + "/models"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise LLMError(f"网络错误：{e}") from e

    if resp.status_code >= 400:
        raise LLMError(f"获取模型列表失败 ({resp.status_code}): {resp.text[:300]}")

    try:
        data = resp.json()
        items = data.get("data", data if isinstance(data, list) else [])
        models = []
        for it in items:
            if isinstance(it, dict):
                mid = it.get("id") or it.get("name")
            else:
                mid = str(it)
            if mid:
                models.append(str(mid))
        return models
    except Exception as e:
        raise LLMError(f"无法解析模型列表响应：{e}") from e


async def test_connection(endpoint: str, api_key: str, model: str) -> str:
    """Ping an OpenAI-compatible endpoint with a 1-token completion.

    Sends `max_tokens=1` per the OpenAI convention to verify the credentials
    and connectivity without burning tokens. Returns the reply text (or an
    empty string if the model only returned usage).
    """
    cfg = LLMConfig.from_request(api_key, endpoint, model, temperature=0, max_tokens=1)
    messages = [{"role": "user", "content": "ping"}]
    try:
        return await chat(cfg, messages, max_tokens=1)
    except LLMError as e:
        raise LLMError(f"连接失败：{e}") from e
