"""Free Indian fundamentals provider adapters.

Stoxim is optional and activated with ``STOXIM_API_KEY``.  The adapter is
deliberately defensive because the free service may have limited company
coverage.  Callers can fall back to Yahoo or local filing imports.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from backend.db import get_setting


STOXIM_BASE_URL = "https://api.stoxim.in/v1"


def stoxim_configured() -> bool:
    return bool((get_setting("data_key_stoxim") or os.getenv("STOXIM_API_KEY") or "").strip())


def _get(path: str, **params: Any) -> Any:
    key = (get_setting("data_key_stoxim") or os.getenv("STOXIM_API_KEY") or "").strip()
    if not key:
        return None
    response = httpx.get(
        f"{STOXIM_BASE_URL}/{path.lstrip('/')}",
        params=params,
        headers={"X-API-Key": key, "Accept": "application/json"},
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("data", payload) if isinstance(payload, dict) else payload


def _rows(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict):
        for key in ("results", "items", "financials", "ratios", "data"):
            if isinstance(value.get(key), list):
                return [row for row in value[key] if isinstance(row, dict)]
        return [value]
    return []


def fetch_stoxim_snapshots(ticker: str) -> list[dict[str, Any]]:
    """Return normalized dated fundamental observations for a ticker."""
    if not stoxim_configured():
        return []
    companies = _rows(_get("companies", q=ticker))
    match = next(
        (row for row in companies if str(row.get("symbol") or row.get("ticker") or "").upper().replace(".NS", "") == ticker.upper().replace(".NS", "")),
        companies[0] if companies else None,
    )
    isin = (match or {}).get("isin") or (match or {}).get("ISIN")
    if not isin:
        return []
    financials = _rows(_get(f"financials/{isin}"))
    ratios = _rows(_get(f"ratios/{isin}"))
    ratios_by_period = {str(row.get("period") or row.get("date")): row for row in ratios}
    snapshots = []
    for row in financials:
        period = row.get("period") or row.get("date") or row.get("report_date")
        if not period:
            continue
        ratio = ratios_by_period.get(str(period), {})
        snapshots.append({
            "date": period,
            "filing_date": row.get("filing_date") or row.get("filingDate") or row.get("published_at") or row.get("publishedAt"),
            "revenue_growth": row.get("revenue_growth") or row.get("revenueGrowth"),
            "operating_margin": row.get("operating_margin") or row.get("operatingMargin"),
            "roe": ratio.get("roe") or row.get("roe"),
            "debt_to_equity": ratio.get("debt_to_equity") or ratio.get("debtToEquity") or row.get("debt_to_equity"),
            "fcf_yield": ratio.get("fcf_yield") or row.get("fcf_yield"),
            "pe": ratio.get("pe") or ratio.get("pe_ratio"),
            "source": "stoxim",
        })
    return snapshots
