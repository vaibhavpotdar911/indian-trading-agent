"use client";

import { useState } from "react";
import { runFundamentalBacktest } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Play, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function FundamentalBacktestPage() {
  const [ticker, setTicker] = useState("RELIANCE");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try { setResult(await runFundamentalBacktest({ ticker })); }
    catch (error: any) { toast.error(error.message || "Backtest failed"); }
    finally { setLoading(false); }
  };
  return <div className="p-6 space-y-6 max-w-6xl mx-auto">
    <div><h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6 text-emerald-600" />Long-term Fundamental Backtest</h1><p className="text-sm text-muted-foreground mt-1">Point-in-time reporting lag, periodic rebalancing, next-open execution, costs and drawdown.</p></div>
    <Card><CardContent className="p-4 flex items-end gap-3"><div><label className="text-xs text-muted-foreground">Ticker</label><Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} /></div><Button onClick={run} disabled={loading || !ticker}>{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running...</> : <><Play className="h-4 w-4 mr-2" />Run backtest</>}</Button></CardContent></Card>
    {result && <><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[["Trades", result.total_trades], ["Win rate", `${result.win_rate}%`], ["Return", `${result.total_return_pct}%`], ["Drawdown", `${result.max_drawdown_pct}%`], ["Final capital", `₹${Number(result.final_capital).toLocaleString()}`]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold mt-1">{value}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>{result.ticker} · long-term results</CardTitle></CardHeader><CardContent className="text-sm space-y-2"><p>Net P&amp;L: ₹{Number(result.net_pnl).toLocaleString()} · {result.fundamental_observations} fundamental observations.</p><p className="text-xs text-muted-foreground">{result.data_note} Historical simulation is not a forecast.</p></CardContent></Card></>}
  </div>;
}
