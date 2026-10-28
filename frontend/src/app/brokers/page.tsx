"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  getBrokerTabs,
  getSupportedBrokers,
  removeBroker,
  syncBroker,
  getKiteLoginUrl,
  getKiteStatus,
  logoutKite,
  getUpstoxLoginUrl,
  getUpstoxStatus,
  logoutUpstox,
  getKotakNeoStatus,
  loginKotakNeo,
  logoutKotakNeo,
  syncKotakNeoPositions,
  getMarketDataVendorStatus,
  saveMarketDataVendorSetting,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Wallet,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  LogOut,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  ShieldCheck,
  PieChart,
  HelpCircle,
  KeyRound,
  Trash2,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { statusColors } from "@/lib/status-colors";
import { BrokerBadge } from "@/components/brokers/BrokerBadge";
import { ConfigureBrokerModal } from "@/components/brokers/ConfigureBrokerModal";

const BROKER_NAMES: Record<string, string> = {
  kite: "Zerodha Kite",
  upstox: "Upstox",
  kotak_neo: "Kotak Neo",
  angel_one: "Angel One",
  fivepaisa: "5Paisa",
  groww: "Groww",
  dhan: "Dhan",
};

function formatBrokerName(key: string, name?: string): string {
  if (name && name.toLowerCase() !== key.toLowerCase()) return name;
  if (BROKER_NAMES[key.toLowerCase()]) return BROKER_NAMES[key.toLowerCase()];
  return key.charAt(0).toUpperCase() + key.slice(1).replace("_", " ");
}

export default function BrokersPage() {
  return (
    <Suspense fallback={<div className="p-6"><p className="text-muted-foreground">Loading broker settings...</p></div>}>
      <BrokersPageInner />
    </Suspense>
  );
}

function BrokersPageInner() {
  const [brokerTabs, setBrokerTabs] = useState<string[]>([]);
  const [supportedBrokers, setSupportedBrokers] = useState<any[]>([]);
  const [brokerDetails, setBrokerDetails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Broker specific statuses
  const [kiteStatus, setKiteStatus] = useState<any>(null);
  const [upstoxStatus, setUpstoxStatus] = useState<any>(null);
  const [kotakNeoStatus, setKotakNeoStatus] = useState<any>(null);

  // Market Data Provider
  const [vendorStatus, setVendorStatus] = useState<any>(null);
  const [updatingVendor, setUpdatingVendor] = useState(false);

  // Action loading states
  const [syncingBroker, setSyncingBroker] = useState<string | null>(null);
  const [loggingInKotak, setLoggingInKotak] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedBrokerKey, setSelectedBrokerKey] = useState<string | undefined>(undefined);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tabsRes, supportedRes, kiteRes, upstoxRes, kotakRes, vendorRes] = await Promise.all([
        getBrokerTabs().catch(() => ({ tabs: [] })),
        getSupportedBrokers().catch(() => []),
        getKiteStatus().catch(() => null),
        getUpstoxStatus().catch(() => null),
        getKotakNeoStatus().catch(() => null),
        getMarketDataVendorStatus().catch(() => null),
      ]);

      const tabs: string[] = (tabsRes as any)?.tabs || [];
      setBrokerTabs(tabs);
      setSupportedBrokers(Array.isArray(supportedRes) ? supportedRes : []);
      setKiteStatus(kiteRes);
      setUpstoxStatus(upstoxRes);
      setKotakNeoStatus(kotakRes);
      setVendorStatus(vendorRes);

      // Build details lookup
      const detailsMap: Record<string, any> = {};
      if (Array.isArray(supportedRes)) {
        supportedRes.forEach((b: any) => {
          detailsMap[b.key] = b;
        });
      }
      setBrokerDetails(detailsMap);
    } catch {
      toast.error("Failed to load broker configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleVendorChange = async (vendor: string) => {
    setUpdatingVendor(true);
    try {
      const updated: any = await saveMarketDataVendorSetting(vendor);
      setVendorStatus(updated);
      toast.success(`Market data source updated to ${updated?.resolved_label || vendor}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update market data provider");
    } finally {
      setUpdatingVendor(false);
    }
  };

  const handleKiteLogin = async () => {
    try {
      const res = (await getKiteLoginUrl()) as { login_url: string };
      window.location.href = res.login_url;
    } catch (err: any) {
      toast.error(err.message || "Failed to get Kite login URL");
    }
  };

  const handleUpstoxLogin = async () => {
    try {
      const res = (await getUpstoxLoginUrl()) as { login_url: string };
      window.location.href = res.login_url;
    } catch (err: any) {
      toast.error(err.message || "Failed to get Upstox login URL");
    }
  };

  const handleSyncBroker = async (brokerKey: string) => {
    setSyncingBroker(brokerKey);
    try {
      if (brokerKey === "kotak_neo") {
        await syncKotakNeoPositions();
      } else {
        await syncBroker(brokerKey);
      }
      toast.success(`${formatBrokerName(brokerKey)} holdings synced successfully!`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || `Failed to sync ${formatBrokerName(brokerKey)}`);
    } finally {
      setSyncingBroker(null);
    }
  };

  const handleDisconnect = async (brokerKey: string) => {
    setDisconnecting(brokerKey);
    try {
      if (brokerKey === "kite") {
        await logoutKite();
      } else if (brokerKey === "upstox") {
        await logoutUpstox();
      } else if (brokerKey === "kotak_neo") {
        await logoutKotakNeo();
      }
      toast.success(`${formatBrokerName(brokerKey)} session cleared`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect session");
    } finally {
      setDisconnecting(null);
    }
  };

  const handleRemoveBroker = async (brokerKey: string) => {
    if (!confirm(`Are you sure you want to remove ${formatBrokerName(brokerKey)} configuration?`)) return;
    try {
      await removeBroker(brokerKey);
      toast.success(`${formatBrokerName(brokerKey)} removed`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove broker");
    }
  };

  const handleKotakNeoLogin = () => {
    setSelectedBrokerKey("kotak_neo");
    setConfigModalOpen(true);
  };

  return (
    <div className="p-3.5 sm:p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/equity-portfolio-analysis"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Portfolio
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6 text-primary" /> Broker &amp; Market Data Configuration
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage Indian broker API connections, credentials, daily login sessions, and live quote vendors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setSelectedBrokerKey(undefined);
              setConfigModalOpen(true);
            }}
            className="h-9 text-xs font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Broker Connection
          </Button>
        </div>
      </div>

      {/* Market Data Provider Card */}
      <Card className="border-blue-500/20 bg-blue-50/10 dark:bg-blue-950/10 shadow-xs">
        <CardHeader className="pb-3 border-b border-blue-500/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2 font-bold">
                <PieChart className="h-4 w-4 text-blue-500" /> Market Data &amp; Quotes Provider
              </CardTitle>
              <CardDescription className="text-xs">
                Select where real-time stock quotes and technical data are fetched from.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={
                  vendorStatus?.is_fallback
                    ? statusColors.caution
                    : vendorStatus?.resolved_vendor !== "yfinance"
                    ? statusColors.bullish
                    : statusColors.info
                }
              >
                Active Feed: {vendorStatus?.resolved_label || "Yahoo Finance"}
              </Badge>

              <div className="flex items-center gap-2 bg-background p-1 rounded-md border text-xs shadow-xs">
                <span className="text-[11px] font-medium text-muted-foreground pl-1">Provider:</span>
                {updatingVendor ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <select
                    className="rounded border-none bg-transparent px-2 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer"
                    value={vendorStatus?.configured_vendor || "auto"}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleVendorChange(e.target.value)}
                  >
                    {(vendorStatus?.options || [
                      { value: "auto", label: "Auto-Detect Active Broker (Recommended)" },
                      { value: "yfinance", label: "Yahoo Finance (yfinance)" },
                      { value: "kite", label: "Zerodha Kite Connect" },
                      { value: "upstox", label: "Upstox API v2" },
                      { value: "kotak_neo", label: "Kotak Neo API" },
                    ]).map((opt: { value: string; label: string }) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-3 text-xs text-muted-foreground leading-relaxed">
          <strong>Auto-Detect</strong> automatically switches to real-time quotes from Zerodha Kite, Upstox, or Kotak Neo whenever an active authenticated session exists, with automatic fallback to Yahoo Finance if markets are closed or broker tokens expire.
        </CardContent>
      </Card>

      {/* Connected Brokers Hub */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Active Broker Connections ({brokerTabs.length})
          </h2>
          <span className="text-xs text-muted-foreground">Read-only holdings synchronization &amp; trade execution</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading configured brokers...
          </div>
        ) : brokerTabs.length === 0 ? (
          <Card className="border-dashed border-2 bg-muted/10">
            <CardContent className="py-12 text-center space-y-3">
              <Wallet className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">No broker accounts configured yet</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Connect Zerodha Kite, Upstox, or Kotak Neo to sync your stock portfolio holdings and enable live quotes.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedBrokerKey(undefined);
                  setConfigModalOpen(true);
                }}
                className="text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Configure Your First Broker
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brokerTabs.map((key) => {
              const detail = brokerDetails[key];
              const brokerName = formatBrokerName(key, detail?.name);

              const isKite = key === "kite";
              const isUpstox = key === "upstox";
              const isKotakNeo = key === "kotak_neo";

              const isConnectedToday = isKite
                ? kiteStatus?.connected_today
                : isUpstox
                ? upstoxStatus?.connected_today
                : isKotakNeo
                ? kotakNeoStatus?.logged_in
                : false;

              const isConfigured = isKite
                ? kiteStatus?.configured
                : isUpstox
                ? upstoxStatus?.configured
                : isKotakNeo
                ? kotakNeoStatus?.configured
                : detail?.active;

              const maskedKey = isKite
                ? kiteStatus?.masked_api_key
                : isUpstox
                ? upstoxStatus?.masked_api_key
                : isKotakNeo
                ? kotakNeoStatus?.masked_consumer_key
                : detail?.masked_key;

              const userName = isKite
                ? kiteStatus?.profile?.user_shortname
                : isUpstox
                ? upstoxStatus?.user_name
                : isKotakNeo
                ? kotakNeoStatus?.client_id
                : null;

              return (
                <Card key={key} className="border-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <BrokerBadge brokerKey={key} size="md" />
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            {brokerName}
                          </CardTitle>
                          {userName && (
                            <span className="text-xs text-muted-foreground block font-medium">
                              User: {userName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        {isConnectedToday ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-semibold">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Connected Today
                          </Badge>
                        ) : isConfigured ? (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-semibold">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Login Required Today
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Not Configured
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4 flex-1">
                    {/* Credentials Info */}
                    <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-[11px]">API Key / Consumer Key:</span>
                        <span className="font-mono font-medium">{maskedKey || "Not set"}</span>
                      </div>
                      {isKite && kiteStatus?.token_date && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[11px]">Session Date:</span>
                          <span className="font-mono font-medium">{kiteStatus.token_date}</span>
                        </div>
                      )}
                      {isUpstox && upstoxStatus?.token_date && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[11px]">Session Date:</span>
                          <span className="font-mono font-medium">{upstoxStatus.token_date}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      {/* Daily Login Button */}
                      {!isConnectedToday && isConfigured && (
                        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-amber-700 dark:text-amber-300">
                            Session expired. Login to sync today&apos;s holdings.
                          </div>
                          {isKite && (
                            <Button
                              size="sm"
                              onClick={handleKiteLogin}
                              className="h-7 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              <KeyRound className="h-3 w-3 mr-1" /> Daily Login
                            </Button>
                          )}
                          {isUpstox && (
                            <Button
                              size="sm"
                              onClick={handleUpstoxLogin}
                              className="h-7 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              <KeyRound className="h-3 w-3 mr-1" /> Daily Login
                            </Button>
                          )}
                          {isKotakNeo && (
                            <Button
                              size="sm"
                              onClick={handleKotakNeoLogin}
                              disabled={loggingInKotak}
                              className="h-7 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              {loggingInKotak ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <KeyRound className="h-3 w-3 mr-1" />}
                              Daily Login
                            </Button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSyncBroker(key)}
                          disabled={syncingBroker === key || !isConnectedToday}
                          className="h-8 text-xs font-medium"
                        >
                          {syncingBroker === key ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                          ) : (
                            <RefreshCw className="h-3 w-3 mr-1.5 text-primary" />
                          )}
                          Sync Holdings
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedBrokerKey(key);
                            setConfigModalOpen(true);
                          }}
                          className="h-8 text-xs"
                        >
                          <Lock className="h-3 w-3 mr-1" /> Edit Credentials
                        </Button>

                        {isConnectedToday && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDisconnect(key)}
                            disabled={disconnecting === key}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <LogOut className="h-3 w-3 mr-1" /> Clear Session
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveBroker(key)}
                          className="h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 ml-auto"
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Supported Brokers to Add */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Available Indian Broker Connectors
          </CardTitle>
          <CardDescription className="text-xs">
            Connect additional demat or trading accounts to unify multi-broker equity holdings in one desk.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "kite", name: "Zerodha Kite", desc: "India's largest retail broker (Kite Connect)" },
              { key: "upstox", name: "Upstox API v2", desc: "Fast OAuth 2.0 delivery & swing execution" },
              { key: "kotak_neo", name: "Kotak Neo", desc: "Zero intraday brokerage Trade API" },
              { key: "angel_one", name: "Angel One", desc: "SmartAPI algorithmic trading platform" },
              { key: "groww", name: "Groww", desc: "Popular investment platform (read-only)" },
              { key: "fivepaisa", name: "5Paisa", desc: "Discount broker API connector" },
            ].map((b) => {
              const isAdded = brokerTabs.includes(b.key);
              return (
                <div
                  key={b.key}
                  className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 ${
                    isAdded ? "bg-muted/30 border-primary/20 opacity-70" : "bg-card border-border hover:border-primary/40"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold">{b.name}</span>
                      {isAdded && (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Added
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">{b.desc}</p>
                  </div>

                  <Button
                    size="sm"
                    variant={isAdded ? "ghost" : "outline"}
                    onClick={() => {
                      setSelectedBrokerKey(b.key);
                      setConfigModalOpen(true);
                    }}
                    className="h-7 text-xs w-full mt-1"
                  >
                    {isAdded ? "Reconfigure" : "+ Connect"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Setup Guide & FAQ */}
      <Card className="border-border shadow-xs">
        <button
          type="button"
          onClick={() => setShowSetupGuide(!showSetupGuide)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/20 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <HelpCircle className="h-4 w-4 text-primary" />
            <span>How to obtain Broker API credentials (Zerodha, Upstox, Kotak Neo)</span>
          </div>
          {showSetupGuide ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showSetupGuide && (
          <CardContent className="pt-0 space-y-4 border-t p-4 text-xs leading-relaxed text-muted-foreground">
            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Zerodha Kite Connect:
              </h4>
              <p>
                1. Go to <a href="https://developers.kite.trade" target="_blank" rel="noreferrer" className="text-primary underline">developers.kite.trade</a> and log in.<br />
                2. Create a new app and copy your <strong>API Key</strong> and <strong>API Secret</strong>.<br />
                3. Set the Redirect URL to <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">http://localhost:8000/api/kite/callback</code>.<br />
                4. SEBI regulations require logging in once every morning to generate a fresh 24-hour access token.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Upstox API v2:
              </h4>
              <p>
                1. Go to <a href="https://service.upstox.com/developer/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">Upstox Developer Console</a>.<br />
                2. Create an App and set Redirect URI to <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">http://localhost:8000/api/upstox/callback</code>.<br />
                3. Copy your <strong>API Key</strong> and <strong>API Secret</strong>. Daily OAuth login is valid until midnight.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Kotak Neo Trade API:
              </h4>
              <p>
                1. Visit the <a href="https://tradeapi.kotaksecurities.com" target="_blank" rel="noreferrer" className="text-primary underline">Kotak Neo API Developer Portal</a>.<br />
                2. Obtain your <strong>Consumer Key</strong>, <strong>Consumer Secret</strong>, and enter your registered Mobile Number and MPIN for automated token refreshes.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Configure Broker Modal */}
      <ConfigureBrokerModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        initialBrokerKey={selectedBrokerKey}
        onSuccess={() => {
          loadData();
          toast.success("Broker configured successfully!");
        }}
      />
    </div>
  );
}
