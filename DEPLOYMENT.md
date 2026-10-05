# Deployment checklist

This application is research/paper-trading software. **Live order execution is
disabled.** Do not enable it without completing independent validation.

## 1. Server requirements

- Python 3.10+
- Node.js 20+
- npm
- SQLite (included with Python)
- A process manager such as systemd, Docker Compose, or Render/Railway
- HTTPS in production (required for secure browser WebSockets)

## 2. Install dependencies

From the repository root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -e .

cd frontend
npm ci
npm run build
cd ..
```

The Python dependencies include the official Kotak package:

```text
kotakneoapi==3.0.7
```

Its Python import is `neo_api_client`.

## 3. Configure persistent storage

Set a writable application-data directory. The SQLite database and local auth
state are stored there:

```bash
export TRADINGAGENTS_HOME=/var/lib/indian-trading-agent
mkdir -p "$TRADINGAGENTS_HOME"
```

Back up this directory regularly. It contains settings, paper trades,
positions, analyses and risk configuration.

## 4. Configure authentication and CORS

For a deployed instance, set a strong application password and frontend URL:

```bash
export TRADINGAGENTS_AUTH_MODE=password
export TRADINGAGENTS_AUTH_USERNAME=admin
export TRADINGAGENTS_AUTH_PASSWORD='use-a-long-random-password'
export FRONTEND_URL=https://your-frontend.example.com
export CORS_ORIGINS=https://your-frontend.example.com
```

Never commit these values. Use the deployment platform's secret manager.

## 5. Configure API keys

The **Settings** page is the preferred configuration method. Values saved in
the UI are stored locally and take priority over environment variables. Keys
are never displayed in plaintext.

### Required for AI analysis

Configure at least one LLM provider in Settings:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `DASHSCOPE_API_KEY`

### Market and fundamental data

- Kotak Neo credentials are configured under Equity Portfolio Analysis / broker
  settings. Use the SDK v3 flow: consumer key, mobile number, UCC, TOTP and
  MPIN.
- Stoxim is optional. Create a free personal-use key at
  https://www.stoxim.com/ and configure it in **Settings → Market & Fundamental
  Data**. The equivalent environment fallback is:

  ```bash
  export STOXIM_API_KEY=your-key
  ```

The fundamental backtest reports whether it used Stoxim or Yahoo Finance.

### Optional broker integrations

These can be configured from the broker settings UI or supplied as deployment
secrets:

- Kite: `KITE_API_KEY`, `KITE_API_SECRET`, `KITE_ACCESS_TOKEN`
- Upstox: `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_ACCESS_TOKEN`
- Angel One: `ANGEL_ONE_API_KEY`, `ANGEL_ONE_CLIENT_CODE`,
  `ANGEL_ONE_PASSWORD`, `ANGEL_ONE_TOTP_SECRET`
- Groww: `GROWW_CLIENT_ID`, `GROWW_API_TOKEN`
- 5paisa: `FIVEPAISA_APP_NAME`, `FIVEPAISA_APP_SOURCE`, `FIVEPAISA_USER_KEY`,
  `FIVEPAISA_ENCRYPTION_KEY`, `FIVEPAISA_USER_ID`

Only connect brokers for read-only holdings/market-data use. Order execution is
intentionally not implemented.

## 6. Start the services

Backend:

```bash
source venv/bin/activate
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
NEXT_PUBLIC_API_URL=https://your-api.example.com npm start
```

For same-host deployment, omit `NEXT_PUBLIC_API_URL`. For separate hosts, make
sure the API URL is reachable over HTTPS and that WebSocket upgrades are
forwarded to the backend.

## 7. First-run checklist

1. Sign in with the configured application credentials.
2. Open Settings and configure the selected LLM key.
3. Configure Stoxim if fundamental data is required.
4. Configure Kotak Neo and complete the daily SDK authentication flow.
5. Set the market-data vendor to Kotak Neo in Settings.
6. Confirm `/charts` shows historical candles and the Kotak live-feed status.
7. Run both realistic and fundamental backtests.
8. Check costs, slippage, drawdown and out-of-sample results.
9. Configure risk capital, per-trade risk, position limits and the kill switch.
10. Use paper trading first and monitor daily P&L and sector exposure.

## 8. Health checks

```bash
curl https://your-api.example.com/api/health
```

Also verify:

- Settings shows keys as configured/masked.
- Kotak session status is current for today.
- WebSocket connections reconnect after a temporary network interruption.
- Risk dashboard reflects paper and synced positions.
- No live order endpoint is enabled.

## 9. Backups and updates

- Back up `$TRADINGAGENTS_HOME` before upgrades.
- Keep API keys in the deployment secret manager and rotate them periodically.
- Run backend tests and the frontend build before deploying changes:

  ```bash
  ./venv/bin/python -m unittest discover -s tests
  cd frontend && npm run build
  ```

- Review every provider's personal-use terms, rate limits and data-retention
  rules. Free data is suitable for research, not guaranteed execution-grade
  market data.
