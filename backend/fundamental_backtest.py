"""Point-in-time fundamental backtesting for Equity Long-term.

Fundamental observations are applied only after a configurable reporting lag,
then orders execute on the next session's open. This prevents using a result
before it could have been known to an investor.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import pandas as pd


@dataclass
class FundamentalBacktestConfig:
    initial_capital: float = 500_000
    reporting_lag_days: int = 90
    rebalance_days: int = 21
    slippage_bps: float = 5
    round_trip_cost_bps: float = 35
    min_score_to_hold: int = 2
    min_score_to_buy: int = 3


def _number(row: pd.Series, names: tuple[str, ...]) -> float | None:
    for name in names:
        value = row.get(name)
        if value is not None and pd.notna(value):
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
    return None


def _score(row: pd.Series) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    growth = _number(row, ("revenue_growth", "growth"))
    roe = _number(row, ("roe",))
    margin = _number(row, ("operating_margin", "margin"))
    debt = _number(row, ("debt_to_equity", "debt_equity"))
    fcf = _number(row, ("fcf_yield", "free_cash_flow_yield"))
    pe = _number(row, ("pe", "pe_ratio"))
    if growth is not None and growth > 8: score += 1; reasons.append("growth")
    if roe is not None and roe > 12: score += 1; reasons.append("ROE")
    if margin is not None and margin > 10: score += 1; reasons.append("margin")
    if debt is not None and debt < 1: score += 1; reasons.append("debt")
    if fcf is not None and fcf > 2: score += 1; reasons.append("FCF")
    if pe is not None and 0 < pe < 30: score += 1; reasons.append("valuation")
    return score, reasons


def run_fundamental_backtest(prices: pd.DataFrame, fundamentals: pd.DataFrame, config: FundamentalBacktestConfig | None = None) -> dict:
    cfg = config or FundamentalBacktestConfig()
    prices = prices.copy().sort_index()
    prices.columns = [str(c).title() for c in prices.columns]
    required = {"Open", "Close"}
    if not required.issubset(prices.columns):
        raise ValueError("Price data requires Open and Close columns")
    if prices.empty or fundamentals.empty:
        raise ValueError("Price and fundamental observations are required")
    fundamentals = fundamentals.copy()
    if "date" not in fundamentals.columns:
        raise ValueError("Fundamentals require a date column")
    fundamentals["date"] = pd.to_datetime(fundamentals["date"]).dt.tz_localize(None)
    fundamentals = fundamentals.sort_values("date")
    capital = float(cfg.initial_capital)
    position = 0
    entry = 0.0
    entry_date = None
    trades: list[dict] = []
    equity: list[dict] = []
    last_rebalance = -cfg.rebalance_days
    for index in range(len(prices) - 1):
        day = pd.Timestamp(prices.index[index]).tz_localize(None) if pd.Timestamp(prices.index[index]).tzinfo else pd.Timestamp(prices.index[index])
        if index - last_rebalance >= cfg.rebalance_days:
            available = fundamentals[fundamentals["date"] <= day - pd.Timedelta(days=cfg.reporting_lag_days)]
            if not available.empty:
                snapshot = available.iloc[-1]
                score, reasons = _score(snapshot)
                should_hold = score >= cfg.min_score_to_hold
                should_buy = score >= cfg.min_score_to_buy
                next_open = float(prices.iloc[index + 1]["Open"])
                slip = cfg.slippage_bps / 10_000
                if position and not should_hold:
                    exit_price = next_open * (1 - slip)
                    gross = (exit_price - entry) * position
                    costs = (entry * position + exit_price * position) * cfg.round_trip_cost_bps / 10_000
                    capital += gross - costs
                    trades.append({"entry_date": entry_date, "exit_date": str(day.date()), "entry_price": round(entry, 2), "exit_price": round(exit_price, 2), "quantity": position, "pnl": round(gross - costs, 2), "score": score, "reasons": reasons})
                    position = 0
                elif not position and should_buy:
                    entry = next_open * (1 + slip)
                    position = math.floor(capital / entry)
                    entry_date = str(prices.index[index + 1].date())
                last_rebalance = index
        marked = capital + (float(prices.iloc[index]["Close"]) - entry) * position if position else capital
        equity.append({"date": str(day.date()), "equity": round(marked, 2)})
    if position:
        exit_price = float(prices.iloc[-1]["Close"]) * (1 - cfg.slippage_bps / 10_000)
        gross = (exit_price - entry) * position
        costs = (entry * position + exit_price * position) * cfg.round_trip_cost_bps / 10_000
        capital += gross - costs
        trades.append({"entry_date": entry_date, "exit_date": str(prices.index[-1].date()), "entry_price": round(entry, 2), "exit_price": round(exit_price, 2), "quantity": position, "pnl": round(gross - costs, 2), "exit_reason": "end_of_test"})
    values = [point["equity"] for point in equity] or [cfg.initial_capital]
    peak = cfg.initial_capital
    max_drawdown = 0.0
    for value in values:
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, (peak - value) / peak * 100 if peak else 0)
    pnls = [trade["pnl"] for trade in trades]
    return {"strategy": "fundamental_long_term", "sessions": len(prices), "fundamental_observations": len(fundamentals), "total_trades": len(trades), "winning_trades": sum(p > 0 for p in pnls), "win_rate": round(sum(p > 0 for p in pnls) / len(pnls) * 100, 2) if pnls else 0, "initial_capital": cfg.initial_capital, "final_capital": round(capital, 2), "net_pnl": round(sum(pnls), 2), "total_return_pct": round((capital / cfg.initial_capital - 1) * 100, 2), "max_drawdown_pct": round(max_drawdown, 2), "config": cfg.__dict__, "trades": trades, "equity_curve": equity}
