"""Tests for Portfolio Daily Deep Analysis DB, service, and API."""

import unittest
from unittest.mock import MagicMock, patch
from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login


class PortfolioDailyAnalysisTests(IsolatedStateTestCase, unittest.TestCase):

    def test_portfolio_daily_analyses_db_crud(self):
        from backend.db import (
            save_portfolio_daily_analysis,
            update_portfolio_daily_analysis,
            get_portfolio_daily_analysis,
            get_latest_portfolio_daily_analysis,
            list_portfolio_daily_analyses,
        )

        record = {
            "batch_id": "test_batch_1",
            "run_date": "2026-10-27",
            "status": "running",
            "total_holdings": 2,
            "completed_holdings": 0,
            "summary": {"executive_verdict": "Analyzing..."},
            "results": [],
        }

        save_portfolio_daily_analysis(record)

        fetched = get_portfolio_daily_analysis("test_batch_1")
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["batch_id"], "test_batch_1")
        self.assertEqual(fetched["status"], "running")
        self.assertEqual(fetched["total_holdings"], 2)

        # Update progress
        update_portfolio_daily_analysis("test_batch_1", {
            "status": "completed",
            "completed_holdings": 2,
            "results": [
                {"ticker": "INFY", "verdict": "HOLD", "average_price": 1400, "last_price": 1450},
                {"ticker": "TCS", "verdict": "BOOK_PROFIT", "average_price": 3200, "last_price": 3500},
            ],
            "summary": {"verdict_counts": {"HOLD": 1, "BOOK_PROFIT": 1}},
        })

        latest = get_latest_portfolio_daily_analysis()
        self.assertIsNotNone(latest)
        self.assertEqual(latest["batch_id"], "test_batch_1")
        self.assertEqual(latest["status"], "completed")
        self.assertEqual(latest["completed_holdings"], 2)
        self.assertEqual(len(latest["results"]), 2)
        self.assertEqual(latest["summary"]["verdict_counts"]["HOLD"], 1)

        history = list_portfolio_daily_analyses(10)
        self.assertEqual(len(history), 1)

    def test_agent_state_holding_propagation(self):
        from tradingagents.graph.propagation import Propagator

        propagator = Propagator()
        holding_info = {
            "quantity": 50,
            "average_price": 1420.0,
            "last_price": 1450.0,
            "pnl": 1500.0,
            "pnl_pct": 2.11,
        }
        state = propagator.create_initial_state("INFY", "2026-10-27", holding_info=holding_info)
        self.assertEqual(state["company_of_interest"], "INFY")
        self.assertIsNotNone(state.get("holding_info"))
        self.assertEqual(state["holding_info"]["average_price"], 1420.0)

    def test_portfolio_holdings_api_endpoint(self):
        from backend.positions import upsert_position

        upsert_position({
            "tradingsymbol": "INFY",
            "exchange": "NSE",
            "quantity": 10,
            "average_price": 1400.0,
            "last_price": 1450.0,
            "source": "manual",
        })

        with fresh_test_client() as client:
            session = login(client)
            resp = client.get("/api/analysis/portfolio/holdings", cookies=session.cookies)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("holdings", data)
            self.assertEqual(len(data["holdings"]), 1)
            self.assertEqual(data["holdings"][0]["tradingsymbol"], "INFY")
            self.assertEqual(data["holdings"][0]["quantity"], 10)

    @patch("backend.portfolio_analysis_service._run_portfolio_batch_sync")
    def test_portfolio_run_api_endpoint(self, mock_run_batch):
        from backend.positions import upsert_position

        upsert_position({
            "tradingsymbol": "RELIANCE",
            "exchange": "NSE",
            "quantity": 5,
            "average_price": 2500.0,
            "last_price": 2600.0,
            "source": "manual",
        })

        with fresh_test_client() as client:
            session = login(client)
            resp = client.post(
                "/api/analysis/portfolio/run",
                json={"depth": 1, "analysts": ["market"]},
                cookies=session.cookies,
                headers=csrf_headers(session),
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("batch_id", data)
            self.assertEqual(data["status"], "running")
            self.assertEqual(data["total_holdings"], 1)


if __name__ == "__main__":
    unittest.main()
