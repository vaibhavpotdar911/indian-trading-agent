"""Read-only 5paisa Developer API integration module.

Fetches holdings and positions securely without order placement capabilities.
"""

from __future__ import annotations

import json
import logging
import os
import httpx
from typing import Any
from backend.db import get_setting, set_setting

logger = logging.getLogger(__name__)

FIVEPAISA_APP_NAME = "fivepaisa_app_name"
FIVEPAISA_APP_SOURCE = "fivepaisa_app_source"
FIVEPAISA_USER_KEY = "fivepaisa_user_key"
FIVEPAISA_ENCRYPTION_KEY = "fivepaisa_encryption_key"
FIVEPAISA_USER_ID = "fivepaisa_user_id"
FIVEPAISA_ACCESS_TOKEN = "fivepaisa_access_token"
FIVEPAISA_PROFILE = "fivepaisa_profile"

FIVEPAISA_BASE_URL = "https://openapi.5paisa.com/VendorsAPI/Service1.svc"


def get_fivepaisa_credentials() -> dict[str, str]:
    return {
        "app_name": (get_setting(FIVEPAISA_APP_NAME) or os.getenv("FIVEPAISA_APP_NAME") or "").strip(),
        "app_source": (get_setting(FIVEPAISA_APP_SOURCE) or os.getenv("FIVEPAISA_APP_SOURCE") or "1").strip(),
        "user_key": (get_setting(FIVEPAISA_USER_KEY) or os.getenv("FIVEPAISA_USER_KEY") or "").strip(),
        "encryption_key": (get_setting(FIVEPAISA_ENCRYPTION_KEY) or os.getenv("FIVEPAISA_ENCRYPTION_KEY") or "").strip(),
        "user_id": (get_setting(FIVEPAISA_USER_ID) or os.getenv("FIVEPAISA_USER_ID") or "").strip(),
    }


def save_fivepaisa_credentials(credentials: dict[str, str]) -> dict[str, Any]:
    app_name = credentials.get("app_name", "").strip()
    app_source = credentials.get("app_source", "1").strip()
    user_key = credentials.get("user_key", "").strip()
    encryption_key = credentials.get("encryption_key", "").strip()
    user_id = credentials.get("user_id", "").strip()

    if app_name:
        set_setting(FIVEPAISA_APP_NAME, app_name)
    if app_source:
        set_setting(FIVEPAISA_APP_SOURCE, app_source)
    if user_key:
        set_setting(FIVEPAISA_USER_KEY, user_key)
    if encryption_key:
        set_setting(FIVEPAISA_ENCRYPTION_KEY, encryption_key)
    if user_id:
        set_setting(FIVEPAISA_USER_ID, user_id)

    status = get_fivepaisa_status()
    return {"status": "saved", "broker": "fivepaisa", "details": status}


def get_fivepaisa_status() -> dict[str, Any]:
    creds = get_fivepaisa_credentials()
    configured = bool(creds["user_key"] and creds["encryption_key"] and creds["user_id"])
    access_token = get_setting(FIVEPAISA_ACCESS_TOKEN) or ""
    profile_raw = get_setting(FIVEPAISA_PROFILE)

    profile = None
    if profile_raw:
        try:
            profile = json.loads(profile_raw)
        except Exception:
            pass

    return {
        "broker": "fivepaisa",
        "broker_name": "5paisa",
        "configured": configured,
        "authenticated": bool(access_token or configured),
        "user_id": creds["user_id"] or None,
        "user_name": profile.get("name") if profile else None,
    }


def sync_fivepaisa_positions() -> list[dict[str, Any]]:
    creds = get_fivepaisa_credentials()
    if not creds["user_key"] or not creds["user_id"]:
        return []

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    body = {
        "head": {
            "appName": creds["app_name"],
            "appSource": creds["app_source"],
            "userId": creds["user_id"],
            "userKey": creds["user_key"],
            "encryptionKey": creds["encryption_key"],
        },
        "body": {"ClientCode": creds["user_id"]},
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(f"{FIVEPAISA_BASE_URL}/V1/NetPositionNetWise", json=body, headers=headers)
            if resp.status_code == 200:
                res_json = resp.json()
                data = res_json.get("body", {}).get("NetPositionDetail") or []
                positions = []
                for p in data:
                    trading_symbol = p.get("ScripName", "")
                    symbol = trading_symbol if trading_symbol.endswith(".NS") else f"{trading_symbol}.NS"
                    net_qty = int(p.get("NetQty", 0))
                    buy_price = float(p.get("BuyAvgRate", 0.0) or 0.0)
                    ltp = float(p.get("LTP", 0.0) or buy_price)
                    pnl = float(p.get("BookedPL", 0.0) or (ltp - buy_price) * net_qty)
                    positions.append({
                        "ticker": trading_symbol,
                        "symbol": symbol,
                        "company_name": trading_symbol,
                        "quantity": net_qty,
                        "buy_price": buy_price,
                        "current_price": ltp,
                        "pnl": pnl,
                        "pnl_pct": round((pnl / (buy_price * net_qty)) * 100, 2) if (buy_price * net_qty) else 0.0,
                        "product_type": "INTRADAY" if p.get("OrderType") == "I" else "DELIVERY",
                        "broker": "fivepaisa",
                    })
                return positions
    except Exception as e:
        logger.warning("Failed to fetch 5paisa positions: %s", e)

    return []


def sync_fivepaisa_holdings() -> list[dict[str, Any]]:
    creds = get_fivepaisa_credentials()
    if not creds["user_key"] or not creds["user_id"]:
        return []

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    body = {
        "head": {
            "appName": creds["app_name"],
            "appSource": creds["app_source"],
            "userId": creds["user_id"],
            "userKey": creds["user_key"],
            "encryptionKey": creds["encryption_key"],
        },
        "body": {"ClientCode": creds["user_id"]},
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(f"{FIVEPAISA_BASE_URL}/V1/Holding", json=body, headers=headers)
            if resp.status_code == 200:
                res_json = resp.json()
                data = res_json.get("body", {}).get("Data") or []
                holdings = []
                for h in data:
                    trading_symbol = h.get("ScripName", "")
                    symbol = trading_symbol if trading_symbol.endswith(".NS") else f"{trading_symbol}.NS"
                    qty = int(h.get("Quantity", 0))
                    buy_price = float(h.get("AvgRate", 0.0) or 0.0)
                    ltp = float(h.get("LTP", 0.0) or buy_price)
                    pnl = float((ltp - buy_price) * qty)
                    holdings.append({
                        "ticker": trading_symbol,
                        "symbol": symbol,
                        "company_name": h.get("SymbolName", trading_symbol),
                        "quantity": qty,
                        "buy_price": buy_price,
                        "current_price": ltp,
                        "pnl": pnl,
                        "pnl_pct": round((pnl / (buy_price * qty)) * 100, 2) if (buy_price * qty) else 0.0,
                        "product_type": "DELIVERY",
                        "broker": "fivepaisa",
                    })
                return holdings
    except Exception as e:
        logger.warning("Failed to fetch 5paisa holdings: %s", e)

    return []
