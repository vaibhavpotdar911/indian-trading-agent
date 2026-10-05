from datetime import date, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.realistic_backtest import BacktestConfig, run_realistic_backtest
from tradingagents.utils.ticker import normalize_ticker


router = APIRouter(prefix="/api/realistic-backtest", tags=["realistic-backtest"])


class RealisticBacktestRequest(BaseModel):
    ticker: str
    trading_mode: str = "equity_swing"
    start_date: str | None = None
    end_date: str | None = None
    initial_capital: float = Field(default=500000, gt=0)
    risk_per_trade_pct: float = Field(default=0.5, gt=0, le=5)
    max_position_pct: float = Field(default=10, gt=0, le=100)
    slippage_bps: float = Field(default=5, ge=0, le=500)
    round_trip_cost_bps: float = Field(default=35, ge=0, le=1000)
    max_hold_days: int = Field(default=10, gt=0, le=252)


@router.post("/run")
def run(request: RealisticBacktestRequest):
    end = request.end_date or date.today().isoformat()
    start = request.start_date or (date.today() - timedelta(days=730)).isoformat()
    try:
        history = yf.download(normalize_ticker(request.ticker), start=start, end=end, auto_adjust=False, progress=False)
        if history is None or history.empty:
            raise ValueError("No OHLCV data returned for this ticker and date range")
        result = run_realistic_backtest(
            history,
            BacktestConfig(
                initial_capital=request.initial_capital,
                risk_per_trade_pct=request.risk_per_trade_pct,
                max_position_pct=request.max_position_pct,
                slippage_bps=request.slippage_bps,
                round_trip_cost_bps=request.round_trip_cost_bps,
                max_hold_days=request.max_hold_days,
            ),
            request.trading_mode,
        )
        result["ticker"] = normalize_ticker(request.ticker)
        result["start_date"] = start
        result["end_date"] = end
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
