"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Props {
  reports: Record<string, string>;
}

const reportTabs = [
  { key: "market_report", label: "Market Technicals" },
  { key: "sentiment_report", label: "Social & Sentiment" },
  { key: "news_report", label: "News & Macro" },
  { key: "fundamentals_report", label: "Fundamentals" },
  { key: "investment_plan", label: "Investment Strategy" },
  { key: "trader_investment_plan", label: "Trading Plan" },
  { key: "final_trade_decision", label: "Final Verdict" },
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
    <Tabs value={value || latestTab} onValueChange={setValue} className="w-full">
      <TabsList className="w-full flex flex-wrap h-auto gap-1.5 bg-muted/40 p-1.5 rounded-xl border border-border/40">
        {availableTabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="text-xs px-3 py-1.5 rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm font-medium transition-all flex items-center gap-1.5"
          >
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {availableTabs.map((tab) => (
        <TabsContent key={tab.key} value={tab.key} className="mt-3">
          <Card className="border border-border/50 bg-card/70 backdrop-blur-sm shadow-md">
            <CardContent className="p-6">
              <ScrollArea className="h-[550px] pr-4">
                <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 leading-relaxed text-foreground/90 text-sm">
                  <ReactMarkdown>{reports[tab.key] || ""}</ReactMarkdown>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}

