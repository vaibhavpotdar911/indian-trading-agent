"""Read-only Kotak Neo v3 SFeed WebSocket bridge."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.brokers.kotak_neo import get_sdk_client, search_scrip_token


router = APIRouter(tags=["kotak-feed"])


@router.websocket("/ws/kotak-neo/feed/{ticker}")
async def kotak_feed(websocket: WebSocket, ticker: str, exchange: str = "NSE"):
    """Stream touch-line ticks from kotakneoapi 3.x to a browser client.

    This endpoint only subscribes to market data; it has no order route and
    cannot place, modify, or cancel trades.
    """
    await websocket.accept()
    try:
        resolved = search_scrip_token(ticker, exchange)
        if not resolved:
            await websocket.send_json({"error": "Kotak instrument token not found"})
            await websocket.close(code=1008)
            return
        segment, token = resolved
        from neo_api_client.websocket.feed import WsToken

        async with get_sdk_client().create_websocket() as feed:
            await feed.subscribe_scrips([WsToken(segment, token)])
            async for message in feed:
                if hasattr(message, "model_dump"):
                    await websocket.send_json(message.model_dump(mode="json"))
                else:
                    await websocket.send_json({"message": str(message)})
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"error": str(exc)})
            await websocket.close(code=1011)
        except Exception:
            pass
