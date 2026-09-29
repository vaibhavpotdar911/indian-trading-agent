"use client";

import { create } from "zustand";
import { runAnalysis, connectAnalysisWS, getAnalysisResult } from "@/lib/api";
import type { WSEvent } from "@/lib/types";

interface AnalysisOptions {
  analysts?: string[];
  max_debate_rounds?: number;
  max_risk_discuss_rounds?: number;
  output_language?: string;
}

interface AnalysisStats {
  llm_calls: number;
  tool_calls: number;
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  cost_usd: number;
  cost_inr: number;
  per_model?: Record<string, { input: number; output: number }>;
}

interface AnalysisState {
  taskId: string | null;
  ticker: string;
  tradeDate: string;
  status: "idle" | "running" | "completed" | "error";
  reports: Record<string, string>;
  debates: { bull: string; bear: string };
  riskDebates: { aggressive: string; conservative: string; neutral: string };
  signal: string | null;
  error: string | null;
  duration: number | null;
  ws: WebSocket | null;
  pollInterval: any | null;
  heartbeat: string;
  lastUpdateAt: number;
  stats: AnalysisStats | null;

  start: (ticker: string, tradeDate: string, options?: AnalysisOptions) => Promise<void>;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  taskId: null,
  ticker: "",
  tradeDate: "",
  status: "idle",
  reports: {},
  debates: { bull: "", bear: "" },
  riskDebates: { aggressive: "", conservative: "", neutral: "" },
  signal: null,
  error: null,
  duration: null,
  ws: null,
  pollInterval: null,
  heartbeat: "",
  lastUpdateAt: 0,
  stats: null,

  start: async (ticker: string, tradeDate: string, options: AnalysisOptions = {}) => {
    // Close existing WS & timer if any
    const existingWs = get().ws;
    if (existingWs) {
      try { existingWs.close(); } catch {}
    }
    const existingTimer = get().pollInterval;
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    set({
      taskId: null,
      ticker,
      tradeDate,
      status: "running",
      reports: {},
      debates: { bull: "", bear: "" },
      riskDebates: { aggressive: "", conservative: "", neutral: "" },
      signal: null,
      error: null,
      duration: null,
      ws: null,
      pollInterval: null,
      heartbeat: "Initializing pipeline...",
      lastUpdateAt: Date.now(),
      stats: null,
    });

    try {
      const result: any = await runAnalysis({
        ticker,
        trade_date: tradeDate,
        analysts: options.analysts,
        max_debate_rounds: options.max_debate_rounds,
        max_risk_discuss_rounds: options.max_risk_discuss_rounds,
        output_language: options.output_language,
      });
      const taskId = result.task_id;

      const ws = connectAnalysisWS(taskId, (event: any) => {
        const state = get();
        switch (event.type) {
          case "heartbeat":
            set({ heartbeat: event.last_activity || `Processing chunk #${event.chunk}`, lastUpdateAt: Date.now() });
            break;
          case "report":
            set({ reports: { ...state.reports, [event.section!]: event.content! }, lastUpdateAt: Date.now() });
            break;
          case "debate":
            set({ debates: { ...state.debates, [event.side!]: event.content! }, lastUpdateAt: Date.now() });
            break;
          case "risk_debate":
            set({ riskDebates: { ...state.riskDebates, [event.side!]: event.content! }, lastUpdateAt: Date.now() });
            break;
          case "signal":
            set({ signal: event.decision!, lastUpdateAt: Date.now() });
            break;
          case "stats":
            set({
              stats: {
                llm_calls: event.llm_calls || 0,
                tool_calls: event.tool_calls || 0,
                tokens_in: event.tokens_in || 0,
                tokens_out: event.tokens_out || 0,
                total_tokens: event.total_tokens || 0,
                cost_usd: event.cost_usd || 0,
                cost_inr: event.cost_inr || 0,
                per_model: event.per_model,
              },
              lastUpdateAt: Date.now(),
            });
            break;
          case "complete":
            ws.close();
            if (get().pollInterval) clearInterval(get().pollInterval);
            set({
              status: "completed",
              duration: event.duration_seconds ?? null,
              ws: null,
              pollInterval: null,
              heartbeat: "Complete",
              stats: event.stats
                ? {
                    llm_calls: event.stats.llm_calls || 0,
                    tool_calls: event.stats.tool_calls || 0,
                    tokens_in: event.stats.tokens_in || 0,
                    tokens_out: event.stats.tokens_out || 0,
                    total_tokens: event.stats.total_tokens || 0,
                    cost_usd: event.stats.cost_usd || 0,
                    cost_inr: event.stats.cost_inr || 0,
                    per_model: event.stats.per_model,
                  }
                : get().stats,
            });
            break;
          case "error":
            ws.close();
            if (get().pollInterval) clearInterval(get().pollInterval);
            set({ status: "error", error: event.message ?? "Unknown error", ws: null, pollInterval: null });
            break;
        }
      });

      // Polling fallback every 3 seconds to catch status if WS drops
      const pollTimer = setInterval(async () => {
        if (get().status !== "running") {
          clearInterval(pollTimer);
          return;
        }
        try {
          const res: any = await getAnalysisResult(taskId);
          if (res.status === "error") {
            if (get().pollInterval) clearInterval(get().pollInterval);
            const currentWs = get().ws;
            if (currentWs) try { currentWs.close(); } catch {}
            set({ status: "error", error: res.error || "Analysis failed", ws: null, pollInterval: null });
          } else if (res.status === "completed" || res.signal || res.market_report) {
            if (get().pollInterval) clearInterval(get().pollInterval);
            const currentWs = get().ws;
            if (currentWs) try { currentWs.close(); } catch {}
            const state = get();
            set({
              status: "completed",
              signal: res.signal || state.signal,
              duration: res.duration_seconds ?? state.duration,
              reports: {
                ...state.reports,
                market_report: res.market_report || state.reports.market_report,
                sentiment_report: res.sentiment_report || state.reports.sentiment_report,
                news_report: res.news_report || state.reports.news_report,
                fundamentals_report: res.fundamentals_report || state.reports.fundamentals_report,
                investment_plan: res.investment_plan || state.reports.investment_plan,
                trader_investment_plan: res.trader_investment_plan || state.reports.trader_investment_plan,
                final_trade_decision: res.final_trade_decision || state.reports.final_trade_decision,
              },
              debates: {
                bull: res.bull_history || state.debates.bull,
                bear: res.bear_history || state.debates.bear,
              },
              riskDebates: {
                aggressive: res.risk_aggressive_history || state.riskDebates.aggressive,
                conservative: res.risk_conservative_history || state.riskDebates.conservative,
                neutral: res.risk_neutral_history || state.riskDebates.neutral,
              },
              stats: res.stats || state.stats,
              ws: null,
              pollInterval: null,
              heartbeat: "Complete",
            });
          }
        } catch {
          // Ignore network errors in polling fallback
        }
      }, 3000);

      set({ taskId, ws, pollInterval: pollTimer });
    } catch (e: any) {
      set({ status: "error", error: e.message });
    }
  },

  reset: () => {
    const ws = get().ws;
    if (ws) {
      try { ws.close(); } catch {}
    }
    const timer = get().pollInterval;
    if (timer) {
      clearInterval(timer);
    }
    set({
      taskId: null,
      ticker: "",
      tradeDate: "",
      status: "idle",
      reports: {},
      debates: { bull: "", bear: "" },
      riskDebates: { aggressive: "", conservative: "", neutral: "" },
      signal: null,
      error: null,
      duration: null,
      ws: null,
      pollInterval: null,
      heartbeat: "",
      lastUpdateAt: 0,
      stats: null,
    });
  },
}));

