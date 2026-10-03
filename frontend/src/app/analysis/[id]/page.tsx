"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAnalysisResult } from "@/lib/api";
import { DecisionCard } from "@/components/analysis/DecisionCard";
import { ReportPanel } from "@/components/analysis/ReportPanel";
import { DebateView } from "@/components/analysis/DebateView";
import { StatsCard } from "@/components/analysis/StatsCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/types";

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

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
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{result.ticker} Stored Report</h1>
            <p className="text-sm text-muted-foreground">
              Date: {result.trade_date} | Task ID: <span className="font-mono text-xs">{result.task_id}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/">
            <Button variant="outline" size="sm">
              <LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard
            </Button>
          </Link>
          <Link href="/history">
            <Button variant="outline" size="sm">
              <History className="h-4 w-4 mr-1" /> Trade History
            </Button>
          </Link>
        </div>
      </div>

      <DecisionCard signal={result.signal} ticker={result.ticker} duration={result.duration_seconds} />

      {result.stats && (
        <StatsCard stats={result.stats} duration={result.duration_seconds} />
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

