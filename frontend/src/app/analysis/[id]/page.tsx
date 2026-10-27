"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAnalysisResult } from "@/lib/api";
import { DecisionCard } from "@/components/analysis/DecisionCard";
import { ReportPanel } from "@/components/analysis/ReportPanel";
import { DebateView } from "@/components/analysis/DebateView";
import { StatsCard } from "@/components/analysis/StatsCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History, LayoutDashboard, Activity } from "lucide-react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/types";

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    if (params.id) {
      getAnalysisResult(params.id as string)
        .then((data: any) => setResult(data))
        .catch(() => setResult(null))
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!result || !result.signal) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="text-muted-foreground">Analysis report not found or still in progress.</p>
      </div>
    );
  }

  const reports: Record<string, string> = {};
  if (result.market_report) reports.market_report = result.market_report;
  if (result.sentiment_report) reports.sentiment_report = result.sentiment_report;
  if (result.news_report) reports.news_report = result.news_report;
  if (result.fundamentals_report) reports.fundamentals_report = result.fundamentals_report;
  if (result.investment_plan) reports.investment_plan = result.investment_plan;
  if (result.trader_investment_plan) reports.trader_investment_plan = result.trader_investment_plan;
  if (result.final_trade_decision) reports.final_trade_decision = result.final_trade_decision;

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="h-8 px-2.5 shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">{result.ticker} Stored Report</h1>
            <p className="text-xs text-muted-foreground truncate">
              Date: {result.trade_date} <span className="opacity-40">•</span> Task: <span className="font-mono text-[11px]">{result.task_id?.slice(0, 8)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-end">
          {result.stats && (
            <Button
              variant={showStats ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowStats((s) => !s)}
              className={`text-xs h-8 font-medium transition-all ${
                showStats ? "bg-primary/10 text-primary border-primary/30" : ""
              }`}
            >
              <Activity className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {showStats ? "Hide Stats" : "Analysis Stats"}
            </Button>
          )}
          <Link href="/">
            <Button variant="outline" size="sm" className="text-xs h-8">
              <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" /> Dashboard
            </Button>
          </Link>
          <Link href="/history">
            <Button variant="outline" size="sm" className="text-xs h-8">
              <History className="h-3.5 w-3.5 mr-1.5" /> History
            </Button>
          </Link>
        </div>
      </div>

      <DecisionCard signal={result.signal} ticker={result.ticker} duration={result.duration_seconds} />

      {/* Analysis stats: hidden by default, shown when the top button is pressed */}
      {showStats && result.stats && (
        <div className="animate-in fade-in-50 duration-200">
          <StatsCard stats={result.stats} duration={result.duration_seconds} />
        </div>
      )}

      <ReportPanel reports={reports} />

      <DebateView
        bull={result.bull_history || ""}
        bear={result.bear_history || ""}
        riskAggressive={result.risk_aggressive_history}
        riskConservative={result.risk_conservative_history}
        riskNeutral={result.risk_neutral_history}
      />
    </div>
  );
}

