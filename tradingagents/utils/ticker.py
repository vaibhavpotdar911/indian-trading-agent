"""Ticker normalization utilities for Indian market (NSE/BSE)."""

POPULAR_INDICES = {
    "NIFTY": "^NSEI",
    "NIFTY50": "^NSEI",
    "NIFTY 50": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "BANK NIFTY": "^NSEBANK",
    "SENSEX": "^BSESN",
    "NIFTYIT": "^CNXIT",
    "NIFTY IT": "^CNXIT",
    "NIFTYFIN": "^CNXFIN",
    "NIFTY FIN": "^CNXFIN",
    "NIFTYPHARMA": "^CNXPHARMA",
}

EXCHANGE_SUFFIXES = {
    "NSE": ".NS",
    "BSE": ".BO",
}


SYMBOL_ALIASES = {
    "TATAMOTORS": "TMPV",
    "TATAMTRDVR": "TMPV",
}


def normalize_ticker(symbol: str, exchange: str = "NSE") -> str:
    """Normalize a ticker symbol for yfinance queries.

    If the symbol is a known index name, returns the yfinance index symbol.
    If it already has an exchange suffix (.NS, .BO), returns as-is.
    Otherwise, appends the appropriate suffix for the exchange.

    Args:
        symbol: Ticker symbol (e.g., "RELIANCE", "RELIANCE.NS", "NIFTY50")
        exchange: Exchange name - "NSE" or "BSE" (default: "NSE")

    Returns:
        Normalized ticker string for yfinance
    """
    symbol = symbol.strip().upper()
    if symbol in SYMBOL_ALIASES:
        symbol = SYMBOL_ALIASES[symbol]

    # Check if it's a known index
    if symbol in POPULAR_INDICES:
        return POPULAR_INDICES[symbol]

    # Already has a yfinance index prefix
    if symbol.startswith("^"):
        return symbol

    # Already has an exchange suffix
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return symbol

    # Append exchange suffix
    suffix = EXCHANGE_SUFFIXES.get(exchange.upper(), ".NS")
    return f"{symbol}{suffix}"


def is_index(symbol: str) -> bool:
    """Check if a symbol is a market index."""
    symbol = symbol.strip().upper()
    return symbol.startswith("^") or symbol in POPULAR_INDICES


def strip_suffix(symbol: str) -> str:
    """Remove exchange suffix from a ticker. Useful for display or Kite API lookups."""
    for suffix in EXCHANGE_SUFFIXES.values():
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol
