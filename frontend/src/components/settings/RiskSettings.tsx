"use client";

import { useEffect, useState } from "react";
import { getRiskProfile, saveRiskProfile, getTradingLock, setTradingLock } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Mode = "equity_long_term" | "equity_swing";

export function RiskSettings() {
  const [mode, setMode] = useState<Mode>("equity_swing");
  const [profile, setProfile] = useState<any>(null);
  const [locked, setLocked] = useState(false);
  const [form, setForm] = useState({ capital: "500000", max_risk_per_trade_pct: "0.5", max_position_pct: "10", max_daily_loss_pct: "1", max_open_positions: "5" });

  const load = (selected: Mode) => {
    getRiskProfile(selected).then((data: any) => {
      setProfile(data);
      setForm({
        capital: String(data.capital),
        max_risk_per_trade_pct: String(data.max_risk_per_trade_pct),
        max_position_pct: String(data.max_position_pct),
        max_daily_loss_pct: String(data.max_daily_loss_pct),
        max_open_positions: String(data.max_open_positions),
      });
    }).catch(() => toast.error("Unable to load risk profile"));
  };

  useEffect(() => {
    load(mode);
    getTradingLock().then((data: any) => setLocked(Boolean(data.trading_locked))).catch(() => {});
  }, [mode]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try {
      const data: any = await saveRiskProfile({
        trading_mode: mode,
        capital: Number(form.capital),
        max_risk_per_trade_pct: Number(form.max_risk_per_trade_pct),
        max_position_pct: Number(form.max_position_pct),
        max_daily_loss_pct: Number(form.max_daily_loss_pct),
        max_open_positions: Number(form.max_open_positions),
      });
      setProfile(data);
      toast.success("Risk profile saved");
    } catch (error: any) {
      toast.error(error.message || "Unable to save risk profile");
    }
  };

  const toggleLock = async () => {
    try {
      const next = !locked;
      await setTradingLock(next);
      setLocked(next);
      toast.success(next ? "Trading locked" : "Trading unlocked");
    } catch (error: any) {
      toast.error(error.message || "Unable to update trading lock");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="text-lg">Risk Controls</CardTitle><CardDescription>These limits are evaluated before an enforced paper or live trade.</CardDescription></div>
          <Badge variant="outline">Live execution disabled</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "equity_long_term" ? "default" : "outline"} onClick={() => setMode("equity_long_term")}>Equity Long-term</Button>
          <Button size="sm" variant={mode === "equity_swing" ? "default" : "outline"} onClick={() => setMode("equity_swing")}>Equity Swing</Button>
          <Button size="sm" variant={locked ? "destructive" : "outline"} onClick={toggleLock}>{locked ? "Unlock trading" : "Lock trading"}</Button>
        </div>
        {profile && <p className="text-xs text-muted-foreground">{profile.label} · stop-loss {profile.require_stop_loss ? "required" : "optional"}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {([
            ["capital", "Capital (₹)"],
            ["max_risk_per_trade_pct", "Risk / trade (%)"],
            ["max_position_pct", "Max position (%)"],
            ["max_daily_loss_pct", "Daily loss (%)"],
            ["max_open_positions", "Open positions"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1"><Label htmlFor={`risk-${key}`}>{label}</Label><Input id={`risk-${key}`} type="number" min="0" step="any" value={form[key]} onChange={(event) => update(key, event.target.value)} /></div>
          ))}
        </div>
        <Button onClick={save}>Save Risk Profile</Button>
      </CardContent>
    </Card>
  );
}
