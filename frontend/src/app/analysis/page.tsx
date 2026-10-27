"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAnalysisStore } from "@/lib/store";
import { DecisionCard } from "@/components/analysis/DecisionCard";
import { AgentProgress } from "@/components/analysis/AgentProgress";
import { ReportPanel } from "@/components/analysis/ReportPanel";
import { DebateView } from "@/components/analysis/DebateView";
import { AnalysisOptions } from "@/components/analysis/AnalysisOptions";
import { StatsCard } from "@/components/analysis/StatsCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TickerSearch } from "@/components/TickerSearch";
import { HelpSection } from "@/components/HelpSection";
import { analysisHelp } from "@/lib/help-content";
import { Loader2, Play, RotateCcw, History, Calculator } from "lucide-react";
import { NextStep } from "@/components/NextStep";
import { PositionSizeCalculator } from "@/components/PositionSizeCalculator";
import { QuotaWidget } from "@/components/QuotaWidget";

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="p-6"><p className="text-muted-foreground">Loading...</p></div>}>
      <AnalysisPageInner />
    </Suspense>
  );
}

function AnalysisPageInner() {
  const searchParams = useSearchParams();
  const defaultTicker = searchParams.get("ticker") || "";
  const tradingMode = searchParams.get("mode") === "equity_long_term" ? "equity_long_term" : "equity_swing";

  // Global store — survives page navigation
  const analysis = useAnalysisStore();

  // Local input state (pre-filled from URL or last analysis ticker)
  const [tickerInput, setTickerInput] = useState(defaultTicker || analysis.ticker || "");
  const [tradeDateInput, setTradeDateInput] = useState(
    analysis.tradeDate || new Date().toISOString().split("T")[0]
  );

  // Analysis options
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>([
    "market", "social", "news", "fundamentals",
  ]);
  const [depth, setDepth] = useState(1);
  const [language, setLanguage] = useState("English");
  const [calcOpen, setCalcOpen] = useState(false);

  const handleRun = () => {
    if (!tickerInput.trim()) return;
    analysis.start(tickerInput.trim(), tradeDateInput, {
      analysts: selectedAnalysts,
      trading_mode: tradingMode,
      max_debate_rounds: depth,
      max_risk_discuss_rounds: depth,
      output_language: language,
    });
  };

  const displayTicker = analysis.ticker || tickerInput;

  return (
    <div className="p-3.5 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto w-full min-w-0 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Run Analysis</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Multi-agent AI analysis for Indian market stocks</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <QuotaWidget compact />
          <Button variant="outline" size="sm" onClick={() => setCalcOpen(true)} className="h-8 text-xs">
            <Calculator className="h-3.5 w-3.5 mr-1.5" />
            Position Calc
          </Button>
          {analysis.status !== "idle" && (
            <Button variant="outline" size="sm" onClick={analysis.reset} className="h-8 text-xs">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              New Analysis
            </Button>
          )}
        </div>
      </div>

      {/* Input Section */}
      <Card className="overflow-visible">
        <CardContent className="p-4 overflow-visible">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Ticker Symbol</label>
              <TickerSearch
                value={tickerInput}
                onChange={setTickerInput}
                placeholder="Search stock (e.g., Infosys, RELIANCE)"
                disabled={analysis.status === "running"}
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Analysis Date</label>
              <Input
                type="date"
                value={tradeDateInput}
                onChange={(e) => setTradeDateInput(e.target.value)}
                disabled={analysis.status === "running"}
              />
            </div>
            <Button
              onClick={handleRun}
              disabled={analysis.status === "running" || !tickerInput.trim()}
              className="h-10 w-full sm:w-auto font-semibold"
            >
              {analysis.status === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customization Options */}
      <AnalysisOptions
        analysts={selectedAnalysts}
        onAnalystsChange={setSelectedAnalysts}
        depth={depth}
        onDepthChange={setDepth}
        language={language}
        onLanguageChange={setLanguage}
        disabled={analysis.status === "running"}
      />

      {/* Error */}
      {analysis.error && (
        <Card className="border-red-500/40 bg-red-500/10 dark:bg-red-950/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-500 font-semibold text-sm">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              Analysis Stopped (LLM API Error)
            </div>
            <p className="text-sm font-mono text-red-400 break-words whitespace-pre-wrap">
              {analysis.error}
            </p>
            {analysis.error.includes("429") || analysis.error.includes("RESOURCE_EXHAUSTED") || analysis.error.toLowerCase().includes("quota") || analysis.error.includes("requests_free_tier") ? (
              <div className="text-xs text-muted-foreground pt-2 border-t border-red-500/20 space-y-1">
                <p className="font-semibold text-red-300">
                  💡 Rate Limit or Quota Cooldown:
                </p>
                <p>
                  The current LLM provider or router returned a rate limit or cooldown response.
                </p>
                <div className="pt-1 flex flex-col gap-1 font-sans">
                  <span>• <strong>Option 1 (Open-Source Router):</strong> Go to <a href="/settings" className="text-primary underline">Settings</a> and configure the <strong>Custom Router / Endpoint</strong> (e.g. FreeLLMAPI, OpenRouter, or vLLM) for high-throughput open-source models.</span>
                  <span>• <strong>Option 2 (Switch Model / Retry):</strong> Select an alternate model in Settings or wait ~30-60 seconds for the rate limit window to refresh.</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Live Heartbeat */}
      {analysis.status === "running" && analysis.heartbeat && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-xs text-muted-foreground">Live:</span>
              <span className="text-blue-700 font-mono text-xs truncate flex-1">{analysis.heartbeat}</span>
              {analysis.lastUpdateAt > 0 && (
                <span className="text-xs text-muted-foreground">
                  {Math.floor((Date.now() - analysis.lastUpdateAt) / 1000)}s ago
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision Card */}
      {analysis.signal && (
        <DecisionCard signal={analysis.signal} ticker={displayTicker} duration={analysis.duration} />
      )}

      {/* Stats Card */}
      {analysis.stats && analysis.status === "completed" && (
        <StatsCard stats={analysis.stats} duration={analysis.duration} />
      )}

      {/* Main Content */}
      {(analysis.status === "running" || analysis.status === "completed") && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 items-start">
          {/* Left: Agent Progress */}
          <div className="col-span-1 lg:col-span-1 min-w-0">
            <AgentProgress
              reports={analysis.reports}
              debates={analysis.debates}
              riskDebates={analysis.riskDebates}
              signal={analysis.signal}
              status={analysis.status}
            />
          </div>

          {/* Right: Reports */}
          <div className="col-span-1 lg:col-span-3 space-y-4 min-w-0">
            <ReportPanel reports={analysis.reports} />

            <DebateView
              bull={analysis.debates.bull}
              bear={analysis.debates.bear}
              riskAggressive={analysis.riskDebates.aggressive}
              riskConservative={analysis.riskDebates.conservative}
              riskNeutral={analysis.riskDebates.neutral}
            />
          </div>
        </div>
      )}

      {/* Help */}
      {/* Next Step */}
      {analysis.status === "completed" && analysis.signal && (
        <NextStep
          title="Track this trade"
          description="After you take the trade and it closes, log your actual P&L in My Trades to build your track record"
          href="/history"
          buttonText="My Trades"
          icon={History}
        />
      )}

      <HelpSection title="How to Use Analysis" items={analysisHelp} />

      <PositionSizeCalculator
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        ticker={displayTicker}
      />
    </div>
  );
}
