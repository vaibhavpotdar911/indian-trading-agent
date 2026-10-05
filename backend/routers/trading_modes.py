from fastapi import APIRouter

from backend.trading_modes import get_trading_mode, get_trading_modes


router = APIRouter(prefix="/api/trading-modes", tags=["trading-modes"])


@router.get("")
def list_trading_modes():
    return {"modes": get_trading_modes()}


@router.get("/{mode}")
def trading_mode(mode: str):
    return get_trading_mode(mode)
