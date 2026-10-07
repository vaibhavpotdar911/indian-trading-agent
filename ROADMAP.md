# Product roadmap

## Current status: Phase 1 — complete for local implementation

Phase 1 delivered the initial risk-managed equity platform:

- Separate **Equity Swing** and **Equity Long-term** workspaces.
- Swing technical signals with ATR-based entry, stop-loss and target plans.
- Long-term fundamental signals covering growth, margins, ROE, debt,
  valuation and free cash flow.
- Deterministic risk controls for capital, position size, risk per trade,
  daily loss, open positions and sector concentration.
- Global trading lock / kill switch.
- Paper-trade storage, realized P&L and portfolio risk monitoring.
- Realistic swing and fundamental backtesting with costs, slippage, exits,
  drawdown and walk-forward results.
- Kotak Neo SDK 3.x integration for authentication, quotes, historical candles
  and the live market-feed WebSocket.
- Kotak historical candles routed into core AI `get_stock_data` and
  `get_indicators` when Kotak is the active vendor.
- Optional Stoxim fundamentals provider with Yahoo Finance fallback.
- Deployment documentation and Settings-based provider-key configuration.
- Regression coverage: 76 backend tests including Kotak SDK parsing,
  Kotak dataflow routing, risk enforcement, dividend/split handling,
  liquidity filters and point-in-time fundamental availability.
- Backtest accounting for dividends, splits, volume/participation filters
  and intraday-range circuit guards.
- Point-in-time fundamental support via `filing_date`/`available_date`.
- Broker/manual positions included in open-position limits, exposure and
  unrealized P&L.
- Daily realized P&L tracked by close/update date rather than entry date.
- Risk dashboard shows synced broker exposure alongside paper risk.

### What still requires your deployed validation?

**Code is complete; market proof is not.** These need real credentials,
market hours and paper-trading time:

1. Validate the Kotak WebSocket and AI dataflow with real credentials during market hours,
   including reconnects, token expiry and instrument-token changes.
2. Cross-check Kotak candles against NSE/BSE end-of-day data.
3. Verify Stoxim coverage for your watchlist; add MCA/XBRL filing ingestion
   if point-in-time coverage is incomplete.
4. Complete extended paper-trading validation across multiple market regimes.

## Phase 2 — data and backtest hardening

- Build a normalized market-data layer with provider health, caching and
  source provenance.
- Use Kotak for technical historical data when selected, with NSE/BSE
  end-of-day cross-checks.
- Add corporate actions, dividends, splits, delistings and adjusted quantity
  handling.
- Add liquidity, spread, circuit-limit and market-impact assumptions.
- Add multi-stock portfolio backtests instead of single-ticker simulations.
- Add benchmark comparison against NIFTY 50 and relevant sector indices.
- Add Monte Carlo trade-sequence analysis and parameter sensitivity tests.
- Store reproducible backtest configurations and data-source versions.

## Phase 3 — long-term fundamental research

- Add MCA/XBRL or another reliable point-in-time filing ingestion path.
- Store actual filing dates, fiscal periods, restatements and consolidated vs
  standalone statements separately.
- Add historical P/E, P/B, EV/EBITDA, earnings yield and free-cash-flow yield.
- Add dividend and buyback history.
- Add portfolio allocation, rebalancing and tax-lot-aware simulation.
- Add peer-group and sector-relative fundamental scoring.
- Add quality checks for missing, restated or inconsistent financial data.

## Phase 4 — portfolio and monitoring improvements

- Continuous broker holdings and positions synchronization.
- Real-time portfolio valuation and mark-to-market P&L.
- Intraday portfolio heat and sector exposure alerts.
- Notifications for stop-loss proximity, daily-loss breaches and feed failure.
- Reconciliation between broker, manual, paper and analysis positions.
- Exportable performance, risk and audit reports.

## Phase 5 — paper-trading validation

- Run each mode through a statistically meaningful paper-trading period.
- Compare predicted and realized entry prices, slippage and execution delay.
- Track signal calibration, false positives and regime-specific performance.
- Validate risk-lock behavior under simulated losses and broker outages.
- Review results before changing any risk limits.

## Phase 6 — controlled execution readiness

This phase must not begin until Phases 2–5 are successful.

- Add a separate, explicitly opt-in execution service.
- Require deterministic risk approval before every order.
- Add order idempotency, broker acknowledgements and reconciliation.
- Add order, fill, cancellation and failure audit trails.
- Add independent kill switches at application and broker layers.
- Start with manual confirmation or extremely limited sandbox/paper execution.
- Keep Futures and Options disabled until contract, expiry, margin, tick-size,
  liquidity and instrument-specific risk logic are separately validated.

## Non-goals and safety rules

- No profitability guarantee will be assumed.
- AI recommendations never override deterministic risk controls.
- Live order execution remains disabled until explicitly approved after the
  validation phases.
- Futures and Options are separate future products, not extensions of the
  equity risk model.
