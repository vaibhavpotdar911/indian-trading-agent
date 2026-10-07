"""Shared portfolio and trade risk checks.

This module is deliberately deterministic. AI output can propose a trade, but
this layer decides whether its size and loss are acceptable.
"""

from datetime import date

from backend.db import get_setting, set_setting, list_paper_trades, list_positions
from backend.trading_modes import get_trading_mode


DEFAULT_CAPITAL = 500_000.0


def _number_setting(key: str, default: float) -> float:
    try:
        value = get_setting(key)
        return float(value) if value not in (None, "") else default
    except Exception:
        return default


def get_risk_profile(trading_mode: str = "equity_swing") -> dict:
    mode = get_trading_mode(trading_mode)
    mode_risk = mode["risk"]
    capital = _number_setting("risk_capital", DEFAULT_CAPITAL)
    return {
        "trading_mode": mode["id"],
        "label": mode["label"],
        "capital": capital,
        "max_risk_per_trade_pct": _number_setting(
            f"risk_{mode['id']}_per_trade_pct", mode_risk["max_risk_per_trade_pct"]
        ),
        "max_position_pct": _number_setting(
            f"risk_{mode['id']}_position_pct", mode_risk["max_position_pct"]
        ),
        "max_daily_loss_pct": _number_setting(
            f"risk_{mode['id']}_daily_loss_pct", mode_risk["max_daily_loss_pct"]
        ),
        "max_open_positions": int(
            _number_setting(f"risk_{mode['id']}_open_positions", mode_risk["max_open_positions"])
        ),
        "require_stop_loss": mode_risk["require_stop_loss"],
        "order_execution_enabled": False,
        "dry_run": True,
        "trading_locked": (get_setting("risk_trading_locked") or "0") == "1",
    }


def _open_trade_count(trading_mode: str) -> int:
    try:
        return sum(
            1 for trade in list_paper_trades(status="active")
            if trade.get("trading_mode", "equity_swing") == trading_mode
        )
    except Exception:
        # A risk check must remain usable during first-run setup. The app
        # lifespan normally initializes SQLite before requests arrive.
        return 0


def _portfolio_metrics(trading_mode: str) -> dict:
    try:
        trades = [
            trade for trade in list_paper_trades()
            if trade.get("trading_mode", "equity_swing") == trading_mode
        ]
        active = [trade for trade in trades if trade.get("status") == "active"]
        open_risk = sum(
            abs(float(trade.get("entry_price") or 0) - float(trade.get("stop_loss") or 0))
            * float(trade.get("quantity") or 0)
            for trade in active
            if trade.get("stop_loss") is not None
        )
        today = date.today().isoformat()
        realized_today = sum(
            float(trade.get("realized_pnl_amount") or 0)
            for trade in trades
            if str(trade.get("updated_at") or trade.get("entry_date") or "")[:10] == today
        )
        broker_positions = list_positions()
        broker_exposure = sum(float(row.get("current_value") or 0) for row in broker_positions)
        broker_unrealized = sum(float(row.get("pnl") or 0) for row in broker_positions)
        broker_count = sum(1 for row in broker_positions if float(row.get("quantity") or 0) > 0)
        return {
            "open_risk": round(open_risk, 2),
            "realized_today": round(realized_today, 2),
            "broker_exposure": round(broker_exposure, 2),
            "broker_positions": broker_count,
            "broker_unrealized": round(broker_unrealized, 2),
        }
    except Exception:
        return {"open_risk": 0.0, "realized_today": 0.0, "broker_exposure": 0.0, "broker_positions": 0, "broker_unrealized": 0.0}


def set_trading_lock(locked: bool) -> dict:
    set_setting("risk_trading_locked", "1" if locked else "0")
    return {"trading_locked": locked}


def get_portfolio_risk_summary(trading_mode: str = "equity_swing") -> dict:
    """Return dashboard-safe portfolio risk metrics for one trading mode."""
    profile = get_risk_profile(trading_mode)
    metrics = _portfolio_metrics(profile["trading_mode"])
    daily_limit = profile["capital"] * profile["max_daily_loss_pct"] / 100
    return {
        "trading_mode": profile["trading_mode"],
        "profile": profile,
        "open_risk": metrics["open_risk"],
        "open_risk_pct": round(metrics["open_risk"] / profile["capital"] * 100, 3) if profile["capital"] else 0,
        "realized_today": metrics["realized_today"],
        "daily_loss_limit": round(daily_limit, 2),
        "daily_loss_used_pct": round(max(0, -metrics["realized_today"]) / daily_limit * 100, 2) if daily_limit else 0,
        "open_positions": _open_trade_count(profile["trading_mode"]),
        "broker_exposure": metrics.get("broker_exposure", 0),
        "broker_positions": metrics.get("broker_positions", 0),
        "broker_unrealized": metrics.get("broker_unrealized", 0),
    }


def check_trade(
    *,
    trading_mode: str = "equity_swing",
    entry_price: float,
    stop_loss: float | None = None,
    quantity: float | None = None,
    direction: str = "LONG",
    capital: float | None = None,
    ticker: str | None = None,
) -> dict:
    """Return an explainable preflight decision for a proposed trade."""
    profile = get_risk_profile(trading_mode)
    if capital is not None and capital > 0:
        profile["capital"] = float(capital)

    errors: list[str] = []
    warnings: list[str] = []
    entry = float(entry_price or 0)
    qty = float(quantity or 0)
    side = (direction or "LONG").upper()
    portfolio = _portfolio_metrics(profile["trading_mode"])
    if profile["trading_locked"]:
        errors.append("Trading is locked by the global risk kill switch.")
    if entry <= 0:
        errors.append("Entry price must be greater than zero.")

    if profile["require_stop_loss"] and stop_loss is None:
        errors.append("A stop-loss is required for this trading mode.")

    if stop_loss is not None:
        stop = float(stop_loss)
        valid_stop = stop < entry if side == "LONG" else stop > entry
        if not valid_stop:
            errors.append("Stop-loss must be below entry for LONG and above entry for SHORT.")
        risk_per_unit = abs(entry - stop)
    else:
        risk_per_unit = 0.0

    margin_rate = 0.22 if (profile.get("asset_class") == "futures" or trading_mode == "futures") else 1.0
    position_value = entry * qty * margin_rate if qty > 0 else 0.0
    risk_amount = risk_per_unit * qty if qty > 0 else 0.0
    risk_pct = risk_amount / profile["capital"] * 100 if profile["capital"] else 0.0
    position_pct = position_value / profile["capital"] * 100 if profile["capital"] else 0.0

    if qty <= 0:
        warnings.append("Quantity was not supplied; position-size limits cannot be fully evaluated.")
    if risk_pct > profile["max_risk_per_trade_pct"]:
        errors.append(
            f"Risk {risk_pct:.2f}% exceeds the {profile['max_risk_per_trade_pct']:.2f}% per-trade limit."
        )
    if position_pct > profile["max_position_pct"]:
        errors.append(
            f"Position {position_pct:.2f}% exceeds the {profile['max_position_pct']:.2f}% position limit."
        )

    daily_loss_limit = profile["capital"] * profile["max_daily_loss_pct"] / 100
    if portfolio["realized_today"] < -daily_loss_limit:
        errors.append("Daily loss limit has already been reached.")
    if portfolio["realized_today"] < 0:
        warnings.append(f"Realized loss today: ₹{abs(portfolio['realized_today']):,.0f}.")

    concentration = None
    if ticker:
        try:
            from backend.concentration import check_new_trade_concentration
            sector_limit = 45.0 if (profile.get("asset_class") == "futures" or trading_mode == "futures") else 30.0
            concentration = check_new_trade_concentration(
                ticker,
                proposed_position_value=position_value or None,
                total_capital=profile["capital"],
                max_percent_per_sector=sector_limit,
            )
            if concentration.get("would_breach"):
                errors.extend(concentration.get("warnings", []))
            elif concentration.get("warnings"):
                warnings.extend(concentration["warnings"])
        except Exception:
            warnings.append("Sector concentration could not be checked.")

    open_count = _open_trade_count(profile["trading_mode"])
    broker_position_count = portfolio.get("broker_positions", 0)
    effective_open_count = open_count + broker_position_count
    if effective_open_count >= profile["max_open_positions"]:
        errors.append(
            f"Maximum open positions reached ({profile['max_open_positions']})."
        )

    return {
        "allowed": not errors,
        "trading_mode": profile["trading_mode"],
        "profile": profile,
        "metrics": {
            "entry_price": entry,
            "stop_loss": stop_loss,
            "quantity": qty,
            "position_value": round(position_value, 2),
            "risk_amount": round(risk_amount, 2),
            "risk_pct": round(risk_pct, 3),
            "position_pct": round(position_pct, 3),
            "open_positions": effective_open_count,
            "paper_open_positions": open_count,
            "broker_positions": broker_position_count,
            "broker_exposure": portfolio.get("broker_exposure", 0),
            "broker_unrealized": portfolio.get("broker_unrealized", 0),
            "open_risk": portfolio["open_risk"],
            "realized_today": portfolio["realized_today"],
            "daily_loss_limit": round(daily_loss_limit, 2),
            "concentration": concentration,
            "checked_on": date.today().isoformat(),
        },
        "errors": errors,
        "warnings": warnings,
    }
