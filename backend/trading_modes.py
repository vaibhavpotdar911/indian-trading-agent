"""Trading-mode profiles shared by the API and UI.

Trading modes are deliberately configuration, not separate applications.  This
keeps authentication, market data, portfolio, journaling and risk controls
shared while allowing each strategy family to evolve independently.
"""

from copy import deepcopy


TRADING_MODES = {
    "equity_long_term": {
        "id": "equity_long_term",
        "label": "Equity Long-term",
        "asset_class": "equity",
        "time_horizon": "months_to_years",
        "description": "Fundamental, portfolio-oriented equity investing.",
        "default_lookback": "2y",
        "risk": {
            "max_risk_per_trade_pct": 1.0,
            "max_position_pct": 20.0,
            "max_open_positions": 12,
            "max_daily_loss_pct": 2.0,
            "require_stop_loss": False,
        },
        "status": "available",
    },
    "equity_swing": {
        "id": "equity_swing",
        "label": "Equity Swing",
        "asset_class": "equity",
        "time_horizon": "days_to_weeks",
        "description": "Technical and event-filtered equity swing setups.",
        "default_lookback": "6mo",
        "risk": {
            "max_risk_per_trade_pct": 5.0,
            "max_position_pct": 25.0,
            "max_open_positions": 5,
            "max_daily_loss_pct": 5.0,
            "require_stop_loss": True,
        },
        "status": "available",
    },
    # Reserved profiles make the product boundary explicit without pretending
    # that derivatives are ready for live use.
    "futures": {
        "id": "futures",
        "label": "Futures",
        "asset_class": "futures",
        "time_horizon": "intraday_to_weeks",
        "description": "NSE Index & Stock Futures paper trading with long/short capability and 5% risk controls.",
        "default_lookback": "6mo",
        "risk": {
            "max_risk_per_trade_pct": 5.0,
            "max_position_pct": 40.0,
            "max_open_positions": 5,
            "max_daily_loss_pct": 5.0,
            "require_stop_loss": True,
        },
        "status": "available",
    },
    "options": {
        "id": "options",
        "label": "Options",
        "asset_class": "options",
        "time_horizon": "intraday_to_weeks",
        "description": "Options chain and defined-risk strategies; not implemented yet.",
        "default_lookback": "6mo",
        "risk": {
            "max_risk_per_trade_pct": 0.25,
            "max_position_pct": 3.0,
            "max_open_positions": 2,
            "max_daily_loss_pct": 0.5,
            "require_stop_loss": True,
        },
        "status": "planned",
    },
}


def get_trading_modes() -> list[dict]:
    """Return safe copies so callers cannot mutate global profile state."""
    return deepcopy(list(TRADING_MODES.values()))


def get_trading_mode(mode: str | None) -> dict:
    """Resolve a mode, defaulting to the currently supported swing workflow."""
    key = (mode or "equity_swing").strip().lower()
    if key not in TRADING_MODES:
        key = "equity_swing"
    return deepcopy(TRADING_MODES[key])
