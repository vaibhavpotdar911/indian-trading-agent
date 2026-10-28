"use client";

import { useEffect, useState } from "react";
import { getTelegramStatus, saveTelegramSettings, sendTelegramTest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";

type TelegramStatus = {
  configured: boolean;
  enabled: boolean;
  masked_bot_token?: string | null;
  masked_chat_id?: string | null;
};

export function TelegramSettings() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const fetchStatus = () => {
    setLoading(true);
    getTelegramStatus()
      .then((data: any) => {
        setStatus(data as TelegramStatus);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim() || !chatId.trim()) {
      toast.error("Both Bot Token and Chat ID are required.");
      return;
    }

    setSaving(true);
    try {
      const updated = (await saveTelegramSettings({
        bot_token: botToken.trim(),
        chat_id: chatId.trim(),
        enabled: true,
      })) as TelegramStatus;
      setStatus(updated);
      setBotToken("");
      setChatId("");
      toast.success("Telegram notification settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save Telegram settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      await sendTelegramTest("🚀 Indian Trading Agent: Telegram test alert sent successfully!");
      toast.success("Test message delivered to your Telegram!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send Telegram test message. Verify Bot Token & Chat ID.");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-sky-500" />
              <CardTitle className="text-lg font-bold">Telegram Notifications</CardTitle>
              {status?.configured ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs">
                  Not Configured
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Receive automated daily portfolio reviews, broker login reminders, and critical trade alerts directly on Telegram.
            </CardDescription>
          </div>

          {status?.configured && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendTest}
              disabled={sendingTest}
              className="h-8 text-xs shrink-0"
            >
              {sendingTest ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <Send className="h-3 w-3 mr-1.5 text-sky-500" />
              )}
              Send Test Alert
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Current Status Overview */}
        {status?.configured && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/30 border text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px] font-medium">Masked Bot Token</span>
              <span className="font-mono text-xs font-semibold">{status.masked_bot_token || "••••••••"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] font-medium">Masked Chat ID</span>
              <span className="font-mono text-xs font-semibold">{status.masked_chat_id || "••••••••"}</span>
            </div>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="telegram_bot_token" className="text-xs font-semibold flex items-center gap-1">
                Bot Token <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="telegram_bot_token"
                type="password"
                placeholder={status?.configured ? "Enter new token to overwrite" : "e.g. 123456789:ABCdefGHIjkl..."}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="font-mono text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">Provided by @BotFather on Telegram.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telegram_chat_id" className="text-xs font-semibold flex items-center gap-1">
                Chat ID <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="telegram_chat_id"
                placeholder={status?.configured ? "Enter new Chat ID to overwrite" : "e.g. 987654321"}
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className="font-mono text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">Your numeric Telegram user or group ID.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-xs h-8 px-2 text-primary hover:text-primary flex items-center gap-1 w-fit"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showInstructions ? "Hide Setup Instructions" : "How to create a Bot & find Chat ID"}
              {showInstructions ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />}
            </Button>

            <Button
              type="submit"
              disabled={saving || (!botToken.trim() && !chatId.trim())}
              size="sm"
              className="h-8 px-4 text-xs font-semibold shadow-xs"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
              Save Telegram Settings
            </Button>
          </div>
        </form>

        {/* Collapsible Step-by-Step Instructions */}
        {showInstructions && (
          <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-50/20 dark:bg-sky-950/20 space-y-3 text-xs leading-relaxed animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300">
              <MessageSquare className="h-4 w-4" /> Step-by-Step Setup Guide
            </div>

            <ol className="list-decimal list-inside space-y-2 text-foreground/90 pl-1">
              <li>
                <strong>Create your Bot</strong>: Open Telegram, search for{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 dark:text-sky-400 font-medium underline inline-flex items-center gap-0.5"
                >
                  @BotFather <ExternalLink className="h-2.5 w-2.5" />
                </a>
                , and send <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">/newbot</code>.
              </li>
              <li>
                Follow the prompts to name your bot (e.g. <em>My Trading Desk</em>) and choose a unique username ending in{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">bot</code> (e.g.{" "}
                <em>MyTradingAgent_bot</em>).
              </li>
              <li>
                BotFather will send an API HTTP Token (looks like <code className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]">712345678:ABC...</code>). Copy and paste this into the <strong>Bot Token</strong> field above.
              </li>
              <li>
                <strong>Start conversation with your bot</strong>: Search for your bot username in Telegram and press <strong>Start</strong> (or send <code className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]">/start</code>).
              </li>
              <li>
                <strong>Get your Chat ID</strong>: Search for{" "}
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 dark:text-sky-400 font-medium underline inline-flex items-center gap-0.5"
                >
                  @userinfobot <ExternalLink className="h-2.5 w-2.5" />
                </a>{" "}
                or <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">@RawDataBot</code> on Telegram, send any message, and copy your numeric <code className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]">Id</code>.
              </li>
              <li>
                Paste your numeric ID into the <strong>Chat ID</strong> field above and click <strong>Save Telegram Settings</strong>.
              </li>
              <li>
                Click <strong>Send Test Alert</strong> to verify delivery!
              </li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
