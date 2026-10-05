"""Cost-aware, non-lookahead daily backtesting for equity strategies.

The simulator consumes OHLCV data and enters on the next session's open. It
models adverse slippage, round-trip costs, stop/target execution, position
sizing and a walk-forward out-of-sample split.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import numpy as np
import pandas as pd


@dataclass
class BacktestConfig:
    initial_capital: float = 500_000
    risk_per_trade_pct: float = 0.5
    max_position_pct: float = 10.0
    slippage_bps: float = 5.0
    round_trip_cost_bps: float = 35.0
    stop_atr_multiple: float = 1.5
    target_atr_multiple: float = 3.0
    max_hold_days: int = 10
    walk_forward_test_pct: float = 30.0


def _prepare(data: pd.DataFrame) -> pd.DataFrame:
    frame = data.copy()
    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = [column[0] for column in frame.columns]
    required = {"Open", "High", "Low", "Close", "Volume"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Missing OHLCV columns: {', '.join(sorted(missing))}")
    frame = frame.sort_index().copy()
    frame["sma20"] = frame["Close"].rolling(20).mean()
    frame["sma50"] = frame["Close"].rolling(50).mean()
    frame["prior_high20"] = frame["High"].rolling(20).max().shift(1)
    prev_close = frame["Close"].shift(1)
    frame["tr"] = np.maximum(frame["High"] - frame["Low"], np.maximum(abs(frame["High"] - prev_close), abs(frame["Low"] - prev_close)))
    frame["atr14"] = frame["tr"].rolling(14).mean()
    return frame.dropna(subset=["sma20", "sma50", "prior_high20", "atr14"])


def run_realistic_backtest(data: pd.DataFrame, config: BacktestConfig | None = None, mode: str = "equity_swing") -> dict:
    cfg = config or BacktestConfig()
    frame = _prepare(data)
    if len(frame) < 30:
        raise ValueError("At least 30 valid OHLCV sessions are required")

    capital = float(cfg.initial_capital)
    peak = capital
    trades: list[dict] = []
    equity_curve: list[dict] = []
    i = 0
    while i < len(frame) - 1:
        signal_row = frame.iloc[i]
        bullish = bool(signal_row["Close"] > signal_row["sma20"] and signal_row["sma20"] > signal_row["sma50"] and signal_row["Close"] > signal_row["prior_high20"])
        bearish = bool(signal_row["Close"] < signal_row["sma20"] and signal_row["sma20"] < signal_row["sma50"])
        if not bullish and not bearish:
            equity_curve.append({"date": str(frame.index[i].date()), "equity": round(capital, 2)})
            i += 1
            continue

        side = "LONG" if bullish else "SHORT"
        entry_row = frame.iloc[i + 1]
        raw_entry = float(entry_row["Open"])
        slip = cfg.slippage_bps / 10_000
        entry = raw_entry * (1 + slip if side == "LONG" else 1 - slip)
        atr = float(signal_row["atr14"])
        stop = entry - cfg.stop_atr_multiple * atr if side == "LONG" else entry + cfg.stop_atr_multiple * atr
        target = entry + cfg.target_atr_multiple * atr if side == "LONG" else entry - cfg.target_atr_multiple * atr
        risk_per_share = abs(entry - stop)
        risk_budget = capital * cfg.risk_per_trade_pct / 100
        max_value = capital * cfg.max_position_pct / 100
        quantity = math.floor(min(risk_budget / risk_per_share, max_value / entry)) if risk_per_share and entry > 0 else 0
        if quantity <= 0:
            i += 1
            continue

        exit_price = None
        exit_reason = "time"
        exit_index = min(i + cfg.max_hold_days, len(frame) - 1)
        for j in range(i + 1, exit_index + 1):
            bar = frame.iloc[j]
            if side == "LONG":
                # Conservative same-bar assumption: stop wins if both levels
                # were touched and OHLC cannot establish the order.
                if float(bar["Low"]) <= stop:
                    exit_price, exit_reason = stop * (1 - slip), "stop"
                    exit_index = j
                    break
                if float(bar["High"]) >= target:
                    exit_price, exit_reason = target * (1 - slip), "target"
                    exit_index = j
                    break
            else:
                if float(bar["High"]) >= stop:
                    exit_price, exit_reason = stop * (1 + slip), "stop"
                    exit_index = j
                    break
                if float(bar["Low"]) <= target:
                    exit_price, exit_reason = target * (1 + slip), "target"
                    exit_index = j
                    break
        if exit_price is None:
            raw_exit = float(frame.iloc[exit_index]["Close"])
            exit_price = raw_exit * (1 - slip if side == "LONG" else 1 + slip)

        gross = (exit_price - entry) * quantity if side == "LONG" else (entry - exit_price) * quantity
        costs = (entry * quantity + exit_price * quantity) * cfg.round_trip_cost_bps / 10_000
        pnl = gross - costs
        capital += pnl
        peak = max(peak, capital)
        drawdown = (peak - capital) / peak * 100 if peak else 0
        trade = {
            "entry_date": str(frame.index[i + 1].date()),
            "exit_date": str(frame.index[exit_index].date()),
            "side": side,
            "entry_price": round(entry, 2),
            "exit_price": round(exit_price, 2),
            "stop_loss": round(stop, 2),
            "target": round(target, 2),
            "quantity": quantity,
            "gross_pnl": round(gross, 2),
            "costs": round(costs, 2),
            "pnl": round(pnl, 2),
            "pnl_pct_on_capital": round(pnl / (capital - pnl) * 100, 3),
            "exit_reason": exit_reason,
            "drawdown_pct": round(drawdown, 2),
        }
        trades.append(trade)
        equity_curve.append({"date": trade["exit_date"], "equity": round(capital, 2)})
        i = max(i + 1, exit_index)

    pnls = np.array([trade["pnl"] for trade in trades], dtype=float)
    split = int(len(trades) * (1 - cfg.walk_forward_test_pct / 100))
    test_trades = trades[split:] if split < len(trades) else []
    test_pnl = sum(trade["pnl"] for trade in test_trades)
    daily_returns = np.diff([cfg.initial_capital] + [point["equity"] for point in equity_curve])
    sharpe = float(np.mean(daily_returns) / np.std(daily_returns) * np.sqrt(252)) if len(daily_returns) > 1 and np.std(daily_returns) else 0.0
    return {
        "mode": mode,
        "config": cfg.__dict__,
        "sessions": len(frame),
        "total_trades": len(trades),
        "winning_trades": sum(1 for pnl in pnls if pnl > 0),
        "losing_trades": sum(1 for pnl in pnls if pnl < 0),
        "win_rate": round(float(np.mean(pnls > 0) * 100), 2) if len(pnls) else 0.0,
        "initial_capital": round(cfg.initial_capital, 2),
        "final_capital": round(capital, 2),
        "net_pnl": round(float(pnls.sum()), 2) if len(pnls) else 0.0,
        "total_return_pct": round((capital / cfg.initial_capital - 1) * 100, 2),
        "max_drawdown_pct": round(max((trade["drawdown_pct"] for trade in trades), default=0), 2),
        "profit_factor": round(float(pnls[pnls > 0].sum() / abs(pnls[pnls < 0].sum())), 2) if np.any(pnls < 0) else None,
        "sharpe_approx": round(sharpe, 2),
        "walk_forward": {
            "test_trade_count": len(test_trades),
            "test_net_pnl": round(test_pnl, 2),
            "test_return_pct": round(test_pnl / cfg.initial_capital * 100, 2),
        },
        "trades": trades,
        "equity_curve": equity_curve,
    }
