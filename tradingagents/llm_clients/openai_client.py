import os
from typing import Any, Optional

from langchain_openai import ChatOpenAI

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model


class NormalizedChatOpenAI(ChatOpenAI):
    """ChatOpenAI with normalized content output.

    The Responses API returns content as a list of typed blocks
    (reasoning, text, etc.). This normalizes to string for consistent
    downstream handling.
    """

    def invoke(self, input, config=None, **kwargs):
        return normalize_content(super().invoke(input, config, **kwargs))

# Kwargs forwarded from user config to ChatOpenAI
_PASSTHROUGH_KWARGS = (
    "timeout", "max_retries", "reasoning_effort",
    "api_key", "callbacks", "http_client", "http_async_client", "default_headers",
)

# Provider base URLs and API key env vars
_PROVIDER_CONFIG = {
    "custom_router": ("https://freellmapi.com/v1", "CUSTOM_ROUTER_API_KEY"),
    "router": ("https://freellmapi.com/v1", "CUSTOM_ROUTER_API_KEY"),
    "freellmapi": ("https://freellmapi.com/v1", "FREELLMAPI_API_KEY"),
    "unorouter": ("https://unorouter.ai/api/v1", "UNOROUTER_API_KEY"),
    "xai": ("https://api.x.ai/v1", "XAI_API_KEY"),
    "deepseek": ("https://api.deepseek.com", "DEEPSEEK_API_KEY"),
    "qwen": ("https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "DASHSCOPE_API_KEY"),
    "glm": ("https://api.z.ai/api/paas/v4/", "ZHIPU_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "ollama": ("http://localhost:11434/v1", None),
}


class OpenAIClient(BaseLLMClient):
    """Client for OpenAI, Ollama, OpenRouter, and xAI providers.

    For native OpenAI models, uses the Responses API (/v1/responses) which
    supports reasoning_effort with function tools across all model families
    (GPT-4.1, GPT-5). Third-party compatible providers (xAI, OpenRouter,
    Ollama, Custom Router) use standard Chat Completions.
    """

    def __init__(
        self,
        model: str,
        base_url: Optional[str] = None,
        provider: str = "openai",
        **kwargs,
    ):
        super().__init__(model, base_url, **kwargs)
        self.provider = provider.lower()

    def get_llm(self) -> Any:
        """Return configured ChatOpenAI instance."""
        self.warn_if_unknown_model()
        llm_kwargs = {"model": self.model}

        # Provider-specific base URL and auth
        if self.provider in _PROVIDER_CONFIG:
            base_url, api_key_env = _PROVIDER_CONFIG[self.provider]
            llm_kwargs["base_url"] = base_url
            if api_key_env:
                api_key = os.environ.get(api_key_env)
                if api_key:
                    llm_kwargs["api_key"] = api_key
            else:
                llm_kwargs["api_key"] = "ollama"
        elif self.base_url:
            llm_kwargs["base_url"] = self.base_url

        # Check DB settings for dynamically configured router base_url or api_key
        try:
            from backend.db import get_setting
            db_base_url = get_setting(f"base_url_{self.provider}")
            if db_base_url:
                llm_kwargs["base_url"] = db_base_url
            db_key = get_setting(f"api_key_{self.provider}")
            if db_key and not llm_kwargs.get("api_key"):
                llm_kwargs["api_key"] = db_key
        except Exception:
            pass

        # If base_url was passed explicitly in constructor, respect it
        if self.base_url:
            llm_kwargs["base_url"] = self.base_url

        # Forward user-provided kwargs
        for key in _PASSTHROUGH_KWARGS:
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        # Ensure custom router has standard headers for broad proxy/router compatibility
        if self.provider in ("custom_router", "router", "openrouter", "freellmapi", "unorouter"):
            headers = llm_kwargs.get("default_headers") or {}
            headers.setdefault("HTTP-Referer", "https://github.com/vaibhavpotdar911/indian-trading-agent")
            headers.setdefault("X-Title", "Indian Trading Agent")
            llm_kwargs["default_headers"] = headers

            # Fallback dummy key for self-hosted local routers (vLLM, LM Studio) if not set
            if not llm_kwargs.get("api_key"):
                llm_kwargs["api_key"] = os.environ.get("CUSTOM_ROUTER_API_KEY") or "token"

        # Native OpenAI: use Responses API for consistent behavior across
        # all model families. Third-party providers use Chat Completions.
        if self.provider == "openai":
            llm_kwargs["use_responses_api"] = True

        return NormalizedChatOpenAI(**llm_kwargs)

    def validate_model(self) -> bool:
        """Validate model for the provider."""
        return validate_model(self.provider, self.model)
