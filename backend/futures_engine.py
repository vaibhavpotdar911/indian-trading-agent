"""NSE Futures Paper Trading & Strategy Engine.

Provides:
- Standard NSE F&O lot size specifications and SPAN+Exposure margin calculations (~22%).
- 5% Risk Budgeting per trade for leveraged futures contracts.
- High-probability Short & Long strategies:
  * Short Buildup Breakdown (Selling volume + Support break)
  * Resistance Rejection Short (Overbought RSI + Bearish reversal)
  * Long Buildup Breakout (Volume expansion + Resistance breakout)
  * Support Bounce Long (Oversold RSI + Support confirmation)
- Multi-Agent AI validation before trade placement with rich audit reports.
- Autonomous daily mark-to-market monitoring, short & long trailing stops, and automatic SL/Target exits.
"""

import math
import uuid
import time
from datetime import datetime, date
from typing import Optional

import yfinance as yf

from tradingagents.utils.ticker import normalize_ticker
from backend.db import (
    get_setting,
    set_setting,
    list_paper_trades,
    add_paper_trade,
    get_paper_trade_by_id,
    update_paper_trade_exit,
    update_paper_trade_live_metrics,
    save_auto_trade_log,
    list_auto_trade_logs,
    save_analysis,
    get_db,
)
from backend.risk_engine import check_trade
from backend.recommender import recommend
from backend.auto_trader import (
    get_current_stock_price,
    run_ai_analysis_for_candidate,
    _send_telegram_alert,
)


DEFAULT_FUTURES_CAPITAL = 500_000.0
DEFAULT_FUTURES_RISK_PCT = 5.0
DEFAULT_FUTURES_MARGIN_RATE = 0.22  # ~22% SPAN + Exposure margin
DEFAULT_FUTURES_MAX_OPEN_POSITIONS = 5
DEFAULT_FUTURES_MAX_POSITION_PCT = 40.0


# Standard NSE Futures Lot Sizes (Representative top F&O stocks & indices)
NSE_FUTURES_LOT_SIZES = {
    "NIFTY": 25,
    "BANKNIFTY": 15,
    "FINNIFTY": 25,
    "MIDCPNIFTY": 50,
    "RELIANCE": 250,
    "TCS": 175,
    "HDFCBANK": 550,
    "INFY": 400,
    "ICICIBANK": 700,
    "SBIN": 1500,
    "BHARTIARTL": 475,
    "ITC": 1600,
    "KOTAKBANK": 400,
    "LT": 175,
    "AXISBANK": 625,
    "BAJFINANCE": 125,
    "ASIANPAINT": 200,
    "MARUTI": 50,
    "TITAN": 175,
    "SUNPHARMA": 350,
    "TMPV": 1425,
    "TATAMOTORS": 1425,
    "TATASTEEL": 5500,
    "WIPRO": 1500,
    "HCLTECH": 350,
    "M&M": 200,
    "ULTRACEMCO": 50,
    "NESTLEIND": 25,
    "NTPC": 1500,
    "POWERGRID": 1800,
    "JSWSTEEL": 675,
    "ADANIENT": 300,
    "ADANIPORTS": 400,
    "BAJAJFINSV": 500,
    "BAJAJ-AUTO": 75,
    "COALINDIA": 2100,
    "GRASIM": 250,
    "DRREDDY": 125,
    "CIPLA": 650,
    "EICHERMOT": 175,
    "APOLLOHOSP": 125,
    "BRITANNIA": 200,
    "BPCL": 1800,
    "HEROMOTOCO": 150,
    "HINDALCO": 1400,
    "INDUSINDBK": 500,
    "HDFCLIFE": 1100,
    "SBILIFE": 750,
    "TATACONSUM": 900,
    "BEL": 2850,
    "TRENT": 100,
}


def get_futures_lot_size(ticker: str, entry_price: float) -> int:
    """Return the official lot size for the ticker, or approximate based on standard contract value."""
    sym = ticker.upper()
    if sym in NSE_FUTURES_LOT_SIZES:
        return NSE_FUTURES_LOT_SIZES[sym]

    # Standard NSE rule: Lot size set such that Contract Value is approx Rs. 5 to 8 Lakhs
    if entry_price > 0:
        approx_lots = round(700_000.0 / entry_price / 25.0) * 25
        return max(25, int(approx_lots))
    return 100


def get_futures_settings() -> dict:
    """Get active configuration for futures trading engine."""
    cap = get_setting("futures_capital") or get_setting("risk_capital")
    capital = float(cap) if cap else DEFAULT_FUTURES_CAPITAL

    risk = get_setting("futures_risk_pct") or get_setting("risk_futures_per_trade_pct")
    risk_pct = float(risk) if risk else DEFAULT_FUTURES_RISK_PCT

    open_pos = get_setting("futures_max_open_positions") or get_setting("risk_futures_open_positions")
    max_open = int(open_pos) if open_pos else DEFAULT_FUTURES_MAX_OPEN_POSITIONS

    max_pos = get_setting("futures_max_position_pct") or get_setting("risk_futures_position_pct")
    max_pos_pct = float(max_pos) if max_pos else DEFAULT_FUTURES_MAX_POSITION_PCT

    return {
        "enabled": (get_setting("futures_enabled") or "0") == "1",
        "capital": capital,
        "risk_per_trade_pct": risk_pct,
        "max_position_pct": max_pos_pct,
        "max_open_positions": max_open,
        "margin_rate": DEFAULT_FUTURES_MARGIN_RATE,
        "universe": get_setting("futures_universe") or "nifty100",
        "trading_mode": "futures",
        "run_ai_validation": (get_setting("futures_run_ai") or "1") == "1",
        "min_score": float(get_setting("futures_min_score") or 1.5),
        "max_candidates_per_cycle": int(get_setting("futures_max_candidates") or 2),
    }


def save_futures_settings(settings: dict) -> dict:
    """Persist settings for the futures trading engine."""
    if "enabled" in settings:
        set_setting("futures_enabled", "1" if settings["enabled"] else "0")
    if "capital" in settings and settings["capital"] is not None:
        val = str(float(settings["capital"]))
        set_setting("futures_capital", val)
    if "risk_per_trade_pct" in settings and settings["risk_per_trade_pct"] is not None:
        val = str(float(settings["risk_per_trade_pct"]))
        set_setting("futures_risk_pct", val)
        set_setting("risk_futures_per_trade_pct", val)
    if "max_open_positions" in settings and settings["max_open_positions"] is not None:
        val = str(int(settings["max_open_positions"]))
        set_setting("futures_max_open_positions", val)
        set_setting("risk_futures_open_positions", val)
    if "max_position_pct" in settings and settings["max_position_pct"] is not None:
        val = str(float(settings["max_position_pct"]))
        set_setting("futures_max_position_pct", val)
        set_setting("risk_futures_position_pct", val)
    if "universe" in settings and settings["universe"]:
        set_setting("futures_universe", str(settings["universe"]))
    if "run_ai_validation" in settings:
        set_setting("futures_run_ai", "1" if settings["run_ai_validation"] else "0")
    if "min_score" in settings and settings["min_score"] is not None:
        set_setting("futures_min_score", str(float(settings["min_score"])))
    if "max_candidates_per_cycle" in settings and settings["max_candidates_per_cycle"] is not None:
        set_setting("futures_max_candidates", str(int(settings["max_candidates_per_cycle"])))

    return get_futures_settings()


def get_futures_portfolio_status() -> dict:
    """Return real-time futures portfolio equity, cash, margin, and open position metrics."""
    cfg = get_futures_settings()
    total_capital = cfg["capital"]

    all_trades = list_paper_trades()
    fut_trades = [t for t in all_trades if t.get("trading_mode") == "futures"]
    active_trades = [t for t in fut_trades if t.get("status") == "active"]
    closed_trades = [t for t in fut_trades if t.get("status") in ("closed", "manually_closed", "expired")]

    deployed_margin = sum(float(t.get("capital") or 0) for t in active_trades)
    unrealized_pnl = sum(float(t.get("unrealized_pnl_amount") or 0) for t in active_trades)
    realized_pnl = sum(float(t.get("realized_pnl_amount") or 0) for t in closed_trades)

    available_cash = max(0.0, total_capital - deployed_margin + realized_pnl)
    total_equity = available_cash + deployed_margin + unrealized_pnl

    return {
        "trading_mode": "futures",
        "settings": cfg,
        "total_capital": round(total_capital, 2),
        "available_cash": round(available_cash, 2),
        "deployed_margin": round(deployed_margin, 2),
        "total_equity": round(total_equity, 2),
        "unrealized_pnl": round(unrealized_pnl, 2),
        "realized_pnl": round(realized_pnl, 2),
        "active_positions_count": len(active_trades),
        "max_open_positions": cfg["max_open_positions"],
        "available_slots": max(0, cfg["max_open_positions"] - len(active_trades)),
        "active_positions": active_trades,
        "closed_positions_count": len(closed_trades),
    }


def calculate_futures_position_size(
    entry_price: float,
    stop_loss: float,
    capital: float,
    available_cash: float,
    lot_size: int,
    risk_pct: float = DEFAULT_FUTURES_RISK_PCT,
    margin_rate: float = DEFAULT_FUTURES_MARGIN_RATE,
    max_position_pct: float = DEFAULT_FUTURES_MAX_POSITION_PCT,
) -> dict:
    """Calculate discrete lot sizing enforcing 5% risk budget and margin limits.

    Formula:
      Stop Distance = abs(entry_price - stop_loss)
      Risk Per Lot = Stop Distance * lot_size
      Risk Budget = Capital * (risk_pct / 100)
      Margin Per Lot = entry_price * lot_size * margin_rate
      Lots (Risk Limit) = floor(Risk Budget / Risk Per Lot)
      Lots (Cash Margin Limit) = floor(available_cash / Margin Per Lot)
      Lots (Position Cap) = floor((Capital * max_position_pct / 100) / Margin Per Lot)
      Final Lots = min(Lots by Risk, Lots by Margin, Lots by Cap)
    """
    if entry_price <= 0 or stop_loss <= 0 or lot_size <= 0:
        return {"allowed": False, "lots": 0, "quantity": 0, "reason": "Invalid price or lot size parameters"}

    stop_dist = abs(entry_price - stop_loss)
    if stop_dist <= 0:
        return {"allowed": False, "lots": 0, "quantity": 0, "reason": "Stop-loss cannot equal entry price"}

    risk_budget = capital * (risk_pct / 100.0)
    risk_per_lot = stop_dist * lot_size
    margin_per_lot = entry_price * lot_size * margin_rate

    lots_by_risk = math.floor(risk_budget / risk_per_lot)
    lots_by_cash = math.floor(available_cash / margin_per_lot)
    lots_by_cap = math.floor((capital * (max_position_pct / 100.0)) / margin_per_lot)

    final_lots = min(lots_by_risk, lots_by_cash, lots_by_cap)

    # For paper futures simulation: if capital is healthy and 1 lot risk is within budget, allow 1 lot
    if final_lots <= 0 and available_cash >= margin_per_lot and risk_per_lot <= risk_budget * 1.05:
        final_lots = 1

    if final_lots <= 0:
        return {
            "allowed": False,
            "lots": 0,
            "quantity": 0,
            "reason": f"Insufficient margin or 1-lot risk exceeds 5% budget (Margin needed: ₹{margin_per_lot:,.2f}, Avail: ₹{available_cash:,.2f})",
        }

    total_qty = final_lots * lot_size
    contract_value = round(entry_price * total_qty, 2)
    required_margin = round(contract_value * margin_rate, 2)
    actual_risk_amount = round(stop_dist * total_qty, 2)
    actual_risk_pct = round(actual_risk_amount / capital * 100.0, 3)

    return {
        "allowed": True,
        "lots": final_lots,
        "lot_size": lot_size,
        "quantity": total_qty,
        "contract_value": contract_value,
        "required_margin": required_margin,
        "actual_risk_amount": actual_risk_amount,
        "actual_risk_pct": actual_risk_pct,
        "stop_distance": round(stop_dist, 2),
        "risk_budget": round(risk_budget, 2),
    }


def screen_futures_setups(universe: str = "nifty100", min_score: float = 1.5, limit: int = 4) -> list[dict]:
    """Scan and categorize both high-probability SHORT setups and LONG setups.

    Short Setups (Bearish):
    - Breakdown below support with expanding volume (Short Buildup)
    - Resistance rejection with overbought RSI
    - Gap down open & trend breakdown

    Long Setups (Bullish):
    - Volume breakout above resistance (Long Buildup)
    - Support bounce with oversold RSI
    """
    rec_result = recommend(
        universe=universe,
        min_signals=2,
        apply_market_bias=True,
        apply_event_filter=True,
        apply_concentration_check=True,
        trading_mode="futures",
    )
    all_recommendations = rec_result.get("recommendations", [])

    active_tickers = {
        t["ticker"].upper()
        for t in list_paper_trades(status="active")
        if t.get("trading_mode") == "futures"
    }

    qualifying_setups = []
    for item in all_recommendations:
        ticker = item.get("ticker", "").upper()
        if ticker in active_tickers:
            continue

        direction = item.get("direction", "").upper()
        score = float(item.get("score") or 0)
        signals = item.get("signals", [])
        signal_types = {s.get("type", "") for s in signals if isinstance(s, dict)}

        # 1. High-Conviction SHORT Setups
        if direction in ("SELL", "STRONG SELL") and abs(score) >= min_score:
            setup_category = "BEARISH_SWING_SHORT"
            if "breakdown_support" in signal_types or "volume_bearish" in signal_types:
                setup_category = "SHORT_BUILDUP_BREAKDOWN"
            elif "near_resistance" in signal_types or "rsi_overbought" in signal_types:
                setup_category = "RESISTANCE_REJECTION_SHORT"

            item_copy = dict(item)
            item_copy["trade_direction"] = "SHORT"
            item_copy["setup_category"] = setup_category
            qualifying_setups.append(item_copy)

        # 2. High-Conviction LONG Setups
        elif direction in ("BUY", "STRONG BUY") and score >= min_score:
            setup_category = "BULLISH_SWING_LONG"
            if "breakout_vol_confirmed" in signal_types or "volume_bullish" in signal_types:
                setup_category = "LONG_BUILDUP_BREAKOUT"
            elif "near_support" in signal_types or "rsi_oversold" in signal_types:
                setup_category = "SUPPORT_BOUNCE_LONG"

            item_copy = dict(item)
            item_copy["trade_direction"] = "LONG"
            item_copy["setup_category"] = setup_category
            qualifying_setups.append(item_copy)

    # Sort by absolute score confluence
    qualifying_setups.sort(
        key=lambda x: (abs(float(x.get("score") or 0)), int(x.get("success_probability") or 0)),
        reverse=True,
    )
    return qualifying_setups[:limit]


def evaluate_and_open_futures_trade(candidate: dict, portfolio_status: dict) -> dict:
    """Evaluate candidate, configure SL/target, run AI validation, size lots with 5% risk, and open paper trade."""
    ticker = candidate["ticker"].upper()
    trade_dir = candidate.get("trade_direction", "SHORT" if "SELL" in candidate.get("direction", "") else "LONG")
    settings = portfolio_status["settings"]
    capital = portfolio_status["total_capital"]
    available_cash = portfolio_status["available_cash"]
    risk_pct = settings["risk_per_trade_pct"]

    current_price = get_current_stock_price(ticker)
    if not current_price or current_price <= 0:
        return {"ok": False, "ticker": ticker, "error": "Could not fetch current market price"}

    lot_size = get_futures_lot_size(ticker, current_price)

    # Calculate logical stop-loss and target
    support_levels = candidate.get("support_levels") or []
    resistance_levels = candidate.get("resistance_levels") or []

    if trade_dir == "SHORT":
        # For SHORT: SL must be ABOVE entry; Target must be BELOW entry
        valid_res = [r for r in resistance_levels if r > current_price]
        if valid_res:
            nearest_res = min(valid_res)
            dist_pct = (nearest_res - current_price) / current_price * 100.0
            if 1.5 <= dist_pct <= 5.0:
                stop_loss = round(nearest_res * 1.005, 2)  # slightly above resistance
            else:
                stop_loss = round(current_price * 1.035, 2)  # 3.5% default stop above
        else:
            stop_loss = round(current_price * 1.035, 2)

        stop_dist = stop_loss - current_price
        target = round(current_price - (stop_dist * 2.0), 2)  # 2:1 Risk/Reward below
    else:
        # For LONG: SL must be BELOW entry; Target must be ABOVE entry
        valid_sup = [s for s in support_levels if 0 < s < current_price]
        if valid_sup:
            nearest_sup = max(valid_sup)
            dist_pct = (current_price - nearest_sup) / current_price * 100.0
            if 1.5 <= dist_pct <= 5.0:
                stop_loss = round(nearest_sup * 0.995, 2)
            else:
                stop_loss = round(current_price * 0.965, 2)
        else:
            stop_loss = round(current_price * 0.965, 2)

        stop_dist = current_price - stop_loss
        target = round(current_price + (stop_dist * 2.0), 2)

    # Position Sizing
    sizing = calculate_futures_position_size(
        entry_price=current_price,
        stop_loss=stop_loss,
        capital=capital,
        available_cash=available_cash,
        lot_size=lot_size,
        risk_pct=risk_pct,
        margin_rate=settings["margin_rate"],
        max_position_pct=settings["max_position_pct"],
    )

    if not sizing["allowed"]:
        return {
            "ok": False,
            "ticker": ticker,
            "error": f"Futures sizing rejected: {sizing.get('reason')}",
        }

    # Deterministic Pre-Flight Risk Check
    risk_check = check_trade(
        trading_mode="futures",
        entry_price=current_price,
        stop_loss=stop_loss,
        quantity=sizing["quantity"],
        direction=trade_dir,
        capital=capital,
        ticker=ticker,
    )

    if not risk_check["allowed"]:
        return {
            "ok": False,
            "ticker": ticker,
            "error": f"Risk engine rejected trade: {', '.join(risk_check['errors'])}",
            "risk_check": risk_check,
        }

    # AI Multi-Agent Validation
    trade_date = date.today().isoformat()
    ai_output = run_ai_analysis_for_candidate(ticker, trade_date, direction=trade_dir)
    ai_result = ai_output.get("result", {})
    ai_signal = ai_output.get("signal", "SHORT" if trade_dir == "SHORT" else "BUY")

    # If trade direction conflicts severely with AI verdict, reject
    if trade_dir == "SHORT" and ai_signal.upper() in ("BUY", "STRONG BUY"):
        return {
            "ok": False,
            "ticker": ticker,
            "error": f"AI pipeline opposed SHORT trade (Signal: {ai_signal})",
        }
    if trade_dir == "LONG" and ai_signal.upper() in ("SELL", "SHORT", "STRONG SELL"):
        return {
            "ok": False,
            "ticker": ticker,
            "error": f"AI pipeline opposed LONG trade (Signal: {ai_signal})",
        }

    # Formulate Comprehensive Selection Audit Report
    triggered_signals = candidate.get("signals", [])
    signals_summary = ", ".join([s.get("type", "") for s in triggered_signals if isinstance(s, dict)])
    setup_name = candidate.get("setup_category", "FUTURES_SWING").replace("_", " ").title()

    selection_report = {
        "ticker": ticker,
        "trading_mode": "futures",
        "direction": trade_dir,
        "selected_at": datetime.now().isoformat(),
        "setup_name": setup_name,
        "contract_specs": {
            "lot_size": lot_size,
            "lots": sizing["lots"],
            "total_quantity": sizing["quantity"],
            "contract_value": sizing["contract_value"],
            "required_margin": sizing["required_margin"],
            "margin_rate_pct": round(settings["margin_rate"] * 100.0, 1),
        },
        "screening_reason": {
            "technical_score": candidate.get("score"),
            "setup_category": candidate.get("setup_category"),
            "success_probability": candidate.get("success_probability"),
            "triggered_signals": triggered_signals,
            "market_bias": candidate.get("market_bias"),
            "event_warning": candidate.get("event_warning"),
        },
        "trade_parameters": {
            "direction": trade_dir,
            "entry_price": current_price,
            "stop_loss": stop_loss,
            "target": target,
            "quantity": sizing["quantity"],
            "lots": sizing["lots"],
            "lot_size": lot_size,
            "position_margin": sizing["required_margin"],
            "risk_budget": sizing["risk_budget"],
            "actual_risk_amount": sizing["actual_risk_amount"],
            "actual_risk_pct": sizing["actual_risk_pct"],
        },
        "ai_analysis": {
            "task_id": ai_output.get("task_id"),
            "signal": ai_signal,
            "investment_plan": ai_result.get("investment_plan"),
            "trader_investment_plan": ai_result.get("trader_investment_plan"),
            "final_trade_decision": ai_result.get("final_trade_decision"),
            "bull_thesis": ai_result.get("bull_history"),
            "bear_thesis": ai_result.get("bear_history"),
            "risk_aggressive": ai_result.get("risk_aggressive_history"),
            "risk_conservative": ai_result.get("risk_conservative_history"),
            "risk_neutral": ai_result.get("risk_neutral_history"),
        },
        "why_picked": (
            f"Selected for Futures {trade_dir} on [{setup_name}] (Score: {candidate.get('score')} | Win Prob: {candidate.get('success_probability')}%). "
            f"Signals: [{signals_summary}]. Multi-agent AI confirmed verdict '{ai_signal}'. "
            f"Executed with {sizing['lots']} lot(s) ({sizing['quantity']} shares) requiring ₹{sizing['required_margin']:,.2f} margin "
            f"and risking {sizing['actual_risk_pct']:.2f}% of portfolio (₹{sizing['actual_risk_amount']:,.2f})."
        ),
    }

    notes = (
        f"Automated Futures Trade ({trade_dir}).\n"
        f"Contract: {sizing['lots']} Lot ({sizing['quantity']} shares @ ₹{current_price:.2f})\n"
        f"SL: ₹{stop_loss:.2f} | Target: ₹{target:.2f} | Margin: ₹{sizing['required_margin']:,.2f}\n"
        f"Risk: ₹{sizing['actual_risk_amount']:,.2f} ({sizing['actual_risk_pct']:.2f}% of ₹{capital:,.0f})\n"
        f"Setup: {setup_name}"
    )

    trade_id = add_paper_trade({
        "ticker": ticker,
        "trading_mode": "futures",
        "source": "ai_auto_futures",
        "strategy": f"Automated Futures ({trade_dir} · 5% Risk)",
        "direction": trade_dir,
        "signal": ai_signal,
        "score": candidate.get("score"),
        "confidence": candidate.get("confidence") or "HIGH",
        "success_probability": candidate.get("success_probability"),
        "triggered_signals": triggered_signals,
        "entry_price": current_price,
        "stop_loss": stop_loss,
        "target": target,
        "quantity": sizing["quantity"],
        "capital": sizing["required_margin"],  # Deployed margin is the capital at work
        "notes": notes,
        "task_id": ai_output.get("task_id"),
        "selection_report": selection_report,
        "current_price": current_price,
    })

    result_payload = {
        "ok": True,
        "trade_id": trade_id,
        "ticker": ticker,
        "direction": trade_dir,
        "entry_price": current_price,
        "stop_loss": stop_loss,
        "target": target,
        "lots": sizing["lots"],
        "lot_size": lot_size,
        "quantity": sizing["quantity"],
        "required_margin": sizing["required_margin"],
        "actual_risk_amount": sizing["actual_risk_amount"],
        "actual_risk_pct": sizing["actual_risk_pct"],
        "ai_signal": ai_signal,
        "task_id": ai_output.get("task_id"),
        "selection_report": selection_report,
    }

    # Dispatch Telegram Alert
    _notify_telegram_futures_opened(result_payload)
    return result_payload


def _notify_telegram_futures_opened(data: dict) -> None:
    rep = data.get("selection_report", {})
    why = rep.get("why_picked", "Selected by automated futures engine.") if isinstance(rep, dict) else ""
    dir_emoji = "📉" if data.get("direction") == "SHORT" else "📈"
    msg = (
        f"{dir_emoji} <b>Automated Futures Trade Opened ({data.get('direction')})</b>\n\n"
        f"📌 <b>Contract:</b> <code>{data.get('ticker')}</code> FUTURES\n"
        f"📦 <b>Position:</b> {data.get('lots')} Lot ({data.get('quantity')} shares) | Margin: ₹{data.get('required_margin', 0):,.2f}\n"
        f"💰 <b>Entry:</b> ₹{data.get('entry_price')} | <b>SL:</b> ₹{data.get('stop_loss')} | <b>Target:</b> ₹{data.get('target')}\n"
        f"🛡️ <b>Risk Budget:</b> {data.get('actual_risk_pct', 0):.2f}% (₹{data.get('actual_risk_amount', 0):,.2f})\n"
        f"🧠 <b>AI Verdict:</b> {data.get('ai_signal', 'SHORT')}\n\n"
        f"💡 <b>Rationale:</b> {why[:250]}..."
    )
    _send_telegram_alert(msg)


def check_and_update_futures_positions() -> dict:
    """Monitor active futures positions against live prices and execute exits for both SHORT & LONG."""
    all_trades = list_paper_trades()
    active_trades = [
        t for t in all_trades
        if t.get("trading_mode") == "futures" and t.get("status") == "active"
    ]

    actions_taken = []
    today = date.today()

    for trade in active_trades:
        trade_id = trade["id"]
        ticker = trade["ticker"]
        entry = float(trade["entry_price"])
        stop_loss = float(trade["stop_loss"]) if trade.get("stop_loss") is not None else None
        target = float(trade.get("target")) if trade.get("target") is not None else None
        quantity = float(trade.get("quantity") or 0)
        direction = trade.get("direction", "LONG").upper()
        multiplier = 1 if direction == "LONG" else -1

        current_price = get_current_stock_price(ticker)
        if current_price is None:
            continue

        entry_date_str = str(trade.get("entry_date") or trade.get("entry_datetime") or "")[:10]
        try:
            entry_d = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
            days_held = (today - entry_d).days
        except Exception:
            days_held = 0

        # Mark-to-market
        price_diff = current_price - entry
        unrealized_pct = round(multiplier * (price_diff / entry) * 100.0, 2)
        unrealized_amt = round(multiplier * price_diff * quantity, 2)

        # 1. Stop-Loss Check
        is_sl_hit = False
        if stop_loss is not None:
            if direction == "LONG" and current_price <= stop_loss:
                is_sl_hit = True
            elif direction == "SHORT" and current_price >= stop_loss:
                is_sl_hit = True

        if is_sl_hit:
            exit_price = min(current_price, stop_loss) if direction == "LONG" else max(current_price, stop_loss)
            realized_pnl = round(multiplier * (exit_price - entry) * quantity, 2)
            realized_pct = round(multiplier * (exit_price - entry) / entry * 100.0, 2)
            note = f"Auto-closed Futures ({direction}): Stop-loss ₹{stop_loss:.2f} triggered at ₹{current_price:.2f}. Realized P&L: ₹{realized_pnl:,.2f} ({realized_pct:+.2f}%)."
            update_paper_trade_exit(trade_id, exit_price, "stop_loss_hit", realized_pnl, note)
            actions_taken.append({
                "ticker": ticker,
                "direction": direction,
                "action": "exit_stop_loss",
                "trade_id": trade_id,
                "exit_price": exit_price,
                "realized_pnl": realized_pnl,
                "realized_pct": realized_pct,
                "reason": "stop_loss_hit",
            })
            from backend.auto_trader import _notify_telegram_trade_exit
            _notify_telegram_trade_exit(f"{ticker} FUT", exit_price, f"{direction.lower()}_stop_loss_hit", realized_pnl, realized_pct)
            continue

        # 2. Target Check
        is_target_hit = False
        if target is not None:
            if direction == "LONG" and current_price >= target:
                is_target_hit = True
            elif direction == "SHORT" and current_price <= target:
                is_target_hit = True

        if is_target_hit:
            exit_price = max(current_price, target) if direction == "LONG" else min(current_price, target)
            realized_pnl = round(multiplier * (exit_price - entry) * quantity, 2)
            realized_pct = round(multiplier * (exit_price - entry) / entry * 100.0, 2)
            note = f"Auto-closed Futures ({direction}): Target ₹{target:.2f} achieved at ₹{current_price:.2f}. Realized P&L: ₹{realized_pnl:,.2f} ({realized_pct:+.2f}%)."
            update_paper_trade_exit(trade_id, exit_price, "target_hit", realized_pnl, note)
            actions_taken.append({
                "ticker": ticker,
                "direction": direction,
                "action": "exit_target",
                "trade_id": trade_id,
                "exit_price": exit_price,
                "realized_pnl": realized_pnl,
                "realized_pct": realized_pct,
                "reason": "target_hit",
            })
            from backend.auto_trader import _notify_telegram_trade_exit
            _notify_telegram_trade_exit(f"{ticker} FUT", exit_price, f"{direction.lower()}_target_hit", realized_pnl, realized_pct)
            continue

        # 3. Holding Horizon / Expiry Check (14 calendar days)
        if days_held > 14:
            realized_pnl = round(multiplier * (current_price - entry) * quantity, 2)
            note = f"Auto-closed Futures ({direction}): Swing horizon / contract rollover reached ({days_held} days). P&L: ₹{realized_pnl:,.2f} ({unrealized_pct:+.2f}%)."
            update_paper_trade_exit(trade_id, current_price, "horizon_expired", realized_pnl, note)
            actions_taken.append({
                "ticker": ticker,
                "direction": direction,
                "action": "exit_horizon_expired",
                "trade_id": trade_id,
                "exit_price": current_price,
                "realized_pnl": realized_pnl,
                "realized_pct": unrealized_pct,
                "reason": "horizon_expired",
            })
            from backend.auto_trader import _notify_telegram_trade_exit
            _notify_telegram_trade_exit(f"{ticker} FUT", current_price, "horizon_expired", realized_pnl, unrealized_pct)
            continue

        # Trailing stop to Breakeven for SHORT and LONG
        if stop_loss is not None:
            initial_risk_dist = abs(entry - float(trade.get("stop_loss") or entry))
            if initial_risk_dist > 0:
                is_one_r = False
                if direction == "LONG" and current_price >= (entry + initial_risk_dist) and stop_loss < entry:
                    is_one_r = True
                elif direction == "SHORT" and current_price <= (entry - initial_risk_dist) and stop_loss > entry:
                    is_one_r = True

                if is_one_r:
                    new_sl = entry
                    with get_db() as conn:
                        conn.execute(
                            """UPDATE paper_trades SET
                                stop_loss = ?,
                                notes = COALESCE(notes, '') || '\nTrailing SL moved to breakeven (Rs.' || ? || ') on ' || date('now') || '.',
                                updated_at = datetime('now')
                               WHERE id = ?""",
                            (new_sl, new_sl, trade_id),
                        )
                    stop_loss = new_sl
                    actions_taken.append({
                        "ticker": ticker,
                        "direction": direction,
                        "action": "trailing_sl_breakeven",
                        "trade_id": trade_id,
                        "new_stop_loss": new_sl,
                    })
                    from backend.auto_trader import _notify_telegram_trailing_stop
                    _notify_telegram_trailing_stop(f"{ticker} FUT ({direction})", current_price, entry)

        # Update live mark-to-market
        update_paper_trade_live_metrics(trade_id, current_price, unrealized_amt, unrealized_pct)

    return {
        "checked": len(active_trades),
        "checked_positions": len(active_trades),
        "actions": actions_taken,
        "actions_taken": actions_taken,
        "updated_at": datetime.now().isoformat(),
    }


def run_futures_trade_cycle(trigger_type: str = "manual") -> dict:
    """Run full automated Futures cycle: check exits, screen short & long setups, validate via AI, and open trades."""
    cycle_start = time.time()
    today_str = date.today().isoformat()
    actions = []

    # 1. Monitor exits & update MTM
    monitor_res = check_and_update_futures_positions()
    actions.extend(monitor_res.get("actions_taken", []))

    # 2. Portfolio & Slot Check
    status = get_futures_portfolio_status()
    available_slots = status["available_slots"]
    available_cash = status["available_cash"]
    max_candidates = status["settings"]["max_candidates_per_cycle"]
    candidates_to_open = min(available_slots, max_candidates)

    opened_trades = []
    if candidates_to_open > 0 and available_cash > 25000:
        # 3. Screen Futures setups (analyzes both SHORT breakdown/reversals and LONG breakouts)
        candidates = screen_futures_setups(
            universe=status["settings"]["universe"],
            min_score=status["settings"]["min_score"],
            limit=candidates_to_open * 2,
        )

        for candidate in candidates:
            if len(opened_trades) >= candidates_to_open:
                break
            trade_res = evaluate_and_open_futures_trade(candidate, status)
            if trade_res.get("ok"):
                opened_trades.append(trade_res)
                actions.append({
                    "action": "opened_futures_trade",
                    "ticker": trade_res["ticker"],
                    "direction": trade_res["direction"],
                    "lots": trade_res["lots"],
                    "quantity": trade_res["quantity"],
                    "required_margin": trade_res["required_margin"],
                    "actual_risk_pct": trade_res["actual_risk_pct"],
                    "ai_signal": trade_res["ai_signal"],
                })
                status["available_cash"] -= trade_res["required_margin"]
            else:
                actions.append({
                    "action": "skipped_candidate",
                    "ticker": candidate.get("ticker"),
                    "reason": trade_res.get("error"),
                })

    duration = round(time.time() - cycle_start, 2)
    summary_text = (
        f"Completed automated Futures cycle ({trigger_type}): Monitored {monitor_res['checked_positions']} active positions. "
        f"Exits/Updates: {len(monitor_res.get('actions_taken', []))}. Opened {len(opened_trades)} new futures trades."
    )

    save_auto_trade_log({
        "run_date": today_str,
        "trigger_type": f"futures_{trigger_type}",
        "status": "completed",
        "summary": summary_text,
        "actions_taken": actions,
    })

    return {
        "ok": True,
        "trading_mode": "futures",
        "summary": summary_text,
        "trigger_type": trigger_type,
        "duration_seconds": duration,
        "actions": actions,
        "opened_trades": opened_trades,
        "portfolio": get_futures_portfolio_status(),
    }
