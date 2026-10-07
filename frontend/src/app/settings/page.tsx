"use client";

import { useEffect, useState } from "react";
import { getConfig } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LLMSettings } from "@/components/settings/LLMSettings";
import { QuotaWidget } from "@/components/QuotaWidget";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { statusColors } from "@/lib/status-colors";
import { RiskSettings } from "@/components/settings/RiskSettings";
import { DataProviderSettings } from "@/components/settings/DataProviderSettings";
import { Route, Building2, ExternalLink, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    getConfig().then((data: any) => setConfig(data)).catch(() => {});
  }, []);

  if (!config) {
    return <div className="p-6"><p className="text-muted-foreground">Loading settings...</p></div>;
  }

  const sections = [
    {
      title: "LLM Configuration",
      items: [
        { label: "Provider", value: config.llm_provider, badge: true },
        { label: "Deep Think Model", value: config.deep_think_llm },
        { label: "Quick Think Model", value: config.quick_think_llm },
      ],
    },
    {
      title: "Market Settings",
      items: [
        { label: "Market", value: config.market, badge: true },
        { label: "Exchange", value: config.default_exchange },
        { label: "Trading Style", value: config.trading_style, badge: true },
      ],
    },
    {
      title: "Analysis Settings",
      items: [
        { label: "Max Debate Rounds", value: config.max_debate_rounds },
        { label: "Max Risk Discussion Rounds", value: config.max_risk_discuss_rounds },
      ],
    },
    {
      title: "Safety & Risk",
      items: [
        { label: "Dry Run", value: config.dry_run ? "Enabled" : "Disabled", badge: true },
        { label: "Order Execution", value: config.order_execution_enabled ? "Enabled" : "Disabled", badge: true },
        { label: "Max Position Value", value: `₹${config.max_position_value?.toLocaleString()}` },
        { label: "Max Loss Per Trade", value: `₹${config.max_loss_per_trade?.toLocaleString()}` },
        { label: "Max Daily Loss", value: `₹${config.max_daily_loss?.toLocaleString()}` },
        { label: "Max Open Positions", value: config.max_open_positions },
      ],
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage API keys, LLM provider, and view current configuration</p>
      </div>

      <QuotaWidget />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Appearance</CardTitle>
          <CardDescription>Choose light, dark, or system theme. Preference is saved automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      {/* Unified Models & Keys — provider chips + inline keys + set-default */}
      <LLMSettings />

      <RiskSettings />
      <DataProviderSettings />

      {/* Multi-Broker Live Execution & Strategy Routing Overview */}
      <Card className="border border-primary/40 bg-card/70 backdrop-blur-md">
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Route className="h-5 w-5 text-primary" />
              Multi-Broker Live Execution Engine
            </CardTitle>
            <CardDescription className="text-xs">
              Automated routing of trade kinds across Zerodha Kite, Kotak Neo, and Upstox with live &amp; paper safety modes.
            </CardDescription>
          </div>
          <Link href="/simulation">
            <Button size="sm" className="text-xs flex items-center gap-1.5">
              Manage Routing &amp; Execute Trades
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <span className="font-bold text-xs text-amber-400 block mb-1">Zerodha Kite</span>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Default for <strong>Equity Long-term (CNC)</strong>. 0% delivery brokerage and reliable portfolio sync.
              </p>
              <span className="text-[10px] text-muted-foreground block font-mono">Product: CNC · Developers portal</span>
            </div>

            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5">
              <span className="font-bold text-xs text-rose-400 block mb-1">Kotak Neo</span>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Default for <strong>Intraday (MIS) &amp; NSE Futures (NRML)</strong>. Zero intraday brokerage plans and low derivatives latency.
              </p>
              <span className="text-[10px] text-muted-foreground block font-mono">Product: MIS / NRML · Trade API</span>
            </div>

            <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5">
              <span className="font-bold text-xs text-purple-400 block mb-1">Upstox API v2</span>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Default for <strong>Equity Swing Trading (CNC)</strong>. OAuth 2.0 authentication and rapid order confirmation.
              </p>
              <span className="text-[10px] text-muted-foreground block font-mono">Product: Delivery (D) · v2 API</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-border/40 bg-background/50 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                All live and simulated orders enforce strict <strong>5% risk per trade budgeting</strong>, pre-trade stop-loss validation, and Indian market hours (09:15 - 15:30 IST).
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">System Configuration</h2>
        <p className="text-xs text-muted-foreground">Runtime settings loaded from default_config.py</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  {item.badge ? (
                    <Badge variant="outline">{String(item.value)}</Badge>
                  ) : (
                    <span className="text-sm font-medium font-sans">{String(item.value)}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* API Cost Guide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">API Cost Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Each AI analysis runs ~15-17 LLM calls. The cost depends on which models you use.
            The current setup uses <strong>Haiku</strong> for fast tasks (13 agents) and <strong>Sonnet</strong> for decisions (2 agents).
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Model</th>
                  <th className="text-right py-2">Input Cost</th>
                  <th className="text-right py-2">Output Cost</th>
                  <th className="text-right py-2">Per Analysis</th>
                  <th className="text-right py-2">Speed</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">Claude Haiku 4.5 + Sonnet (current)</td>
                  <td className="text-right">$0.80/M + $3/M</td>
                  <td className="text-right">$4/M + $15/M</td>
                  <td className="text-right font-medium text-green-600">Rs.15-25</td>
                  <td className="text-right">1-3 min</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Claude Sonnet only</td>
                  <td className="text-right">$3/M</td>
                  <td className="text-right">$15/M</td>
                  <td className="text-right">Rs.70-100</td>
                  <td className="text-right">3-5 min</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">GPT-4o mini (cheapest)</td>
                  <td className="text-right">$0.15/M</td>
                  <td className="text-right">$0.60/M</td>
                  <td className="text-right font-medium text-green-600">Rs.4-8</td>
                  <td className="text-right">1-2 min</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">GPT-4o</td>
                  <td className="text-right">$2.50/M</td>
                  <td className="text-right">$10/M</td>
                  <td className="text-right">Rs.50-75</td>
                  <td className="text-right">3-5 min</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Gemini 2.0 Flash (cheapest)</td>
                  <td className="text-right">$0.10/M</td>
                  <td className="text-right">$0.40/M</td>
                  <td className="text-right font-medium text-green-600">Rs.3-5</td>
                  <td className="text-right">1-2 min</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">Ollama (local models)</td>
                  <td className="text-right">Free</td>
                  <td className="text-right">Free</td>
                  <td className="text-right font-medium text-green-600">Rs.0</td>
                  <td className="text-right">Varies (local GPU/CPU)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`p-3 rounded-lg ${statusColors.bullish}`}>
              <p className="text-xs font-medium">FREE Features (no API cost)</p>
              <ul className="text-xs mt-1 space-y-0.5 opacity-90">
                <li>Support/Resistance levels</li>
                <li>Pivot Points</li>
                <li>Monthly Seasonality</li>
                <li>Day-of-Week patterns</li>
                <li>Sector Rotation</li>
                <li>Seasonal Backtest</li>
                <li>Market Scanner (Gap/Volume/Breakout)</li>
                <li>Charts</li>
              </ul>
            </div>
            <div className={`p-3 rounded-lg ${statusColors.caution}`}>
              <p className="text-xs font-medium">Paid Features (API cost)</p>
              <ul className="text-xs mt-1 space-y-0.5 opacity-90">
                <li>AI Analysis (~Rs.15-25 each)</li>
                <li>AI Backtest (~Rs.15-25 per date)</li>
              </ul>
            </div>
            <div className={`p-3 rounded-lg ${statusColors.info}`}>
              <p className="text-xs font-medium">How to Switch Provider</p>
              <p className="text-xs mt-1 opacity-90">
                Edit <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">tradingagents/default_config.py</code> and change <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">llm_provider</code> to &quot;openai&quot; or &quot;google&quot;. Set the corresponding API key in <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">.env</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
