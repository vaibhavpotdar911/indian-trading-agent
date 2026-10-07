from datetime import date, timedelta

import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.fundamental_backtest import FundamentalBacktestConfig, run_fundamental_backtest
from backend.fundamentals_provider import fetch_stoxim_snapshots, stoxim_configured
from tradingagents.utils.ticker import normalize_ticker

router = APIRouter(prefix="/api/fundamental-backtest", tags=["fundamental-backtest"])


class FundamentalBacktestRequest(BaseModel):
    ticker: str
    start_date: str | None = None
    end_date: str | None = None
    initial_capital: float = Field(default=500000, gt=0)
    reporting_lag_days: int = Field(default=90, ge=30, le=365)
    rebalance_days: int = Field(default=21, ge=5, le=252)
    slippage_bps: float = Field(default=5, ge=0, le=500)
    round_trip_cost_bps: float = Field(default=35, ge=0, le=1000)


@router.post("/run")
def run(request: FundamentalBacktestRequest):
    end = request.end_date or date.today().isoformat()
    start = request.start_date or (date.today() - timedelta(days=3650)).isoformat()
    try:
        ticker = normalize_ticker(request.ticker)
        prices = yf.Ticker(ticker).history(start=start, end=end, auto_adjust=False)
        snapshots = fetch_stoxim_snapshots(ticker)
        source = "stoxim" if snapshots else "yahoo_finance"
        if not snapshots:
            info = yf.Ticker(ticker)
            income = info.income_stmt
            balance = info.balance_sheet
            cashflow = info.cashflow
            for statement_date in income.columns if income is not None else []:
                revenue = income.get(statement_date, pd.Series()).get("Total Revenue")
                op_income = income.get(statement_date, pd.Series()).get("Operating Income")
                assets = balance.get(statement_date, pd.Series()).get("Total Assets") if balance is not None else None
                equity = balance.get(statement_date, pd.Series()).get("Stockholders Equity") if balance is not None else None
                debt = balance.get(statement_date, pd.Series()).get("Total Debt") if balance is not None else None
                fcf = cashflow.get(statement_date, pd.Series()).get("Free Cash Flow") if cashflow is not None else None
                snapshots.append({"date": statement_date, "operating_margin": float(op_income / revenue * 100) if revenue and op_income else None, "roe": float(op_income / equity * 100) if equity and op_income else None, "debt_to_equity": float(debt / equity) if debt and equity else None, "fcf_yield": float(fcf / assets * 100) if fcf and assets else None, "point_in_time_quality": "fiscal_period_date"})
        result = run_fundamental_backtest(prices, pd.DataFrame(snapshots), FundamentalBacktestConfig(initial_capital=request.initial_capital, reporting_lag_days=request.reporting_lag_days, rebalance_days=request.rebalance_days, slippage_bps=request.slippage_bps, round_trip_cost_bps=request.round_trip_cost_bps))
        result.update({"ticker": ticker, "start_date": start, "end_date": end, "fundamentals_source": source, "data_note": "Stoxim is used when STOXIM_API_KEY is configured; otherwise Yahoo financial statements are used. Verify filing/publication dates before relying on results."})
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
