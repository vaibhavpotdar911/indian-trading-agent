"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  getPortfolioHoldingsForAnalysis,
  runPortfolioDailyAnalysis,
  getLatestPortfolioDailyAnalysis,
  getPortfolioDailyAnalysis,
  getPortfolioDailyAnalysisHistory,
  connectPortfolioAnalysisWS,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Briefcase,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Shield,
  Loader2,
  ExternalLink,
  Clock,
  Layers,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface Holding {
  tradingsymbol: string;
  exchange?: string;
  quantity: number;
  average_price: number;
  last_price: number;
  invested_value: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
  allocation_pct?: number;
  source?: string;
}

interface StockResult {
  ticker: string;
  task_id: string;
  verdict: string;
  verdict_category: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  pnl_pct: number;
  levels?: {
    stop_loss?: number;
    target_1?: number;
    target_2?: number;
  };
  duration_seconds?: number;
  decision_preview?: string;
  status: string;
  error?: string;
}

interface BatchSummary {
  status: string;
  total_holdings: number;
  completed_holdings: number;
  verdict_counts: Record<string, number>;
  executive_verdict: string;
  total_invested?: number;
  total_current?: number;
  total_pnl?: number;
  total_pnl_pct?: number;
  finished_at?: string;
}

export function PortfolioDailyAnalysis() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [depth, setDepth] = useState<number>(1);
  const [running, setRunning] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);

  // Live Batch Execution State
  const [currentTicker, setCurrentTicker] = useState<string>("");
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [totalHoldingsCount, setTotalHoldingsCount] = useState<number>(0);
  const [currentActivity, setCurrentActivity] = useState<string>("");
  const [results, setResults] = useState<StockResult[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchHoldings = async () => {
    setLoadingHoldings(true);
    try {
      const data: any = await getPortfolioHoldingsForAnalysis();
      const pos: Holding[] = data.holdings || [];
      setHoldings(pos);
      // Select all by default
      setSelectedTickers(pos.map((h) => h.tradingsymbol));
    } catch {
      toast.error("Failed to load portfolio holdings.");
    } finally {
      setLoadingHoldings(false);
    }
  };

  const fetchLatest = async () => {
    try {
      const data: any = await getLatestPortfolioDailyAnalysis();
      if (data.found && data.batch) {
        const b = data.batch;
        setBatchId(b.batch_id);
        setResults(b.results || []);
        setSummary(b.summary || null);
        if (b.status === "running") {
          setRunning(true);
          listenToBatch(b.batch_id);
        }
      }
    } catch {}
  };

  const fetchHistoryList = async () => {
    try {
      const data: any = await getPortfolioDailyAnalysisHistory(15);
      setHistory(data.history || []);
    } catch {}
  };

  useEffect(() => {
    fetchHoldings();
    fetchLatest();
    fetchHistoryList();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const listenToBatch = (bId: string) => {
    if (wsRef.current) wsRef.current.close();

    const ws = connectPortfolioAnalysisWS(bId, (event: any) => {
      if (event.type === "batch_start") {
        setRunning(true);
        setTotalHoldingsCount(event.total_holdings);
        setResults([]);
        setSummary(null);
      } else if (event.type === "stock_start") {
        setCurrentTicker(event.ticker);
        setCurrentIndex(event.index);
        setTotalHoldingsCount(event.total);
        setCurrentActivity("Starting multi-agent analysis...");
      } else if (event.type === "stock_heartbeat") {
        if (event.activity) setCurrentActivity(event.activity);
      } else if (event.type === "stock_complete") {
        setResults((prev) => {
          const exists = prev.some((r) => r.ticker === event.ticker);
          if (exists) return prev.map((r) => (r.ticker === event.ticker ? event.result : r));
          return [...prev, event.result];
        });
      } else if (event.type === "batch_complete") {
        setRunning(false);
        setCurrentTicker("");
        setCurrentActivity("");
        setSummary(event.summary);
        setResults(event.results || []);
        toast.success("Portfolio daily deep analysis complete!");
        fetchHistoryList();
      } else if (event.type === "batch_error") {
        setRunning(false);
        toast.error(`Batch analysis error: ${event.error}`);
      }
    });

    wsRef.current = ws;
  };

  const handleRun = async () => {
    if (selectedTickers.length === 0) {
      toast.error("Please select at least one holding to analyze.");
      return;
    }

    try {
      setRunning(true);
      setResults([]);
      setSummary(null);
      setCurrentIndex(0);
      setTotalHoldingsCount(selectedTickers.length);

      const resp: any = await runPortfolioDailyAnalysis({
        tickers: selectedTickers,
        depth,
        trading_mode: "equity_swing",
      });

      setBatchId(resp.batch_id);
      listenToBatch(resp.batch_id);
      toast.info(`Started daily analysis for ${selectedTickers.length} holdings.`);
    } catch (err: any) {
      setRunning(false);
      toast.error(err.message || "Failed to start portfolio deep analysis.");
    }
  };

  const toggleTicker = (ticker: string) => {
    if (selectedTickers.includes(ticker)) {
      setSelectedTickers(selectedTickers.filter((t) => t !== ticker));
    } else {
      setSelectedTickers([...selectedTickers, ticker]);
    }
  };

  const selectAll = () => setSelectedTickers(holdings.map((h) => h.tradingsymbol));
  const deselectAll = () => setSelectedTickers([]);

  const totalInvested = holdings.reduce((acc, h) => acc + (h.invested_value || 0), 0);
  const totalCurrent = holdings.reduce((acc, h) => acc + (h.current_value || 0), 0);
  const totalPnL = holdings.reduce((acc, h) => acc + (h.pnl || 0), 0);
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  const getVerdictBadge = (category: string, verdict: string) => {
    switch (category) {
      case "HOLD":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-1 text-xs font-semibold">
            🟢 HOLD
          </Badge>
        );
      case "ADD_MORE":
        return (
          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 px-2.5 py-1 text-xs font-semibold">
            🔵 ADD MORE / ACCUMULATE
          </Badge>
        );
      case "BOOK_PROFIT":
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 px-2.5 py-1 text-xs font-semibold">
            🟡 BOOK PROFIT / TRIM
          </Badge>
        );
      case "CUT_LOSS":
        return (
          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 px-2.5 py-1 text-xs font-semibold">
            🔴 CUT LOSS / EXIT
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="px-2.5 py-1 text-xs font-semibold">
            {verdict || "ANALYZED"}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview & Portfolio Banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-card via-card to-primary/5">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <h2 className="text-lg sm:text-xl font-bold">Synced Portfolio Daily Deep Analysis</h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Runs full multi-agent LLM analysis across your holdings considering your actual buy prices, current prices, and P&L.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHoldings}
                disabled={running || loadingHoldings}
                className="h-8 text-xs"
              >
                <RotateCcw className={`h-3 w-3 mr-1.5 ${loadingHoldings ? "animate-spin" : ""}`} />
                Refresh Holdings
              </Button>
              {history.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="h-8 text-xs"
                >
                  <Clock className="h-3 w-3 mr-1.5" />
                  Past Daily Runs ({history.length})
                </Button>
              )}
            </div>
          </div>

          {/* Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t">
            <div className="p-2.5 sm:p-3 rounded-lg bg-muted/40">
              <span className="text-[11px] text-muted-foreground block font-medium">Holdings Count</span>
              <span className="text-base sm:text-lg font-bold">{holdings.length} stocks</span>
            </div>
            <div className="p-2.5 sm:p-3 rounded-lg bg-muted/40">
              <span className="text-[11px] text-muted-foreground block font-medium">Invested Value</span>
              <span className="text-base sm:text-lg font-bold">₹{totalInvested.toLocaleString("en-IN")}</span>
            </div>
            <div className="p-2.5 sm:p-3 rounded-lg bg-muted/40">
              <span className="text-[11px] text-muted-foreground block font-medium">Current Value</span>
              <span className="text-base sm:text-lg font-bold">₹{totalCurrent.toLocaleString("en-IN")}</span>
            </div>
            <div className={`p-2.5 sm:p-3 rounded-lg border ${
              totalPnL >= 0
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
            }`}>
              <span className="text-[11px] block font-medium opacity-80">Unrealized P&L</span>
              <span className="text-base sm:text-lg font-bold flex items-center gap-1">
                {totalPnL >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                ₹{Math.abs(totalPnL).toLocaleString("en-IN")} ({totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History Drawer */}
      {showHistory && history.length > 0 && (
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Historical Daily Portfolio Analyses</span>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} className="h-6 text-xs">
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {history.map((item) => (
                <button
                  key={item.batch_id}
                  onClick={() => {
                    setBatchId(item.batch_id);
                    setResults(item.results || []);
                    setSummary(item.summary || null);
                    setShowHistory(false);
                  }}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors hover:bg-muted/50 ${
                    batchId === item.batch_id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold mb-1">
                    <span>{item.run_date}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.completed_holdings}/{item.total_holdings} stocks
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {item.summary?.executive_verdict || "Completed"}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trigger & Holdings Selection Section */}
      <Card>
        <CardHeader className="p-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Select Holdings to Analyze
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {selectedTickers.length} of {holdings.length} holdings selected for today&apos;s analysis
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={running} className="h-7 text-xs px-2">
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll} disabled={running} className="h-7 text-xs px-2">
              Deselect All
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Holdings List */}
          {loadingHoldings ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading portfolio positions...
            </div>
          ) : holdings.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No synced holdings found. Please sync your portfolio from Kite, Upstox, Kotak Neo, or add positions in the Portfolio section.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {holdings.map((h) => {
                const selected = selectedTickers.includes(h.tradingsymbol);
                return (
                  <div
                    key={h.tradingsymbol}
                    onClick={() => !running && toggleTicker(h.tradingsymbol)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                      selected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border opacity-60 hover:opacity-100 bg-muted/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {}}
                      className="mt-0.5 h-3.5 w-3.5 rounded accent-primary pointer-events-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-bold text-sm truncate">{h.tradingsymbol}</span>
                        <span className={`text-[11px] font-semibold ${
                          (h.pnl || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                        }`}>
                          {(h.pnl || 0) >= 0 ? "+" : ""}{h.pnl_pct ? h.pnl_pct.toFixed(1) : 0}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                        <span>Qty: {h.quantity}</span>
                        <span>Buy: ₹{h.average_price}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground text-[11px] mt-0.5">
                        <span>CMP: ₹{h.last_price}</span>
                        <span>P&amp;L: ₹{Math.round(h.pnl || 0).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Research Depth:</span>
              <div className="flex gap-1.5">
                {[
                  { val: 1, label: "Fast (1 round)" },
                  { val: 2, label: "Balanced (2 rounds)" },
                  { val: 3, label: "Deep (3 rounds)" },
                ].map((d) => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => setDepth(d.val)}
                    disabled={running}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      depth === d.val
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleRun}
              disabled={running || selectedTickers.length === 0}
              className="h-10 font-semibold px-6 shadow-md"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing Portfolio ({currentIndex}/{totalHoldingsCount || selectedTickers.length})...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2 text-yellow-300" />
                  Run Daily Deep Analysis ({selectedTickers.length} Stocks)
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live Execution Progress Card */}
      {running && (
        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
              <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing {currentTicker || "Portfolio"} ({currentIndex} of {totalHoldingsCount})...
              </span>
              <span className="text-muted-foreground">
                {totalHoldingsCount > 0 ? Math.round((results.length / totalHoldingsCount) * 100) : 0}% Complete
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-blue-200/50 dark:bg-blue-950 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{
                  width: `${totalHoldingsCount > 0 ? Math.round((results.length / totalHoldingsCount) * 100) : 0}%`,
                }}
              />
            </div>

            {currentActivity && (
              <p className="text-xs font-mono text-muted-foreground truncate">
                Activity: {currentActivity}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results Dashboard */}
      {summary && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold">{summary.executive_verdict}</h3>
              </div>
              {summary.finished_at && (
                <span className="text-xs text-muted-foreground">
                  Updated: {new Date(summary.finished_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-emerald-500/20">
              <span className="text-xs font-semibold text-muted-foreground">Action Summary:</span>
              <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                🟢 {summary.verdict_counts?.HOLD || 0} Hold
              </Badge>
              <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30 text-xs">
                🔵 {summary.verdict_counts?.ADD_MORE || 0} Add More
              </Badge>
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs">
                🟡 {summary.verdict_counts?.BOOK_PROFIT || 0} Take Profit / Trim
              </Badge>
              <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs">
                🔴 {summary.verdict_counts?.CUT_LOSS || 0} Cut Loss / Exit
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Holdings Verdict Cards Grid */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Daily Verdicts by Holding
            </h3>
            <span className="text-xs text-muted-foreground">{results.length} stocks reviewed</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((r) => {
              const isProfit = (r.pnl || 0) >= 0;
              return (
                <Card key={r.ticker} className="overflow-hidden border-border hover:border-primary/40 transition-all">
                  <div className="p-4 sm:p-5 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{r.ticker}</span>
                          <span className="text-xs text-muted-foreground">Qty: {r.quantity}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>Buy: ₹{r.average_price}</span>
                          <span>CMP: ₹{r.last_price}</span>
                          <span className={`font-semibold ${isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                            P&amp;L: ₹{Math.round(r.pnl || 0).toLocaleString("en-IN")} ({isProfit ? "+" : ""}{r.pnl_pct ? r.pnl_pct.toFixed(1) : 0}%)
                          </span>
                        </div>
                      </div>

                      <div>{getVerdictBadge(r.verdict_category, r.verdict)}</div>
                    </div>

                    {/* Key Levels (Stop-Loss & Targets) */}
                    {r.levels && (r.levels.stop_loss || r.levels.target_1) && (
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-muted/40 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block">Stop-Loss</span>
                          <span className="font-semibold text-rose-500">
                            {r.levels.stop_loss ? `₹${r.levels.stop_loss}` : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Target 1</span>
                          <span className="font-semibold text-emerald-500">
                            {r.levels.target_1 ? `₹${r.levels.target_1}` : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Target 2</span>
                          <span className="font-semibold text-blue-500">
                            {r.levels.target_2 ? `₹${r.levels.target_2}` : "—"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Executive Decision Preview */}
                    {r.decision_preview && (
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed border-l-2 border-primary/40 pl-2.5 italic">
                        {r.decision_preview.replace(/^Rating:.*?\n/i, "")}
                      </p>
                    )}

                    {/* Footer link to full multi-agent report */}
                    <div className="pt-2 border-t flex items-center justify-between text-xs">
                      <span className="text-muted-foreground text-[11px]">
                        Analyzed in {r.duration_seconds || 0}s
                      </span>
                      <Link
                        href={`/analysis/${r.task_id}`}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                        target="_blank"
                      >
                        View Full Deep Report <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
