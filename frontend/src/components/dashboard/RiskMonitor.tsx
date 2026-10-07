"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { getConcentrationSummary, getRiskSummary, getTradingLock } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function RiskMonitor() {
  const [summary, setSummary] = useState<any>(null);
  const [concentration, setConcentration] = useState<any>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRiskSummary(), getConcentrationSummary(), getTradingLock()])
      .then(([risk, sectors, lock]: any[]) => {
        setSummary(risk);
        setConcentration(sectors);
        setLocked(Boolean(lock.trading_locked));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading risk monitor...</CardContent></Card>;
  if (!summary) return null;

  const heatPct = summary.open_risk_pct || 0;
  const dailyPct = summary.daily_loss_used_pct || 0;
  const highRisk = locked || heatPct >= summary.profile.max_risk_per_trade_pct * 3 || dailyPct >= 80 || concentration?.risk_level === "HIGH";

  return (
    <Card className={highRisk ? "border-red-300 dark:border-red-800" : "border-emerald-300 dark:border-emerald-800"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />Portfolio Risk Monitor</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{summary.profile.label}</Badge>
            {locked ? <Badge variant="destructive"><LockKeyhole className="h-3 w-3 mr-1" />LOCKED</Badge> : <Badge variant="outline" className="text-emerald-600 border-emerald-300">Trading unlocked</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Open positions" value={`${summary.open_positions}/${summary.profile.max_open_positions}`} />
          <Metric label="Open risk heat" value={`₹${Number(summary.open_risk || 0).toLocaleString()}`} detail={`${heatPct}% of capital`} />
          <Metric label="Realized today" value={`₹${Number(summary.realized_today || 0).toLocaleString()}`} detail={`${dailyPct}% of loss limit`} negative={summary.realized_today < 0} />
          <Metric label="Broker exposure" value={`₹${Number(summary.broker_exposure || 0).toLocaleString()}`} detail={`${summary.broker_positions || 0} synced positions · ${concentration?.risk_level || "UNKNOWN"} sector`} negative={concentration?.risk_level === "HIGH"} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1">{highRisk ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />} {highRisk ? "Review risk before opening new trades." : "No immediate risk threshold breached."}</span>
          <Link href="/settings"><Button variant="outline" size="sm">Manage risk controls</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail, negative }: { label: string; value: string; detail?: string; negative?: boolean }) {
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`font-semibold mt-1 ${negative ? "text-red-600" : ""}`}>{value}</p>{detail && <p className="text-[11px] text-muted-foreground mt-0.5">{detail}</p>}</div>;
}
