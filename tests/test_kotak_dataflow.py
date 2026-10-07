import unittest
from unittest.mock import patch


class KotakAnalysisDataflowTests(unittest.TestCase):
    @patch("backend.brokers.kotak_neo.fetch_historical_ohlcv")
    def test_kotak_stock_data_preserves_analysis_csv_contract(self, fetch):
        fetch.return_value = [{"time": "2026-01-02", "open": 100, "high": 110, "low": 95, "close": 105, "volume": 1000}]
        from tradingagents.dataflows.interface import get_kotak_stock_data

        result = get_kotak_stock_data("RELIANCE", "2026-01-01", "2026-01-03")
        self.assertIn("Data source: Kotak Neo SDK 3.x", result)
        self.assertIn("2026-01-02", result)
        fetch.assert_called_once_with("RELIANCE", "NSE", "D", "2026-01-01", "2026-01-03")

    @patch("backend.market_data_provider.resolve_active_vendor", return_value=("kotak_neo", "Kotak Neo API", False))
    def test_default_analysis_routes_technical_data_to_kotak(self, _resolve):
        from tradingagents.dataflows.interface import get_vendor

        self.assertEqual(get_vendor("core_stock_apis"), "kotak_neo")
        self.assertEqual(get_vendor("technical_indicators"), "kotak_neo")


if __name__ == "__main__":
    unittest.main()
