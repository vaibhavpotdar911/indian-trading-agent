"""FastAPI router for Portfolio Daily Deep Analysis."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.db import (
    get_latest_portfolio_daily_analysis,
    get_portfolio_daily_analysis,
    list_portfolio_daily_analyses,
)
from backend.positions import get_positions_view
from backend.portfolio_analysis_service import (
    get_active_batch,
    portfolio_ws_manager,
    start_portfolio_daily_analysis,
)

router = APIRouter(prefix="/api/analysis/portfolio", tags=["portfolio-analysis"])


class PortfolioAnalysisRunRequest(BaseModel):
    tickers: Optional[List[str]] = None
    analysts: Optional[List[str]] = None
    depth: int = 1
    trading_mode: str = "equity_swing"
    language: str = "English"
    trade_date: Optional[str] = None


@router.get("/holdings")
def get_portfolio_holdings():
    """Return all synced holdings ready for multi-agent deep analysis."""
    view = get_positions_view()
    positions = view.get("positions", [])
    # Return non-zero positions with derived metrics
    holdings = [p for p in positions if float(p.get("quantity") or 0) > 0]
    return {
        "holdings": holdings,
        "count": len(holdings),
        "summary": view.get("summary", {}),
        "last_sync": view.get("last_sync"),
    }


@router.post("/run")
def trigger_portfolio_analysis(req: PortfolioAnalysisRunRequest):
    """Start daily deep analysis batch across holdings."""
    view = get_positions_view()
    all_holdings = [p for p in view.get("positions", []) if float(p.get("quantity") or 0) > 0]

    if req.tickers:
        selected_tickers = {t.upper().strip() for t in req.tickers}
        target_holdings = [
            h for h in all_holdings
            if (h.get("tradingsymbol") or "").upper() in selected_tickers
        ]
    else:
        target_holdings = all_holdings

    if not target_holdings:
        raise HTTPException(
            status_code=400,
            detail="No holdings found to analyze. Sync portfolio or select valid holdings first."
        )

    try:
        result = start_portfolio_daily_analysis(
            holdings=target_holdings,
            analysts=req.analysts,
            depth=req.depth,
            trading_mode=req.trading_mode,
            language=req.language,
            trade_date=req.trade_date,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/latest")
def get_latest():
    """Fetch the latest portfolio daily deep analysis record."""
    record = get_latest_portfolio_daily_analysis()
    return {"found": bool(record), "batch": record}


@router.get("/history")
def get_history(limit: int = Query(20, ge=1, le=50)):
    """Fetch recent portfolio daily deep analysis runs."""
    records = list_portfolio_daily_analyses(limit=limit)
    return {"history": records, "count": len(records)}


@router.get("/{batch_id}")
def get_batch(batch_id: str):
    """Fetch status and results for a specific batch run."""
    record = get_active_batch(batch_id)
    if not record:
        raise HTTPException(status_code=404, detail="Portfolio analysis batch not found")
    return record


@router.websocket("/ws/{batch_id}")
async def portfolio_analysis_websocket(websocket: WebSocket, batch_id: str):
    """WebSocket endpoint for streaming portfolio batch events."""
    await portfolio_ws_manager.connect(batch_id, websocket)
    try:
        # Keep connection open and listen for potential client pings
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await portfolio_ws_manager.disconnect(batch_id, websocket)
    except Exception:
        await portfolio_ws_manager.disconnect(batch_id, websocket)
