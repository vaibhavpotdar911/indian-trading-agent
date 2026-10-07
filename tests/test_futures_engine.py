"""Tests for the NSE Futures Paper Trading & Strategy Engine."""

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
from backend.futures_engine import (
    get_futures_lot_size,
    get_futures_settings,
    save_futures_settings,
    get_futures_portfolio_status,
    calculate_futures_position_size,
    screen_futures_setups,
    evaluate_and_open_futures_trade,
    check_and_update_futures_positions,
    run_futures_trade_cycle,
    NSE_FUTURES_LOT_SIZES,
)


class FuturesEngineTests(IsolatedStateTestCase, unittest.TestCase):
    def test_lot_size_lookup_and_fallback(self):
        # Known F&O lot sizes
        self.assertEqual(get_futures_lot_size("NIFTY", 24000.0), 25)
        self.assertEqual(get_futures_lot_size("HDFCBANK", 1600.0), 550)
        self.assertEqual(get_futures_lot_size("RELIANCE", 2900.0), 250)
        self.assertEqual(get_futures_lot_size("SBIN", 800.0), 1500)

        # Fallback approximation for unknown symbol (Contract value ~ 7 Lakhs)
        unknown_lot = get_futures_lot_size("UNKNOWNXYZ", 700.0)
        # 700,000 / 700 = 1000 shares
        self.assertEqual(unknown_lot, 1000)

    def test_futures_settings_and_portfolio_status(self):
        settings = get_futures_settings()
        self.assertEqual(settings["capital"], 500000.0)
        self.assertEqual(settings["risk_per_trade_pct"], 5.0)
        self.assertEqual(settings["margin_rate"], 0.22)
        self.assertFalse(settings["enabled"])

        # Save settings
        updated = save_futures_settings({
            "capital": 1000000.0,
            "risk_per_trade_pct": 5.0,
            "enabled": True,
            "max_open_positions": 3,
        })
        self.assertEqual(updated["capital"], 1000000.0)
        self.assertTrue(updated["enabled"])
        self.assertEqual(updated["max_open_positions"], 3)

        status = get_futures_portfolio_status()
        self.assertEqual(status["total_capital"], 1000000.0)
        self.assertEqual(status["available_cash"], 1000000.0)
        self.assertEqual(status["deployed_margin"], 0.0)
        self.assertEqual(status["available_slots"], 3)

    def test_futures_position_sizing_5_pct_risk_limit(self):
        capital = 500000.0
        available_cash = 500000.0
        entry = 1000.0
        stop_loss = 1040.0  # SHORT trade, stop distance = 40 (4%)
        lot_size = 200      # 200 shares per lot

        # Risk budget (5% of 5L) = 25,000
        # Risk per lot = 40 * 200 = 8,000
        # Margin per lot = 1000 * 200 * 0.22 = 44,000
        # Lots by risk = floor(25,000 / 8,000) = 3 lots (Risk = 3 * 8,000 = 24,000)
        # Margin for 3 lots = 3 * 44,000 = 132,000 <= 25% cap (125,000 is cap)
        # Lots by 25% cap = floor(125,000 / 44,000) = 2 lots
        # Final lots = min(3, floor(500k/44k), 2) = 2 lots
        sizing = calculate_futures_position_size(
            entry_price=entry,
            stop_loss=stop_loss,
            capital=capital,
            available_cash=available_cash,
            lot_size=lot_size,
            risk_pct=5.0,
            margin_rate=0.22,
            max_position_pct=25.0,
        )

        self.assertTrue(sizing["allowed"])
        self.assertEqual(sizing["lots"], 2)
        self.assertEqual(sizing["quantity"], 400)
        self.assertEqual(sizing["required_margin"], 88000.0)
        # Risk = 400 * 40 = 16,000 (3.2% of capital, strictly <= 5%)
        self.assertEqual(sizing["actual_risk_amount"], 16000.0)
        self.assertLessEqual(sizing["actual_risk_pct"], 5.0)

    def test_futures_position_sizing_clamped_by_cash_margin(self):
        capital = 500000.0
        available_cash = 50000.0  # Only 50k cash remaining
        entry = 1000.0
        stop_loss = 1020.0        # Small 20 pt stop distance
        lot_size = 200

        # Margin per lot = 1000 * 200 * 0.22 = 44,000
        # Available cash = 50,000 -> allows at most 1 lot
        sizing = calculate_futures_position_size(
            entry_price=entry,
            stop_loss=stop_loss,
            capital=capital,
            available_cash=available_cash,
            lot_size=lot_size,
            risk_pct=5.0,
            margin_rate=0.22,
            max_position_pct=25.0,
        )

        self.assertTrue(sizing["allowed"])
        self.assertEqual(sizing["lots"], 1)
        self.assertEqual(sizing["quantity"], 200)
        self.assertEqual(sizing["required_margin"], 44000.0)

    def test_screen_futures_setups_short_and_long(self):
        mock_recommendations = [
            {
                "ticker": "INFY",
                "direction": "STRONG SELL",
                "score": -4.0,
                "success_probability": 75,
                "signals": [{"type": "breakdown_support", "weight": 2.5}],
            },
            {
                "ticker": "TCS",
                "direction": "SELL",
                "score": -2.5,
                "success_probability": 65,
                "signals": [{"type": "near_resistance", "weight": 2.0}],
            },
            {
                "ticker": "RELIANCE",
                "direction": "STRONG BUY",
                "score": 3.8,
                "success_probability": 70,
                "signals": [{"type": "breakout_vol_confirmed", "weight": 3.0}],
            },
        ]

        with patch("backend.futures_engine.recommend", return_value={"recommendations": mock_recommendations}):
            setups = screen_futures_setups(min_score=1.5, limit=5)

        self.assertEqual(len(setups), 3)

        # INFY should be identified as SHORT with SHORT_BUILDUP_BREAKDOWN
        infy_setup = next(s for s in setups if s["ticker"] == "INFY")
        self.assertEqual(infy_setup["trade_direction"], "SHORT")
        self.assertEqual(infy_setup["setup_category"], "SHORT_BUILDUP_BREAKDOWN")

        # TCS should be RESISTANCE_REJECTION_SHORT
        tcs_setup = next(s for s in setups if s["ticker"] == "TCS")
        self.assertEqual(tcs_setup["trade_direction"], "SHORT")
        self.assertEqual(tcs_setup["setup_category"], "RESISTANCE_REJECTION_SHORT")

        # RELIANCE should be LONG with LONG_BUILDUP_BREAKOUT
        rel_setup = next(s for s in setups if s["ticker"] == "RELIANCE")
        self.assertEqual(rel_setup["trade_direction"], "LONG")
        self.assertEqual(rel_setup["setup_category"], "LONG_BUILDUP_BREAKOUT")

    def test_evaluate_and_open_futures_short_trade(self):
        candidate = {
            "ticker": "HDFCBANK",
            "trade_direction": "SHORT",
            "direction": "STRONG SELL",
            "score": -3.5,
            "success_probability": 70,
            "signals": [{"type": "breakdown_support", "weight": 2.5}],
            "resistance_levels": [1525.0],  # Resistance above current price 1500
        }
        portfolio_status = get_futures_portfolio_status()

        with patch("backend.futures_engine.get_current_stock_price", return_value=1500.0):
            res = evaluate_and_open_futures_trade(candidate, portfolio_status)

        self.assertTrue(res.get("ok"), res.get("error"))
        self.assertEqual(res["direction"], "SHORT")
        self.assertEqual(res["ticker"], "HDFCBANK")
        self.assertGreater(res["stop_loss"], 1500.0)  # SL must be strictly above entry for short
        self.assertLess(res["target"], 1500.0)        # Target must be strictly below entry for short
        self.assertGreater(res["lots"], 0)
        self.assertLessEqual(res["actual_risk_pct"], 5.0)

        # Verify persisted paper trade
        trade = get_paper_trade_by_id(res["trade_id"])
        self.assertIsNotNone(trade)
        self.assertEqual(trade["trading_mode"], "futures")
        self.assertEqual(trade["direction"], "SHORT")

        # Audit report
        rep = trade.get("selection_report")
        self.assertIsInstance(rep, dict)
        self.assertEqual(rep["direction"], "SHORT")
        self.assertIn("contract_specs", rep)
        self.assertIn("why_picked", rep)

    def test_futures_short_stop_loss_exit(self):
        # Entry = 1000, SL = 1050 (above entry), Target = 900
        trade_id = add_paper_trade({
            "ticker": "AXISBANK",
            "trading_mode": "futures",
            "source": "ai_auto_futures",
            "direction": "SHORT",
            "signal": "SELL",
            "entry_price": 1000.0,
            "stop_loss": 1050.0,
            "target": 900.0,
            "quantity": 625.0,
            "capital": 137500.0,
        })

        # Price rises above SL to 1055.0 -> Should trigger SL exit!
        with patch("backend.futures_engine.get_current_stock_price", return_value=1055.0):
            res = check_and_update_futures_positions()

        self.assertEqual(len(res["actions"]), 1)
        self.assertEqual(res["actions"][0]["action"], "exit_stop_loss")
        self.assertEqual(res["actions"][0]["reason"], "stop_loss_hit")

        trade = get_paper_trade_by_id(trade_id)
        self.assertEqual(trade["status"], "closed")
        self.assertEqual(trade["exit_reason"], "stop_loss_hit")
        # For short trade, price increase is a loss: (1000 - 1055) * 625 = -34,375
        self.assertLess(trade["realized_pnl_amount"], 0)

    def test_futures_short_target_exit(self):
        # Entry = 1000, SL = 1050, Target = 900
        trade_id = add_paper_trade({
            "ticker": "AXISBANK",
            "trading_mode": "futures",
            "source": "ai_auto_futures",
            "direction": "SHORT",
            "signal": "SELL",
            "entry_price": 1000.0,
            "stop_loss": 1050.0,
            "target": 900.0,
            "quantity": 625.0,
            "capital": 137500.0,
        })

        # Price drops to 890.0 <= Target 900 -> Should trigger Target exit!
        with patch("backend.futures_engine.get_current_stock_price", return_value=890.0):
            res = check_and_update_futures_positions()

        self.assertEqual(len(res["actions"]), 1)
        self.assertEqual(res["actions"][0]["action"], "exit_target")
        self.assertEqual(res["actions"][0]["reason"], "target_hit")

        trade = get_paper_trade_by_id(trade_id)
        self.assertEqual(trade["status"], "closed")
        self.assertEqual(trade["exit_reason"], "target_hit")
        # Short profit: (1000 - 890) * 625 = +68,750
        self.assertGreater(trade["realized_pnl_amount"], 0)

    def test_futures_short_trailing_stop_to_breakeven(self):
        # Entry = 1000, SL = 1050 (Risk = 50 pt). 1R profit reached at 950.
        trade_id = add_paper_trade({
            "ticker": "KOTAKBANK",
            "trading_mode": "futures",
            "source": "ai_auto_futures",
            "direction": "SHORT",
            "signal": "SELL",
            "entry_price": 1000.0,
            "stop_loss": 1050.0,
            "target": 900.0,
            "quantity": 400.0,
            "capital": 88000.0,
        })

        # Price drops to 945.0 (gain >= 50 pt / 1R). SL should trail down to breakeven (1000.0)!
        with patch("backend.futures_engine.get_current_stock_price", return_value=945.0):
            res = check_and_update_futures_positions()

        trade = get_paper_trade_by_id(trade_id)
        self.assertEqual(trade["status"], "active")
        self.assertEqual(trade["stop_loss"], 1000.0)
        self.assertIn("Trailing SL moved to breakeven", trade["notes"])

    def test_api_futures_mode_endpoints(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # 1. GET status for futures mode
            status_res = client.get("/api/auto-trade/status?mode=futures")
            self.assertEqual(status_res.status_code, 200)
            data = status_res.json()
            self.assertEqual(data["trading_mode"], "futures")
            self.assertIn("deployed_margin", data)

            # 2. POST update futures settings
            settings_res = client.post(
                "/api/auto-trade/settings?mode=futures",
                json={"capital": 750000.0, "risk_per_trade_pct": 5.0, "enabled": True},
                headers=headers,
            )
            self.assertEqual(settings_res.status_code, 200)
            self.assertEqual(settings_res.json()["capital"], 750000.0)

            # 3. POST monitor exits for futures
            with patch("backend.futures_engine.get_current_stock_price", return_value=1500.0):
                monitor_res = client.post("/api/auto-trade/monitor-exits?mode=futures", headers=headers)
                self.assertEqual(monitor_res.status_code, 200)

            # 4. POST run cycle for futures
            with patch("backend.futures_engine.get_current_stock_price", return_value=1500.0):
                with patch("backend.futures_engine.screen_futures_setups", return_value=[]):
                    run_res = client.post("/api/auto-trade/run?mode=futures", headers=headers)
                    self.assertEqual(run_res.status_code, 200)
                    self.assertTrue(run_res.json()["ok"])
                    self.assertEqual(run_res.json()["trading_mode"], "futures")


if __name__ == "__main__":
    unittest.main()
