"""Tests for the Automated Swing Paper Trading Engine."""

import unittest
from unittest.mock import patch, MagicMock

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login
from backend.db import (
    set_setting,
    get_setting,
    add_paper_trade,
    list_paper_trades,
    get_paper_trade_by_id,
    list_auto_trade_logs,
)
from backend.auto_trader import (
    get_auto_trader_settings,
    save_auto_trader_settings,
    get_auto_portfolio_status,
    calculate_swing_position_size,
    check_and_update_positions,
    evaluate_and_open_trade,
    run_auto_trade_cycle,
)


class AutoTraderTests(IsolatedStateTestCase, unittest.TestCase):
    def test_settings_defaults_and_updates(self):
        settings = get_auto_trader_settings()
        self.assertEqual(settings["capital"], 500000.0)
        self.assertEqual(settings["risk_per_trade_pct"], 5.0)
        self.assertEqual(settings["max_position_pct"], 25.0)
        self.assertEqual(settings["max_open_positions"], 5)
        self.assertFalse(settings["enabled"])

        # Update settings
        updated = save_auto_trader_settings({
            "capital": 1000000.0,
            "risk_per_trade_pct": 5.0,
            "enabled": True,
            "max_open_positions": 4,
        })
        self.assertEqual(updated["capital"], 1000000.0)
        self.assertEqual(updated["risk_per_trade_pct"], 5.0)
        self.assertTrue(updated["enabled"])
        self.assertEqual(updated["max_open_positions"], 4)

    def test_position_sizing_5_pct_risk_budgeting(self):
        capital = 500000.0
        available_cash = 500000.0
        entry = 1000.0
        stop_loss = 950.0  # stop distance = 50 (5% drop)

        # 5% of 5,00,000 = 25,000 risk budget
        # Desired qty by risk = 25,000 / 50 = 500 shares (value = 5,00,000)
        # Position cap (25% of capital) = 1,25,000 / 1000 = 125 shares
        # Final qty = min(500, 125, 500) = 125 shares
        sizing = calculate_swing_position_size(
            entry_price=entry,
            stop_loss=stop_loss,
            capital=capital,
            available_cash=available_cash,
            risk_pct=5.0,
            max_position_pct=25.0,
        )
        self.assertTrue(sizing["allowed"])
        self.assertEqual(sizing["quantity"], 125)
        self.assertEqual(sizing["position_value"], 125000.0)
        # Actual risk = 125 * 50 = 6,250 (1.25% <= 5.0%)
        self.assertEqual(sizing["actual_risk_amount"], 6250.0)
        self.assertLessEqual(sizing["actual_risk_pct"], 5.0)

    def test_position_sizing_clamped_by_available_cash(self):
        capital = 500000.0
        available_cash = 25000.0  # limited cash remaining
        entry = 500.0
        stop_loss = 480.0

        sizing = calculate_swing_position_size(
            entry_price=entry,
            stop_loss=stop_loss,
            capital=capital,
            available_cash=available_cash,
            risk_pct=5.0,
            max_position_pct=25.0,
        )
        self.assertTrue(sizing["allowed"])
        self.assertEqual(sizing["quantity"], 50)  # 25000 / 500 = 50 shares
        self.assertEqual(sizing["position_value"], 25000.0)

    def test_exit_stop_loss_hit(self):
        # Open an active trade
        trade_id = add_paper_trade({
            "ticker": "TATAMOTORS",
            "trading_mode": "equity_swing",
            "source": "ai_auto_swing",
            "direction": "LONG",
            "signal": "BUY",
            "entry_price": 1000.0,
            "stop_loss": 960.0,
            "target": 1080.0,
            "quantity": 20.0,
            "capital": 20000.0,
        })

        # Mock market price dropping below stop loss to 950.0
        with patch("backend.auto_trader.get_current_stock_price", return_value=950.0):
            res = check_and_update_positions()

        # Check that position was auto-closed
        updated = get_paper_trade_by_id(trade_id)
        self.assertEqual(updated["status"], "closed")
        self.assertEqual(updated["exit_reason"], "stop_loss_hit")
        self.assertIsNotNone(updated["exit_price"])
        self.assertLess(updated["realized_pnl_amount"], 0)
        self.assertEqual(updated["unrealized_pnl_amount"], 0.0)

    def test_exit_target_hit(self):
        trade_id = add_paper_trade({
            "ticker": "INFY",
            "trading_mode": "equity_swing",
            "source": "ai_auto_swing",
            "direction": "LONG",
            "signal": "BUY",
            "entry_price": 1500.0,
            "stop_loss": 1450.0,
            "target": 1600.0,
            "quantity": 10.0,
            "capital": 15000.0,
        })

        # Mock market price hitting target at 1620.0
        with patch("backend.auto_trader.get_current_stock_price", return_value=1620.0):
            res = check_and_update_positions()

        updated = get_paper_trade_by_id(trade_id)
        self.assertEqual(updated["status"], "closed")
        self.assertEqual(updated["exit_reason"], "target_hit")
        self.assertGreater(updated["realized_pnl_amount"], 0)

    def test_hold_updates_mark_to_market(self):
        trade_id = add_paper_trade({
            "ticker": "RELIANCE",
            "trading_mode": "equity_swing",
            "source": "ai_auto_swing",
            "direction": "LONG",
            "signal": "BUY",
            "entry_price": 2500.0,
            "stop_loss": 2400.0,
            "target": 2700.0,
            "quantity": 10.0,
            "capital": 25000.0,
        })

        # Mock market price slightly up to 2550.0
        with patch("backend.auto_trader.get_current_stock_price", return_value=2550.0):
            res = check_and_update_positions()

        updated = get_paper_trade_by_id(trade_id)
        self.assertEqual(updated["status"], "active")
        self.assertEqual(updated["current_price"], 2550.0)
        self.assertEqual(updated["unrealized_pnl_amount"], 500.0)
        self.assertEqual(updated["unrealized_pnl_pct"], 2.0)

    def test_trailing_stop_to_breakeven(self):
        # Entry = 100, Stop-Loss = 95 (risk dist = 5). Target = 110 (+2R)
        trade_id = add_paper_trade({
            "ticker": "SBIN",
            "trading_mode": "equity_swing",
            "source": "ai_auto_swing",
            "direction": "LONG",
            "signal": "BUY",
            "entry_price": 100.0,
            "stop_loss": 95.0,
            "target": 110.0,
            "quantity": 10.0,
            "capital": 1000.0,
        })

        # Price rises to 106 (+1R reached). SL should be trailed to entry 100.0!
        with patch("backend.auto_trader.get_current_stock_price", return_value=106.0):
            res = check_and_update_positions()

        updated = get_paper_trade_by_id(trade_id)
        self.assertEqual(updated["status"], "active")
        self.assertEqual(updated["stop_loss"], 100.0)
        self.assertIn("Trailing SL adjusted to breakeven", updated["notes"])

    def test_ai_selection_report_persistence(self):
        candidate = {
            "ticker": "HDFCBANK",
            "direction": "STRONG BUY",
            "score": 4.5,
            "success_probability": 72,
            "signals": [{"type": "breakout_vol_confirmed", "weight": 3.0}],
            "support_levels": [1600.0, 1550.0],
            "resistance_levels": [1750.0],
        }
        portfolio_status = get_auto_portfolio_status()

        with patch("backend.auto_trader.get_current_stock_price", return_value=1650.0):
            trade_res = evaluate_and_open_trade(candidate, portfolio_status)

        self.assertTrue(trade_res["ok"])
        trade_id = trade_res["trade_id"]
        trade = get_paper_trade_by_id(trade_id)
        self.assertIsNotNone(trade)
        self.assertIsNotNone(trade.get("task_id"))

        report = trade.get("selection_report")
        self.assertIsInstance(report, dict)
        self.assertEqual(report["ticker"], "HDFCBANK")
        self.assertIn("ai_analysis", report)
        self.assertIn("screening_reason", report)
        self.assertIn("trade_parameters", report)
        self.assertIn("why_picked", report)
        self.assertEqual(report["screening_reason"]["technical_score"], 4.5)

    def test_api_auto_trade_endpoints(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # 1. GET status
            status_res = client.get("/api/auto-trade/status")
            self.assertEqual(status_res.status_code, 200)
            self.assertIn("total_capital", status_res.json())
            self.assertIn("cash_balance", status_res.json())

            # 2. POST settings
            update_res = client.post(
                "/api/auto-trade/settings",
                json={"capital": 600000.0, "risk_per_trade_pct": 5.0, "enabled": True},
                headers=headers,
            )
            self.assertEqual(update_res.status_code, 200)
            self.assertEqual(update_res.json()["capital"], 600000.0)
            self.assertEqual(update_res.json()["risk_per_trade_pct"], 5.0)

            # 3. POST monitor-exits
            with patch("backend.auto_trader.get_current_stock_price", return_value=100.0):
                monitor_res = client.post("/api/auto-trade/monitor-exits", headers=headers)
                self.assertEqual(monitor_res.status_code, 200)

            # 4. POST run cycle
            with patch("backend.auto_trader.get_current_stock_price", return_value=500.0):
                with patch("backend.auto_trader.screen_swing_candidates", return_value=[]):
                    run_res = client.post("/api/auto-trade/run", headers=headers)
                    self.assertEqual(run_res.status_code, 200)
                    self.assertTrue(run_res.json()["ok"])
                    self.assertIn("summary", run_res.json())

            # 5. GET logs
            logs_res = client.get("/api/auto-trade/logs")
            self.assertEqual(logs_res.status_code, 200)
            self.assertGreater(len(logs_res.json()["logs"]), 0)


if __name__ == "__main__":
    unittest.main()
