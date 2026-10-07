"use client";

import { useEffect, useState } from "react";
import {
  getAutoTradeStatus,
  runAutoTradeCycle,
  monitorExitsNow,
  updateAutoTradeSettings,
  getAutoTradeLogs,
  getTradeSelectionReport,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Bot,
  Play,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  FileText,
  Clock,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";

export function AutoTraderPanel() {
  const [tradingMode, setTradingMode] = useState<"equity_swing" | "futures">("equity_swing");
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [selectedTradeReport, setSelectedTradeReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchStatus = (mode = tradingMode) => {
    setLoading(true);
    getAutoTradeStatus(mode)
      .then((data) => setStatus(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const fetchLogs = () => {
    getAutoTradeLogs(10)
      .then((data) => setLogs(data.logs || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus(tradingMode);
    fetchLogs();
    const interval = setInterval(() => {
      fetchStatus(tradingMode);
      fetchLogs();
    }, 15000);
    return () => clearInterval(interval);
  }, [tradingMode]);

  const handleModeChange = (newMode: "equity_swing" | "futures") => {
    setTradingMode(newMode);
    fetchStatus(newMode);
  };

  const handleRunCycle = async () => {
    setRunningCycle(true);
    try {
      const res = await runAutoTradeCycle(tradingMode);
      toast.success(res.summary || `Automated ${tradingMode === "futures" ? "Futures" : "Swing"} cycle completed!`);
      fetchStatus();
      fetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to execute auto cycle");
    } finally {
      setRunningCycle(false);
    }
  };

  const handleMonitorExits = async () => {
    setMonitoring(true);
    try {
      const res = await monitorExitsNow(tradingMode);
      const count = res.checked_positions ?? res.checked ?? 0;
      toast.success(`Checked ${count} positions against current market prices.`);
      fetchStatus();
      fetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to monitor exits");
    } finally {
      setMonitoring(false);
    }
  };

  const handleToggleAutoPilot = async () => {
    if (!status?.settings) return;
    const nextState = !status.settings.enabled;
    try {
      await updateAutoTradeSettings({ enabled: nextState }, tradingMode);
      toast.success(`Auto-Pilot (${tradingMode === "futures" ? "Futures" : "Swing"}) ${nextState ? "Enabled" : "Disabled"}`);
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to update setting");
    }
  };

  const handleViewReport = async (tradeId: number) => {
    setReportLoading(true);
    try {
      const res = await getTradeSelectionReport(tradeId);
      setSelectedTradeReport(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load selection report");
    } finally {
      setReportLoading(false);
    }
  };

  if (!status) return null;

  const isEnabled = !!status.settings?.enabled;
  const activePositions = status.active_positions || [];
  const rep = selectedTradeReport?.selection_report;
  const isFutures = tradingMode === "futures";

  return (
    <>
      <Card className="border border-border/60 bg-card/70 backdrop-blur-md shadow-xl mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Bot className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg font-bold">
                {isFutures ? "NSE Futures Automated Engine" : "Automated AI Swing Engine"}
              </CardTitle>
              <Badge variant="outline" className={isEnabled ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-muted text-muted-foreground"}>
                {isEnabled ? "Auto-Pilot: ON" : "Auto-Pilot: OFF"}
              </Badge>
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10">
                5% Risk / Trade
              </Badge>
              {isFutures && (
                <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                  Long & Short (SPAN Margin)
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-1">
              {isFutures
                ? "Autonomous NSE stock & index futures trading with overnight shorting, multi-agent AI verification, lot sizing, and 5% risk limits."
                : "Automated screening, AI Multi-Agent validation, 5% risk budgeting, and daily self-managing portfolio exits."}
            </CardDescription>

            {/* Mode Switch Tabs */}
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => handleModeChange("equity_swing")}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                  !isFutures
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                Equity Swing (Cash)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("futures")}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                  isFutures
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                <TrendingDown className="h-3.5 w-3.5 text-rose-300" />
                NSE Futures (Long & Short)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={isEnabled ? "destructive" : "outline"}
              onClick={handleToggleAutoPilot}
              className="text-xs"
            >
              {isEnabled ? "Disable Auto-Pilot" : "Enable Auto-Pilot"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleMonitorExits}
              disabled={monitoring}
              className="text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${monitoring ? "animate-spin" : ""}`} />
              Sync & Check Exits
            </Button>

            <Button
              size="sm"
              onClick={handleRunCycle}
              disabled={runningCycle}
              className={`text-xs text-white flex items-center gap-1.5 ${
                isFutures ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              <Play className={`h-3.5 w-3.5 ${runningCycle ? "animate-spin" : ""}`} />
              Run {isFutures ? "Futures" : "Swing"} Cycle
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Portfolio Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <div className="p-3 rounded-lg border border-border/40 bg-background/50">
              <span className="text-xs text-muted-foreground block">Paper Capital</span>
              <span className="text-base font-bold">₹{Number(status.total_capital || 0).toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground block">Allocated base</span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-background/50">
              <span className="text-xs text-muted-foreground block">Available Cash</span>
              <span className="text-base font-bold text-emerald-400">
                ₹{Number(status.available_cash ?? status.cash_balance ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground block">Unallocated margin</span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-background/50">
              <span className="text-xs text-muted-foreground block">
                {isFutures ? "Deployed Margin" : "Deployed Value"}
              </span>
              <span className="text-base font-bold">
                ₹{Number(status.deployed_margin ?? status.current_market_value ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {status.active_positions_count} of {status.max_open_positions} positions
              </span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-background/50">
              <span className="text-xs text-muted-foreground block">Unrealized P&L</span>
              <span className={`text-base font-bold ${status.unrealized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {status.unrealized_pnl >= 0 ? "+" : ""}₹{Number(status.unrealized_pnl || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground block">Mark-to-market</span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-background/50">
              <span className="text-xs text-muted-foreground block">Realized P&L</span>
              <span className={`text-base font-bold ${status.realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {status.realized_pnl >= 0 ? "+" : ""}₹{Number(status.realized_pnl || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground block">Closed positions</span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-background/50">
              <span className="text-xs text-muted-foreground block">Total Equity</span>
              <span className="text-base font-bold text-primary">₹{Number(status.total_equity || 0).toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground block">Cash + Margin + MTM</span>
            </div>
          </div>

          {/* Active Positions */}
          {activePositions.length > 0 ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Active {isFutures ? "Futures" : "Swing"} Positions ({activePositions.length})
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Stop-loss, target, and breakeven trailing monitored daily
                </span>
              </div>

              <div className="space-y-2">
                {activePositions.map((pos: any) => {
                  const pnlAmt = Number(pos.unrealized_pnl_amount || 0);
                  const pnlPct = Number(pos.unrealized_pnl_pct || 0);
                  const isProfit = pnlAmt >= 0;
                  const isShort = (pos.direction || "").toUpperCase() === "SHORT";

                  return (
                    <div
                      key={pos.id}
                      className="p-3 rounded-lg border border-border/50 bg-background/60 flex items-center justify-between flex-wrap gap-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">
                              {pos.ticker} {isFutures ? "FUT" : ""}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] py-0 flex items-center gap-1 ${
                                isShort
                                  ? "border-rose-500/30 text-rose-400 bg-rose-500/10"
                                  : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                              }`}
                            >
                              {isShort ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                              {pos.direction || "LONG"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] py-0 border-primary/30 text-primary">
                              Qty: {pos.quantity}
                            </Badge>
                            {isFutures && pos.capital && (
                              <Badge variant="outline" className="text-[10px] py-0 border-indigo-500/30 text-indigo-400">
                                Margin: ₹{Number(pos.capital).toLocaleString()}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Entry: ₹{pos.entry_price} · Current: ₹{pos.current_price || pos.entry_price} · SL: ₹{pos.stop_loss || "—"} · Target: ₹{pos.target || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className={`text-sm font-bold block ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                            {isProfit ? "+" : ""}₹{pnlAmt.toLocaleString()} ({isProfit ? "+" : ""}{pnlPct}%)
                          </span>
                          <span className="text-[10px] text-muted-foreground">Unrealized MTM</span>
                        </div>

                        {pos.selection_report && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewReport(pos.id)}
                            className="text-xs border border-border/40 hover:bg-muted text-primary"
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Why Picked?
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-border/50 text-center text-xs text-muted-foreground mb-4">
              No active {isFutures ? "Futures" : "Swing"} positions open currently. Click &quot;Run {isFutures ? "Futures" : "Swing"} Cycle&quot; to screen candidates and trigger automated analysis.
            </div>
          )}

          {/* Recent Auto-Trade Execution Logs */}
          {logs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Recent Daily Cycle Activity
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {logs.slice(0, 3).map((l: any) => (
                  <div key={l.id} className="text-xs p-2 rounded bg-muted/30 border border-border/20 flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[11px] text-muted-foreground mr-2">{l.run_datetime?.slice(0, 16)}</span>
                      <span>{l.summary}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* "Why and How Was This Scrip Picked?" Selection & AI Audit Dialog */}
      <Dialog open={!!selectedTradeReport} onOpenChange={(open) => !open && setSelectedTradeReport(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-6">
          <DialogHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="h-4 w-4" />
                </div>
                <DialogTitle className="text-lg">
                  Scrip Selection & AI Analysis Report: {selectedTradeReport?.ticker}
                </DialogTitle>
              </div>
              <Badge
                variant="outline"
                className={
                  (rep?.direction || selectedTradeReport?.direction) === "SHORT"
                    ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                    : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                }
              >
                {rep?.direction || selectedTradeReport?.direction || "LONG"} · {rep?.ai_analysis?.signal || selectedTradeReport?.signal || "BUY"}
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              Complete audit trail explaining how and why this scrip was screened, validated by AI, and executed with 5% risk budgeting.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-3 overflow-y-auto">
            <div className="py-4 space-y-4">
              {/* Executive Summary */}
              {rep?.why_picked && (
                <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                    Selection Rationale
                  </span>
                  <p className="text-xs leading-relaxed text-foreground/90">{rep.why_picked}</p>
                </div>
              )}

              {/* Futures Contract Specifications (if available) */}
              {rep?.contract_specs && (
                <div className="p-3.5 rounded-lg border border-indigo-500/40 bg-indigo-500/5">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 block mb-2">
                    NSE Futures Contract Specifications
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Lot Size</span>
                      <span className="font-semibold">{rep.contract_specs.lot_size} shares/lot</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Lots Traded</span>
                      <span className="font-semibold">{rep.contract_specs.lots} Lot(s)</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Contract Notional</span>
                      <span className="font-semibold">₹{Number(rep.contract_specs.contract_value || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Required Margin (22%)</span>
                      <span className="font-semibold text-indigo-400">₹{Number(rep.contract_specs.required_margin || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Trade Parameters & 5% Risk Budgeting */}
              {rep?.trade_parameters && (
                <div className="p-3.5 rounded-lg border border-border/50 bg-muted/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary block mb-2">
                    Deterministic Risk & Position Sizing
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Entry Price</span>
                      <span className="font-semibold">₹{rep.trade_parameters.entry_price}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Stop-Loss (SL)</span>
                      <span className="font-semibold text-rose-400">₹{rep.trade_parameters.stop_loss}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Target (2x R:R)</span>
                      <span className="font-semibold text-emerald-400">₹{rep.trade_parameters.target}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Quantity</span>
                      <span className="font-semibold">{rep.trade_parameters.quantity} shares</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Deployed Margin / Capital</span>
                      <span className="font-semibold">
                        ₹{Number(rep.trade_parameters.position_margin ?? rep.trade_parameters.position_value ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Risk Budget (5%)</span>
                      <span className="font-semibold">₹{Number(rep.trade_parameters.risk_budget || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Actual Risk Amount</span>
                      <span className="font-semibold">₹{Number(rep.trade_parameters.actual_risk_amount || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Risk of Portfolio</span>
                      <span className="font-semibold text-emerald-400">{rep.trade_parameters.actual_risk_pct}% (Max: 5.0%)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Screening Confluence Signals */}
              {rep?.screening_reason && (
                <div className="p-3.5 rounded-lg border border-border/50 bg-background/50">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                    Technical Screener Confluence: {rep.setup_name || rep.screening_reason.setup_category || "Strategy"}
                  </span>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {rep.screening_reason.triggered_signals?.map((sig: any, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-[11px]">
                        {typeof sig === "object" ? sig.type || JSON.stringify(sig) : sig}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-4">
                    <span>Technical Score: <strong className="text-foreground">{rep.screening_reason.technical_score}</strong></span>
                    <span>Win Probability: <strong className="text-foreground">{rep.screening_reason.success_probability}%</strong></span>
                  </div>
                </div>
              )}

              {/* AI Multi-Agent Thesis */}
              {rep?.ai_analysis && (
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary block">
                    AI Multi-Agent Pipeline Consensus
                  </span>

                  {rep.ai_analysis.bull_thesis && (
                    <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-xs">
                      <span className="font-semibold text-emerald-400 block mb-1">Bull Researcher Thesis:</span>
                      <p className="text-muted-foreground leading-relaxed">{rep.ai_analysis.bull_thesis}</p>
                    </div>
                  )}

                  {rep.ai_analysis.bear_thesis && (
                    <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-xs">
                      <span className="font-semibold text-rose-400 block mb-1">Bear Researcher Counter-Thesis:</span>
                      <p className="text-muted-foreground leading-relaxed">{rep.ai_analysis.bear_thesis}</p>
                    </div>
                  )}

                  {rep.ai_analysis.investment_plan && (
                    <div className="p-3 rounded-lg border border-border/50 bg-background/60 text-xs">
                      <span className="font-semibold text-foreground block mb-1">Trader & Risk Management Plan:</span>
                      <p className="text-muted-foreground leading-relaxed">{rep.ai_analysis.investment_plan}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
