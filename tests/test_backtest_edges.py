import unittest

import pandas as pd

from backend.realistic_backtest import BacktestConfig, run_realistic_backtest
from backend.fundamental_backtest import run_fundamental_backtest


def _prices(n=200, start="2024-01-01"):
    idx = pd.date_range(start, periods=n, freq="B")
    close = [100 + (i * 0.3 if i % 40 < 20 else -i * 0.05) for i in range(n)]
    # Ensure deterministic drift with some oscillation to trigger signals
    import numpy as np
    drift = np.linspace(100, 160, n)
    wiggle = np.sin(np.arange(n) * 0.4) * 3
    close = drift + wiggle
    return pd.DataFrame(
        {"Open": close - 0.2, "High": close + 1.2, "Low": close - 1.2, "Close": close, "Volume": 500000},
        index=idx,
    )


class BacktestEdgeTests(unittest.TestCase):
    def test_missing_columns_rejected(self):
        with self.assertRaises(ValueError):
            run_realistic_backtest(pd.DataFrame({"Close": [1, 2, 3]}))

    def test_insufficient_sessions_rejected(self):
        with self.assertRaises(ValueError):
            run_realistic_backtest(_prices(20))

    def test_dividend_and_split_accounting(self):
        prices = _prices(120)
        prices["Dividends"] = 0.0
        prices["Stock Splits"] = 0.0
        prices.iloc[60, prices.columns.get_loc("Dividends")] = 2.0
        prices.iloc[70, prices.columns.get_loc("Stock Splits")] = 2.0
        result = run_realistic_backtest(prices, BacktestConfig(initial_capital=100000))
        self.assertIn("dividend_pnl", (result["trades"] or [{}])[0] if result["trades"] else {})
        self.assertGreaterEqual(result["sessions"], 30)

    def test_illiquid_filter_blocks_trades(self):
        prices = _prices(120)
        result = run_realistic_backtest(prices, BacktestConfig(initial_capital=100000, min_average_volume=10**12))
        self.assertEqual(result["total_trades"], 0)

    def test_fundamental_requires_filing_date_semantics(self):
        prices = _prices(120)
        # Filing date in the future relative to prices should produce no trades
        fundamentals = pd.DataFrame([{
            "date": "2025-01-01", "filing_date": "2026-06-01",
            "revenue_growth": 20, "roe": 18, "operating_margin": 20,
            "debt_to_equity": 0.2, "fcf_yield": 4,
        }])
        result = run_fundamental_backtest(prices, fundamentals)
        self.assertEqual(result["total_trades"], 0)
        # Filing date available early should allow trades
        fundamentals2 = pd.DataFrame([{
            "date": "2023-01-01", "filing_date": "2023-06-01",
            "revenue_growth": 20, "roe": 18, "operating_margin": 20,
            "debt_to_equity": 0.2, "fcf_yield": 4,
        }])
        result2 = run_fundamental_backtest(prices, fundamentals2)
        self.assertGreaterEqual(result2["total_trades"], 1)


if __name__ == "__main__":
    unittest.main()
