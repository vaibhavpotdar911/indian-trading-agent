"""Read-only Angel One (SmartAPI) integration module.

Fetches holdings and positions securely without order execution privileges.
"""

from __future__ import annotations

import json
import logging
import os
import httpx
from typing import Any
from backend.db import get_setting, set_setting

logger = logging.getLogger(__name__)

ANGEL_API_KEY = "angel_one_api_key"
ANGEL_CLIENT_CODE = "angel_one_client_code"
ANGEL_PASSWORD = "angel_one_password"
ANGEL_TOTP_SECRET = "angel_one_totp_secret"
ANGEL_JWT_TOKEN = "angel_one_jwt_token"
ANGEL_REFRESH_TOKEN = "angel_one_refresh_token"
ANGEL_PROFILE = "angel_one_profile"

SMARTAPI_BASE_URL = "https://apiconnect.angelbroking.com"


def get_angel_one_credentials() -> dict[str, str]:
    return {
        "api_key": (get_setting(ANGEL_API_KEY) or os.getenv("ANGEL_ONE_API_KEY") or "").strip(),
        "client_code": (get_setting(ANGEL_CLIENT_CODE) or os.getenv("ANGEL_ONE_CLIENT_CODE") or "").strip(),
        "password": (get_setting(ANGEL_PASSWORD) or os.getenv("ANGEL_ONE_PASSWORD") or "").strip(),
        "totp_secret": (get_setting(ANGEL_TOTP_SECRET) or os.getenv("ANGEL_ONE_TOTP_SECRET") or "").strip(),
    }


def save_angel_one_credentials(credentials: dict[str, str]) -> dict[str, Any]:
    api_key = credentials.get("api_key", "").strip()
    client_code = credentials.get("client_code", "").strip()
    password = credentials.get("password", "").strip()
    totp_secret = credentials.get("totp_secret", "").strip()

    if api_key:
        set_setting(ANGEL_API_KEY, api_key)
    if client_code:
        set_setting(ANGEL_CLIENT_CODE, client_code)
    if password:
        set_setting(ANGEL_PASSWORD, password)
    if totp_secret:
        set_setting(ANGEL_TOTP_SECRET, totp_secret)

    status = get_angel_one_status()
    return {"status": "saved", "broker": "angel_one", "details": status}


def get_angel_one_status() -> dict[str, Any]:
    creds = get_angel_one_credentials()
    configured = bool(creds["api_key"] and creds["client_code"])
    jwt_token = get_setting(ANGEL_JWT_TOKEN) or ""
    profile_raw = get_setting(ANGEL_PROFILE)

    profile = None
    if profile_raw:
        try:
            profile = json.loads(profile_raw)
        except Exception:
            pass

    return {
        "broker": "angel_one",
        "broker_name": "Angel One",
        "configured": configured,
        "authenticated": bool(jwt_token),
        "client_code": creds["client_code"] or None,
        "user_name": profile.get("name") if profile else None,
    }


def sync_angel_one_positions() -> list[dict[str, Any]]:
    creds = get_angel_one_credentials()
    if not creds["api_key"] or not creds["client_code"]:
        return []

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
        "X-PrivateKey": creds["api_key"],
    }
    jwt_token = get_setting(ANGEL_JWT_TOKEN)
    if jwt_token:
        headers["Authorization"] = f"Bearer {jwt_token}"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{SMARTAPI_BASE_URL}/rest/secure/angelbroking/order/v1/getPosition", headers=headers)
            if resp.status_code == 200:
                body = resp.json()
                data = body.get("data") or []
                positions = []
                for p in data:
                    trading_symbol = p.get("tradingsymbol", "")
                    symbol = trading_symbol if trading_symbol.endswith(".NS") else f"{trading_symbol}.NS"
                    net_qty = int(p.get("netqty", 0))
                    buy_price = float(p.get("buyavgprice", 0.0) or 0.0)
                    ltp = float(p.get("ltp", 0.0) or buy_price)
                    pnl = float(p.get("pnl", 0.0) or (ltp - buy_price) * net_qty)
                    positions.append({
                        "ticker": trading_symbol,
                        "symbol": symbol,
                        "company_name": p.get("symbolname", trading_symbol),
                        "quantity": net_qty,
                        "buy_price": buy_price,
                        "current_price": ltp,
                        "pnl": pnl,
                        "pnl_pct": round((pnl / (buy_price * net_qty)) * 100, 2) if (buy_price * net_qty) else 0.0,
                        "product_type": p.get("producttype", "DELIVERY"),
                        "broker": "angel_one",
                    })
                return positions
    except Exception as e:
        logger.warning("Failed to fetch Angel One positions: %s", e)

    return []


def sync_angel_one_holdings() -> list[dict[str, Any]]:
    creds = get_angel_one_credentials()
    if not creds["api_key"] or not creds["client_code"]:
        return []

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
        "X-PrivateKey": creds["api_key"],
    }
    jwt_token = get_setting(ANGEL_JWT_TOKEN)
    if jwt_token:
        headers["Authorization"] = f"Bearer {jwt_token}"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{SMARTAPI_BASE_URL}/rest/secure/angelbroking/portfolio/v1/getHolding", headers=headers)
            if resp.status_code == 200:
                body = resp.json()
                data = body.get("data") or []
                holdings = []
                for h in data:
                    trading_symbol = h.get("tradingsymbol", "")
                    symbol = trading_symbol if trading_symbol.endswith(".NS") else f"{trading_symbol}.NS"
                    qty = int(h.get("quantity", 0))
                    buy_price = float(h.get("averageprice", 0.0) or 0.0)
                    ltp = float(h.get("ltp", 0.0) or buy_price)
                    pnl = float(h.get("profitandloss", 0.0) or (ltp - buy_price) * qty)
                    holdings.append({
                        "ticker": trading_symbol,
                        "symbol": symbol,
                        "company_name": h.get("symbolname", trading_symbol),
                        "quantity": qty,
                        "buy_price": buy_price,
                        "current_price": ltp,
                        "pnl": pnl,
                        "pnl_pct": round((pnl / (buy_price * qty)) * 100, 2) if (buy_price * qty) else 0.0,
                        "product_type": "DELIVERY",
                        "broker": "angel_one",
                    })
                return holdings
    except Exception as e:
        logger.warning("Failed to fetch Angel One holdings: %s", e)

    return []
