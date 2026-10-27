"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CheckCircle,
  TrendingUp,
  MessageSquare,
  Newspaper,
  BarChart3,
  Lightbulb,
  Zap,
  ShieldCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Props {
  reports: Record<string, string>;
}

const reportTabs = [
  { key: "market_report", label: "Market Technicals", shortLabel: "Technicals", icon: TrendingUp },
  { key: "sentiment_report", label: "Social & Sentiment", shortLabel: "Social", icon: MessageSquare },
  { key: "news_report", label: "News & Macro", shortLabel: "News", icon: Newspaper },
  { key: "fundamentals_report", label: "Fundamentals", shortLabel: "Fundamentals", icon: BarChart3 },
  { key: "investment_plan", label: "Investment Strategy", shortLabel: "Strategy", icon: Lightbulb },
  { key: "trader_investment_plan", label: "Trading Plan", shortLabel: "Trading Plan", icon: Zap },
  { key: "final_trade_decision", label: "Final Verdict", shortLabel: "Verdict", icon: ShieldCheck },
];

export function ReportPanel({ reports }: Props) {
  const availableTabs = reportTabs.filter((t) => reports[t.key]);
  const latestTab = availableTabs[availableTabs.length - 1]?.key || "";

  // Controlled tab value — auto-advances as new reports arrive
  const [value, setValue] = useState(latestTab);

  useEffect(() => {
    if (!value || !availableTabs.some((t) => t.key === value)) {
      setValue(latestTab);
    } else if (latestTab && latestTab !== value) {
      setValue(latestTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTab]);

  if (availableTabs.length === 0) {
    return (
      <Card className="h-[220px] flex flex-col items-center justify-center border-dashed border-border/60 bg-muted/20">
        <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-muted-foreground">Reports will appear here as agents execute...</p>
      </Card>
    );
  }

  return (
    <Tabs value={value || latestTab} onValueChange={setValue} className="w-full space-y-2.5">
      {/* Agent Selector Toolbar */}
      <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin overscroll-x-contain">
        <TabsList className="w-auto min-w-full inline-flex flex-nowrap h-auto gap-1 sm:gap-1.5 bg-muted/50 p-1 sm:p-1.5 rounded-xl border border-border/50 justify-start">
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="text-xs px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 group"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80 group-data-[state=active]:opacity-100" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden font-semibold">{tab.shortLabel}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {availableTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <TabsContent key={tab.key} value={tab.key} className="mt-0 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Icon className="h-3.5 w-3.5 text-primary" /> {tab.label} Report
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle className="h-3 w-3" /> Ready
              </span>
            </div>

            <Card className="border border-border/50 bg-card/70 backdrop-blur-sm shadow-md">
              <CardContent className="p-3.5 sm:p-5 md:p-6">
                <ScrollArea className="h-[380px] sm:h-[480px] md:h-[550px] pr-2 sm:pr-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none space-y-3 leading-relaxed text-foreground/90 text-xs sm:text-sm overflow-x-auto break-words">
                    <ReactMarkdown>{reports[tab.key] || ""}</ReactMarkdown>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

