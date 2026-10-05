from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from backend.risk_engine import check_trade, get_risk_profile, set_trading_lock, get_portfolio_risk_summary
from backend.db import set_setting


router = APIRouter(prefix="/api/risk", tags=["risk"])


class RiskCheckRequest(BaseModel):
    trading_mode: str = "equity_swing"
    entry_price: float = Field(gt=0)
    stop_loss: float | None = Field(default=None, gt=0)
    quantity: float | None = Field(default=None, gt=0)
    direction: str = "LONG"
    capital: float | None = Field(default=None, gt=0)
    ticker: str | None = None


class RiskSettingsUpdate(BaseModel):
    trading_mode: str = "equity_swing"
    capital: float = Field(gt=0)
    max_risk_per_trade_pct: float = Field(gt=0, le=10)
    max_position_pct: float = Field(gt=0, le=100)
    max_daily_loss_pct: float = Field(gt=0, le=20)
    max_open_positions: int = Field(gt=0, le=100)


class TradingLockUpdate(BaseModel):
    locked: bool


@router.get("/profile")
def risk_profile(trading_mode: str = Query("equity_swing")):
    return get_risk_profile(trading_mode)


@router.get("/summary")
def risk_summary(trading_mode: str = Query("equity_swing")):
    return get_portfolio_risk_summary(trading_mode)


@router.put("/profile")
def update_risk_profile(request: RiskSettingsUpdate):
    mode = get_risk_profile(request.trading_mode)["trading_mode"]
    set_setting("risk_capital", str(request.capital))
    set_setting(f"risk_{mode}_per_trade_pct", str(request.max_risk_per_trade_pct))
    set_setting(f"risk_{mode}_position_pct", str(request.max_position_pct))
    set_setting(f"risk_{mode}_daily_loss_pct", str(request.max_daily_loss_pct))
    set_setting(f"risk_{mode}_open_positions", str(request.max_open_positions))
    return get_risk_profile(mode)


@router.post("/check")
def risk_check(request: RiskCheckRequest):
    return check_trade(**request.model_dump())


@router.get("/lock")
def trading_lock_status():
    return get_risk_profile().get("trading_locked", False) and {"trading_locked": True} or {"trading_locked": False}


@router.put("/lock")
def update_trading_lock(request: TradingLockUpdate):
    return set_trading_lock(request.locked)
