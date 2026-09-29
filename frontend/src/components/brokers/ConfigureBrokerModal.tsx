"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { configureBroker, getSupportedBrokers } from "@/lib/api";
import { Loader2, Plus, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface ConfigureBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newBrokerKey: string) => void;
  initialBrokerKey?: string;
}

export function ConfigureBrokerModal({
  isOpen,
  onClose,
  onSuccess,
  initialBrokerKey,
}: ConfigureBrokerModalProps) {
  const [supportedBrokers, setSupportedBrokers] = useState<any[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("kite");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getSupportedBrokers()
        .then((data: any) => {
          if (Array.isArray(data)) {
            setSupportedBrokers(data);
            if (initialBrokerKey) {
              setSelectedKey(initialBrokerKey);
            } else if (data.length > 0) {
              const firstUnadded = data.find((b: any) => !b.active) || data[0];
              setSelectedKey(firstUnadded.key);
            }
          }
        })
        .catch(() => toast.error("Failed to load supported brokers"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, initialBrokerKey]);

  useEffect(() => {
    setFormData({});
  }, [selectedKey]);

  const currentBroker = supportedBrokers.find((b) => b.key === selectedKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKey || !currentBroker) return;

    setSaving(true);
    try {
      await configureBroker(selectedKey, formData);
      toast.success(`${currentBroker.name} configured & connected successfully!`);
      onSuccess(selectedKey);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to configure broker");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Configure Broker Connection
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter your API credentials to sync holdings &amp; positions. All credentials are stored securely in your local database.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" /> Loading brokers...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Broker selection options */}
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Select Broker</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {supportedBrokers.map((b) => {
                  const isSel = b.key === selectedKey;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setSelectedKey(b.key)}
                      className={`relative flex items-center justify-between p-2.5 rounded-lg border text-left text-xs font-semibold transition-all ${
                        isSel
                          ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground"
                          : "border-border hover:border-primary/40 bg-background text-muted-foreground"
                      }`}
                    >
                      <span className="truncate">{b.name}</span>
                      {b.active && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic fields */}
            {currentBroker && currentBroker.fields && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{currentBroker.name} Credentials</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-green-600" /> Read-only sync
                  </span>
                </div>

                {currentBroker.fields.map((f: any) => (
                  <div key={f.name} className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      type={f.type || "text"}
                      placeholder={`Enter ${f.label}`}
                      value={formData[f.name] || ""}
                      onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                      required={f.required}
                      className="font-sans text-xs h-9"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Saving...
                  </>
                ) : (
                  "Save & Connect Tab"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
