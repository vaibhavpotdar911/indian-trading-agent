"""Tests for router settings, discovery, and adaptive quota tracking."""

import pytest
from unittest.mock import patch, MagicMock
from backend.settings_manager import (
    get_provider_base_url,
    save_provider_base_url,
    sanitize_model_name,
    test_api_key as check_api_key,
    PROVIDERS_INFO,
)
from backend.routers.settings import list_providers, discover_router_models, DiscoverModelsRequest
from backend.quota_tracker import QuotaTracker


def test_custom_router_in_providers_info():
    assert "custom_router" in PROVIDERS_INFO
    info = PROVIDERS_INFO["custom_router"]
    assert info["supports_custom_url"] is True
    assert info["default_base_url"] == "https://freellmapi.com/v1"
    assert "deepseek-ai/deepseek-r1" in info["models_deep"]
    assert "meta-llama/llama-3.3-70b-instruct" in info["models_quick"]


def test_base_url_get_and_save():
    with patch("backend.settings_manager.set_setting") as mock_set, patch("backend.settings_manager.get_setting") as mock_get:
        # Default
        mock_get.return_value = None
        assert get_provider_base_url("custom_router") == "https://freellmapi.com/v1"

        # Custom saved
        mock_get.return_value = "https://openrouter.ai/api/v1"
        assert get_provider_base_url("custom_router") == "https://openrouter.ai/api/v1"

        # Save
        save_provider_base_url("custom_router", "https://unorouter.ai/api/v1/")
        mock_set.assert_called_with("base_url_custom_router", "https://unorouter.ai/api/v1")


def test_sanitize_model_name_does_not_force_gemini_for_custom_router():
    # If custom model is provided, it is preserved
    assert sanitize_model_name("meta-llama/llama-3.3-70b-instruct", kind="quick", provider="custom_router") == "meta-llama/llama-3.3-70b-instruct"
    assert sanitize_model_name("deepseek-ai/deepseek-r1", kind="deep", provider="custom_router") == "deepseek-ai/deepseek-r1"

    # If empty, provider defaults are chosen, NOT gemini
    assert "llama" in sanitize_model_name("", kind="quick", provider="custom_router").lower()
    assert "deepseek" in sanitize_model_name("", kind="deep", provider="custom_router").lower()


def test_test_api_key_custom_router():
    with patch("backend.settings_manager.get_provider_base_url", return_value="https://freellmapi.com/v1"), \
         patch("openai.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_model = MagicMock()
        mock_model.id = "meta-llama/llama-3.3-70b-instruct"
        mock_client.models.list.return_value = MagicMock(data=[mock_model])
        mock_client.chat.completions.create.return_value = MagicMock()

        res = check_api_key("custom_router", "sk-test-unified-key")
        assert res["ok"] is True
        assert res["model"] == "meta-llama/llama-3.3-70b-instruct"
        assert "Connected to" in res["message"]


def test_discover_router_models_endpoint():
    with patch("openai.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        m1 = MagicMock()
        m1.id = "meta-llama/llama-3.3-70b-instruct"
        m2 = MagicMock()
        m2.id = "deepseek-ai/deepseek-r1"
        mock_client.models.list.return_value = MagicMock(data=[m1, m2])

        req = DiscoverModelsRequest(
            provider="custom_router",
            base_url="https://freellmapi.com/v1",
            api_key="sk-test",
        )
        res = discover_router_models(req)
        assert res["reachable"] is True
        assert res["count"] == 2
        assert "meta-llama/llama-3.3-70b-instruct" in res["models"]
        assert "deepseek-ai/deepseek-r1" in res["models"]


def test_adaptive_quota_tracker_custom_router():
    tracker = QuotaTracker()
    status = tracker.get_status(provider="custom_router", model="meta-llama/llama-3.3-70b-instruct")
    assert status["rpm_limit"] == 120
    assert status["tpm_limit"] == 2_000_000
    assert status["status"] == "ready"
    assert status["can_trigger"] is True
    assert "Router ready" in status["status_message"]
