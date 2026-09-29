"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

interface TradingViewAdvancedChartProps {
  ticker: string;
  exchange?: "NSE" | "BSE";
  height?: number | string;
  className?: string;
  onSwitchEngine?: () => void;
}

export function TradingViewAdvancedChart({
  ticker,
  exchange: initialExchange = "NSE",
  height = 780,
  className = "",
  onSwitchEngine,
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [exchange, setExchange] = useState<"NSE" | "BSE">(initialExchange);
  const widgetIdRef = useRef<string>(`tv_chart_${Math.random().toString(36).substring(2, 9)}`);

  const cleanTicker = (ticker || "RELIANCE")
    .replace(/\.NS$/i, "")
    .replace(/\.BO$/i, "")
    .toUpperCase();
  const symbol = `${exchange}:${cleanTicker}`;

  const formattedHeight = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = resolvedTheme === "dark";
    const containerId = widgetIdRef.current;

    // Clear previous widget
    containerRef.current.innerHTML = `<div id="${containerId}" style="height: 100%; width: 100%;"></div>`;

    const initWidget = () => {
      if (typeof (window as any).TradingView !== "undefined" && document.getElementById(containerId)) {
        try {
          new (window as any).TradingView.widget({
            autosize: true,
            symbol: symbol,
            interval: "D",
            timezone: "Asia/Kolkata",
            theme: isDark ? "dark" : "light",
            style: "1",
            locale: "en",
            toolbar_bg: isDark ? "#1e222d" : "#f1f3f6",
            enable_publishing: false,
            allow_symbol_change: true,
            container_id: containerId,
            hide_side_toolbar: false,
            hide_top_toolbar: false,
            save_image: true,
            details: true,
            hotlist: true,
            calendar: true,
            studies: [
              "RSI@tv-basicstudies",
              "MACD@tv-basicstudies",
              "MASimple@tv-basicstudies",
            ],
          });
        } catch (e) {
          console.error("Failed to initialize TradingView widget:", e);
        }
      }
    };

    if (typeof (window as any).TradingView !== "undefined") {
      initWidget();
    } else {
      const existingScript = document.getElementById("tradingview-tv-js");
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "tradingview-tv-js";
        script.src = "https://s3.tradingview.com/tv.js";
        script.type = "text/javascript";
        script.async = true;
        script.onload = initWidget;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener("load", initWidget);
      }
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, resolvedTheme]);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Top Toolbar inside integration */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border bg-card shadow-sm text-xs">
        <div className="flex items-center gap-2 font-medium">
          <span className="text-muted-foreground">Exchange Feed:</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
            <button
              onClick={() => setExchange("NSE")}
              className={`px-2.5 py-0.5 rounded font-semibold transition-colors ${
                exchange === "NSE"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              NSE ({cleanTicker})
            </button>
            <button
              onClick={() => setExchange("BSE")}
              className={`px-2.5 py-0.5 rounded font-semibold transition-colors ${
                exchange === "BSE"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              BSE ({cleanTicker})
            </button>
          </div>
        </div>

        {onSwitchEngine && (
          <button
            onClick={onSwitchEngine}
            className="px-2.5 py-1 rounded-lg border border-border bg-muted/50 hover:bg-muted font-medium transition-colors text-muted-foreground hover:text-foreground"
          >
            Switch to Lightweight Engine
          </button>
        )}
      </div>

      {/* Full Embedded TradingView Container */}
      <div
        className="w-full relative rounded-xl overflow-hidden border border-border bg-card shadow-sm transition-all duration-200"
        style={{ height: formattedHeight, minHeight: "600px" }}
      >
        <div
          ref={containerRef}
          className="tradingview-widget-container w-full h-full"
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </div>
  );
}

