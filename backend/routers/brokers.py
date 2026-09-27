"""FastAPI Router for Unified Multi-Broker Management & Integration."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.brokers import manager

router = APIRouter(prefix="/api/brokers", tags=["brokers"])


class ConfigureBrokerRequest(BaseModel):
    credentials: dict[str, Any]


@router.get("/tabs")
def get_broker_tabs():
    """Get list of active, persistent broker tabs configured by the user."""
    return manager.get_active_broker_tabs()


@router.get("/supported")
def get_supported_brokers():
    """Get list of all supported brokers and their form fields."""
    return manager.get_all_supported_brokers()


@router.post("/{broker_key}/configure")
def configure_broker(broker_key: str, req: ConfigureBrokerRequest):
    """Configure credentials for a broker and persist its tab in DB."""
    try:
        return manager.configure_broker(broker_key, req.credentials)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{broker_key}")
def remove_broker(broker_key: str):
    """Remove a broker from persistent active tabs."""
    return manager.remove_broker(broker_key)


@router.get("/{broker_key}/status")
def get_broker_status(broker_key: str):
    """Get status of a specific broker connection."""
    return manager.get_broker_status(broker_key)


@router.post("/{broker_key}/sync")
def sync_broker(broker_key: str):
    """Sync positions and holdings for a specified broker."""
    positions = manager.sync_broker_positions(broker_key)
    holdings = manager.sync_broker_holdings(broker_key)
    return {
        "broker": broker_key,
        "positions_count": len(positions),
        "holdings_count": len(holdings),
        "positions": positions,
        "holdings": holdings,
    }
