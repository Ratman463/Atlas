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
