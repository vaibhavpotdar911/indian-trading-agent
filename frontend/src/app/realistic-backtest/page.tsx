"use client";

import { useState } from "react";
import { runRealisticBacktest } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function RealisticBacktestPage() {
  const [ticker, setTicker] = useState("RELIANCE");
  const [mode, setMode] = useState<"equity_swing" | "equity_long_term">("equity_swing");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await runRealisticBacktest({ ticker, trading_mode: mode }));
    } catch (error: any) {
      toast.error(error.message || "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  return <div className="p-6 space-y-6 max-w-6xl mx-auto">
    <div><h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-emerald-600" />Realistic Backtest</h1><p className="text-sm text-muted-foreground mt-1">Next-open execution with slippage, costs, ATR exits, position sizing and walk-forward results.</p></div>
    <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
      <div><label className="text-xs text-muted-foreground">Ticker</label><Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} /></div>
      <div className="flex gap-2"><Button variant={mode === "equity_swing" ? "default" : "outline"} onClick={() => setMode("equity_swing")}>Swing</Button><Button variant={mode === "equity_long_term" ? "default" : "outline"} onClick={() => setMode("equity_long_term")}>Long-term</Button></div>
      <Button onClick={run} disabled={loading || !ticker}>{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running...</> : <><Play className="h-4 w-4 mr-2" />Run backtest</>}</Button>
    </CardContent></Card>
    {result && <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[["Trades", result.total_trades], ["Win rate", `${result.win_rate}%`], ["Return", `${result.total_return_pct}%`], ["Drawdown", `${result.max_drawdown_pct}%`], ["Profit factor", result.profit_factor ?? "—"]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold mt-1">{value}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2">Results <Badge variant="outline">{result.ticker} · {result.mode}</Badge></CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>Initial capital: ₹{Number(result.initial_capital).toLocaleString()} · Final capital: ₹{Number(result.final_capital).toLocaleString()} · Net P&L: ₹{Number(result.net_pnl).toLocaleString()}</p><p>Walk-forward test: {result.walk_forward.test_trade_count} trades · {result.walk_forward.test_return_pct}% return · Sharpe approximation: {result.sharpe_approx}</p><p className="text-xs text-muted-foreground">This is historical simulation, not a promise of future performance. Review costs, drawdown and out-of-sample results before using any strategy.</p></CardContent></Card>
    </>}
  </div>;
}
