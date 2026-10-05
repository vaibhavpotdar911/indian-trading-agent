"use client";

import { useEffect, useState } from "react";
import { getDataProviderKeys, saveDataProviderKey } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DataProviderSettings() {
  const [status, setStatus] = useState<any>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { getDataProviderKeys().then(setStatus).catch(() => setStatus({})); }, []);
  const save = async () => {
    setSaving(true);
    try { await saveDataProviderKey("stoxim", key); setStatus(await getDataProviderKeys()); setKey(""); toast.success("Stoxim key saved"); }
    catch (error: any) { toast.error(error.message || "Could not save data-provider key"); }
    finally { setSaving(false); }
  };
  const stoxim = status?.stoxim;
  return <Card><CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Database className="h-5 w-5" />Market &amp; Fundamental Data</CardTitle><CardDescription>Keys are stored locally and shown only in masked form.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between"><div><p className="font-medium">Stoxim fundamentals</p><p className="text-xs text-muted-foreground">Optional free provider for Indian financial statements and ratios.</p></div>{stoxim?.configured ? <Badge variant="outline">Configured ({stoxim.source})</Badge> : <Badge variant="outline">Not configured</Badge>}</div><div className="flex gap-2"><Input type="password" placeholder={stoxim?.masked || "Stoxim API key"} value={key} onChange={(e) => setKey(e.target.value)} /><Button onClick={save} disabled={saving || !key}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save key"}</Button></div><p className="text-xs text-muted-foreground">Get a free key at stoxim.com. Yahoo Finance remains the fallback.</p></CardContent></Card>;
}
