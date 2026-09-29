"""Unified Broker Manager — manages persistent active broker tabs, credentials, and multi-broker sync."""

from __future__ import annotations

import json
import logging
from typing import Any
from backend.db import get_setting, set_setting
from backend.brokers import kite, upstox, kotak_neo, angel_one, fivepaisa, groww

logger = logging.getLogger(__name__)

ACTIVE_BROKER_TABS_SETTING = "active_broker_tabs"

SUPPORTED_BROKERS: dict[str, dict[str, Any]] = {
    "kite": {
        "name": "Zerodha Kite",
        "key": "kite",
        "requires_auth": True,
        "fields": [
            {"name": "api_key", "label": "Kite API Key", "type": "text", "required": True},
            {"name": "api_secret", "label": "Kite API Secret", "type": "password", "required": True},
            {"name": "access_token", "label": "Access Token (Optional)", "type": "password", "required": False},
        ],
    },
    "upstox": {
        "name": "Upstox",
        "key": "upstox",
        "requires_auth": True,
        "fields": [
            {"name": "client_id", "label": "API Key / Client ID", "type": "text", "required": True},
            {"name": "client_secret", "label": "API Secret", "type": "password", "required": True},
            {"name": "redirect_uri", "label": "Redirect URI", "type": "text", "required": False},
            {"name": "access_token", "label": "Access Token (Optional)", "type": "password", "required": False},
        ],
    },
    "kotak_neo": {
        "name": "Kotak Neo",
        "key": "kotak_neo",
        "requires_auth": True,
        "fields": [
            {"name": "consumer_key", "label": "Consumer Key", "type": "text", "required": True},
            {"name": "consumer_secret", "label": "Consumer Secret", "type": "password", "required": True},
            {"name": "mobile_number", "label": "Mobile Number (+91)", "type": "text", "required": True},
            {"name": "password", "label": "Password / PIN", "type": "password", "required": True},
        ],
    },
    "angel_one": {
        "name": "Angel One",
        "key": "angel_one",
        "requires_auth": True,
        "fields": [
            {"name": "api_key", "label": "SmartAPI Key", "type": "text", "required": True},
            {"name": "client_code", "label": "Client Code / User ID", "type": "text", "required": True},
            {"name": "password", "label": "MPIN / Password", "type": "password", "required": True},
            {"name": "totp_secret", "label": "TOTP Secret Key (Optional)", "type": "password", "required": False},
        ],
    },
    "groww": {
        "name": "Groww",
        "key": "groww",
        "requires_auth": True,
        "fields": [
            {"name": "client_id", "label": "Groww Client ID", "type": "text", "required": True},
            {"name": "api_token", "label": "API Access Token", "type": "password", "required": True},
        ],
    },
    "fivepaisa": {
        "name": "5paisa",
        "key": "fivepaisa",
        "requires_auth": True,
        "fields": [
            {"name": "app_name", "label": "App Name", "type": "text", "required": True},
            {"name": "user_key", "label": "User Key", "type": "text", "required": True},
            {"name": "encryption_key", "label": "Encryption Key", "type": "password", "required": True},
            {"name": "user_id", "label": "Client Code / User ID", "type": "text", "required": True},
        ],
    },
}


def get_active_broker_tabs() -> list[dict[str, Any]]:
    """Return active broker tabs saved in SQLite DB that are configured or connected."""
    raw = get_setting(ACTIVE_BROKER_TABS_SETTING)
    active_keys = []
    if raw:
        try:
            active_keys = json.loads(raw)
        except Exception:
            active_keys = []

    result = []
    for key in active_keys:
        if key in SUPPORTED_BROKERS:
            status = get_broker_status(key)
            # Only include the tab if the user has actually configured credentials or connected
            if status.get("configured") or status.get("connected_today"):
                meta = SUPPORTED_BROKERS[key].copy()
                meta["status"] = status
                result.append(meta)

    return result


def get_all_supported_brokers() -> list[dict[str, Any]]:
    """Return all supported brokers for the Add Broker modal dropdown."""
    active_tabs = {b["key"] for b in get_active_broker_tabs()}
    res = []
    for key, info in SUPPORTED_BROKERS.items():
        item = info.copy()
        item["active"] = key in active_tabs
        res.append(item)
    return res


def configure_broker(broker_key: str, credentials: dict[str, Any]) -> dict[str, Any]:
    """Save credentials for a broker and persist its tab in SQLite DB."""
    broker_key = broker_key.lower().strip()
    if broker_key not in SUPPORTED_BROKERS:
        raise ValueError(f"Unsupported broker: {broker_key}")

    # Dispatch credential save
    if broker_key == "kite":
        kite.save_credentials({"api_key": credentials.get("api_key", ""), "api_secret": credentials.get("api_secret", ""), "access_token": credentials.get("access_token", "")})
    elif broker_key == "upstox":
        upstox.save_credentials({"client_id": credentials.get("client_id", ""), "client_secret": credentials.get("client_secret", ""), "redirect_uri": credentials.get("redirect_uri", ""), "access_token": credentials.get("access_token", "")})
    elif broker_key == "kotak_neo":
        kotak_neo.save_credentials({"consumer_key": credentials.get("consumer_key", ""), "consumer_secret": credentials.get("consumer_secret", ""), "mobile_number": credentials.get("mobile_number", ""), "password": credentials.get("password", "")})
    elif broker_key == "angel_one":
        angel_one.save_angel_one_credentials(credentials)
    elif broker_key == "fivepaisa":
        fivepaisa.save_fivepaisa_credentials(credentials)
    elif broker_key == "groww":
        groww.save_groww_credentials(credentials)

    # Persist in active_broker_tabs list in DB
    raw = get_setting(ACTIVE_BROKER_TABS_SETTING)
    active_keys = []
    if raw:
        try:
            active_keys = json.loads(raw)
        except Exception:
            active_keys = []

    if broker_key not in active_keys:
        active_keys.append(broker_key)
        set_setting(ACTIVE_BROKER_TABS_SETTING, json.dumps(active_keys))

    status = get_broker_status(broker_key)
    return {"status": "configured", "broker": broker_key, "details": status, "active_tabs": get_active_broker_tabs()}


def remove_broker(broker_key: str) -> dict[str, Any]:
    """Remove a broker from persistent active tabs."""
    broker_key = broker_key.lower().strip()
    raw = get_setting(ACTIVE_BROKER_TABS_SETTING)
    active_keys = []
    if raw:
        try:
            active_keys = json.loads(raw)
        except Exception:
            active_keys = []

    if broker_key in active_keys:
        active_keys.remove(broker_key)
        set_setting(ACTIVE_BROKER_TABS_SETTING, json.dumps(active_keys))

    return {"status": "removed", "broker": broker_key, "active_tabs": get_active_broker_tabs()}


def get_broker_status(broker_key: str) -> dict[str, Any]:
    broker_key = broker_key.lower().strip()
    if broker_key == "kite":
        return kite.get_status()
    elif broker_key == "upstox":
        return upstox.get_status()
    elif broker_key == "kotak_neo":
        return kotak_neo.get_status()
    elif broker_key == "angel_one":
        return angel_one.get_angel_one_status()
    elif broker_key == "fivepaisa":
        return fivepaisa.get_fivepaisa_status()
    elif broker_key == "groww":
        return groww.get_groww_status()
    return {"broker": broker_key, "configured": False, "authenticated": False}


def sync_broker_positions(broker_key: str) -> list[dict[str, Any]]:
    broker_key = broker_key.lower().strip()
    if broker_key == "kite":
        return kite.sync_positions()
    elif broker_key == "upstox":
        return upstox.sync_positions()
    elif broker_key == "kotak_neo":
        return kotak_neo.sync_positions()
    elif broker_key == "angel_one":
        return angel_one.sync_angel_one_positions()
    elif broker_key == "fivepaisa":
        return fivepaisa.sync_fivepaisa_positions()
    elif broker_key == "groww":
        return groww.sync_groww_positions()
    return []


def sync_broker_holdings(broker_key: str) -> list[dict[str, Any]]:
    broker_key = broker_key.lower().strip()
    if broker_key == "kite":
        return kite.sync_holdings()
    elif broker_key == "upstox":
        return upstox.sync_holdings()
    elif broker_key == "kotak_neo":
        return kotak_neo.sync_holdings()
    elif broker_key == "angel_one":
        return angel_one.sync_angel_one_holdings()
    elif broker_key == "fivepaisa":
        return fivepaisa.sync_fivepaisa_holdings()
    elif broker_key == "groww":
        return groww.sync_groww_holdings()
    return []
