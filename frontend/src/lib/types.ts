export interface Quote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
  market_cap?: number;
  pe_ratio?: number;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
}

export interface ChartDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketStatus {
  session: string;
  is_trading_day: boolean;
  nifty: { price: number; change: number; change_percent: number };
  banknifty: { price: number; change: number; change_percent: number };
}

export interface WatchlistItem {
  ticker: string;
  symbol: string;
  exchange: string;
  name: string;
  price: number | null;
  change: number | null;
  change_percent: number | null;
  added_at: string;
}

export interface AnalysisRequest {
  ticker: string;
  trade_date: string;
  analysts: string[];
  max_debate_rounds: number;
  max_risk_discuss_rounds: number;
}

export interface AnalysisResult {
  task_id: string;
  ticker: string;
  trade_date: string;
  signal: string;
  status?: string;
  error_message?: string;
  market_report?: string;
  sentiment_report?: string;
  news_report?: string;
  fundamentals_report?: string;
  investment_plan?: string;
  trader_investment_plan?: string;
  final_trade_decision?: string;
  bull_history?: string;
  bear_history?: string;
  risk_aggressive_history?: string;
  risk_conservative_history?: string;
  risk_neutral_history?: string;
  stats?: {
    llm_calls: number;
    tool_calls: number;
    tokens_in: number;
    tokens_out: number;
    total_tokens: number;
    cost_usd: number;
    cost_inr: number;
    per_model?: Record<string, { input: number; output: number }>;
  };
  duration_seconds?: number;
  created_at?: string;
}

export interface AnalysisHistoryItem {
  task_id: string;
  ticker: string;
  trade_date: string;
  signal: string;
  status?: string;
  error_message?: string;
  duration_seconds: number;
  entry_price?: number;
  exit_price?: number;
  pnl_pct?: number;
  pnl_status?: string;
  created_at: string;
}

export interface BacktestTrade {
  trade_date: string;
  ticker: string;
  signal: string;
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
  pnl_amount: number;
  cumulative_pnl: number;
  portfolio_value: number;
  duration_seconds: number;
}

export interface BacktestResult {
  backtest_id: string;
  ticker: string;
  initial_capital: number;
  final_portfolio_value: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_return_pct: number;
  max_drawdown_pct: number;
  total_pnl: number;
  status: string;
  trades: BacktestTrade[];
}

export interface BacktestWSEvent {
  type: "trade" | "status" | "complete" | "error";
  message?: string;
  total_dates?: number;
  // trade fields
  trade_date?: string;
  signal?: string;
  entry_price?: number;
  exit_price?: number;
  pnl_pct?: number;
  pnl_amount?: number;
  cumulative_pnl?: number;
  portfolio_value?: number;
  // complete fields
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  total_return_pct?: number;
  max_drawdown_pct?: number;
  total_pnl?: number;
}

export interface WSEvent {
  type: "report" | "debate" | "risk_debate" | "signal" | "agent_status" | "complete" | "error" | "stats";
  section?: string;
  content?: string;
  side?: string;
  agent?: string;
  status?: string;
  decision?: string;
  ticker?: string;
  message?: string;
  duration_seconds?: number;
  llm_calls?: number;
  tool_calls?: number;
  tokens_in?: number;
  tokens_out?: number;
}

export type Signal = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "SHORT" | "OVERWEIGHT" | "UNDERWEIGHT";
