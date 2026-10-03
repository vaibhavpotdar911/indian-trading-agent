"use client";

import { useEffect, useState } from "react";
import { getQuotaStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, ShieldAlert, CheckCircle2, Activity } from "lucide-react";

interface QuotaData {
  provider: string;
  model: string;
  status: "ready" | "warning" | "cooldown";
  status_message: string;
  can_trigger: boolean;
  rpm_used: number;
  rpm_limit: number;
  tpm_used: number;
  tpm_limit: number;
  rpd_used: number;
  rpd_limit: number;
  cooldown_seconds: number;
}

export function QuotaWidget({ compact = false }: { compact?: boolean }) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [cooldownCountdown, setCooldownCountdown] = useState<number>(0);

  const fetchQuota = () => {
    getQuotaStatus()
      .then((data: any) => {
        setQuota(data);
        if (data.cooldown_seconds > 0) {
          setCooldownCountdown(data.cooldown_seconds);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchQuota();
    const interval = setInterval(fetchQuota, 8000);
    return () => clearInterval(interval);
  }, []);

  // Handle second-by-second countdown for cooldown
  useEffect(() => {
    if (cooldownCountdown <= 0) return;
    const timer = setInterval(() => {
      setCooldownCountdown((prev) => {
        if (prev <= 1) {
          fetchQuota();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownCountdown]);

  if (!quota) return null;

  const rpmPct = Math.min(100, Math.round((quota.rpm_used / quota.rpm_limit) * 100));
  const tpmPct = Math.min(100, Math.round((quota.tpm_used / quota.tpm_limit) * 100));

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs bg-muted/60 border rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-1.5 font-medium">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span>Gemini Quota:</span>
        </div>

        {cooldownCountdown > 0 ? (
          <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 animate-pulse">
            <Clock className="h-3 w-3 mr-1" /> Ready in {cooldownCountdown}s
          </Badge>
        ) : quota.status === "warning" ? (
          <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">
            <ShieldAlert className="h-3 w-3 mr-1" /> {quota.rpm_used}/{quota.rpm_limit} RPM
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Ready ({quota.rpm_used}/{quota.rpm_limit} RPM)
          </Badge>
        )}

        <span className="text-muted-foreground hidden md:inline">
          {((quota.tpm_used) / 1000).toFixed(0)}K / {(quota.tpm_limit / 1000).toFixed(0)}K TPM
        </span>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Gemini API Rate Limit & Quota</h3>
          </div>
          {cooldownCountdown > 0 ? (
            <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 animate-pulse">
              <Clock className="h-3 w-3 mr-1" /> Cooldown: {cooldownCountdown}s
            </Badge>
          ) : quota.status === "warning" ? (
            <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">
              High Traffic
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
              Ready to Analyze
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{quota.status_message}</p>

        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="p-2.5 rounded-lg bg-muted/50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Requests / Min</span>
              <span className="font-semibold">{quota.rpm_used} / {quota.rpm_limit}</span>
            </div>
            <div className="w-full bg-muted-foreground/20 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all ${rpmPct > 80 ? "bg-red-500" : rpmPct > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                style={{ width: `${rpmPct}%` }}
              />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-muted/50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tokens / Min</span>
              <span className="font-semibold">{(quota.tpm_used / 1000).toFixed(0)}K / {(quota.tpm_limit / 1000).toFixed(0)}K</span>
            </div>
            <div className="w-full bg-muted-foreground/20 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all ${tpmPct > 80 ? "bg-red-500" : tpmPct > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                style={{ width: `${tpmPct}%` }}
              />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-muted/50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Requests Today</span>
              <span className="font-semibold">{quota.rpd_used} / {quota.rpd_limit}</span>
            </div>
            <div className="w-full bg-muted-foreground/20 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, (quota.rpd_used / quota.rpd_limit) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
