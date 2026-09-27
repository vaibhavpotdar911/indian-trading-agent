"""Read-only Groww integration module.

Synchronizes Groww holdings and positions for equity portfolio analysis.
"""

from __future__ import annotations

import json
import logging
import os
import httpx
from typing import Any
from backend.db import get_setting, set_setting

logger = logging.getLogger(__name__)

GROWW_CLIENT_ID = "groww_client_id"
GROWW_API_TOKEN = "groww_api_token"
GROWW_PROFILE = "groww_profile"

GROWW_BASE_URL = "https://groww.in/v1/api"


def get_groww_credentials() -> dict[str, str]:
    return {
        "client_id": (get_setting(GROWW_CLIENT_ID) or os.getenv("GROWW_CLIENT_ID") or "").strip(),
        "api_token": (get_setting(GROWW_API_TOKEN) or os.getenv("GROWW_API_TOKEN") or "").strip(),
    }


def save_groww_credentials(credentials: dict[str, str]) -> dict[str, Any]:
    client_id = credentials.get("client_id", "").strip()
    api_token = credentials.get("api_token", "").strip()

    if client_id:
        set_setting(GROWW_CLIENT_ID, client_id)
    if api_token:
        set_setting(GROWW_API_TOKEN, api_token)

    status = get_groww_status()
    return {"status": "saved", "broker": "groww", "details": status}


def get_groww_status() -> dict[str, Any]:
    creds = get_groww_credentials()
    configured = bool(creds["client_id"] or creds["api_token"])
    profile_raw = get_setting(GROWW_PROFILE)

    profile = None
    if profile_raw:
        try:
            profile = json.loads(profile_raw)
        except Exception:
            pass

    return {
        "broker": "groww",
        "broker_name": "Groww",
        "configured": configured,
        "authenticated": bool(creds["api_token"] or configured),
        "client_id": creds["client_id"] or None,
        "user_name": profile.get("name") if profile else None,
    }


def sync_groww_positions() -> list[dict[str, Any]]:
    creds = get_groww_credentials()
    if not creds["api_token"]:
        return []

    headers = {
        "Authorization": f"Bearer {creds['api_token']}",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{GROWW_BASE_URL}/stocks/v1/user/positions", headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("positions") or []
                positions = []
                for p in data:
                    trading_symbol = p.get("tradingSymbol", "")
                    symbol = trading_symbol if trading_symbol.endswith(".NS") else f"{trading_symbol}.NS"
                    net_qty = int(p.get("quantity", 0))
                    buy_price = float(p.get("averagePrice", 0.0) or 0.0)
                    ltp = float(p.get("lastTradedPrice", 0.0) or buy_price)
                    pnl = float(p.get("realizedPnl", 0.0) or (ltp - buy_price) * net_qty)
                    positions.append({
                        "ticker": trading_symbol,
                        "symbol": symbol,
                        "company_name": p.get("companyName", trading_symbol),
                        "quantity": net_qty,
                        "buy_price": buy_price,
                        "current_price": ltp,
                        "pnl": pnl,
                        "pnl_pct": round((pnl / (buy_price * net_qty)) * 100, 2) if (buy_price * net_qty) else 0.0,
                        "product_type": "INTRADAY" if p.get("productType") == "MIS" else "DELIVERY",
                        "broker": "groww",
                    })
                return positions
    except Exception as e:
        logger.warning("Failed to fetch Groww positions: %s", e)

    return []


def sync_groww_holdings() -> list[dict[str, Any]]:
    creds = get_groww_credentials()
    if not creds["api_token"]:
        return []

    headers = {
        "Authorization": f"Bearer {creds['api_token']}",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{GROWW_BASE_URL}/stocks/v1/user/holdings", headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("holdings") or []
                holdings = []
                for h in data:
                    trading_symbol = h.get("tradingSymbol", "")
                    symbol = trading_symbol if trading_symbol.endswith(".NS") else f"{trading_symbol}.NS"
                    qty = int(h.get("quantity", 0))
                    buy_price = float(h.get("averagePrice", 0.0) or 0.0)
                    ltp = float(h.get("lastTradedPrice", 0.0) or buy_price)
                    pnl = float(h.get("unrealizedPnl", 0.0) or (ltp - buy_price) * qty)
                    holdings.append({
                        "ticker": trading_symbol,
                        "symbol": symbol,
                        "company_name": h.get("companyName", trading_symbol),
                        "quantity": qty,
                        "buy_price": buy_price,
                        "current_price": ltp,
                        "pnl": pnl,
                        "pnl_pct": round((pnl / (buy_price * qty)) * 100, 2) if (buy_price * qty) else 0.0,
                        "product_type": "DELIVERY",
                        "broker": "groww",
                    })
                return holdings
    except Exception as e:
        logger.warning("Failed to fetch Groww holdings: %s", e)

    return []
