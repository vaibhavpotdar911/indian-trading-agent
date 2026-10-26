"""Tests for Custom Router / Open-Source Endpoint LLM clients."""

import os
from unittest.mock import patch, MagicMock
from tradingagents.llm_clients.factory import create_llm_client
from tradingagents.llm_clients.openai_client import OpenAIClient
from tradingagents.llm_clients.validators import validate_model


def test_create_custom_router_client():
    client = create_llm_client(
        provider="custom_router",
        model="meta-llama/llama-3.3-70b-instruct",
    )
    assert isinstance(client, OpenAIClient)
    assert client.provider == "custom_router"
    assert client.model == "meta-llama/llama-3.3-70b-instruct"


def test_custom_router_model_validation_allows_any_model():
    # Any open-source model slug should be valid for custom_router, freellmapi, openrouter
    assert validate_model("custom_router", "deepseek-ai/deepseek-r1") is True
    assert validate_model("custom_router", "meta-llama/llama-3.3-70b-instruct") is True
    assert validate_model("custom_router", "qwen/qwen-2.5-72b-instruct") is True
    assert validate_model("custom_router", "custom-org/fine-tuned-model:v1") is True
    assert validate_model("freellmapi", "any-arbitrary-model") is True
    assert validate_model("openrouter", "any-arbitrary-model") is True


def test_custom_router_default_base_url_and_headers():
    client = create_llm_client(
        provider="custom_router",
        model="deepseek-ai/deepseek-v3",
    )
    llm = client.get_llm()
    # NormalizedChatOpenAI instance
    assert "freellmapi.com/v1" in str(llm.openai_api_base)
    # Check default headers contain referer
    assert "HTTP-Referer" in llm.default_headers
    assert "Indian Trading Agent" in llm.default_headers.get("X-Title", "")


def test_custom_router_explicit_base_url():
    custom_url = "https://openrouter.ai/api/v1"
    client = create_llm_client(
        provider="custom_router",
        model="meta-llama/llama-3.3-70b-instruct",
        base_url=custom_url,
    )
    llm = client.get_llm()
    assert str(llm.openai_api_base).rstrip("/") == custom_url.rstrip("/")


def test_custom_router_db_base_url_lookup():
    with patch("backend.db.get_setting") as mock_get_setting:
        def get_setting_mock(key):
            if key == "base_url_custom_router":
                return "https://my-vllm-server.internal/v1"
            if key == "api_key_custom_router":
                return "sk-unified-token-12345"
            return None
        mock_get_setting.side_effect = get_setting_mock

        client = create_llm_client(
            provider="custom_router",
            model="meta-llama/llama-3.3-70b-instruct",
        )
        llm = client.get_llm()
        assert "my-vllm-server.internal/v1" in str(llm.openai_api_base)
        assert llm.openai_api_key.get_secret_value() == "sk-unified-token-12345"
