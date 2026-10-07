"""API Router for Automated Swing Paper Trading Engine."""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from backend.auto_trader import (
    get_auto_portfolio_status,
    get_auto_trader_settings,
    save_auto_trader_settings,
    run_auto_trade_cycle,
    check_and_update_positions,
)
from backend.futures_engine import (
    get_futures_portfolio_status,
    get_futures_settings,
    save_futures_settings,
    run_futures_trade_cycle,
    check_and_update_futures_positions,
    screen_futures_setups,
)
from backend.db import list_auto_trade_logs, get_paper_trade_by_id

router = APIRouter(prefix="/api/auto-trade", tags=["auto_trade"])


class AutoTraderSettingsRequest(BaseModel):
    enabled: Optional[bool] = None
    capital: Optional[float] = None
    risk_per_trade_pct: Optional[float] = None
    max_position_pct: Optional[float] = None
    max_open_positions: Optional[int] = None
    universe: Optional[str] = None
    run_ai_validation: Optional[bool] = None
    min_score: Optional[float] = None
    max_candidates_per_cycle: Optional[int] = None


def _resolve_mode(trading_mode: Optional[str] = None, mode: Optional[str] = None) -> str:
    m = mode or trading_mode or "equity_swing"
    return m.strip().lower()


@router.get("/status")
def get_status(trading_mode: Optional[str] = None, mode: Optional[str] = None):
    """Get real-time automated portfolio equity, cash, open positions, and risk metrics."""
    if _resolve_mode(trading_mode, mode) == "futures":
        return get_futures_portfolio_status()
    return get_auto_portfolio_status()


@router.get("/settings")
def get_settings(trading_mode: Optional[str] = None, mode: Optional[str] = None):
    """Get active automated trader configuration."""
    if _resolve_mode(trading_mode, mode) == "futures":
        return get_futures_settings()
    return get_auto_trader_settings()


@router.post("/settings")
def update_settings(req: AutoTraderSettingsRequest, trading_mode: Optional[str] = None, mode: Optional[str] = None):
    """Update automated trader configuration (capital, 5% risk per trade, limits, universe)."""
    if _resolve_mode(trading_mode, mode) == "futures":
        return save_futures_settings(req.model_dump(exclude_unset=True))
    return save_auto_trader_settings(req.model_dump(exclude_unset=True))


@router.post("/run")
def trigger_cycle(trading_mode: Optional[str] = None, mode: Optional[str] = None):
    """Run full automated cycle: monitor exits, screen candidates, validate via AI, and open trades."""
    if _resolve_mode(trading_mode, mode) == "futures":
        return run_futures_trade_cycle(trigger_type="manual")
    return run_auto_trade_cycle(trigger_type="manual")


@router.post("/monitor-exits")
def monitor_exits_now(trading_mode: Optional[str] = None, mode: Optional[str] = None):
    """Check current market prices and auto-exit any positions that hit stop-loss or target."""
    if _resolve_mode(trading_mode, mode) == "futures":
        return check_and_update_futures_positions()
    return check_and_update_positions()


@router.get("/futures/candidates")
def get_futures_candidates(universe: str = "nifty100", min_score: float = 1.5, limit: int = 6):
    """Scan and categorize both high-probability SHORT setups and LONG setups for Futures."""
    return {"candidates": screen_futures_setups(universe=universe, min_score=min_score, limit=limit)}


@router.get("/logs")
def get_logs(limit: int = Query(30, ge=1, le=100)):
    """Retrieve execution history logs for automated trading runs."""
    return {"logs": list_auto_trade_logs(limit=limit)}


@router.get("/trade/{trade_id}/report")
def get_trade_selection_report(trade_id: int):
    """Get the full 'How and Why it picked this scrip' AI analysis audit report."""
    trade = get_paper_trade_by_id(trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Paper trade not found")

    report = trade.get("selection_report")
    return {
        "trade_id": trade_id,
        "ticker": trade.get("ticker"),
        "status": trade.get("status"),
        "entry_price": trade.get("entry_price"),
        "stop_loss": trade.get("stop_loss"),
        "target": trade.get("target"),
        "quantity": trade.get("quantity"),
        "capital": trade.get("capital"),
        "task_id": trade.get("task_id"),
        "selection_report": report,
        "notes": trade.get("notes"),
    }
