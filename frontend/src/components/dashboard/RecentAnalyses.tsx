"use client";

import { useEffect, useState } from "react";
import { getAnalysisHistory, getAnalysisResult } from "@/lib/api";
import type { AnalysisHistoryItem, AnalysisResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DecisionCard } from "@/components/analysis/DecisionCard";
import { DebateView } from "@/components/analysis/DebateView";
import { StatsCard } from "@/components/analysis/StatsCard";
import { ReportPanel } from "@/components/analysis/ReportPanel";
import { Eye, ExternalLink, History, Loader2, AlertTriangle, CheckCircle2, Clock, ShieldAlert, Cpu, Sparkles, RefreshCw } from "lucide-react";
import Link from "next/link";

const signalColors: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "STRONG BUY": "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold",
  OVERWEIGHT: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  HOLD: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  SELL: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  SHORT: "bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold",
  UNDERWEIGHT: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  "ANALYZING...": "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse font-mono",
  INTERRUPTED: "bg-rose-500/20 text-rose-400 border-rose-500/40 font-medium",
};

export function RecentAnalyses() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<AnalysisResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchHistory = () => {
    getAnalysisHistory(6).then((data: any) => setAnalyses(data)).catch(() => {});
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const openPreview = (taskId: string) => {
    setSelectedTaskId(taskId);
    setLoadingPreview(true);
    setPreviewResult(null);
    getAnalysisResult(taskId)
      .then((res: any) => setPreviewResult(res))
      .catch(() => setPreviewResult(null))
      .finally(() => setLoadingPreview(false));
  };

  const reports: Record<string, string> = {};
  if (previewResult) {
    if (previewResult.market_report) reports.market_report = previewResult.market_report;
    if (previewResult.sentiment_report) reports.sentiment_report = previewResult.sentiment_report;
    if (previewResult.news_report) reports.news_report = previewResult.news_report;
    if (previewResult.fundamentals_report) reports.fundamentals_report = previewResult.fundamentals_report;
    if (previewResult.investment_plan) reports.investment_plan = previewResult.investment_plan;
    if (previewResult.trader_investment_plan) reports.trader_investment_plan = previewResult.trader_investment_plan;
    if (previewResult.final_trade_decision) reports.final_trade_decision = previewResult.final_trade_decision;
  }

  const generatedReportsCount = Object.keys(reports).length;
  const isInterrupted = previewResult?.status === "error" || previewResult?.signal === "INTERRUPTED" || !!previewResult?.error_message;

  return (
    <>
      <Card className="border border-border/50 bg-card/60 backdrop-blur-md shadow-xl">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Stored Agent Reports
            </CardTitle>
            <CardDescription className="text-xs">
              Quick access to recent multi-agent analysis results & status
            </CardDescription>
          </div>
          <Link href="/history" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            View All <History className="h-3 w-3" />
          </Link>
        </CardHeader>

        <CardContent className="pt-0 space-y-2.5">
          {analyses.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-xl bg-muted/20">
              <Cpu className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-medium">No stored analysis reports found</p>
              <Link href="/analysis" className="text-xs text-primary hover:underline mt-1 inline-block">
                Start a new multi-agent scan →
              </Link>
            </div>
          ) : (
            analyses.map((a) => {
              const itemInterrupted = a.status === "error" || a.signal === "INTERRUPTED" || !!a.error_message;
              const isRunning = a.signal === "ANALYZING...";
              return (
                <div
                  key={a.task_id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/30 hover:bg-muted/60 transition-all duration-200 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm tracking-tight">{a.ticker}</span>
                      {itemInterrupted ? (
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] py-0 px-2 flex items-center gap-1 font-semibold">
                          <AlertTriangle className="h-3 w-3" /> INTERRUPTED
                        </Badge>
                      ) : isRunning ? (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] py-0 px-2 animate-pulse flex items-center gap-1 font-medium">
                          <Clock className="h-3 w-3" /> IN PROGRESS
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`${signalColors[a.signal] || ""} text-[10px] py-0 px-2`}>
                          {a.signal}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{a.trade_date}</span>
                      {a.duration_seconds ? (
                        <>
                          <span>•</span>
                          <span>{Math.round(a.duration_seconds)}s scan</span>
                        </>
                      ) : null}
                      {a.pnl_status && a.pnl_status !== "pending" && (
                        <>
                          <span>•</span>
                          <span className={a.pnl_pct && a.pnl_pct >= 0 ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                            {a.pnl_pct != null ? `${a.pnl_pct >= 0 ? "+" : ""}${a.pnl_pct}% P&L` : a.pnl_status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2.5 text-xs font-medium bg-secondary/80 hover:bg-secondary border border-border/40 shadow-sm"
                      onClick={() => openPreview(a.task_id)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1 text-primary" /> Preview
                    </Button>
                    <Link href={`/analysis/${a.task_id}`}>
                      <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs font-medium border-border/60 hover:border-primary/50">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Full Page
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Quick Preview Modal */}
      <Dialog open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[92vh] h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl p-6 md:p-8">
          <DialogHeader className="pb-4 border-b border-border/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span>{previewResult?.ticker || "Analysis"} Report Preview</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  {previewResult?.trade_date ? `Scanned for trade date: ${previewResult.trade_date}` : "Analysis details and agent intelligence"}
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                {isInterrupted ? (
                  <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/40 px-3 py-1 font-semibold text-xs flex items-center gap-1.5 shadow-sm">
                    <AlertTriangle className="h-3.5 w-3.5" /> Interrupted / Terminated
                  </Badge>
                ) : previewResult?.signal === "ANALYZING..." ? (
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/40 px-3 py-1 animate-pulse font-semibold text-xs flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> In Progress
                  </Badge>
                ) : previewResult ? (
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 px-3 py-1 font-semibold text-xs flex items-center gap-1.5 shadow-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed ({generatedReportsCount} Reports)
                  </Badge>
                ) : null}

                {selectedTaskId && (
                  <Link href={`/analysis/${selectedTaskId}`}>
                    <Button size="sm" className="h-8 text-xs font-semibold shadow-md">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Full Page
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </DialogHeader>

          {loadingPreview ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Fetching stored agent reports...</p>
            </div>
          ) : previewResult ? (
            <div className="space-y-5 pt-3">
              {/* Interruption alert banner with details */}
              {isInterrupted && (
                <Card className="border-rose-500/50 bg-rose-500/10 dark:bg-rose-950/40 shadow-lg">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                      <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
                      Analysis Execution Interrupted
                    </div>
                    <p className="text-xs text-rose-300 font-mono bg-rose-950/50 p-2.5 rounded-lg border border-rose-500/20 break-words leading-relaxed">
                      {previewResult.error_message || "Google Gemini free tier limit reached (20 requests/day). Execution was halted before all agent stages completed."}
                    </p>
                    <div className="text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-rose-500/20">
                      <span>
                        💡 <strong>Partial Data Available:</strong> {generatedReportsCount > 0 ? `${generatedReportsCount} agent report(s) generated prior to interruption are viewable below.` : "No complete reports were stored before the limit was hit."}
                      </span>
                      <Link href="/settings" className="shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs border-rose-500/40 hover:bg-rose-500/20 text-rose-300">
                          <RefreshCw className="h-3 w-3 mr-1" /> Switch LLM Model
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Signal Card if available */}
              {previewResult.signal && previewResult.signal !== "INTERRUPTED" && (
                <DecisionCard
                  signal={previewResult.signal}
                  ticker={previewResult.ticker}
                  duration={previewResult.duration_seconds}
                />
              )}

              {/* Token & LLM Stats */}
              {previewResult.stats && (
                <StatsCard stats={previewResult.stats} duration={previewResult.duration_seconds} />
              )}

              {/* Generated Reports Panel */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-primary" /> Agent Analysis Reports
                </h4>
                <ReportPanel reports={reports} />
              </div>

              {/* Debates View */}
              {(previewResult.bull_history || previewResult.bear_history || previewResult.risk_aggressive_history) && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Agent Debates & Risk Discussion
                  </h4>
                  <DebateView
                    bull={previewResult.bull_history || ""}
                    bear={previewResult.bear_history || ""}
                    riskAggressive={previewResult.risk_aggressive_history}
                    riskConservative={previewResult.risk_conservative_history}
                    riskNeutral={previewResult.risk_neutral_history}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
              <p className="text-sm font-medium">Unable to load report details for this analysis.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


