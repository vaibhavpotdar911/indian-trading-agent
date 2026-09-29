"use client";

import { useEffect, useRef } from "react";
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
  exchange = "NSE",
  height = 780,
  className = "",
  onSwitchEngine,
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const cleanTicker = (ticker || "RELIANCE")
    .replace(/\.NS$/i, "")
    .replace(/\.BO$/i, "")
    .toUpperCase();
  const symbol = `${exchange}:${cleanTicker}`;
  const tvExternalUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;

  const formattedHeight = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    if (!containerRef.current) return;

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
  }, [symbol, resolvedTheme]);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Exchange Licensing Guidance Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold">⚠️ Exchange Licensing Note:</span>
          <span>
            TradingView restricts embedded data for certain {exchange} stock scrips. If the chart displays data unavailable:
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchEngine && (
            <button
              onClick={onSwitchEngine}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 font-medium transition-colors"
            >
              ⚡ Switch to Lightweight Candles
            </button>
          )}
          <a
            href={tvExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1 transition-colors"
          >
            Open {symbol} on TradingView.com ↗
          </a>
        </div>
      </div>

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

