"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import type { CandlestickData, HistogramData, IChartApi } from "lightweight-charts";
import { getChartData } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpSection } from "@/components/HelpSection";
import { chartsHelp } from "@/lib/help-content";
import { TradingViewAdvancedChart } from "@/components/charts/TradingViewAdvancedChart";
import { LineChart, BarChart2 } from "lucide-react";

const periods = ["1mo", "3mo", "6mo", "1y", "2y"];

type ChartEngine = "tradingview" | "lightweight";

type ChartPoint = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ChartResponse = { data?: unknown };

function isChartPoint(value: unknown): value is ChartPoint {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.time === "string" &&
    ["open", "high", "low", "close", "volume"].every(
      (field) => typeof row[field] === "number" && Number.isFinite(row[field])
    )
  );
}

function getChartOptions(isDark: boolean) {
  const textColor = isDark ? "#e5e5e5" : "#333";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  return { textColor, gridColor, borderColor };
}

export default function ChartsPage() {
  const { resolvedTheme } = useTheme();
  const [engine, setEngine] = useState<ChartEngine>("tradingview");
  const [exchange, setExchange] = useState<"NSE" | "BSE">("NSE");
  const [chartHeight, setChartHeight] = useState<number | string>(780);

  const [ticker, setTicker] = useState("RELIANCE");
  const [submittedTicker, setSubmittedTicker] = useState("RELIANCE");
  const [period, setPeriod] = useState("3mo");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);

  // Load user engine preference from localStorage
  useEffect(() => {
    const savedEngine = localStorage.getItem("chart_engine_preference") as ChartEngine | null;
    if (savedEngine === "lightweight" || savedEngine === "tradingview") {
      setEngine(savedEngine);
    }
  }, []);

  const switchEngine = (newEngine: ChartEngine) => {
    setEngine(newEngine);
    localStorage.setItem("chart_engine_preference", newEngine);
  };

  const loadChart = useCallback(
    async (symbol?: string) => {
      const t = symbol || ticker;
      if (!t.trim()) return;
      const clean = t.trim().toUpperCase();
      setSubmittedTicker(clean);

      if (engine === "lightweight") {
        setLoading(true);
        try {
          const result = (await getChartData(clean, period)) as ChartResponse;
          setData(Array.isArray(result.data) ? result.data.filter(isChartPoint) : []);
        } catch {
          setData([]);
        } finally {
          setLoading(false);
        }
      }
    },
    [ticker, period, engine]
  );

  useEffect(() => {
    if (engine === "lightweight") {
      loadChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, engine]);

  useEffect(() => {
    if (engine !== "lightweight" || !chartRef.current || data.length === 0) return;

    let disposed = false;

    if (chartInstance.current) {
      try {
        chartInstance.current.remove();
      } catch {}
      chartInstance.current = null;
    }

    let chart: IChartApi | null = null;

    (async () => {
      const lc = await import("lightweight-charts");

      if (disposed || !chartRef.current) return;

      const isDark = resolvedTheme === "dark";
      const { textColor, gridColor, borderColor } = getChartOptions(isDark);

      chart = lc.createChart(chartRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor,
        },
        grid: {
          vertLines: { color: gridColor },
          horzLines: { color: gridColor },
        },
        width: chartRef.current.clientWidth,
        height: 550,
        crosshair: { mode: 0 },
        timeScale: { borderColor },
        rightPriceScale: { borderColor },
      });

      if (disposed) {
        try {
          chart.remove();
        } catch {}
        return;
      }

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        wickUpColor: "#22c55e",
      });

      candleSeries.setData(
        data.map((d): CandlestickData<string> => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );

      const volumeSeries = chart.addSeries(lc.HistogramSeries, {
        color: "#3b82f680",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeries.setData(
        data.map((d): HistogramData<string> => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? "#22c55e40" : "#ef444440",
        }))
      );

      chart.timeScale().fitContent();
      chartInstance.current = chart;
    })();

    const handleResize = () => {
      if (chartInstance.current && chartRef.current) {
        try {
          chartInstance.current.applyOptions({ width: chartRef.current.clientWidth });
        } catch {}
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      if (chartInstance.current) {
        try {
          chartInstance.current.remove();
        } catch {}
        chartInstance.current = null;
      }
      if (chart && chart !== chartInstance.current) {
        try {
          chart.remove();
        } catch {}
      }
    };
  }, [data, resolvedTheme, engine]);

  const handleSearchSubmit = () => {
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;
    setSubmittedTicker(clean);
    if (engine === "lightweight") {
      loadChart(clean);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header + Engine Toggle */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Charts
            <Badge variant="outline" className="text-xs uppercase font-mono">
              {engine === "tradingview" ? "TradingView Full" : "Lightweight"}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Interactive charting for NSE/BSE stocks with indicator tools and multi-timeframes
          </p>
        </div>

        {/* Engine Toggle Buttons */}
        <div className="inline-flex items-center p-1 rounded-xl border border-border bg-muted/50">
          <button
            onClick={() => switchEngine("tradingview")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              engine === "tradingview"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5 text-blue-500" />
            TradingView Full
          </button>
          <button
            onClick={() => switchEngine("lightweight")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              engine === "lightweight"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChart className="h-3.5 w-3.5 text-green-500" />
            Lightweight Charts
          </button>
        </div>
      </div>

      {/* Ticker Search Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-card p-3.5 rounded-xl border border-border shadow-sm">
        <div className="flex gap-2 items-center flex-1 min-w-[280px] max-w-md">
          <Input
            placeholder="Enter ticker (e.g., RELIANCE, TMPV, TCS)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            className="font-sans"
          />
          <Button onClick={handleSearchSubmit} disabled={loading && engine === "lightweight"}>
            {loading && engine === "lightweight" ? "Loading..." : "Load"}
          </Button>
        </div>

        {/* Engine-specific Controls */}
        {engine === "tradingview" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Exchange:</span>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-xs">
                <button
                  onClick={() => setExchange("NSE")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    exchange === "NSE" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  NSE
                </button>
                <button
                  onClick={() => setExchange("BSE")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    exchange === "BSE" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  BSE
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Height:</span>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-xs">
                <button
                  onClick={() => setChartHeight(780)}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    chartHeight === 780 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setChartHeight(920)}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    chartHeight === 920 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tall
                </button>
                <button
                  onClick={() => setChartHeight("calc(100vh - 200px)")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    chartHeight === "calc(100vh - 200px)" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Full Viewport
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-1 items-center">
            <span className="text-xs text-muted-foreground mr-1">Period:</span>
            {periods.map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-8 text-xs"
              >
                {p}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Main Chart Container */}
      {engine === "tradingview" ? (
        <TradingViewAdvancedChart
          ticker={submittedTicker}
          exchange={exchange}
          height={chartHeight}
          onSwitchEngine={() => switchEngine("lightweight")}
        />
      ) : (
        <Card>
          <CardContent className="p-4">
            <div
              ref={chartRef}
              className="w-full"
              style={{ minHeight: 550, display: data.length > 0 ? "block" : "none" }}
            />
            {data.length === 0 && (
              <div className="h-[550px] flex items-center justify-center text-muted-foreground">
                {loading ? "Loading chart data..." : "Enter a ticker and click Load to view chart"}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* License & Attribution */}
      <p className="text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {engine === "tradingview"
            ? "Full TradingView Advanced Real-Time Chart Widget with technical indicators, drawing tools & multi-timeframe controls."
            : "Lightweight Charts powered by TradingView Lightweight Charts™."}
        </span>
        <a
          href={engine === "tradingview" ? "https://www.tradingview.com" : "https://www.tradingview.com/lightweight-charts/"}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          TradingView™
        </a>
      </p>

      {/* Help */}
      <HelpSection title="How to Read Charts" items={chartsHelp} />
    </div>
  );
}
