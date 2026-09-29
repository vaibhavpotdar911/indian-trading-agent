"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface TradingViewAdvancedChartProps {
  ticker: string;
  exchange?: "NSE" | "BSE";
  height?: number | string;
  className?: string;
}

export function TradingViewAdvancedChart({
  ticker,
  exchange = "NSE",
  height = 780,
  className = "",
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const formattedHeight = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean ticker for TradingView symbol format (e.g. NSE:RELIANCE, NSE:TMPV)
    const cleanTicker = (ticker || "RELIANCE")
      .replace(/\.NS$/i, "")
      .replace(/\.BO$/i, "")
      .toUpperCase();
    const symbol = `${exchange}:${cleanTicker}`;
    const isDark = resolvedTheme === "dark";

    // Clear previous widget script/container
    containerRef.current.innerHTML = "";

    const widgetWrapper = document.createElement("div");
    widgetWrapper.className = "tradingview-widget-container__widget";
    widgetWrapper.style.height = "100%";
    widgetWrapper.style.width = "100%";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    const widgetOptions = {
      autosize: true,
      symbol: symbol,
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: true,
      support_host: "https://www.tradingview.com",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      studies: ["STD;RSI", "STD;MACD"],
    };

    script.innerHTML = JSON.stringify(widgetOptions);

    containerRef.current.appendChild(widgetWrapper);
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [ticker, exchange, resolvedTheme]);

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

