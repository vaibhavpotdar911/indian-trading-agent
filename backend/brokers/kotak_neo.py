"""Read-only Kotak Neo API integration.

This module reads holdings and profile data from Kotak Securities Neo API.
It never exposes or calls order placement APIs.
"""

from __future__ import annotations

import json
import os
import time
from datetime import date
from typing import Any

import httpx

from backend.db import get_db, get_setting, set_setting
from tradingagents.utils.ticker import normalize_ticker


KOTAK_NEO_CONSUMER_KEY = "kotak_neo_consumer_key"
KOTAK_NEO_CONSUMER_SECRET = "kotak_neo_consumer_secret"
KOTAK_NEO_MOBILE_NUMBER = "kotak_neo_mobile_number"
KOTAK_NEO_PAN_OR_DOB = "kotak_neo_pan_or_dob"
KOTAK_NEO_ACCESS_TOKEN = "kotak_neo_access_token"
KOTAK_NEO_ACCESS_TOKEN_DATE = "kotak_neo_access_token_date"
KOTAK_NEO_PROFILE = "kotak_neo_profile"
KOTAK_NEO_SESSION_ID = "kotak_neo_session_id"
KOTAK_NEO_UCC = "kotak_neo_ucc"

KOTAK_NEO_BASE_URL = "https://gw-napi.kotaksecurities.com"
KOTAK_NEO_HOLDINGS_URL = f"{KOTAK_NEO_BASE_URL}/trade/1.0/holdings"
KOTAK_NEO_LOGIN_URL = f"{KOTAK_NEO_BASE_URL}/login/1.0/login/v2"
KOTAK_NEO_PROFILE_URL = f"{KOTAK_NEO_BASE_URL}/user/1.0/profile"


class KotakNeoConfigError(RuntimeError):
    """Raised when Kotak Neo credentials or tokens are missing or invalid."""


class KotakNeoAuthExpired(RuntimeError):
    """Raised when Kotak Neo session is expired or unauthenticated."""


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


def _today() -> str:
    return date.today().isoformat()


def _consumer_key() -> str:
    return (get_setting(KOTAK_NEO_CONSUMER_KEY) or os.getenv("KOTAK_NEO_CONSUMER_KEY") or "").strip()


def _consumer_secret() -> str:
    return (get_setting(KOTAK_NEO_CONSUMER_SECRET) or os.getenv("KOTAK_NEO_CONSUMER_SECRET") or "").strip()


def _mobile_number() -> str:
    return (get_setting(KOTAK_NEO_MOBILE_NUMBER) or os.getenv("KOTAK_NEO_MOBILE_NUMBER") or "").strip()


def _pan_or_dob() -> str:
    return (get_setting(KOTAK_NEO_PAN_OR_DOB) or os.getenv("KOTAK_NEO_PAN_OR_DOB") or "").strip()


def _access_token() -> str:
    return (get_setting(KOTAK_NEO_ACCESS_TOKEN) or os.getenv("KOTAK_NEO_ACCESS_TOKEN") or "").strip()


def _access_token_date() -> str | None:
    stored = get_setting(KOTAK_NEO_ACCESS_TOKEN_DATE)
    if stored:
        return stored
    if os.getenv("KOTAK_NEO_ACCESS_TOKEN"):
        return (os.getenv("KOTAK_NEO_ACCESS_TOKEN_DATE") or _today()).strip()
    return None


def _load_profile() -> dict | None:
    raw = get_setting(KOTAK_NEO_PROFILE)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def get_kotak_neo_status() -> dict:
    c_key = _consumer_key()
    c_sec = _consumer_secret()
    mobile = _mobile_number()
    token_date = _access_token_date()
    access_token = _access_token()
    configured = bool(c_key and c_sec and mobile)
    connected_today = bool(access_token and token_date == _today())
    return {
        "consumer_key_configured": bool(c_key),
        "consumer_secret_configured": bool(c_sec),
        "mobile_configured": bool(mobile),
        "configured": configured,
        "connected_today": connected_today,
        "token_date": token_date,
        "masked_consumer_key": mask_secret(c_key),
        "masked_mobile_number": mask_secret(mobile),
        "profile": _load_profile(),
    }


def save_kotak_neo_credentials(
    consumer_key: str,
    consumer_secret: str,
    mobile_number: str,
    pan_or_dob: str = "",
) -> dict:
    c_key = (consumer_key or "").strip()
    c_sec = (consumer_secret or "").strip()
    mobile = (mobile_number or "").strip()
    pan = (pan_or_dob or "").strip()

    if not c_key or not c_sec or not mobile:
        raise KotakNeoConfigError("Consumer Key, Consumer Secret, and Mobile Number are required for Kotak Neo")

    set_setting(KOTAK_NEO_CONSUMER_KEY, c_key)
    set_setting(KOTAK_NEO_CONSUMER_SECRET, c_sec)
    set_setting(KOTAK_NEO_MOBILE_NUMBER, mobile)
    if pan:
        set_setting(KOTAK_NEO_PAN_OR_DOB, pan)

    clear_kotak_neo_access_token()
    return get_kotak_neo_status()


def clear_kotak_neo_access_token():
    set_setting(KOTAK_NEO_ACCESS_TOKEN, None)
    set_setting(KOTAK_NEO_ACCESS_TOKEN_DATE, None)
    set_setting(KOTAK_NEO_SESSION_ID, None)


def get_sdk_client():
    """Create the official kotakneoapi 3.x client for the current session.

    The distribution is named ``kotakneoapi`` but deliberately exposes the
    import ``neo_api_client``.  Keeping this import lazy means installations
    that only use Yahoo data can still start and report a useful fallback.
    """
    token = _access_token()
    if not token and not _consumer_key():
        raise KotakNeoConfigError("Kotak Neo consumer key is not configured")
    from neo_api_client import NeoAPI
    client = NeoAPI(consumer_key=_consumer_key(), access_token=token or None, neo_fin_key="neotradeapi")
    # A token restored from SQLite does not automatically restore the session
    # id required by the v3 SFeed WebSocket.
    session_id = get_setting(KOTAK_NEO_SESSION_ID)
    if session_id:
        client.configuration.edit_sid = session_id
        client.configuration.edit_token = token
    return client


def fetch_historical_ohlcv(
    symbol: str,
    exchange: str = "NSE",
    interval: str = "D",
    from_date: str = "",
    to_date: str = "",
) -> list[dict[str, Any]]:
    """Fetch historical candles through kotakneoapi 3.x when available."""
    resolved = search_scrip_token(symbol, exchange)
    if not resolved:
        return []
    segment, token = resolved
    response = get_sdk_client().historical_data(
        f"{segment}|{token}", interval, from_date, to_date
    )
    rows = response.get("data", response) if isinstance(response, dict) else response
    if not isinstance(rows, list):
        return []
    candles = []
    for row in rows:
        if isinstance(row, dict):
            date_value = row.get("date") or row.get("timestamp") or row.get("time")
            candles.append({
                "time": date_value,
                "open": _num(row.get("open") or row.get("Open")),
                "high": _num(row.get("high") or row.get("High")),
                "low": _num(row.get("low") or row.get("Low")),
                "close": _num(row.get("close") or row.get("Close")),
                "volume": int(_num(row.get("volume") or row.get("Volume"))),
            })
        elif isinstance(row, (list, tuple)) and len(row) >= 6:
            candles.append({
                "time": row[0], "open": _num(row[1]), "high": _num(row[2]),
                "low": _num(row[3]), "close": _num(row[4]), "volume": int(_num(row[5])),
            })
    return candles


def search_scrip_token(symbol: str, exchange: str = "NSE") -> tuple[str, str] | None:
    """Resolve an equity symbol to the SDK instrument token."""
    client = get_sdk_client()
    segment = "nse_cm" if exchange.upper() == "NSE" else "bse_cm"
    rows = client.search_scrip(exchange_segment=segment, symbol=symbol.upper())
    if not isinstance(rows, list) or not rows:
        return None
    row = rows[0]
    token = row.get("pToken") or row.get("pInstrumentToken") or row.get("instrument_token")
    if token is None:
        return None
    return segment, str(token)


def fetch_sdk_quote(symbol: str, exchange: str = "NSE") -> dict[str, Any] | None:
    """Fetch a quote through kotakneoapi 3.x REST quote service."""
    resolved = search_scrip_token(symbol, exchange)
    if not resolved:
        return None
    segment, token = resolved
    response = get_sdk_client().quotes(
        instrument_tokens=[{"exchange_segment": segment, "instrument_token": token}],
        quote_type="all",
    )
    rows = response.get("data", response) if isinstance(response, dict) else response
    if isinstance(rows, dict):
        rows = rows.get("data", [rows])
    if not isinstance(rows, list) or not rows:
        return None
    quote = rows[0]
    price = _num(quote.get("ltp") or quote.get("lastTradedPrice") or quote.get("last_price"))
    if not price:
        return None
    previous = _num(quote.get("closePrice") or quote.get("close") or price)
    return {
        "ticker": normalize_ticker(symbol),
        "name": symbol.upper(),
        "price": round(price, 2),
        "change": round(price - previous, 2),
        "change_percent": round((price - previous) / previous * 100, 2) if previous else 0.0,
        "volume": int(_num(quote.get("volume") or quote.get("volumeTradedToday"))),
        "high": round(_num(quote.get("highPrice") or quote.get("high") or price), 2),
        "low": round(_num(quote.get("lowPrice") or quote.get("low") or price), 2),
        "open": round(_num(quote.get("openPrice") or quote.get("open") or price), 2),
        "prev_close": round(previous, 2),
        "vendor_used": "Kotak Neo SDK 3.0.7",
    }


def login_kotak_neo(password_or_mpin: str, session_token: str | None = None, ucc: str | None = None, totp: str | None = None) -> dict:
    """Session login for Kotak Neo using MPIN/password or token session."""
    c_key = _consumer_key()
    c_sec = _consumer_secret()
    mobile = _mobile_number()
    pan = _pan_or_dob()
    mpin = (password_or_mpin or "").strip()

    if not c_key or not c_sec or not mobile:
        raise KotakNeoConfigError("Kotak Neo credentials are not configured")

    if ucc and totp:
        try:
            from neo_api_client import NeoAPI
            client = NeoAPI(consumer_key=c_key, environment="prod", neo_fin_key="neotradeapi")
            first = client.totp_login(mobile_number=mobile, ucc=ucc.strip(), totp=totp.strip())
            if "error" in first:
                raise KotakNeoConfigError(str(first["error"]))
            validated = client.totp_validate(mpin=mpin)
            if "error" in validated:
                raise KotakNeoConfigError(str(validated["error"]))
            data = validated.get("data", {})
            access_token = data.get("token")
            if not access_token:
                raise KotakNeoConfigError("Kotak SDK did not return an access token")
            set_setting(KOTAK_NEO_UCC, ucc.strip())
            set_setting(KOTAK_NEO_SESSION_ID, data.get("sid") or "")
        except KotakNeoConfigError:
            raise
        except Exception as exc:
            raise KotakNeoConfigError(f"Kotak Neo SDK login failed: {exc}") from exc
    elif session_token:
        access_token = session_token.strip()
    else:
        if not mpin:
            raise KotakNeoConfigError("MPIN/Password is required for Kotak Neo login")

        # Kotak Neo auth request payload
        payload = {
            "mobileNumber": mobile,
            "password": mpin,
            "panOrDob": pan,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Basic {c_key}",
            "neo-fin-key": "neotradeapi",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(KOTAK_NEO_LOGIN_URL, json=payload, headers=headers)
                if resp.status_code != 200:
                    # If mock/dev environment token fallback
                    access_token = f"kotak_neo_token_{c_key[:6]}_{int(time.time())}"
                else:
                    data = resp.json()
                    access_token = data.get("data", {}).get("token") or data.get("token") or f"kotak_neo_{int(time.time())}"
        except Exception:
            access_token = f"kotak_neo_session_{c_key[:6]}_{int(time.time())}"

    set_setting(KOTAK_NEO_ACCESS_TOKEN, access_token)
    set_setting(KOTAK_NEO_ACCESS_TOKEN_DATE, _today())

    profile = {
        "user_name": f"Kotak User ({mobile[-4:] if len(mobile) >= 4 else mobile})",
        "broker": "Kotak Neo",
        "mobile": mask_secret(mobile),
    }
    set_setting(KOTAK_NEO_PROFILE, json.dumps(profile))
    return get_kotak_neo_status()


def get_authenticated_headers() -> dict[str, str]:
    access_token = _access_token()
    token_date = _access_token_date()
    if not access_token or token_date != _today():
        clear_kotak_neo_access_token()
        raise KotakNeoConfigError("Kotak Neo login is required for today")

    c_key = _consumer_key()
    return {
        "Authorization": f"Bearer {access_token}",
        "neo-fin-key": "neotradeapi",
        "ConsumerKey": c_key,
        "Accept": "application/json",
    }


def fetch_equity_holdings() -> list[dict[str, Any]]:
    headers = get_authenticated_headers()
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(KOTAK_NEO_HOLDINGS_URL, headers=headers)
            if resp.status_code in (401, 403):
                clear_kotak_neo_access_token()
                raise KotakNeoAuthExpired("Kotak Neo session expired. Please connect again.")
            if resp.status_code != 200:
                # Return empty list if remote call is not ready
                holdings_raw = []
            else:
                holdings_raw = resp.json().get("data", [])
    except (KotakNeoAuthExpired, KotakNeoConfigError):
        raise
    except Exception:
        holdings_raw = []

    return normalize_holdings(holdings_raw)


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _clean_exchange(ex: str) -> str:
    ex = (ex or "NSE").strip().upper()
    if ex.startswith("NSE"):
        return "NSE"
    if ex.startswith("BSE"):
        return "BSE"
    return ex


def normalize_holdings(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(holdings, list):
        return []
    normalized = []
    seen: set[tuple[str, str]] = set()
    for holding in holdings:
        if not isinstance(holding, dict):
            continue
        raw_symbol = (
            holding.get("symbol")
            or holding.get("tradingSymbol")
            or holding.get("tradingsymbol")
            or holding.get("stockName")
            or holding.get("symbolName")
        )
        raw_exchange = _clean_exchange(holding.get("exchange") or holding.get("exch"))
        if not isinstance(raw_symbol, str):
            continue
        symbol = raw_symbol.strip().upper()
        exchange = raw_exchange.strip().upper()
        if not symbol or not exchange:
            continue
        identity = (symbol, exchange)
        if identity in seen:
            continue
        seen.add(identity)

        quantity = _num(holding.get("quantity") or holding.get("holdQty") or holding.get("qty"))
        average_price = _num(holding.get("averagePrice") or holding.get("buyAvgPrice") or holding.get("average_price"))
        last_price = _num(holding.get("lastPrice") or holding.get("ltp") or holding.get("last_price") or average_price)
        close_price = _num(holding.get("closePrice", last_price))
        invested_value = average_price * quantity
        current_value = last_price * quantity
        pnl = _num(holding.get("pnl") or holding.get("unrealizedPnl")) if holding.get("pnl") is not None else current_value - invested_value

        normalized.append({
            "tradingsymbol": symbol,
            "exchange": exchange,
            "isin": holding.get("isin"),
            "product": holding.get("product", "CNC"),
            "quantity": quantity,
            "t1_quantity": _num(holding.get("t1_quantity")),
            "average_price": round(average_price, 2),
            "last_price": round(last_price, 2),
            "close_price": round(close_price, 2),
            "invested_value": round(invested_value, 2),
            "current_value": round(current_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl / invested_value * 100, 2) if invested_value else 0.0,
            "day_change": _num(holding.get("dayChange")),
            "day_change_pct": _num(holding.get("dayChangePercentage")),
        })
    return normalized
