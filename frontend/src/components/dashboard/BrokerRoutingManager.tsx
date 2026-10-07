"use client";

import { useEffect, useState } from "react";
import {
  getExecutionRoutingRules,
  updateExecutionRoutingRules,
  getExecutionConfig,
  updateExecutionConfig,
  getExecutionBrokersStatus,
  placeExecutionOrder,
  getExecutionOrders,
} from "@/lib/api";
import { ConfigureBrokerModal } from "@/components/brokers/ConfigureBrokerModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ShieldAlert,
  Zap,
  Route,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Building2,
  Clock,
  BookOpen,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ShieldCheck,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

const STRATEGY_LABELS: Record<string, { label: string; desc: string; defaultBroker: string }> = {
  equity_long_term: {
    label: "Equity Long-term",
    desc: "Delivery investing, portfolio compounding (CNC)",
    defaultBroker: "kite",
  },
  equity_swing: {
    label: "Equity Swing",
    desc: "Multi-day technical momentum setups (CNC)",
    defaultBroker: "upstox",
  },
  intraday: {
    label: "Intraday Trading",
    desc: "Same-day square-off trades (MIS)",
    defaultBroker: "kotak_neo",
  },
  futures: {
    label: "NSE Futures",
    desc: "Stock & Index derivatives with long/short capability (NRML)",
    defaultBroker: "kotak_neo",
  },
  options: {
    label: "Options",
    desc: "Defined-risk derivatives (NRML)",
    defaultBroker: "kotak_neo",
  },
};

const BROKER_METAS: Record<string, { name: string; color: string; badgeClass: string; portalUrl: string }> = {
  kite: {
    name: "Zerodha Kite",
    color: "text-amber-400",
    badgeClass: "border-amber-500/40 text-amber-400 bg-amber-500/10",
    portalUrl: "https://developers.kite.trade",
  },
  kotak_neo: {
    name: "Kotak Neo",
    color: "text-rose-400",
    badgeClass: "border-rose-500/40 text-rose-400 bg-rose-500/10",
    portalUrl: "https://neo.kotaksecurities.com",
  },
  upstox: {
    name: "Upstox",
    color: "text-purple-400",
    badgeClass: "border-purple-500/40 text-purple-400 bg-purple-500/10",
    portalUrl: "https://account.upstox.com/developer/apps",
  },
};

export function BrokerRoutingManager() {
  const [routingRules, setRoutingRules] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<{ mode: string; is_live: boolean } | null>(null);
  const [brokersStatus, setBrokersStatus] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Instructions State
  const [showInstructions, setShowInstructions] = useState(true);
  const [activeGuideTab, setActiveGuideTab] = useState<"overview" | "kite" | "kotak" | "upstox" | "safety">("overview");

  // Configure Broker Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configBrokerKey, setConfigBrokerKey] = useState("kite");

  // Manual Order Form State
  const [orderTicker, setOrderTicker] = useState("RELIANCE");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderQty, setOrderQty] = useState(1);
  const [orderMode, setOrderMode] = useState("equity_swing");
  const [orderBroker, setOrderBroker] = useState(""); // empty = auto-route
  const [orderType, setOrderType] = useState("MARKET");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderProduct, setOrderProduct] = useState("");

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRules, rConfig, rBrokers, rOrders] = await Promise.all([
        getExecutionRoutingRules(),
        getExecutionConfig(),
        getExecutionBrokersStatus(),
        getExecutionOrders(25),
      ]);
      setRoutingRules(rRules.rules || {});
      setConfig(rConfig);
      setBrokersStatus(rBrokers);
      setOrders(rOrders.orders || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleRoutingChange = (strategy: string, targetBroker: string) => {
    setRoutingRules((prev) => ({
      ...prev,
      [strategy]: targetBroker,
    }));
  };

  const handleSaveRouting = async () => {
    setSavingRouting(true);
    try {
      const res = await updateExecutionRoutingRules(routingRules);
      setRoutingRules(res.rules);
      toast.success("Strategy routing rules updated successfully!");
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to update routing rules");
    } finally {
      setSavingRouting(false);
    }
  };

  const handleToggleExecutionMode = async () => {
    if (!config) return;
    const nextMode = config.mode === "live" ? "paper" : "live";
    try {
      const res = await updateExecutionConfig(nextMode as "live" | "paper");
      setConfig(res);
      toast.success(
        res.mode === "live"
          ? "LIVE Execution Mode ENABLED! Orders will dispatch to connected brokers."
          : "Switched to Paper Execution Simulation."
      );
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle execution mode");
    }
  };

  const handleOpenConfigModal = (brokerKey: string) => {
    setConfigBrokerKey(brokerKey);
    setIsConfigModalOpen(true);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderTicker.trim() || orderQty <= 0) {
      toast.error("Please enter a valid ticker and quantity");
      return;
    }

    setPlacingOrder(true);
    try {
      const res = await placeExecutionOrder({
        ticker: orderTicker.trim().toUpperCase(),
        direction: orderSide,
        quantity: orderQty,
        trading_mode: orderMode,
        price: orderPrice ? parseFloat(orderPrice) : undefined,
        order_type: orderType,
        product: orderProduct || undefined,
        requested_broker: orderBroker || undefined,
      });

      if (res.ok) {
        toast.success(
          `Order ${res.order_id} placed on ${BROKER_METAS[res.broker]?.name || res.broker}! Status: ${res.status}`
        );
        loadAll();
      } else {
        toast.error(`Order failed: ${res.message}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to place order");
    } finally {
      setPlacingOrder(false);
    }
  };

  const isLive = config?.is_live;

  return (
    <div className="space-y-6">
      {/* Top Banner: Mode & Global Status */}
      <Card className="border border-border/60 bg-card/70 backdrop-blur-md shadow-lg">
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Route className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg font-bold">Multi-Broker Live Execution Engine</CardTitle>
              <Badge
                variant="outline"
                className={
                  isLive
                    ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10 font-bold"
                    : "border-amber-500/50 text-amber-400 bg-amber-500/10 font-bold"
                }
              >
                {isLive ? "🟢 LIVE BROKER ORDERS ACTIVE" : "🧪 PAPER SIMULATION (DRY-RUN)"}
              </Badge>
            </div>
            <CardDescription className="text-xs mt-1">
              Route long-term trades to Zerodha Kite, swing trades to Upstox, and intraday / futures trades to Kotak Neo — or override broker per trade at any time.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInstructions((prev) => !prev)}
              className="text-xs flex items-center gap-1 border-primary/30 text-primary"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {showInstructions ? "Hide Setup Guide" : "Show Setup Guide"}
              {showInstructions ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
            </Button>

            <Button
              size="sm"
              variant={isLive ? "destructive" : "outline"}
              onClick={handleToggleExecutionMode}
              className="text-xs font-semibold"
            >
              {isLive ? "Switch to Paper Mode" : "Enable Live Execution"}
            </Button>

            <Button size="sm" variant="ghost" onClick={loadAll} disabled={loading} className="text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>

        {/* Broker Connectivity Status Cards */}
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {["kite", "kotak_neo", "upstox"].map((bKey) => {
              const meta = BROKER_METAS[bKey];
              const bData = brokersStatus?.brokers?.[bKey];
              const isConfigured = bData?.configured;
              const isConnectedToday = bData?.connected_today;
              const assigned = bData?.assigned_strategies || [];

              return (
                <div key={bKey} className="p-3.5 rounded-lg border border-border/50 bg-background/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm flex items-center gap-1.5">
                        <Building2 className={`h-4 w-4 ${meta.color}`} />
                        {meta.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={`text-[10px] ${meta.badgeClass}`}>
                          {isConnectedToday ? "Connected Today" : isConfigured ? "Configured" : "Not Linked"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {isConfigured
                        ? isConnectedToday
                          ? "Active session ready for real execution."
                          : "Credentials saved. Login session required for live dispatch."
                        : "Credentials missing. Click below to configure."}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5 uppercase tracking-wider">
                        Assigned Trades:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {assigned.length > 0 ? (
                          assigned.map((st: string) => (
                            <Badge key={st} variant="secondary" className="text-[10px] py-0 px-1.5">
                              {STRATEGY_LABELS[st]?.label || st}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">None currently routed</span>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenConfigModal(bKey)}
                      className="text-xs h-7 px-2 border border-border/40 hover:bg-muted ml-2 shrink-0"
                    >
                      <KeyRound className="h-3 w-3 mr-1" />
                      Configure
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* STEP-BY-STEP EXECUTION WORKFLOW SETUP GUIDE & INSTRUCTIONS                */}
      {/* ========================================================================= */}
      {showInstructions && (
        <Card className="border border-primary/30 bg-primary/[0.02] shadow-md transition-all">
          <CardHeader className="pb-3 border-b border-border/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-primary/10 text-primary">
                  <BookOpen className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-bold">Execution Workflow Setup & User Instructions</CardTitle>
              </div>

              {/* Guide Tabs */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveGuideTab("overview")}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                    activeGuideTab === "overview" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Quickstart (4 Steps)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuideTab("kite")}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                    activeGuideTab === "kite" ? "bg-amber-600 text-white font-bold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Zerodha Kite Setup
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuideTab("kotak")}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                    activeGuideTab === "kotak" ? "bg-rose-600 text-white font-bold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Kotak Neo Setup
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuideTab("upstox")}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                    activeGuideTab === "upstox" ? "bg-purple-600 text-white font-bold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Upstox Setup
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuideTab("safety")}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                    activeGuideTab === "safety" ? "bg-emerald-600 text-white font-bold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Safety & Risk Rules
                </button>
              </div>
            </div>
            <CardDescription className="text-xs mt-1">
              Follow these exact instructions to link your broker accounts, define strategy routing, and safely execute orders.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 text-xs space-y-4 leading-relaxed">
            {/* OVERVIEW / 4 STEPS */}
            {activeGuideTab === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-border/40 bg-background/60">
                  <div className="flex items-center gap-2 mb-1.5 font-bold text-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px]">1</span>
                    Link Broker Credentials
                  </div>
                  <p className="text-muted-foreground text-[11px] mb-2">
                    Enter API credentials for Zerodha Kite, Kotak Neo, and/or Upstox. Each broker has distinct developer keys.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => handleOpenConfigModal("kite")} className="text-[11px] h-6 px-2 w-full">
                    Configure Keys Now
                  </Button>
                </div>

                <div className="p-3 rounded-lg border border-border/40 bg-background/60">
                  <div className="flex items-center gap-2 mb-1.5 font-bold text-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px]">2</span>
                    Set Routing Rules
                  </div>
                  <p className="text-muted-foreground text-[11px] mb-2">
                    In the table below, assign which broker executes which trade kind (e.g. Long-term $\rightarrow$ Kite, Intraday $\rightarrow$ Neo, Swing $\rightarrow$ Upstox).
                  </p>
                  <span className="text-[10px] text-emerald-400 block font-semibold">
                    ✓ Click any broker pill to reassign
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-border/40 bg-background/60">
                  <div className="flex items-center gap-2 mb-1.5 font-bold text-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px]">3</span>
                    Choose Execution Mode
                  </div>
                  <p className="text-muted-foreground text-[11px] mb-2">
                    Start in <strong>Paper Simulation</strong> to verify order formatting, margins, and lot sizing. Toggle <strong>Live Mode</strong> when ready for real market orders.
                  </p>
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                    {isLive ? "Currently LIVE" : "Currently PAPER"}
                  </Badge>
                </div>

                <div className="p-3 rounded-lg border border-border/40 bg-background/60">
                  <div className="flex items-center gap-2 mb-1.5 font-bold text-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px]">4</span>
                    Execute & Audit Trades
                  </div>
                  <p className="text-muted-foreground text-[11px] mb-2">
                    Use the <strong>Manual Order Dispatcher</strong> or let the <strong>Autonomous Auto-Trader</strong> screen and place verified trades. Every order logs in the journal.
                  </p>
                  <span className="text-[10px] text-primary block font-semibold">
                    ✓ Real-time Telegram alerts sent
                  </span>
                </div>
              </div>
            )}

            {/* ZERODHA KITE GUIDE */}
            {activeGuideTab === "kite" && (
              <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" /> Zerodha Kite Connect Setup Guide
                  </span>
                  <a
                    href="https://developers.kite.trade"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-amber-400 hover:underline flex items-center gap-1"
                  >
                    Kite Developer Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-[11px]">
                  <li>
                    Log in to <strong className="text-foreground">developers.kite.trade</strong> and click <em>&quot;Create new app&quot;</em>.
                  </li>
                  <li>
                    Set the Redirect URL to <code className="text-foreground bg-muted/60 px-1 py-0.5 rounded">http://localhost:3000/settings</code> (or your deployed domain).
                  </li>
                  <li>
                    Copy your <strong className="text-foreground">API Key</strong> and <strong className="text-foreground">API Secret</strong> into the broker settings configuration dialog.
                  </li>
                  <li>
                    <strong className="text-foreground">Daily Session Generation:</strong> In accordance with SEBI/Zerodha regulations, access tokens expire daily. Click <em>&quot;Connect Kite&quot;</em> each morning to authenticate and issue a fresh session token.
                  </li>
                  <li>
                    <strong className="text-foreground">Recommended Usage:</strong> Ideal for <strong>Equity Long-Term (CNC)</strong> investing with 0% delivery brokerage and dependable execution.
                  </li>
                </ol>
                <div className="pt-2 flex gap-2">
                  <Button size="sm" onClick={() => handleOpenConfigModal("kite")} className="text-xs bg-amber-600 hover:bg-amber-700 text-white">
                    Enter Kite API Credentials
                  </Button>
                </div>
              </div>
            )}

            {/* KOTAK NEO GUIDE */}
            {activeGuideTab === "kotak" && (
              <div className="p-4 rounded-lg border border-rose-500/20 bg-rose-500/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-400 text-sm flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" /> Kotak Securities Neo API Setup Guide
                  </span>
                  <a
                    href="https://neo.kotaksecurities.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-rose-400 hover:underline flex items-center gap-1"
                  >
                    Kotak Neo Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-[11px]">
                  <li>
                    Log in to <strong className="text-foreground">Kotak Neo Trade API portal</strong> to generate your application keys.
                  </li>
                  <li>
                    Obtain your <strong className="text-foreground">Consumer Key</strong> and <strong className="text-foreground">Consumer Secret</strong>.
                  </li>
                  <li>
                    Enter your Consumer Key, Consumer Secret, registered <strong className="text-foreground">Mobile Number (+91)</strong>, and <strong className="text-foreground">Password/PIN</strong> in the configuration modal.
                  </li>
                  <li>
                    <strong className="text-foreground">Daily Authentication:</strong> Kotak Neo tokens are refreshed using your secure 2FA PIN. The system handles session renewal.
                  </li>
                  <li>
                    <strong className="text-foreground">Recommended Usage:</strong> Optimal for <strong>Intraday (MIS)</strong> and <strong>NSE Futures & Options (NRML)</strong> to take advantage of Kotak Neo&apos;s zero-brokerage intraday plans and low derivatives latency.
                  </li>
                </ol>
                <div className="pt-2 flex gap-2">
                  <Button size="sm" onClick={() => handleOpenConfigModal("kotak_neo")} className="text-xs bg-rose-600 hover:bg-rose-700 text-white">
                    Enter Kotak Neo Credentials
                  </Button>
                </div>
              </div>
            )}

            {/* UPSTOX GUIDE */}
            {activeGuideTab === "upstox" && (
              <div className="p-4 rounded-lg border border-purple-500/20 bg-purple-500/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-400 text-sm flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" /> Upstox API v2 Setup Guide
                  </span>
                  <a
                    href="https://account.upstox.com/developer/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                  >
                    Upstox Developer Console <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-[11px]">
                  <li>
                    Visit the <strong className="text-foreground">Upstox Developer Console</strong> and create a new application.
                  </li>
                  <li>
                    Set the Redirect URL to <code className="text-foreground bg-muted/60 px-1 py-0.5 rounded">http://localhost:3000/api/brokers/upstox/callback</code>.
                  </li>
                  <li>
                    Copy your <strong className="text-foreground">Client ID (API Key)</strong> and <strong className="text-foreground">API Secret</strong> into the configuration modal.
                  </li>
                  <li>
                    <strong className="text-foreground">Daily Login:</strong> Click <em>&quot;Connect Upstox&quot;</em> to authenticate via standard Upstox OAuth 2.0 and generate your daily token.
                  </li>
                  <li>
                    <strong className="text-foreground">Recommended Usage:</strong> Ideal for <strong>Equity Swing Trading (CNC)</strong> with rapid order confirmation and reliable holding sync.
                  </li>
                </ol>
                <div className="pt-2 flex gap-2">
                  <Button size="sm" onClick={() => handleOpenConfigModal("upstox")} className="text-xs bg-purple-600 hover:bg-purple-700 text-white">
                    Enter Upstox Credentials
                  </Button>
                </div>
              </div>
            )}

            {/* SAFETY & RISK INSTRUCTIONS */}
            {activeGuideTab === "safety" && (
              <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-2.5">
                <span className="font-bold text-emerald-400 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Pre-Flight Safety, Risk Rules & Market Hours
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                  <div className="space-y-1.5">
                    <p><strong className="text-foreground">1. Strict 5% Risk Budgeting:</strong> The engine automatically calculates stop distance and clamps position quantities so no trade risks more than 5% of total capital.</p>
                    <p><strong className="text-foreground">2. Mandatory Stop-Loss:</strong> Every automated trade requires a pre-determined stop-loss. Orders without valid stops are rejected before reaching the broker.</p>
                    <p><strong className="text-foreground">3. Global Kill Switch:</strong> You can pause all trading at any moment in Risk Monitor if market volatility reaches extreme levels.</p>
                  </div>
                  <div className="space-y-1.5">
                    <p><strong className="text-foreground">4. Indian Market Hours:</strong> Live orders only execute between <strong>09:15 AM and 03:30 PM IST</strong> on NSE/BSE trading days. Off-market attempts in live mode are guarded.</p>
                    <p><strong className="text-foreground">5. Product Codes:</strong> Delivery trades use <code className="text-foreground">CNC</code>, intraday uses <code className="text-foreground">MIS</code>, and overnight futures use <code className="text-foreground">NRML</code>.</p>
                    <p><strong className="text-foreground">6. Telegram Alert Verification:</strong> Receive instant push notifications with scrip, broker, and order ID whenever an order is submitted or closed.</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* STRATEGY-TO-BROKER ROUTING TABLE + MANUAL ORDER DISPATCHER                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Strategy Routing Preferences (7 cols) */}
        <Card className="lg:col-span-7 border border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Strategy-to-Broker Routing Rules
            </CardTitle>
            <CardDescription className="text-xs">
              Choose which broker automatically takes each kind of trade. Click any broker pill to reassign.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(STRATEGY_LABELS).map((stKey) => {
              const info = STRATEGY_LABELS[stKey];
              const currentTarget = routingRules[stKey] || info.defaultBroker;

              return (
                <div
                  key={stKey}
                  className="p-3 rounded-lg border border-border/40 bg-background/60 flex items-center justify-between flex-wrap gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="max-w-xs">
                    <span className="font-semibold text-sm block">{info.label}</span>
                    <span className="text-[11px] text-muted-foreground">{info.desc}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {["kite", "kotak_neo", "upstox"].map((bKey) => {
                      const isSelected = currentTarget === bKey;
                      const meta = BROKER_METAS[bKey];

                      return (
                        <button
                          key={bKey}
                          type="button"
                          onClick={() => handleRoutingChange(stKey, bKey)}
                          className={`text-xs px-2.5 py-1.5 rounded-md font-medium border transition-all flex items-center gap-1 ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-sm font-bold"
                              : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                          {meta.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="pt-2 flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveRouting}
                disabled={savingRouting}
                className="text-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savingRouting ? "Saving..." : "Save Routing Preferences"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Manual Order Execution Ticket (5 cols) */}
        <Card className="lg:col-span-5 border border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-400" />
              Manual Order Dispatcher
            </CardTitle>
            <CardDescription className="text-xs">
              Execute a trade directly with explicit broker choice or rule-based auto routing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePlaceOrder} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Scrip / Ticker</label>
                  <Input
                    value={orderTicker}
                    onChange={(e) => setOrderTicker(e.target.value)}
                    placeholder="e.g. RELIANCE"
                    className="h-8 text-xs font-semibold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Trade Direction</label>
                  <div className="flex rounded-md overflow-hidden border border-border/50">
                    <button
                      type="button"
                      onClick={() => setOrderSide("BUY")}
                      className={`flex-1 text-xs py-1.5 font-bold transition-colors ${
                        orderSide === "BUY"
                          ? "bg-emerald-600 text-white"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      BUY (Long)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderSide("SELL")}
                      className={`flex-1 text-xs py-1.5 font-bold transition-colors ${
                        orderSide === "SELL"
                          ? "bg-rose-600 text-white"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      SELL (Short)
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Trade Kind / Style</label>
                  <select
                    value={orderMode}
                    onChange={(e) => setOrderMode(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-border/50 rounded-md px-2 text-foreground"
                  >
                    <option value="equity_swing">Equity Swing</option>
                    <option value="equity_long_term">Equity Long-term</option>
                    <option value="intraday">Intraday (MIS)</option>
                    <option value="futures">NSE Futures (NRML)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Target Broker</label>
                  <select
                    value={orderBroker}
                    onChange={(e) => setOrderBroker(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-border/50 rounded-md px-2 text-foreground font-semibold"
                  >
                    <option value="">⚡ Auto-route by Rule</option>
                    <option value="kite">Zerodha Kite</option>
                    <option value="kotak_neo">Kotak Neo</option>
                    <option value="upstox">Upstox</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    value={orderQty}
                    onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-xs font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Order Type</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-border/50 rounded-md px-2 text-foreground"
                  >
                    <option value="MARKET">MARKET</option>
                    <option value="LIMIT">LIMIT</option>
                  </select>
                </div>
              </div>

              {orderType === "LIMIT" && (
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Limit Price (₹)</label>
                  <Input
                    type="number"
                    step="0.05"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    placeholder="e.g. 2900.50"
                    className="h-8 text-xs"
                    required={orderType === "LIMIT"}
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={placingOrder}
                className={`w-full text-xs font-semibold text-white ${
                  orderSide === "BUY" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {placingOrder ? "Dispatching..." : `Execute ${orderSide} Order (${isLive ? "LIVE" : "SIMULATED"})`}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* EXECUTION JOURNAL: ORDERS HISTORY ACROSS ALL BROKERS                      */}
      {/* ========================================================================= */}
      <Card className="border border-border/60">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Multi-Broker Order Execution Journal
            </CardTitle>
            <CardDescription className="text-xs">
              Audit trail of live and simulated orders placed across Kite, Kotak Neo, and Upstox.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {orders.length} Orders Recorded
          </Badge>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <div className="rounded-md border border-border/40 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Time</TableHead>
                    <TableHead>Broker</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {orders.map((ord: any) => {
                    const bMeta = BROKER_METAS[ord.broker] || { name: ord.broker, badgeClass: "" };
                    const isBuy = ord.direction === "BUY";

                    return (
                      <TableRow key={ord.id}>
                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {ord.created_at?.slice(0, 16)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${bMeta.badgeClass}`}>
                            {bMeta.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold">{ord.ticker}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              isBuy
                                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                : "border-rose-500/40 text-rose-400 bg-rose-500/10"
                            }`}
                          >
                            {ord.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{ord.product}</TableCell>
                        <TableCell className="font-medium">{ord.quantity}</TableCell>
                        <TableCell>{ord.price ? `₹${ord.price}` : "MKT"}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {ord.order_id}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              ord.status === "COMPLETE" || ord.status === "SUBMITTED"
                                ? "border-emerald-500/30 text-emerald-400"
                                : "border-rose-500/30 text-rose-400"
                            }`}
                          >
                            {ord.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {ord.mode}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-md">
              No broker orders recorded yet. Use the Manual Order Dispatcher above or run the Auto-Trader cycle to execute trades.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configure Broker Credentials Modal */}
      <ConfigureBrokerModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSuccess={() => {
          setIsConfigModalOpen(false);
          loadAll();
        }}
        initialBrokerKey={configBrokerKey}
      />
    </div>
  );
}
