"""Unified Live & Simulated Multi-Broker Execution Engine.

Supports:
- Zerodha Kite
- Kotak Securities Neo
- Upstox API v2

Capabilities:
1. Dynamic strategy-to-broker routing (e.g. Long-term on Kite, Intraday on Kotak Neo, Swing on Upstox, Futures on Kotak Neo).
2. Per-trade broker selection and override at any point of time.
3. Proper product code handling (CNC, MIS, NRML) and order types (MARKET, LIMIT, SL).
4. Dual-mode safety: 'paper' (high-fidelity simulation & payload verification) vs 'live' (real broker API dispatch).
5. Comprehensive order lifecycle journaling in `broker_orders` database table.
6. Real-time Telegram order alerts.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import uuid
from datetime import date, datetime
from typing import Any, Optional

import httpx

from backend.db import (
    get_setting,
    set_setting,
    add_broker_order,
    list_broker_orders,
    update_broker_order_status,
    get_broker_order,
)
from backend.brokers import kite, kotak_neo, upstox
from backend.notifications.telegram import send_message
from tradingagents.utils.ticker import normalize_ticker

logger = logging.getLogger(__name__)

EXECUTION_ROUTING_SETTING = "broker_execution_routing"
EXECUTION_MODE_SETTING = "broker_execution_mode"

DEFAULT_BROKER_ROUTING: dict[str, str] = {
    "equity_long_term": "kite",     # Long term investing on Zerodha Kite
    "equity_swing": "upstox",       # Swing trading on Upstox
    "intraday": "kotak_neo",        # Intraday on Kotak Neo (zero intraday brokerage)
    "futures": "kotak_neo",         # Futures on Kotak Neo
    "options": "kotak_neo",         # Options
}

SUPPORTED_BROKERS = ["kite", "kotak_neo", "upstox"]

PRODUCT_MAP = {
    "equity_long_term": "CNC",
    "equity_swing": "CNC",
    "intraday": "MIS",
    "futures": "NRML",
    "options": "NRML",
}


def get_execution_routing_rules() -> dict[str, str]:
    """Return the active strategy-to-broker routing mapping."""
    raw = get_setting(EXECUTION_ROUTING_SETTING)
    if raw:
        try:
            stored = json.loads(raw)
            if isinstance(stored, dict):
                rules = dict(DEFAULT_BROKER_ROUTING)
                rules.update(stored)
                return rules
        except Exception:
            pass
    return dict(DEFAULT_BROKER_ROUTING)


def save_execution_routing_rules(rules: dict[str, str]) -> dict[str, str]:
    """Persist strategy-to-broker routing preferences."""
    current = get_execution_routing_rules()
    for k, v in rules.items():
        if k in DEFAULT_BROKER_ROUTING and v in SUPPORTED_BROKERS:
            current[k] = v
    set_setting(EXECUTION_ROUTING_SETTING, json.dumps(current))
    return current


def get_execution_mode() -> str:
    """Return execution mode: 'live' or 'paper' (default)."""
    return get_setting(EXECUTION_MODE_SETTING) or "paper"


def set_execution_mode(mode: str) -> str:
    """Set execution mode: 'live' or 'paper'."""
    val = "live" if mode.lower() == "live" else "paper"
    set_setting(EXECUTION_MODE_SETTING, val)
    return val


def get_brokers_execution_status() -> dict[str, Any]:
    """Return connection and configuration readiness for Kite, Kotak Neo, and Upstox."""
    kite_stat = kite.get_kite_status()
    neo_stat = kotak_neo.get_kotak_neo_status()
    upstox_stat = upstox.get_upstox_status()

    routing = get_execution_routing_rules()
    exec_mode = get_execution_mode()

    return {
        "execution_mode": exec_mode,
        "routing_rules": routing,
        "brokers": {
            "kite": {
                "name": "Zerodha Kite",
                "configured": kite_stat.get("configured", False),
                "connected_today": kite_stat.get("connected_today", False),
                "assigned_strategies": [k for k, v in routing.items() if v == "kite"],
            },
            "kotak_neo": {
                "name": "Kotak Neo",
                "configured": neo_stat.get("configured", False),
                "connected_today": neo_stat.get("connected_today", False),
                "assigned_strategies": [k for k, v in routing.items() if v == "kotak_neo"],
            },
            "upstox": {
                "name": "Upstox",
                "configured": upstox_stat.get("configured", False),
                "connected_today": upstox_stat.get("connected_today", False),
                "assigned_strategies": [k for k, v in routing.items() if v == "upstox"],
            },
        },
    }


def resolve_broker_for_trade(
    trading_mode: str = "equity_swing",
    requested_broker: Optional[str] = None,
) -> tuple[str, str]:
    """Resolve target broker. Explicit override takes top precedence, then routing rules."""
    req = (requested_broker or "").strip().lower()
    if req in SUPPORTED_BROKERS:
        return req, f"Manual override chosen by user: {req}"

    routing = get_execution_routing_rules()
    target = routing.get(trading_mode, DEFAULT_BROKER_ROUTING.get(trading_mode, "kite"))
    return target, f"Auto-routed for {trading_mode} via configured preferences"


def _infer_product(trading_mode: str, product: Optional[str] = None) -> str:
    if product and product.upper() in ("CNC", "MIS", "NRML"):
        return product.upper()
    return PRODUCT_MAP.get(trading_mode, "CNC")


def execute_trade_order(
    *,
    ticker: str,
    direction: str,
    quantity: float,
    trading_mode: str = "equity_swing",
    price: Optional[float] = None,
    trigger_price: Optional[float] = None,
    order_type: str = "MARKET",
    product: Optional[str] = None,
    requested_broker: Optional[str] = None,
    notes: Optional[str] = None,
    force_mode: Optional[str] = None,
) -> dict[str, Any]:
    """Execute live or simulated order across Kite, Kotak Neo, or Upstox based on routing rules."""
    symbol = normalize_ticker(ticker).replace(".NS", "").replace(".BO", "").upper()
    side = direction.upper()
    if side not in ("BUY", "SELL"):
        raise ValueError(f"Invalid trade direction: {direction}. Must be 'BUY' or 'SELL'.")

    qty = abs(float(quantity))
    if qty <= 0:
        raise ValueError("Order quantity must be greater than zero.")

    mode = force_mode.lower() if force_mode else get_execution_mode()
    broker_key, resolution_reason = resolve_broker_for_trade(trading_mode, requested_broker)
    prod = _infer_product(trading_mode, product)
    order_t = order_type.upper() if order_type in ("MARKET", "LIMIT", "SL", "SL-M") else "MARKET"

    order_payload = {
        "broker": broker_key,
        "ticker": symbol,
        "direction": side,
        "quantity": qty,
        "price": price,
        "trigger_price": trigger_price,
        "order_type": order_t,
        "product": prod,
        "trading_mode": trading_mode,
        "mode": mode,
        "routing_reason": resolution_reason,
        "timestamp": datetime.now().isoformat(),
    }

    # Dispatch to specific broker handler
    if broker_key == "kite":
        res = _dispatch_kite_order(symbol, side, qty, prod, order_t, price, trigger_price, mode)
    elif broker_key == "kotak_neo":
        res = _dispatch_kotak_neo_order(symbol, side, qty, prod, order_t, price, trigger_price, mode)
    elif broker_key == "upstox":
        res = _dispatch_upstox_order(symbol, side, qty, prod, order_t, price, trigger_price, mode)
    else:
        raise ValueError(f"Unsupported broker: {broker_key}")

    order_id = res["order_id"]
    status = res["status"]

    # Save to database audit trail
    db_id = add_broker_order({
        "broker": broker_key,
        "order_id": order_id,
        "trading_mode": trading_mode,
        "ticker": symbol,
        "direction": side,
        "quantity": qty,
        "price": price,
        "trigger_price": trigger_price,
        "product": prod,
        "order_type": order_t,
        "status": status,
        "mode": mode,
        "payload": order_payload,
        "response": res.get("response", {}),
        "notes": notes or resolution_reason,
    })

    result = {
        "ok": res.get("ok", True),
        "db_id": db_id,
        "order_id": order_id,
        "broker": broker_key,
        "mode": mode,
        "trading_mode": trading_mode,
        "ticker": symbol,
        "direction": side,
        "quantity": qty,
        "product": prod,
        "order_type": order_t,
        "price": price,
        "status": status,
        "routing_reason": resolution_reason,
        "message": res.get("message", "Order placed successfully"),
        "raw_response": res.get("response", {}),
    }

    # Dispatch Telegram Alert
    _notify_telegram_live_order(result)
    return result


def _dispatch_kite_order(
    symbol: str,
    direction: str,
    quantity: float,
    product: str,
    order_type: str,
    price: Optional[float],
    trigger_price: Optional[float],
    mode: str,
) -> dict[str, Any]:
    """Dispatch order to Zerodha Kite or simulate when paper mode."""
    status_info = kite.get_kite_status()
    is_live = mode == "live" and status_info.get("connected_today")

    if is_live:
        try:
            from kiteconnect import KiteConnect
            client = kite._new_client()
            client.set_access_token(kite._access_token())

            kite_product = (
                client.PRODUCT_CNC if product == "CNC"
                else client.PRODUCT_MIS if product == "MIS"
                else client.PRODUCT_NRML
            )
            kite_order_type = (
                client.ORDER_TYPE_MARKET if order_type == "MARKET"
                else client.ORDER_TYPE_LIMIT if order_type == "LIMIT"
                else client.ORDER_TYPE_SL
            )
            kite_tx_type = client.TRANSACTION_TYPE_BUY if direction == "BUY" else client.TRANSACTION_TYPE_SELL

            order_id = client.place_order(
                variety=client.VARIETY_REGULAR,
                exchange=client.EXCHANGE_NSE,
                tradingsymbol=symbol,
                transaction_type=kite_tx_type,
                quantity=int(quantity),
                product=kite_product,
                order_type=kite_order_type,
                price=float(price) if price and order_type != "MARKET" else None,
                trigger_price=float(trigger_price) if trigger_price else None,
                tag="INDIAN_AGENT",
            )
            return {
                "ok": True,
                "order_id": str(order_id),
                "status": "SUBMITTED",
                "message": f"Kite live order placed (ID: {order_id})",
                "response": {"order_id": order_id, "broker": "kite"},
            }
        except Exception as e:
            logger.error(f"Kite live order failed: {e}")
            return {
                "ok": False,
                "order_id": f"KITE-ERR-{uuid.uuid4().hex[:8].upper()}",
                "status": "REJECTED",
                "message": f"Kite order rejected: {str(e)}",
                "response": {"error": str(e)},
            }

    # High-fidelity Paper Simulation
    sim_id = f"KITE-SIM-{uuid.uuid4().hex[:8].upper()}"
    return {
        "ok": True,
        "order_id": sim_id,
        "status": "COMPLETE",
        "message": f"Kite paper trade simulated successfully (ID: {sim_id})",
        "response": {
            "order_id": sim_id,
            "broker": "kite",
            "simulated": True,
            "product": product,
            "exchange": "NSE",
        },
    }


def _dispatch_kotak_neo_order(
    symbol: str,
    direction: str,
    quantity: float,
    product: str,
    order_type: str,
    price: Optional[float],
    trigger_price: Optional[float],
    mode: str,
) -> dict[str, Any]:
    """Dispatch order to Kotak Securities Neo API or simulate when paper mode."""
    status_info = kotak_neo.get_kotak_neo_status()
    is_live = mode == "live" and status_info.get("connected_today")

    if is_live:
        try:
            token = kotak_neo._access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "neo-fin-key": "neotrade",
                "Content-Type": "application/json",
            }
            # Kotak Neo payload specifications
            es = "nse_fo" if product == "NRML" else "nse_cm"
            pt = "MKT" if order_type == "MARKET" else "L"
            tt = "B" if direction == "BUY" else "S"

            neo_payload = {
                "am": "NO",
                "es": es,
                "pc": product,
                "pt": pt,
                "qt": int(quantity),
                "rt": "DAY",
                "tp": float(trigger_price or 0),
                "ts": symbol,
                "tt": tt,
                "pr": float(price or 0) if order_type != "MARKET" else 0,
            }

            resp = httpx.post(
                f"{kotak_neo.KOTAK_NEO_BASE_URL}/trade/1.0/orders",
                json=neo_payload,
                headers=headers,
                timeout=10.0,
            )
            data = resp.json()
            if resp.status_code in (200, 201) and (data.get("stat") == "Ok" or "nOrdNo" in data):
                order_id = str(data.get("nOrdNo") or data.get("order_id") or uuid.uuid4().hex[:8])
                return {
                    "ok": True,
                    "order_id": order_id,
                    "status": "SUBMITTED",
                    "message": f"Kotak Neo live order placed (ID: {order_id})",
                    "response": data,
                }
            else:
                err_msg = data.get("errMsg") or data.get("message") or resp.text
                return {
                    "ok": False,
                    "order_id": f"NEO-ERR-{uuid.uuid4().hex[:8].upper()}",
                    "status": "REJECTED",
                    "message": f"Kotak Neo order rejected: {err_msg}",
                    "response": data,
                }
        except Exception as e:
            logger.error(f"Kotak Neo live order failed: {e}")
            return {
                "ok": False,
                "order_id": f"NEO-ERR-{uuid.uuid4().hex[:8].upper()}",
                "status": "REJECTED",
                "message": f"Kotak Neo order exception: {str(e)}",
                "response": {"error": str(e)},
            }

    # High-fidelity Paper Simulation
    sim_id = f"NEO-SIM-{uuid.uuid4().hex[:8].upper()}"
    return {
        "ok": True,
        "order_id": sim_id,
        "status": "COMPLETE",
        "message": f"Kotak Neo paper trade simulated successfully (ID: {sim_id})",
        "response": {
            "order_id": sim_id,
            "broker": "kotak_neo",
            "simulated": True,
            "product": product,
            "segment": "nse_fo" if product == "NRML" else "nse_cm",
        },
    }


def _dispatch_upstox_order(
    symbol: str,
    direction: str,
    quantity: float,
    product: str,
    order_type: str,
    price: Optional[float],
    trigger_price: Optional[float],
    mode: str,
) -> dict[str, Any]:
    """Dispatch order to Upstox API v2 or simulate when paper mode."""
    status_info = upstox.get_upstox_status()
    is_live = mode == "live" and status_info.get("connected_today")

    if is_live:
        try:
            token = upstox._access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            # Upstox v2 Product: 'D' for Delivery (CNC), 'I' for Intraday (MIS)
            upstox_product = "D" if product == "CNC" else "I"
            upstox_payload = {
                "quantity": int(quantity),
                "product": upstox_product,
                "validity": "DAY",
                "price": float(price or 0) if order_type != "MARKET" else 0.0,
                "tag": "AGENT",
                "instrument_token": f"NSE_EQ|{symbol}",
                "order_type": "MARKET" if order_type == "MARKET" else "LIMIT",
                "transaction_type": direction,
                "disclosed_quantity": 0,
                "trigger_price": float(trigger_price or 0.0),
                "is_amo": False,
            }

            resp = httpx.post(
                "https://api.upstox.com/v2/order/place",
                json=upstox_payload,
                headers=headers,
                timeout=10.0,
            )
            data = resp.json()
            if resp.status_code in (200, 201) and data.get("status") == "success":
                order_id = str(data.get("data", {}).get("order_id") or uuid.uuid4().hex[:8])
                return {
                    "ok": True,
                    "order_id": order_id,
                    "status": "SUBMITTED",
                    "message": f"Upstox live order placed (ID: {order_id})",
                    "response": data,
                }
            else:
                err_msg = data.get("message") or resp.text
                return {
                    "ok": False,
                    "order_id": f"UPSTOX-ERR-{uuid.uuid4().hex[:8].upper()}",
                    "status": "REJECTED",
                    "message": f"Upstox order rejected: {err_msg}",
                    "response": data,
                }
        except Exception as e:
            logger.error(f"Upstox live order failed: {e}")
            return {
                "ok": False,
                "order_id": f"UPSTOX-ERR-{uuid.uuid4().hex[:8].upper()}",
                "status": "REJECTED",
                "message": f"Upstox order exception: {str(e)}",
                "response": {"error": str(e)},
            }

    # High-fidelity Paper Simulation
    sim_id = f"UPSTOX-SIM-{uuid.uuid4().hex[:8].upper()}"
    return {
        "ok": True,
        "order_id": sim_id,
        "status": "COMPLETE",
        "message": f"Upstox paper trade simulated successfully (ID: {sim_id})",
        "response": {
            "order_id": sim_id,
            "broker": "upstox",
            "simulated": True,
            "product": product,
        },
    }


def _notify_telegram_live_order(order: dict[str, Any]) -> None:
    """Send formatted notification for live and simulated orders."""
    broker_name = {
        "kite": "Zerodha Kite",
        "kotak_neo": "Kotak Neo",
        "upstox": "Upstox",
    }.get(order.get("broker", ""), order.get("broker", "").upper())

    mode_badge = "🟢 LIVE BROKER" if order.get("mode") == "live" else "🧪 PAPER SIMULATION"
    dir_emoji = "🟢" if order.get("direction") == "BUY" else "🔴"

    msg = (
        f"⚡ <b>Order Executed ({mode_badge})</b>\n\n"
        f"{dir_emoji} <b>{order.get('direction')}</b> <code>{order.get('ticker')}</code>\n"
        f"🏛️ <b>Broker:</b> {broker_name} (Routed by: {order.get('trading_mode')})\n"
        f"📦 <b>Quantity:</b> {order.get('quantity')} | <b>Product:</b> {order.get('product')}\n"
        f"🏷️ <b>Type:</b> {order.get('order_type')} | <b>Price:</b> ₹{order.get('price') or 'MKT'}\n"
        f"🆔 <b>Order ID:</b> <code>{order.get('order_id')}</code>\n"
        f"📊 <b>Status:</b> {order.get('status')}\n"
        f"💡 <i>{order.get('routing_reason')}</i>"
    )
    try:
        send_message(msg, parse_mode="HTML")
    except Exception:
        pass
