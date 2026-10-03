"use client";

import { useEffect, useState } from "react";
import { getAnalysisHistory, getAnalysisResult } from "@/lib/api";
import type { AnalysisHistoryItem, AnalysisResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DecisionCard } from "@/components/analysis/DecisionCard";
import { ReportPanel } from "@/components/analysis/ReportPanel";
import { Eye, ExternalLink, History, Loader2 } from "lucide-react";
import Link from "next/link";

const signalColors: Record<string, string> = {
  BUY: "bg-green-500/20 text-green-400 border-green-500/30",
  "STRONG BUY": "bg-green-500/20 text-green-400 border-green-500/30",
  OVERWEIGHT: "bg-green-500/15 text-green-300 border-green-500/20",
  HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SELL: "bg-red-500/20 text-red-400 border-red-500/30",
  SHORT: "bg-red-500/20 text-red-400 border-red-500/30",
  UNDERWEIGHT: "bg-red-500/15 text-red-300 border-red-500/20",
  "ANALYZING...": "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse font-mono",
};

export function RecentAnalyses() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<AnalysisResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchHistory = () => {
    getAnalysisHistory(5).then((data: any) => setAnalyses(data)).catch(() => {});
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

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Stored Reports</CardTitle>
          <Link href="/history" className="text-xs text-primary hover:underline flex items-center gap-1">
            <History className="h-3 w-3" /> All Reports
          </Link>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No stored reports yet. <Link href="/analysis" className="text-primary hover:underline">Run your first analysis</Link>
            </p>
          ) : (
            analyses.map((a) => (
              <div
                key={a.task_id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.ticker}</span>
                    <Badge variant="outline" className={signalColors[a.signal] || ""}>
                      {a.signal}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Date: {a.trade_date} {a.duration_seconds ? `| ${Math.round(a.duration_seconds)}s` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => openPreview(a.task_id)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                  </Button>
                  <Link href={`/analysis/${a.task_id}`}>
                    <Button size="sm" variant="outline" className="h-8 px-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Full
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Quick Preview Modal */}
      <Dialog open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>{previewResult?.ticker || "Stored Analysis"} Report Preview</span>
              {selectedTaskId && (
                <Link href={`/analysis/${selectedTaskId}`}>
                  <Button size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Full Visualisation
                  </Button>
                </Link>
              )}
            </DialogTitle>
          </DialogHeader>

          {loadingPreview ? (
            <div className="py-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">Loading stored report...</p>
            </div>
          ) : previewResult ? (
            <div className="space-y-4 pt-2">
              <DecisionCard
                signal={previewResult.signal}
                ticker={previewResult.ticker}
                duration={previewResult.duration_seconds}
              />
              <ReportPanel reports={reports} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Unable to load stored report preview.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

