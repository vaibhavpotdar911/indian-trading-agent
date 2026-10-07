"""FastAPI Router for Live & Multi-Broker Trade Execution & Strategy Routing."""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.execution_engine import (
    get_execution_routing_rules,
    save_execution_routing_rules,
    get_execution_mode,
    set_execution_mode,
    get_brokers_execution_status,
    execute_trade_order,
)
from backend.db import list_broker_orders, get_broker_order

router = APIRouter(prefix="/api/execution", tags=["execution"])


class UpdateRoutingRulesRequest(BaseModel):
    rules: dict[str, str]


class UpdateExecutionConfigRequest(BaseModel):
    mode: str  # 'live' or 'paper'


class PlaceOrderRequest(BaseModel):
    ticker: str
    direction: str  # 'BUY' or 'SELL'
    quantity: float
    trading_mode: Optional[str] = "equity_swing"
    price: Optional[float] = None
    trigger_price: Optional[float] = None
    order_type: Optional[str] = "MARKET"
    product: Optional[str] = None  # 'CNC', 'MIS', 'NRML'
    requested_broker: Optional[str] = None  # 'kite', 'kotak_neo', 'upstox' (override)
    notes: Optional[str] = None
    force_mode: Optional[str] = None  # 'live' or 'paper'


@router.get("/routing-rules")
def get_routing():
    """Get active strategy-to-broker routing preferences and defaults."""
    return {
        "rules": get_execution_routing_rules(),
        "supported_brokers": ["kite", "kotak_neo", "upstox"],
        "supported_strategies": ["equity_long_term", "equity_swing", "intraday", "futures", "options"],
    }


@router.post("/routing-rules")
def update_routing(req: UpdateRoutingRulesRequest):
    """Update strategy-to-broker routing mapping (e.g. long_term on kite, intraday on kotak_neo, swing on upstox)."""
    updated = save_execution_routing_rules(req.rules)
    return {"ok": True, "rules": updated}


@router.get("/config")
def get_config():
    """Get live execution configuration and mode."""
    return {
        "mode": get_execution_mode(),
        "is_live": get_execution_mode() == "live",
    }


@router.post("/config")
def update_config(req: UpdateExecutionConfigRequest):
    """Set execution mode: 'live' for real broker orders or 'paper' for simulation."""
    new_mode = set_execution_mode(req.mode)
    return {
        "ok": True,
        "mode": new_mode,
        "is_live": new_mode == "live",
    }


@router.get("/brokers")
def get_brokers_status():
    """Get connectivity, credentials, and active token status for Kite, Kotak Neo, and Upstox."""
    return get_brokers_execution_status()


@router.post("/order")
def place_order(req: PlaceOrderRequest):
    """Place an order across Kite, Kotak Neo, or Upstox based on routing rules or explicit broker selection."""
    try:
        res = execute_trade_order(
            ticker=req.ticker,
            direction=req.direction,
            quantity=req.quantity,
            trading_mode=req.trading_mode or "equity_swing",
            price=req.price,
            trigger_price=req.trigger_price,
            order_type=req.order_type or "MARKET",
            product=req.product,
            requested_broker=req.requested_broker,
            notes=req.notes,
            force_mode=req.force_mode,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Execution error: {str(e)}")


@router.get("/orders")
def get_orders(limit: int = Query(50, ge=1, le=200), broker: Optional[str] = None):
    """Retrieve execution order history across all brokers."""
    return {"orders": list_broker_orders(limit=limit, broker=broker)}


@router.get("/order/{order_id}")
def get_order_details(order_id: str):
    """Retrieve full details of a specific broker order."""
    order = get_broker_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Broker order not found")
    return order
