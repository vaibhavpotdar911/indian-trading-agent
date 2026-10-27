"""Batch execution service for Portfolio Daily Deep Analysis."""

import asyncio
from datetime import date, datetime
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional
import uuid
from fastapi import WebSocket

from backend.db import (
    save_analysis,
    save_portfolio_daily_analysis,
    update_portfolio_daily_analysis,
    get_portfolio_daily_analysis,
    get_latest_portfolio_daily_analysis,
    list_portfolio_daily_analyses,
)
from tradingagents.utils.ticker import normalize_ticker
from backend.positions import get_positions_view
from backend.stats_callback import StatsCallback
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.propagation import Propagator
from tradingagents.graph.trading_graph import TradingAgentsGraph

logger = logging.getLogger(__name__)


class PortfolioWebSocketManager:
    """Manages WebSocket connections for streaming portfolio batch events."""

    def __init__(self):
        self._connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, batch_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(batch_id, []).append(websocket)

    async def disconnect(self, batch_id: str, websocket: WebSocket):
        async with self._lock:
            if batch_id in self._connections:
                self._connections[batch_id] = [
                    ws for ws in self._connections[batch_id] if ws != websocket
                ]
                if not self._connections[batch_id]:
                    del self._connections[batch_id]

    async def send_event(self, batch_id: str, event: dict):
        connections = list(self._connections.get(batch_id, []))
        dead = []
        for ws in connections:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                if batch_id in self._connections:
                    self._connections[batch_id] = [
                        ws for ws in self._connections[batch_id] if ws not in dead
                    ]


portfolio_ws_manager = PortfolioWebSocketManager()
_active_batches: Dict[str, dict] = {}


def get_active_batch(batch_id: str) -> Optional[dict]:
    return _active_batches.get(batch_id) or get_portfolio_daily_analysis(batch_id)


def start_portfolio_daily_analysis(
    holdings: Optional[List[dict]] = None,
    analysts: Optional[List[str]] = None,
    depth: int = 1,
    trading_mode: str = "equity_swing",
    language: str = "English",
    trade_date: Optional[str] = None,
) -> dict:
    """Initiate daily multi-agent deep analysis across portfolio holdings."""
    if holdings is None:
        pos_view = get_positions_view()
        raw_positions = pos_view.get("positions", [])
        # Only analyze non-zero holdings
        holdings = [p for p in raw_positions if float(p.get("quantity") or 0) > 0]

    if not holdings:
        raise ValueError("No portfolio holdings available to analyze. Add or sync positions first.")

    batch_id = str(uuid.uuid4())[:8]
    today_str = trade_date or date.today().isoformat()

    record = {
        "batch_id": batch_id,
        "run_date": today_str,
        "status": "running",
        "total_holdings": len(holdings),
        "completed_holdings": 0,
        "summary": {
            "total_holdings": len(holdings),
            "verdict_counts": {"HOLD": 0, "ADD_MORE": 0, "BOOK_PROFIT": 0, "CUT_LOSS": 0, "OTHER": 0},
            "status": "running",
            "executive_verdict": "Multi-agent deep analysis in progress...",
        },
        "results": [],
    }

    save_portfolio_daily_analysis(record)
    _active_batches[batch_id] = record

    options = {
        "analysts": analysts or ["market", "social", "news", "fundamentals"],
        "depth": depth,
        "trading_mode": trading_mode,
        "language": language,
        "trade_date": today_str,
    }

    thread = threading.Thread(
        target=_run_portfolio_batch_sync,
        args=(batch_id, holdings, options),
        daemon=True,
    )
    thread.start()

    return {"batch_id": batch_id, "status": "running", "total_holdings": len(holdings)}


def _extract_verdict_key(signal: str) -> str:
    s = (signal or "").upper().strip()
    if "HOLD" in s:
        return "HOLD"
    if "ADD" in s or "ACCUMULATE" in s or "BUY" in s:
        return "ADD_MORE"
    if "PROFIT" in s or "TRIM" in s:
        return "BOOK_PROFIT"
    if "LOSS" in s or "EXIT" in s or "SELL" in s:
        return "CUT_LOSS"
    return "OTHER"


def _extract_price_levels(final_decision: str, current_price: float) -> dict:
    """Heuristic extraction of Stop-Loss and Targets from final decision text."""
    import re
    sl_match = re.search(r"Stop-Loss[:\*\s]+(?:₹|Rs\.?\s*)?([\d,]+\.?\d*)", final_decision, re.IGNORECASE)
    t1_match = re.search(r"Target\s*1[:\*\s]+(?:₹|Rs\.?\s*)?([\d,]+\.?\d*)", final_decision, re.IGNORECASE)
    t2_match = re.search(r"Target\s*2[:\*\s]+(?:₹|Rs\.?\s*)?([\d,]+\.?\d*)", final_decision, re.IGNORECASE)

    levels = {}
    if sl_match:
        try:
            levels["stop_loss"] = float(sl_match.group(1).replace(",", ""))
        except ValueError:
            pass
    if t1_match:
        try:
            levels["target_1"] = float(t1_match.group(1).replace(",", ""))
        except ValueError:
            pass
    if t2_match:
        try:
            levels["target_2"] = float(t2_match.group(1).replace(",", ""))
        except ValueError:
            pass
    return levels


def _run_portfolio_batch_sync(batch_id: str, holdings: List[dict], options: dict):
    """Background worker executing sequential multi-agent deep analysis per holding."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    results = []
    verdict_counts = {"HOLD": 0, "ADD_MORE": 0, "BOOK_PROFIT": 0, "CUT_LOSS": 0, "OTHER": 0}

    try:
        loop.run_until_complete(portfolio_ws_manager.send_event(batch_id, {
            "type": "batch_start",
            "batch_id": batch_id,
            "total_holdings": len(holdings),
            "holdings": [h.get("tradingsymbol") for h in holdings],
        }))

        for idx, holding in enumerate(holdings, start=1):
            raw_ticker = holding.get("tradingsymbol") or holding.get("symbol") or ""
            ticker = normalize_ticker(raw_ticker)
            if not ticker:
                continue

            # Generate individual task ID for this stock's analysis
            task_id = f"port_{batch_id}_{ticker}"
            start_t = time.time()

            loop.run_until_complete(portfolio_ws_manager.send_event(batch_id, {
                "type": "stock_start",
                "index": idx,
                "total": len(holdings),
                "ticker": ticker,
                "task_id": task_id,
                "holding": holding,
            }))

            config = DEFAULT_CONFIG.copy()
            config["max_debate_rounds"] = options.get("depth", 1)
            config["max_risk_discuss_rounds"] = options.get("depth", 1)
            config["output_language"] = options.get("language", "English")
            config["trading_mode"] = options.get("trading_mode", "equity_swing")

            stats = StatsCallback()
            stock_result = None

            try:
                ta = TradingAgentsGraph(
                    selected_analysts=options.get("analysts", ["market", "social", "news", "fundamentals"]),
                    debug=False,
                    config=config,
                    callbacks=[stats],
                )

                propagator = Propagator(max_recur_limit=config.get("max_recur_limit", 100))
                init_state = propagator.create_initial_state(
                    ticker,
                    options.get("trade_date", date.today().isoformat()),
                    holding_info=holding,
                )
                stream_args = propagator.get_graph_args()

                chunk = None
                for chunk in ta.graph.stream(init_state, **stream_args):
                    # Periodically report heartbeat to WS
                    last_msg = ""
                    if chunk.get("messages"):
                        m = chunk["messages"][-1]
                        last_msg = getattr(m, "content", "") or ""
                        if isinstance(last_msg, str):
                            last_msg = last_msg[:80]
                    loop.run_until_complete(portfolio_ws_manager.send_event(batch_id, {
                        "type": "stock_heartbeat",
                        "ticker": ticker,
                        "activity": last_msg,
                    }))

                final_state = chunk or {}
                final_decision = final_state.get("final_trade_decision") or ""
                signal = ta.process_signal(final_decision)
                verdict_category = _extract_verdict_key(signal)
                verdict_counts[verdict_category] = verdict_counts.get(verdict_category, 0) + 1

                duration = time.time() - start_t
                invest_state = final_state.get("investment_debate_state", {})
                risk_state = final_state.get("risk_debate_state", {})
                levels = _extract_price_levels(final_decision, float(holding.get("last_price") or 0))

                analysis_record = {
                    "ticker": ticker,
                    "trade_date": options.get("trade_date", date.today().isoformat()),
                    "trading_mode": options.get("trading_mode", "equity_swing"),
                    "signal": signal,
                    "market_report": final_state.get("market_report"),
                    "sentiment_report": final_state.get("sentiment_report"),
                    "news_report": final_state.get("news_report"),
                    "fundamentals_report": final_state.get("fundamentals_report"),
                    "investment_plan": final_state.get("investment_plan"),
                    "trader_investment_plan": final_state.get("trader_investment_plan"),
                    "final_trade_decision": final_decision,
                    "bull_history": invest_state.get("bull_history"),
                    "bear_history": invest_state.get("bear_history"),
                    "risk_aggressive_history": risk_state.get("aggressive_history"),
                    "risk_conservative_history": risk_state.get("conservative_history"),
                    "risk_neutral_history": risk_state.get("neutral_history"),
                    "stats": stats.summary(),
                    "duration_seconds": round(duration, 1),
                    "holding_info": holding,
                }
                save_analysis(task_id, analysis_record)

                stock_result = {
                    "ticker": ticker,
                    "task_id": task_id,
                    "verdict": signal,
                    "verdict_category": verdict_category,
                    "quantity": holding.get("quantity", 0),
                    "average_price": holding.get("average_price", 0),
                    "last_price": holding.get("last_price", 0),
                    "invested_value": holding.get("invested_value", 0),
                    "current_value": holding.get("current_value", 0),
                    "pnl": holding.get("pnl", 0),
                    "pnl_pct": holding.get("pnl_pct", 0),
                    "levels": levels,
                    "duration_seconds": round(duration, 1),
                    "decision_preview": final_decision[:300] if final_decision else "",
                    "status": "completed",
                }

            except Exception as e:
                logger.exception("Failed deep analysis for stock %s in batch %s", ticker, batch_id)
                stock_result = {
                    "ticker": ticker,
                    "task_id": task_id,
                    "verdict": "ERROR",
                    "verdict_category": "OTHER",
                    "quantity": holding.get("quantity", 0),
                    "average_price": holding.get("average_price", 0),
                    "last_price": holding.get("last_price", 0),
                    "pnl": holding.get("pnl", 0),
                    "pnl_pct": holding.get("pnl_pct", 0),
                    "error": str(e),
                    "status": "failed",
                }

            results.append(stock_result)
            completed_count = len(results)

            # Update DB incrementally
            update_portfolio_daily_analysis(batch_id, {
                "completed_holdings": completed_count,
                "results": results,
            })

            loop.run_until_complete(portfolio_ws_manager.send_event(batch_id, {
                "type": "stock_complete",
                "index": idx,
                "total": len(holdings),
                "ticker": ticker,
                "result": stock_result,
            }))

        # Final Batch Summary
        total_inv = sum(float(r.get("invested_value") or 0) for r in results)
        total_curr = sum(float(r.get("current_value") or 0) for r in results)
        total_pnl = sum(float(r.get("pnl") or 0) for r in results)
        total_pnl_pct = round((total_pnl / total_inv * 100), 2) if total_inv else 0.0

        exec_parts = []
        if verdict_counts.get("HOLD", 0) > 0:
            exec_parts.append(f"{verdict_counts['HOLD']} Hold")
        if verdict_counts.get("ADD_MORE", 0) > 0:
            exec_parts.append(f"{verdict_counts['ADD_MORE']} Add More")
        if verdict_counts.get("BOOK_PROFIT", 0) > 0:
            exec_parts.append(f"{verdict_counts['BOOK_PROFIT']} Book Profit / Trim")
        if verdict_counts.get("CUT_LOSS", 0) > 0:
            exec_parts.append(f"{verdict_counts['CUT_LOSS']} Cut Loss / Exit")

        exec_summary = "Portfolio Daily Verdict: " + (", ".join(exec_parts) if exec_parts else "All reviews completed.")

        summary_data = {
            "status": "completed",
            "total_holdings": len(holdings),
            "completed_holdings": len(results),
            "verdict_counts": verdict_counts,
            "executive_verdict": exec_summary,
            "total_invested": round(total_inv, 2),
            "total_current": round(total_curr, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": total_pnl_pct,
            "finished_at": datetime.now().isoformat(),
        }

        update_portfolio_daily_analysis(batch_id, {
            "status": "completed",
            "completed_holdings": len(results),
            "summary": summary_data,
            "results": results,
        })

        if batch_id in _active_batches:
            _active_batches[batch_id].update({
                "status": "completed",
                "summary": summary_data,
                "results": results,
            })

        loop.run_until_complete(portfolio_ws_manager.send_event(batch_id, {
            "type": "batch_complete",
            "batch_id": batch_id,
            "summary": summary_data,
            "results": results,
        }))

    except Exception as exc:
        logger.exception("Catastrophic error in portfolio batch analysis %s", batch_id)
        err_msg = str(exc)
        update_portfolio_daily_analysis(batch_id, {
            "status": "failed",
            "summary": {"status": "failed", "error": err_msg},
        })
        loop.run_until_complete(portfolio_ws_manager.send_event(batch_id, {
            "type": "batch_error",
            "batch_id": batch_id,
            "error": err_msg,
        }))
    finally:
        loop.close()
