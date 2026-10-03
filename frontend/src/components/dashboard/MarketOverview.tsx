"use client";

import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/api";
import type { MarketStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function MarketOverview() {
  const [data, setData] = useState<MarketStatus | null>(null);

  useEffect(() => {
    getMarketStatus().then((d: any) => setData(d)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="flex flex-col sm:flex-row gap-3 p-4 bg-card/60 rounded-xl border border-border/50 animate-pulse">
        <div className="h-8 w-28 bg-muted rounded-lg" />
        <div className="h-8 flex-1 bg-muted rounded-lg" />
      </div>
    );
  }

  const sessionColors: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pre_market: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    closing_hour: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    post_market: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    closed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };

  const formatChange = (change: number, pct: number) => {
    const color = change >= 0 ? "text-emerald-400" : "text-rose-400";
    const arrow = change >= 0 ? "+" : "";
    return <span className={`${color} font-medium text-xs sm:text-sm`}>{arrow}{change.toFixed(2)} ({arrow}{pct.toFixed(2)}%)</span>;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-card/80 backdrop-blur-md rounded-2xl border border-border/60 shadow-sm">
      <div className="flex items-center justify-between sm:justify-start gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:hidden">Market Status</span>
        <Badge variant="outline" className={`${sessionColors[data.session] || sessionColors.closed} text-xs px-2.5 py-0.5 font-bold tracking-tight`}>
          {data.session.replace("_", " ").toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:flex items-center gap-3 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-muted/30 sm:bg-transparent p-2 sm:p-0 rounded-xl">
          <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground">NIFTY 50</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono font-bold text-sm sm:text-base">{data.nifty.price.toLocaleString()}</span>
            {formatChange(data.nifty.change, data.nifty.change_percent)}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-muted/30 sm:bg-transparent p-2 sm:p-0 rounded-xl">
          <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground">BANK NIFTY</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono font-bold text-sm sm:text-base">{data.banknifty.price.toLocaleString()}</span>
            {formatChange(data.banknifty.change, data.banknifty.change_percent)}
          </div>
        </div>
      </div>
    </div>
  );
}

