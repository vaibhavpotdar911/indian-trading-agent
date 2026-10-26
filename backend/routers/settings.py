"""Settings API — manage API keys and LLM provider config from the UI."""

import os
import json
import logging
import urllib.request

from fastapi import APIRouter
from pydantic import BaseModel
from backend.settings_manager import (
    get_api_keys_status,
    save_api_key,
    test_api_key,
    get_llm_config,
    save_llm_config,
    apply_llm_config_to_default,
    PROVIDERS_INFO,
    get_data_provider_keys_status,
    save_data_provider_key,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])
logger = logging.getLogger(__name__)


class ApiKeyUpdate(BaseModel):
    provider: str
    key: str


class ApiKeyTest(BaseModel):
    provider: str
    key: str | None = None  # if None, tests saved key


class DataProviderKeyUpdate(BaseModel):
    provider: str
    key: str


class LLMConfigUpdate(BaseModel):
    llm_provider: str | None = None
    deep_think_llm: str | None = None
    quick_think_llm: str | None = None


class BaseUrlUpdate(BaseModel):
    provider: str
    base_url: str


class DiscoverModelsRequest(BaseModel):
    provider: str = "custom_router"
    base_url: str | None = None
    api_key: str | None = None


@router.get("/api-keys")
def list_api_keys():
    """Get status of all API keys (masked)."""
    return get_api_keys_status()


@router.put("/api-keys")
def update_api_key(data: ApiKeyUpdate):
    """Save a new API key."""
    save_api_key(data.provider, data.key)
    return {"status": "saved", "provider": data.provider}


@router.delete("/api-keys/{provider}")
def delete_api_key(provider: str):
    """Remove an API key from DB (env var fallback still applies)."""
    save_api_key(provider, "")
    return {"status": "removed", "provider": provider}


@router.post("/api-keys/test")
def test_key(data: ApiKeyTest):
    """Test if an API key works."""
    return test_api_key(data.provider, data.key)


@router.get("/data-provider-keys")
def list_data_provider_keys():
    return get_data_provider_keys_status()


@router.put("/data-provider-keys")
def update_data_provider_key(data: DataProviderKeyUpdate):
    save_data_provider_key(data.provider, data.key)
    return {"status": "saved", "provider": data.provider}


@router.delete("/data-provider-keys/{provider}")
def delete_data_provider_key(provider: str):
    save_data_provider_key(provider, "")
    return {"status": "removed", "provider": provider}


@router.get("/llm")
def get_llm_settings():
    """Get current LLM provider and model settings."""
    return get_llm_config()


@router.put("/llm")
def update_llm_settings(data: LLMConfigUpdate):
    """Update LLM provider/model settings."""
    save_llm_config(
        provider=data.llm_provider,
        deep_model=data.deep_think_llm,
        quick_model=data.quick_think_llm,
    )
    apply_llm_config_to_default()
    return {"status": "saved", "config": get_llm_config()}


@router.get("/providers")
def list_providers():
    """List available LLM providers with their active supported models."""
    from backend.db import get_setting
    from backend.settings_manager import OBSOLETE_MODELS, get_provider_base_url
    info = json.loads(json.dumps(PROVIDERS_INFO))

    # Add custom Base URL if supported
    for p_id in info:
        if info[p_id].get("supports_custom_url"):
            info[p_id]["base_url"] = get_provider_base_url(p_id)

    api_key_google = get_setting("api_key_google") or os.environ.get("GOOGLE_API_KEY")
    if api_key_google:
        try:
            from tradingagents.llm_clients.google_client import get_google_live_models
            live = get_google_live_models(api_key_google)
            if live.get("quick"):
                info["google"]["models_quick"] = [m for m in live["quick"] if m not in OBSOLETE_MODELS]
            if live.get("deep"):
                info["google"]["models_deep"] = [m for m in live["deep"] if m not in OBSOLETE_MODELS]
        except Exception:
            pass

    # Ensure obsolete models are filtered out for all providers
    for p_id in info:
        info[p_id]["models_quick"] = [m for m in info[p_id].get("models_quick", []) if m not in OBSOLETE_MODELS]
        info[p_id]["models_deep"] = [m for m in info[p_id].get("models_deep", []) if m not in OBSOLETE_MODELS]

    return info


@router.get("/router/base-url/{provider}")
def get_base_url(provider: str):
    """Get the current base URL for a provider."""
    from backend.settings_manager import get_provider_base_url
    return {"provider": provider, "base_url": get_provider_base_url(provider)}


@router.put("/router/base-url")
def update_base_url(data: BaseUrlUpdate):
    """Save a custom base URL for a provider."""
    from backend.settings_manager import save_provider_base_url, get_provider_base_url
    save_provider_base_url(data.provider, data.base_url)
    return {"status": "saved", "provider": data.provider, "base_url": get_provider_base_url(data.provider)}


@router.post("/router/discover-models")
def discover_router_models(data: DiscoverModelsRequest):
    """Query {base_url}/models to list active models from the router."""
    from backend.settings_manager import get_provider_base_url, PROVIDER_ENV_KEYS
    from backend.db import get_setting
    from openai import OpenAI

    base_url = (data.base_url or "").strip().rstrip("/") or get_provider_base_url(data.provider)
    key = data.api_key
    if not key:
        key = get_setting(f"api_key_{data.provider}") or os.environ.get(PROVIDER_ENV_KEYS.get(data.provider, ""), "")
    if not key:
        key = "token"

    try:
        client = OpenAI(
            api_key=key,
            base_url=base_url,
            timeout=8.0,
            default_headers={
                "HTTP-Referer": "https://github.com/vaibhavpotdar911/indian-trading-agent",
                "X-Title": "Indian Trading Agent",
            },
        )
        models_page = client.models.list()
        models = [m.id for m in getattr(models_page, "data", []) if getattr(m, "id", None)]
        return {"reachable": True, "base_url": base_url, "models": models, "count": len(models)}
    except Exception as e:
        logger.warning("Model discovery failed for %s at %s: %s", data.provider, base_url, e)
        return {"reachable": False, "base_url": base_url, "models": [], "error": str(e)}


def _ollama_host() -> str:
    """Base URL of the local Ollama server.

    Derived from the LLM client's provider config so this admin endpoint and the
    chat client never drift. Falls back to the documented default.
    """
    try:
        from tradingagents.llm_clients.openai_client import _PROVIDER_CONFIG

        base = _PROVIDER_CONFIG["ollama"][0].rstrip("/")  # e.g. http://localhost:11434/v1
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        return base
    except Exception:
        return "http://localhost:11434"


@router.get("/ollama/models")
def list_ollama_models():
    """List models installed on the local Ollama server (live, no key required).

    Returns {reachable, models, count}, or {reachable: False, error} when the
    server isn't running. Powers the Ollama model dropdowns + reachability
    status in Settings, so the list always reflects what's actually pulled
    locally rather than a hardcoded catalog.
    """
    url = f"{_ollama_host()}/api/tags"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name") for m in payload.get("models", []) if m.get("name")]
        return {"reachable": True, "models": models, "count": len(models)}
    except Exception:
        logger.exception("Ollama model discovery failed")
        return {"reachable": False, "models": [], "error": "Ollama is unavailable."}


@router.get("/google/models")
def list_google_models():
    """List live available Google Gemini models directly from Google GenAI API or catalog."""
    from backend.db import get_setting
    api_key = get_setting("api_key_google") or os.environ.get("GOOGLE_API_KEY")
    from tradingagents.llm_clients.google_client import get_google_live_models
    res = get_google_live_models(api_key)
    return {
        "reachable": True,
        "quick_models": res.get("quick", []),
        "deep_models": res.get("deep", []),
    }


@router.get("/quota")
def get_quota_status():
    """Get live LLM quota and rate limit status adapted to active provider."""
    from backend.quota_tracker import quota_tracker
    from backend.settings_manager import get_llm_config
    config = get_llm_config()
    provider = config.get("llm_provider", "custom_router")
    model = config.get("quick_think_llm", "")
    return quota_tracker.get_status(provider=provider, model=model)

