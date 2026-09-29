"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";

const BROKER_CONFIG: Record<string, { label: string; className: string }> = {
  kite: {
    label: "Zerodha Kite",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold",
  },
  zerodha: {
    label: "Zerodha Kite",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold",
  },
  upstox: {
    label: "Upstox",
    className: "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold",
  },
  kotak_neo: {
    label: "Kotak Neo",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold",
  },
  kotak: {
    label: "Kotak Neo",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold",
  },
  angel_one: {
    label: "Angel One",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold",
  },
  angel: {
    label: "Angel One",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold",
  },
  groww: {
    label: "Groww",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold",
  },
  fivepaisa: {
    label: "5paisa",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold",
  },
  "5paisa": {
    label: "5paisa",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold",
  },
  yfinance: {
    label: "Yahoo Finance",
    className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold",
  },
  manual: {
    label: "Manual Entry",
    className: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400 font-semibold",
  },
};

export function BrokerBadge({ brokerKey, size = "sm" }: { brokerKey: string; size?: "xs" | "sm" | "md" }) {
  const key = (brokerKey || "").toLowerCase();
  const conf = BROKER_CONFIG[key] || {
    label: brokerKey.toUpperCase(),
    className: "border-border text-foreground font-medium",
  };

  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.2" : size === "md" ? "text-xs px-2.5 py-1" : "text-[11px] px-2 py-0.5";

  return (
    <Badge variant="outline" className={`${conf.className} ${sizeClass} font-mono tracking-wide`}>
      {conf.label}
    </Badge>
  );
}
