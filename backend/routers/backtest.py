"""Backtest endpoints — run historical backtests with P&L tracking."""

import uuid
import threading
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional
from backend.ws import manager
from backend.db import (
    save_backtest_run,
    save_backtest_trade,
    get_backtest_run,
    get_backtest_trades,
    get_backtest_history,
)
from backend.backtest_engine import run_backtest, get_trading_dates
from tradingagents.utils.ticker import normalize_ticker
from tradingagents.default_config import DEFAULT_CONFIG

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    ticker: str
    trading_mode: str = "equity_swing"
    start_date: str
    end_date: str
    interval_days: int = 5
    initial_capital: float = 100000
    position_size_pct: float = 10
    enable_learning: bool = False


def _run_backtest_thread(backtest_id: str, req: BacktestRequest):
    """Run backtest in a background thread, streaming progress via WebSocket."""
    loop = asyncio.new_event_loop()
    ticker = normalize_ticker(req.ticker)

    # Generate trading dates
    dates = get_trading_dates(req.start_date, req.end_date, req.interval_days)

    if not dates:
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "error", "message": "No trading dates found in the given range",
        }))
        loop.close()
        return

    # Save initial run
    save_backtest_run(backtest_id, {
        "ticker": ticker,
        "trading_mode": req.trading_mode,
        "initial_capital": req.initial_capital,
        "position_size_pct": req.position_size_pct,
        "enable_learning": req.enable_learning,
        "status": "running",
    })

    loop.run_until_complete(manager.send_event(backtest_id, {
        "type": "status",
        "message": f"Starting backtest: {ticker} | {len(dates)} dates | ₹{req.initial_capital:,.0f} capital",
        "total_dates": len(dates),
    }))

    config = DEFAULT_CONFIG.copy()

    def on_trade(trade):
        save_backtest_trade(backtest_id, trade)
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "trade",
            **trade,
        }))

    def on_status(msg):
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "status", "message": msg,
        }))

    try:
        summary, trades = run_backtest(
            ticker=req.ticker,
            dates=dates,
            initial_capital=req.initial_capital,
            position_size_pct=req.position_size_pct,
            enable_learning=req.enable_learning,
            config=config,
            on_trade_complete=on_trade,
            on_status=on_status,
        )

        # Update run with final stats
        save_backtest_run(backtest_id, summary)

        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "complete",
            **summary,
        }))

    except Exception as e:
        save_backtest_run(backtest_id, {
            "ticker": ticker,
            "initial_capital": req.initial_capital,
            "position_size_pct": req.position_size_pct,
            "enable_learning": req.enable_learning,
            "status": "error",
        })
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "error", "message": str(e),
        }))
    finally:
        loop.close()


@router.post("/run")
def start_backtest(req: BacktestRequest):
    """Start a backtest. Returns backtest_id for WebSocket streaming."""
    backtest_id = str(uuid.uuid4())[:8]

    thread = threading.Thread(
        target=_run_backtest_thread,
        args=(backtest_id, req),
        daemon=True,
    )
    thread.start()

    dates = get_trading_dates(req.start_date, req.end_date, req.interval_days)

    return {
        "backtest_id": backtest_id,
        "status": "started",
        "ticker": normalize_ticker(req.ticker),
        "trading_mode": req.trading_mode,
        "total_dates": len(dates),
        "dates": dates,
    }


@router.websocket("/ws/{backtest_id}")
async def backtest_websocket(websocket: WebSocket, backtest_id: str):
    """WebSocket for streaming backtest progress."""
    await manager.connect(websocket, backtest_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, backtest_id)


@router.get("/{backtest_id}")
def get_backtest_result(backtest_id: str):
    """Get backtest results."""
    run = get_backtest_run(backtest_id)
    if not run:
        return {"error": "Backtest not found"}

    trades = get_backtest_trades(backtest_id)
    return {**run, "trades": trades}


@router.get("/history/list")
def list_backtests(limit: int = 20):
    """List past backtest runs."""
    return get_backtest_history(limit)
