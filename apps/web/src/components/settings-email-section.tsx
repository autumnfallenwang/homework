"use client";

// Settings → Notifications → Email section (Phase 22 EM2-EM7). Collapsed
// summary card (mirrors settings-children.tsx's ChildRow) expands to a
// single-Save form with multi-recipient To support. Save commits every
// field atomically and (optionally) fires one test email so the user sees
// it land.

import { Loader2, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getSettingBool,
  getSettingString,
  sendDigestTest,
  setSettingBool,
  setSettingString,
} from "@/lib/api";

const EMAIL_KEY = "notify.refreshDigest.email";

interface LoadedConfig {
  readonly host: string;
  readonly port: string;
  readonly username: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly hasSavedPassword: boolean;
  readonly enabled: boolean;
}

function splitTo(raw: string): string[] {
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : [""];
}

function joinTo(list: readonly string[]): string {
  return list
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(", ");
}

function isConfigured(c: LoadedConfig): boolean {
  const port = Number.parseInt(c.port, 10);
  return Boolean(
    c.host.trim() &&
      Number.isFinite(port) &&
      port > 0 &&
      c.username.trim() &&
      c.from.trim() &&
      c.to.some((t) => t.trim().length > 0) &&
      c.hasSavedPassword,
  );
}

async function loadConfig(): Promise<LoadedConfig> {
  const [host, port, username, from, toRaw, pw, enabled] = await Promise.all([
    getSettingString("smtp.host", ""),
    getSettingString("smtp.port", ""),
    getSettingString("smtp.username", ""),
    getSettingString("smtp.from", ""),
    getSettingString("smtp.to", ""),
    getSettingString("smtp.password", ""),
    getSettingBool(EMAIL_KEY, false),
  ]);
  return {
    host,
    port,
    username,
    from,
    to: splitTo(toRaw),
    hasSavedPassword: pw.length > 0,
    enabled,
  };
}

export function SettingsEmailSection() {
  const [config, setConfig] = useState<LoadedConfig | null>(null);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    setConfig(await loadConfig());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!config) {
    return (
      <div className="rounded-lg bg-card px-4 py-3 text-[13px] text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        Loading…
      </div>
    );
  }

  const configured = isConfigured(config);

  const toggleDigest = async (next: boolean) => {
    if (!configured) return;
    try {
      await setSettingBool(EMAIL_KEY, next);
      await reload();
    } catch {
      // Leave the existing state; reload would have picked up a successful write.
    }
  };

  return (
    <div className="space-y-3">
      {editing ? (
        <EmailForm
          initial={config}
          onDone={async () => {
            setEditing(false);
            await reload();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <SmtpSummaryCard config={config} configured={configured} onEdit={() => setEditing(true)} />
      )}

      <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className={`flex items-center gap-4 px-4 py-3 ${configured ? "" : "opacity-60"}`}>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Email digest</p>
            <p className="text-[12px] text-muted-foreground">
              {configured
                ? "Send the daily digest through the SMTP server above."
                : "Set up SMTP above to enable."}
            </p>
          </div>
          <Switch
            checked={config.enabled && configured}
            disabled={!configured}
            onChange={(next) => {
              void toggleDigest(next);
            }}
            aria-label="Email digest enabled"
          />
        </div>
      </div>
    </div>
  );
}

interface SmtpSummaryCardProps {
  readonly config: LoadedConfig;
  readonly configured: boolean;
  readonly onEdit: () => void;
}

function SmtpSummaryCard({ config, configured, onEdit }: SmtpSummaryCardProps) {
  const summary = configured
    ? `${config.host} · ${config.from} → ${config.to.filter(Boolean).join(", ")}`
    : "No email configured";
  const detail = configured
    ? "SMTP server + recipients. Click Update to change."
    : "Send the daily digest to one or more inboxes.";
  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{summary}</p>
          <p className="text-[11px] text-muted-foreground">{detail}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[12px]" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
          {configured ? "Update" : "Set up email"}
        </Button>
      </div>
    </div>
  );
}

interface EmailFormProps {
  readonly initial: LoadedConfig;
  readonly onDone: () => Promise<void>;
  readonly onCancel: () => void;
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "sending" }
  | { kind: "ok"; message: string }
  | { kind: "err"; message: string };

interface ToRow {
  readonly id: string;
  readonly value: string;
}

let rowCounter = 0;
function makeRow(value: string): ToRow {
  rowCounter += 1;
  return { id: `to-${rowCounter}`, value };
}

function EmailForm({ initial, onDone, onCancel }: EmailFormProps) {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState<ToRow[]>(() =>
    initial.to.length > 0 ? initial.to.map(makeRow) : [makeRow("")],
  );
  const [sendTestOnSave, setSendTestOnSave] = useState<boolean>(true);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [toErrors, setToErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  const validate = (): boolean => {
    const next: Partial<Record<string, string>> = {};
    if (!host.trim()) next.host = "Required.";
    const p = Number.parseInt(port, 10);
    if (!Number.isFinite(p) || p <= 0 || p > 65535) next.port = "Enter a port between 1 and 65535.";
    if (!username.trim()) next.username = "Required.";
    if (!initial.hasSavedPassword && !password) next.password = "Required.";
    if (!from.trim() || !from.includes("@")) next.from = "Enter an email address.";
    const toProblems: Record<string, string | undefined> = {};
    const nonEmpty = to.filter((r) => r.value.trim().length > 0);
    if (nonEmpty.length === 0) {
      toProblems[to[0]?.id ?? "to-0"] = "Enter at least one recipient.";
    } else {
      for (const row of nonEmpty) {
        if (!row.value.trim().includes("@")) toProblems[row.id] = "Enter an email address.";
      }
    }
    setErrors(next);
    setToErrors(toProblems);
    return Object.keys(next).length === 0 && Object.keys(toProblems).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setStatus({ kind: "saving" });
    try {
      await setSettingString("smtp.host", host.trim());
      await setSettingString("smtp.port", String(Number.parseInt(port, 10)));
      await setSettingString("smtp.username", username.trim());
      await setSettingString("smtp.from", from.trim());
      await setSettingString("smtp.to", joinTo(to.map((r) => r.value)));
      if (password) {
        await setSettingString("smtp.password", password);
      }

      if (sendTestOnSave) {
        setStatus({ kind: "sending" });
        try {
          const result = await sendDigestTest();
          if (!result.ok) throw new Error("Test email failed.");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          setStatus({
            kind: "err",
            message: `Saved, but test email failed: ${msg}`,
          });
          return;
        }
      }

      setStatus({ kind: "ok", message: "Saved." });
      setTimeout(() => {
        void onDone();
      }, 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatus({ kind: "err", message: msg });
    }
  };

  const addRecipient = () => setTo([...to, makeRow("")]);
  const removeRecipient = (id: string) => {
    if (to.length <= 1) return;
    setTo(to.filter((r) => r.id !== id));
    setToErrors({});
  };
  const updateRecipient = (id: string, value: string) => {
    setTo(to.map((r) => (r.id === id ? { ...r, value } : r)));
  };

  const inFlight = status.kind === "saving" || status.kind === "sending";

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div>
        <h2 className="text-[14px] font-medium">SMTP server</h2>
        <p className="text-[12px] text-muted-foreground">
          BYO SMTP — we never relay through a server. Password stays on your self-hosted
          infrastructure.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_100px] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-host" className="text-[13px]">
            Host
          </Label>
          <Input
            id="smtp-host"
            placeholder="smtp.gmail.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            aria-invalid={Boolean(errors.host)}
            className="h-9 rounded-lg"
          />
          {errors.host && <p className="text-[12px] text-destructive">{errors.host}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-port" className="text-[13px]">
            Port
          </Label>
          <Input
            id="smtp-port"
            type="number"
            placeholder="587"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            aria-invalid={Boolean(errors.port)}
            className="h-9 rounded-lg"
          />
          {errors.port && <p className="text-[12px] text-destructive">{errors.port}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="smtp-username" className="text-[13px]">
          Username
        </Label>
        <Input
          id="smtp-username"
          placeholder="you@gmail.com"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={Boolean(errors.username)}
          className="h-9 rounded-lg"
        />
        {errors.username && <p className="text-[12px] text-destructive">{errors.username}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="smtp-password" className="text-[13px]">
          Password
        </Label>
        <Input
          id="smtp-password"
          type="password"
          placeholder={
            initial.hasSavedPassword ? "Keep existing (type to replace)" : "App password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
          className="h-9 rounded-lg"
        />
        {errors.password && <p className="text-[12px] text-destructive">{errors.password}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="smtp-from" className="text-[13px]">
          From
        </Label>
        <Input
          id="smtp-from"
          type="email"
          placeholder="you@gmail.com"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-invalid={Boolean(errors.from)}
          className="h-9 rounded-lg"
        />
        {errors.from && <p className="text-[12px] text-destructive">{errors.from}</p>}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px]">To</Label>
        {to.map((row) => (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="family@example.com"
                value={row.value}
                onChange={(e) => updateRecipient(row.id, e.target.value)}
                aria-invalid={Boolean(toErrors[row.id])}
                className="h-9 flex-1 rounded-lg"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={to.length <= 1}
                onClick={() => removeRecipient(row.id)}
                aria-label="Remove recipient"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            {toErrors[row.id] && <p className="text-[12px] text-destructive">{toErrors[row.id]}</p>}
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[12px]"
          onClick={addRecipient}
        >
          <Plus className="h-3 w-3" />
          Add recipient
        </Button>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Switch
          checked={sendTestOnSave}
          onChange={setSendTestOnSave}
          aria-label="Send test email after save"
        />
        <span className="text-[13px]">Send test email after save</span>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={inFlight}>
          {status.kind === "saving" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          )}
          {status.kind === "sending" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending test…
            </>
          )}
          {status.kind !== "saving" &&
            status.kind !== "sending" &&
            (sendTestOnSave ? "Save & send test email" : "Save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={inFlight}>
          Cancel
        </Button>
        {status.kind === "ok" && <p className="text-[12px] text-meeting">{status.message}</p>}
        {status.kind === "err" && <p className="text-[12px] text-destructive">{status.message}</p>}
      </div>

      <p className="pt-1 text-[11px] text-muted-foreground">
        For Gmail, use an App Password (2-step verification required).{" "}
        <Link
          href="/gmail-app-password"
          className="text-primary underline-offset-4 hover:underline"
        >
          Setup guide →
        </Link>
      </p>
    </div>
  );
}
