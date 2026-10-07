import unittest

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login
from backend.db import set_setting
from backend.risk_engine import check_trade, get_portfolio_risk_summary


class RiskEngineTests(IsolatedStateTestCase, unittest.TestCase):
    def test_kill_switch_blocks_trades(self):
        set_setting("risk_trading_locked", "1")
        result = check_trade(trading_mode="equity_swing", entry_price=100.0, stop_loss=98.0, quantity=10)
        self.assertFalse(result["allowed"])
        self.assertTrue(any("locked" in e.lower() for e in result["errors"]))

    def test_per_trade_and_position_limits(self):
        set_setting("risk_trading_locked", "0")
        set_setting("risk_capital", "100000")
        # 10 @ 100 with 10 stop distance = 100 risk = 0.1% ok, but position 1000 = 1% ok
        ok_trade = check_trade(trading_mode="equity_swing", entry_price=100.0, stop_loss=90.0, quantity=10)
        self.assertTrue(ok_trade["allowed"])
        # Excessive risk: 1000 shares x 10 risk = 10000 = 10% > default per-trade limit
        bad = check_trade(trading_mode="equity_swing", entry_price=100.0, stop_loss=90.0, quantity=1000)
        self.assertFalse(bad["allowed"])

    def test_missing_stop_rejected_for_swing(self):
        set_setting("risk_trading_locked", "0")
        result = check_trade(trading_mode="equity_swing", entry_price=100.0, quantity=10)
        self.assertFalse(result["allowed"])

    def test_risk_api_lock_flow(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)
            lock = client.put("/api/risk/lock", json={"locked": True}, headers=headers)
            self.assertEqual(lock.status_code, 200)
            check = client.post(
                "/api/risk/check",
                json={"trading_mode": "equity_swing", "entry_price": 100, "stop_loss": 98, "quantity": 10},
                headers=headers,
            )
            self.assertEqual(check.status_code, 200)
            self.assertFalse(check.json()["allowed"])
            summary = client.get("/api/risk/summary?trading_mode=equity_swing")
            self.assertEqual(summary.status_code, 200)
            self.assertIn("broker_exposure", summary.json())

    def test_broker_positions_count_toward_open_limit(self):
        from backend.db import get_db
        set_setting("risk_trading_locked", "0")
        set_setting("risk_capital", "100000")
        set_setting("risk_equity_swing_open_positions", "1")
        with get_db() as conn:
            conn.execute(
                """INSERT INTO positions
                (tradingsymbol, exchange, quantity, average_price, last_price, current_value, source)
                VALUES ('RELIANCE','NSE',10,100,110,1100,'manual')"""
            )
        result = check_trade(trading_mode="equity_swing", entry_price=100.0, stop_loss=98.0, quantity=1)
        self.assertFalse(result["allowed"])
        self.assertTrue(any("Maximum open positions" in e for e in result["errors"]))


if __name__ == "__main__":
    unittest.main()
