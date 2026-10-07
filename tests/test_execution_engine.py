"""Tests for the Unified Multi-Broker Live & Simulated Execution Engine."""

import unittest
from unittest.mock import patch, MagicMock

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login
from backend.db import list_broker_orders, get_broker_order
from backend.execution_engine import (
    get_execution_routing_rules,
    save_execution_routing_rules,
    get_execution_mode,
    set_execution_mode,
    resolve_broker_for_trade,
    execute_trade_order,
    get_brokers_execution_status,
    _infer_product,
)


class ExecutionEngineTests(IsolatedStateTestCase, unittest.TestCase):
    def test_default_routing_rules(self):
        rules = get_execution_routing_rules()
        self.assertEqual(rules["equity_long_term"], "kite")
        self.assertEqual(rules["equity_swing"], "upstox")
        self.assertEqual(rules["intraday"], "kotak_neo")
        self.assertEqual(rules["futures"], "kotak_neo")

    def test_update_routing_rules(self):
        # User configures: swing on kite, intraday on kotak_neo, futures on upstox
        new_rules = {
            "equity_swing": "kite",
            "futures": "upstox",
            "equity_long_term": "upstox",
        }
        saved = save_execution_routing_rules(new_rules)
        self.assertEqual(saved["equity_swing"], "kite")
        self.assertEqual(saved["futures"], "upstox")
        self.assertEqual(saved["equity_long_term"], "upstox")

        # Verify persisted
        reloaded = get_execution_routing_rules()
        self.assertEqual(reloaded["equity_swing"], "kite")
        self.assertEqual(reloaded["futures"], "upstox")

    def test_resolve_broker_for_trade(self):
        # 1. Auto-routing by strategy
        broker, reason = resolve_broker_for_trade("equity_long_term")
        self.assertEqual(broker, "kite")
        self.assertIn("Auto-routed", reason)

        broker, reason = resolve_broker_for_trade("intraday")
        self.assertEqual(broker, "kotak_neo")

        broker, reason = resolve_broker_for_trade("equity_swing")
        self.assertEqual(broker, "upstox")

        # 2. Explicit User Override
        broker, reason = resolve_broker_for_trade("equity_swing", requested_broker="kotak_neo")
        self.assertEqual(broker, "kotak_neo")
        self.assertIn("Manual override", reason)

    def test_infer_product(self):
        self.assertEqual(_infer_product("equity_long_term"), "CNC")
        self.assertEqual(_infer_product("equity_swing"), "CNC")
        self.assertEqual(_infer_product("intraday"), "MIS")
        self.assertEqual(_infer_product("futures"), "NRML")
        # Explicit override
        self.assertEqual(_infer_product("equity_swing", "MIS"), "MIS")

    def test_execute_order_simulated_kite(self):
        res = execute_trade_order(
            ticker="RELIANCE",
            direction="BUY",
            quantity=10,
            trading_mode="equity_long_term",  # Auto-routes to kite
            price=2900.0,
            order_type="LIMIT",
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["broker"], "kite")
        self.assertEqual(res["ticker"], "RELIANCE")
        self.assertEqual(res["product"], "CNC")
        self.assertEqual(res["order_type"], "LIMIT")
        self.assertEqual(res["status"], "COMPLETE")
        self.assertTrue(res["order_id"].startswith("KITE-SIM-"))

        # Check DB audit record
        orders = list_broker_orders(limit=10, broker="kite")
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["order_id"], res["order_id"])

    def test_execute_order_simulated_kotak_neo(self):
        res = execute_trade_order(
            ticker="AXISBANK",
            direction="SELL",
            quantity=50,
            trading_mode="intraday",  # Auto-routes to kotak_neo
            order_type="MARKET",
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["broker"], "kotak_neo")
        self.assertEqual(res["product"], "MIS")
        self.assertEqual(res["status"], "COMPLETE")
        self.assertTrue(res["order_id"].startswith("NEO-SIM-"))

        order = get_broker_order(res["order_id"])
        self.assertIsNotNone(order)
        self.assertEqual(order["ticker"], "AXISBANK")
        self.assertEqual(order["direction"], "SELL")

    def test_execute_order_simulated_upstox(self):
        res = execute_trade_order(
            ticker="INFY",
            direction="BUY",
            quantity=25,
            trading_mode="equity_swing",  # Auto-routes to upstox
            price=1800.0,
            order_type="LIMIT",
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["broker"], "upstox")
        self.assertEqual(res["product"], "CNC")
        self.assertTrue(res["order_id"].startswith("UPSTOX-SIM-"))

    def test_execute_order_with_explicit_broker_override(self):
        # Mode is equity_long_term (usually kite), but user manually picks upstox
        res = execute_trade_order(
            ticker="TCS",
            direction="BUY",
            quantity=5,
            trading_mode="equity_long_term",
            requested_broker="upstox",
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["broker"], "upstox")
        self.assertIn("Manual override", res["routing_reason"])

    def test_api_execution_endpoints(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # 1. GET routing rules
            r1 = client.get("/api/execution/routing-rules")
            self.assertEqual(r1.status_code, 200)
            self.assertIn("rules", r1.json())
            self.assertEqual(r1.json()["rules"]["equity_long_term"], "kite")

            # 2. POST update routing rules
            r2 = client.post(
                "/api/execution/routing-rules",
                json={"rules": {"equity_swing": "kite", "intraday": "upstox"}},
                headers=headers,
            )
            self.assertEqual(r2.status_code, 200)
            self.assertEqual(r2.json()["rules"]["equity_swing"], "kite")
            self.assertEqual(r2.json()["rules"]["intraday"], "upstox")

            # 3. GET/POST config
            r3 = client.get("/api/execution/config")
            self.assertEqual(r3.status_code, 200)
            self.assertEqual(r3.json()["mode"], "paper")

            r4 = client.post(
                "/api/execution/config",
                json={"mode": "live"},
                headers=headers,
            )
            self.assertEqual(r4.status_code, 200)
            self.assertEqual(r4.json()["mode"], "live")
            self.assertTrue(r4.json()["is_live"])

            # 4. GET brokers status
            r5 = client.get("/api/execution/brokers")
            self.assertEqual(r5.status_code, 200)
            self.assertIn("kite", r5.json()["brokers"])
            self.assertIn("kotak_neo", r5.json()["brokers"])
            self.assertIn("upstox", r5.json()["brokers"])

            # 5. POST place order
            r6 = client.post(
                "/api/execution/order",
                json={
                    "ticker": "SBIN",
                    "direction": "BUY",
                    "quantity": 100,
                    "trading_mode": "equity_swing",
                    "requested_broker": "kotak_neo",
                },
                headers=headers,
            )
            self.assertEqual(r6.status_code, 200)
            order_data = r6.json()
            self.assertTrue(order_data["ok"])
            self.assertEqual(order_data["broker"], "kotak_neo")
            self.assertEqual(order_data["ticker"], "SBIN")

            # 6. GET orders history
            r7 = client.get("/api/execution/orders")
            self.assertEqual(r7.status_code, 200)
            self.assertGreater(len(r7.json()["orders"]), 0)

            # 7. GET order details
            order_id = order_data["order_id"]
            r8 = client.get(f"/api/execution/order/{order_id}")
            self.assertEqual(r8.status_code, 200)
            self.assertEqual(r8.json()["order_id"], order_id)


if __name__ == "__main__":
    unittest.main()
