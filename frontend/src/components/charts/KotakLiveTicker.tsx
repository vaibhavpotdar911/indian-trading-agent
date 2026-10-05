"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getKotakFeedUrl } from "@/lib/api";

type Tick = { last_traded_price?: number; net_change_percent?: number; last_update_time?: number };

export function KotakLiveTicker({ ticker }: { ticker: string }) {
  const [tick, setTick] = useState<Tick | null>(null);
  const [status, setStatus] = useState("Connecting");
  useEffect(() => {
    if (!ticker) return;
    const socket = new WebSocket(getKotakFeedUrl(ticker));
    socket.onopen = () => setStatus("Live");
    socket.onmessage = (event) => {
      try {
        const value = JSON.parse(event.data);
        if (value.type === "scrip" || value.type === "scrip_lite") setTick(value);
      } catch { /* Ignore malformed broker frames. */ }
    };
    socket.onerror = () => setStatus("Unavailable");
    socket.onclose = () => setStatus("Disconnected");
    return () => socket.close();
  }, [ticker]);
  return <div className="flex items-center gap-2 text-sm"><Badge variant={status === "Live" ? "default" : "outline"}>{status}</Badge>{tick && <><span className="font-semibold">₹{tick.last_traded_price?.toFixed(2)}</span><span className={Number(tick.net_change_percent) >= 0 ? "text-emerald-600" : "text-red-600"}>{Number(tick.net_change_percent || 0).toFixed(2)}%</span></>}</div>;
}
