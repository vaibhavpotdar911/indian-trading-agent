"use client";

import Link from "next/link";
import { BriefcaseBusiness, ChartCandlestick, FlaskConical, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TradingMode = "equity_long_term" | "equity_swing";

const modeContent = {
  equity_long_term: {
    title: "Equity Long-term",
    subtitle: "Research quality businesses and build a disciplined equity portfolio.",
    icon: BriefcaseBusiness,
    accent: "text-blue-600",
    horizon: "Months to years",
    risk: "1% planned risk per position",
    signals: ["Revenue and earnings growth", "ROE, debt and cash flow", "Valuation and quality", "Portfolio concentration"],
  },
  equity_swing: {
    title: "Equity Swing",
    subtitle: "Find liquid technical setups held for days to weeks.",
    icon: TrendingUp,
    accent: "text-emerald-600",
    horizon: "5–15 trading days",
    risk: "0.5% planned risk per trade",
    signals: ["Trend and momentum", "Breakouts and volume", "Support and resistance", "ATR stop-loss and target"],
  },
} as const;

export function TradingModeWorkspace({ mode }: { mode: TradingMode }) {
  const content = modeContent[mode];
  const Icon = content.icon;
  const query = `?mode=${mode}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={`h-7 w-7 ${content.accent}`} />
            <h1 className="text-2xl font-bold">{content.title}</h1>
            <Badge variant="outline">Equity</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{content.subtitle}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/recommendations${query}`}><Button><ChartCandlestick className="h-4 w-4 mr-2" />Find setups</Button></Link>
          <Link href={`/analysis${query}`}><Button variant="outline"><Search className="h-4 w-4 mr-2" />Deep analysis</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Time horizon</CardTitle></CardHeader><CardContent className="font-semibold">{content.horizon}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Risk profile</CardTitle></CardHeader><CardContent className="font-semibold">{content.risk}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Safety status</CardTitle></CardHeader><CardContent className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" />Paper / research mode</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>What this workspace evaluates</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            {content.signals.map((signal) => <div key={signal} className="rounded-lg border p-3 text-sm">{signal}</div>)}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href={`/simulation${query}`}><Card className="h-full hover:border-primary transition-colors"><CardContent className="p-5"><FlaskConical className="h-5 w-5 mb-3 text-purple-600" /><p className="font-semibold">Paper trading</p><p className="text-xs text-muted-foreground mt-1">Track this mode separately before risking capital.</p></CardContent></Card></Link>
        <Link href={`/backtest${query}`}><Card className="h-full hover:border-primary transition-colors"><CardContent className="p-5"><ChartCandlestick className="h-5 w-5 mb-3 text-orange-600" /><p className="font-semibold">Validate the strategy</p><p className="text-xs text-muted-foreground mt-1">Review historical results, costs and drawdown.</p></CardContent></Card></Link>
        <Link href="/settings"><Card className="h-full hover:border-primary transition-colors"><CardContent className="p-5"><ShieldCheck className="h-5 w-5 mb-3 text-emerald-600" /><p className="font-semibold">Risk settings</p><p className="text-xs text-muted-foreground mt-1">Configure capital and safety limits before trading.</p></CardContent></Card></Link>
      </div>
    </div>
  );
}
