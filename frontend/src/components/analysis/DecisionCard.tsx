"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

const signalConfig: Record<string, { color: string; bg: string; icon: any }> = {
  BUY: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: TrendingUp },
  "STRONG BUY": { color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: TrendingUp },
  OVERWEIGHT: { color: "text-green-300", bg: "bg-green-500/10 border-green-500/20", icon: TrendingUp },
  HOLD: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: Minus },
  SELL: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: TrendingDown },
  SHORT: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: AlertTriangle },
  UNDERWEIGHT: { color: "text-red-300", bg: "bg-red-500/10 border-red-500/20", icon: TrendingDown },
};

interface Props {
  signal: string | null;
  ticker: string;
  duration?: number | null;
}

export function DecisionCard({ signal, ticker, duration }: Props) {
  if (!signal) return null;

  const config = signalConfig[signal] || signalConfig.HOLD;
  const Icon = config.icon;

  return (
    <Card className={`${config.bg} border-2 shadow-sm`}>
      <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`p-2.5 sm:p-3 rounded-full ${config.bg} shrink-0`}>
            <Icon className={`h-6 w-6 sm:h-8 sm:w-8 ${config.color}`} />
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Final Decision for {ticker}</p>
            <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${config.color}`}>{signal}</p>
          </div>
        </div>
        {duration && (
          <div className="text-left sm:text-right w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/20 flex sm:block justify-between items-center">
            <p className="text-[11px] sm:text-xs text-muted-foreground">Analysis Duration</p>
            <p className="text-sm sm:text-lg font-sans font-medium">{Math.round(duration)}s</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
