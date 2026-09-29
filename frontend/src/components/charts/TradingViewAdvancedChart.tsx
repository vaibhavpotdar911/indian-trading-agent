"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface TradingViewAdvancedChartProps {
  ticker: string;
  height?: number | string;
  className?: string;
}

export function TradingViewAdvancedChart({
  ticker,
  height = 780,
  className = "",
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const widgetIdRef = useRef<string>(`tv_chart_${Math.random().toString(36).substring(2, 9)}`);

  const cleanTicker = (ticker || "RELIANCE")
    .replace(/\.NS$/i, "")
    .replace(/\.BO$/i, "")
    .toUpperCase();
  const symbol = `BSE:${cleanTicker}`;

  const formattedHeight = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = resolvedTheme === "dark";
    const containerId = widgetIdRef.current;

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
    <div
      className={`w-full relative rounded-xl overflow-hidden border border-border bg-card shadow-sm transition-all duration-200 ${className}`}
      style={{ height: formattedHeight, minHeight: "600px" }}
    >
      <div
        ref={containerRef}
        className="tradingview-widget-container w-full h-full"
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}

