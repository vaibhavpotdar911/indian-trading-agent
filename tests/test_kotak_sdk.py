import unittest
from unittest.mock import MagicMock, patch

from tests._support import IsolatedStateTestCase


class KotakSdkTests(IsolatedStateTestCase, unittest.TestCase):
    def test_search_scrip_token_parsing(self):
        from backend.brokers import kotak_neo as kn
        mock_client = MagicMock()
        mock_client.search_scrip.return_value = [{"pToken": "1333"}]
        with patch.object(kn, "get_sdk_client", return_value=mock_client):
            result = kn.search_scrip_token("RELIANCE", "NSE")
        self.assertEqual(result, ("nse_cm", "1333"))

    def test_search_scrip_token_empty(self):
        from backend.brokers import kotak_neo as kn
        mock_client = MagicMock()
        mock_client.search_scrip.return_value = []
        with patch.object(kn, "get_sdk_client", return_value=mock_client):
            self.assertIsNone(kn.search_scrip_token("UNKNOWN", "NSE"))

    def test_sdk_quote_parsing(self):
        from backend.brokers import kotak_neo as kn
        with patch.object(kn, "search_scrip_token", return_value=("nse_cm", "1333")):
            mock_client = MagicMock()
            mock_client.quotes.return_value = {
                "data": [{"ltp": 2500.5, "closePrice": 2480, "volume": 1000,
                          "highPrice": 2510, "lowPrice": 2470, "openPrice": 2485}]
            }
            with patch.object(kn, "get_sdk_client", return_value=mock_client):
                quote = kn.fetch_sdk_quote("RELIANCE", "NSE")
        self.assertEqual(quote["price"], 2500.5)
        self.assertIn("Kotak Neo SDK", quote["vendor_used"])

    def test_websocket_tick_normalization(self):
        # SDK SFeed messages expose model_dump; bridge forwards that payload.
        tick = MagicMock()
        tick.model_dump.return_value = {
            "type": "scrip", "exchange_segment": "nse_cm", "instrument_token": "1333",
            "last_traded_price": 2501.2, "net_change_percent": 0.8,
        }
        payload = tick.model_dump(mode="json")
        self.assertEqual(payload["last_traded_price"], 2501.2)
        self.assertEqual(payload["type"], "scrip")

    def test_historical_ohlcv_normalization(self):
        from backend.brokers import kotak_neo as kn
        with patch.object(kn, "search_scrip_token", return_value=("nse_cm", "1333")):
            mock_client = MagicMock()
            mock_client.historical_data.return_value = {
                "data": [{"date": "2026-01-02", "open": 100, "high": 110,
                          "low": 95, "close": 105, "volume": 1000}]
            }
            with patch.object(kn, "get_sdk_client", return_value=mock_client):
                candles = kn.fetch_historical_ohlcv("RELIANCE", "NSE", "D", "2026-01-01", "2026-01-03")
        self.assertEqual(candles[0]["close"], 105)
        self.assertEqual(candles[0]["time"], "2026-01-02")


if __name__ == "__main__":
    unittest.main()
