from typing import Annotated

# Import from vendor-specific modules
from .y_finance import (
    get_YFin_data_online,
    get_stock_stats_indicators_window,
    get_fundamentals as get_yfinance_fundamentals,
    get_balance_sheet as get_yfinance_balance_sheet,
    get_cashflow as get_yfinance_cashflow,
    get_income_statement as get_yfinance_income_statement,
    get_insider_transactions as get_yfinance_insider_transactions,
)
from .yfinance_news import get_news_yfinance, get_global_news_yfinance
from .alpha_vantage import (
    get_stock as get_alpha_vantage_stock,
    get_indicator as get_alpha_vantage_indicator,
    get_fundamentals as get_alpha_vantage_fundamentals,
    get_balance_sheet as get_alpha_vantage_balance_sheet,
    get_cashflow as get_alpha_vantage_cashflow,
    get_income_statement as get_alpha_vantage_income_statement,
    get_insider_transactions as get_alpha_vantage_insider_transactions,
    get_news as get_alpha_vantage_news,
    get_global_news as get_alpha_vantage_global_news,
)
from .alpha_vantage_common import AlphaVantageRateLimitError

# Import Indian market data functions
from .nse_data import (
    get_fii_dii_activity,
    get_bulk_block_deals,
    get_delivery_percentage,
)

# Configuration and routing logic
from .config import get_config


def get_kotak_stock_data(symbol: str, start_date: str, end_date: str) -> str:
    """Return Kotak daily candles in the same CSV contract as yfinance."""
    from backend.brokers.kotak_neo import fetch_historical_ohlcv
    rows = fetch_historical_ohlcv(symbol, "NSE", "D", start_date, end_date)
    if not rows:
        raise RuntimeError(f"Kotak returned no historical data for {symbol}")
    frame = __import__("pandas").DataFrame(rows).rename(columns={"time": "Date"})
    frame["Date"] = frame["Date"].astype(str).str[:10]
    return f"# Data source: Kotak Neo SDK 3.x\n{frame.to_csv(index=False)}"


def get_kotak_indicators(symbol: str, indicator: str, curr_date: str, look_back_days: int) -> str:
    """Calculate technical indicators from Kotak candles, not Yahoo data."""
    from datetime import datetime, timedelta
    from stockstats import wrap
    from backend.brokers.kotak_neo import fetch_historical_ohlcv
    end = datetime.strptime(curr_date, "%Y-%m-%d").date()
    rows = fetch_historical_ohlcv(symbol, "NSE", "D", (end - timedelta(days=look_back_days + 60)).isoformat(), curr_date)
    if not rows:
        raise RuntimeError(f"Kotak returned no indicator data for {symbol}")
    frame = __import__("pandas").DataFrame(rows)
    frame = frame.rename(columns={"time": "date"})
    frame["date"] = frame["date"].astype(str).str[:10]
    stats = wrap(frame)
    stats[indicator]
    valid = stats[stats["date"] <= curr_date]
    if valid.empty:
        raise RuntimeError(f"Kotak has no indicator value for {symbol} on {curr_date}")
    value = valid.iloc[-1][indicator]
    return "N/A" if __import__("pandas").isna(value) else str(value)

# Tools organized by category
TOOLS_CATEGORIES = {
    "core_stock_apis": {
        "description": "OHLCV stock price data",
        "tools": [
            "get_stock_data"
        ]
    },
    "technical_indicators": {
        "description": "Technical analysis indicators",
        "tools": [
            "get_indicators"
        ]
    },
    "fundamental_data": {
        "description": "Company fundamentals",
        "tools": [
            "get_fundamentals",
            "get_balance_sheet",
            "get_cashflow",
            "get_income_statement"
        ]
    },
    "news_data": {
        "description": "News and insider data",
        "tools": [
            "get_news",
            "get_global_news",
            "get_insider_transactions",
        ]
    },
    "indian_market_data": {
        "description": "NSE/BSE specific data (FII/DII, bulk deals, delivery %)",
        "tools": [
            "get_fii_dii_activity",
            "get_bulk_block_deals",
            "get_delivery_percentage",
        ]
    }
}

VENDOR_LIST = [
    "yfinance",
    "alpha_vantage",
    "kotak_neo",
    "nse",
]

# Mapping of methods to their vendor-specific implementations
VENDOR_METHODS = {
    # core_stock_apis
    "get_stock_data": {
        "alpha_vantage": get_alpha_vantage_stock,
        "yfinance": get_YFin_data_online,
        "kotak_neo": get_kotak_stock_data,
    },
    # technical_indicators
    "get_indicators": {
        "alpha_vantage": get_alpha_vantage_indicator,
        "yfinance": get_stock_stats_indicators_window,
        "kotak_neo": get_kotak_indicators,
    },
    # fundamental_data
    "get_fundamentals": {
        "alpha_vantage": get_alpha_vantage_fundamentals,
        "yfinance": get_yfinance_fundamentals,
    },
    "get_balance_sheet": {
        "alpha_vantage": get_alpha_vantage_balance_sheet,
        "yfinance": get_yfinance_balance_sheet,
    },
    "get_cashflow": {
        "alpha_vantage": get_alpha_vantage_cashflow,
        "yfinance": get_yfinance_cashflow,
    },
    "get_income_statement": {
        "alpha_vantage": get_alpha_vantage_income_statement,
        "yfinance": get_yfinance_income_statement,
    },
    # news_data
    "get_news": {
        "alpha_vantage": get_alpha_vantage_news,
        "yfinance": get_news_yfinance,
    },
    "get_global_news": {
        "yfinance": get_global_news_yfinance,
        "alpha_vantage": get_alpha_vantage_global_news,
    },
    "get_insider_transactions": {
        "alpha_vantage": get_alpha_vantage_insider_transactions,
        "yfinance": get_yfinance_insider_transactions,
    },
    # Indian market data (NSE-specific, no vendor fallback needed)
    "get_fii_dii_activity": {
        "nse": get_fii_dii_activity,
    },
    "get_bulk_block_deals": {
        "nse": get_bulk_block_deals,
    },
    "get_delivery_percentage": {
        "nse": get_delivery_percentage,
    },
}

def get_category_for_method(method: str) -> str:
    """Get the category that contains the specified method."""
    for category, info in TOOLS_CATEGORIES.items():
        if method in info["tools"]:
            return category
    raise ValueError(f"Method '{method}' not found in any category")

def get_vendor(category: str, method: str = None) -> str:
    """Get the configured vendor for a data category or specific tool method.
    Tool-level configuration takes precedence over category-level.
    """
    config = get_config()

    # Check tool-level configuration first (if method provided)
    if method:
        tool_vendors = config.get("tool_vendors", {})
        if method in tool_vendors:
            return tool_vendors[method]

    # The broker market-data selector is authoritative for live/technical
    # equity data. This connects Kotak's SDK feed to the same analysis tools
    # used by the agents, while preserving configured vendor overrides.
    configured = config.get("data_vendors", {}).get(category, "default")
    if category in ("core_stock_apis", "technical_indicators"):
        try:
            from backend.market_data_provider import resolve_active_vendor
            vendor, _, _ = resolve_active_vendor()
            if vendor == "kotak_neo":
                return "kotak_neo"
        except Exception:
            pass
    return configured

def route_to_vendor(method: str, *args, **kwargs):
    """Route method calls to appropriate vendor implementation with fallback support."""
    category = get_category_for_method(method)
    vendor_config = get_vendor(category, method)
    primary_vendors = [v.strip() for v in vendor_config.split(',')]

    if method not in VENDOR_METHODS:
        raise ValueError(f"Method '{method}' not supported")

    # Build fallback chain: primary vendors first, then remaining available vendors
    all_available_vendors = list(VENDOR_METHODS[method].keys())
    fallback_vendors = primary_vendors.copy()
    for vendor in all_available_vendors:
        if vendor not in fallback_vendors:
            fallback_vendors.append(vendor)

    for vendor in fallback_vendors:
        if vendor not in VENDOR_METHODS[method]:
            continue

        vendor_impl = VENDOR_METHODS[method][vendor]
        impl_func = vendor_impl[0] if isinstance(vendor_impl, list) else vendor_impl

        try:
            return impl_func(*args, **kwargs)
        except AlphaVantageRateLimitError:
            continue  # Only rate limits trigger fallback

    raise RuntimeError(f"No available vendor for '{method}'")
