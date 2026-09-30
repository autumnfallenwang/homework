"use client";

import { Check, Loader2 } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { useMe, useRefreshMe } from "@/components/auth/session-gate";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, updateMyName } from "@/lib/auth-client";

export const ROLE_LABEL = { parent: "Parent", child: "Child" } as const;

/**
 * Your own login (ADR 0004), for either role: who you are, and a new password.
 * A parent can rename themselves; a child's name comes from their child
 * profile, which only a parent edits.
 */
export function AccountSettings() {
  const me = useMe();
  const isChild = me.user.role === "child";
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Profile"
        help={
          isChild
            ? "Your name comes from your profile. Ask a parent if it needs to change."
            : "The name shown in the sidebar."
        }
      >
        {isChild ? <ReadOnlyProfile /> : <ParentProfileForm />}
      </SettingsSection>
      <SettingsSection
        title="Password"
        help="Changing it signs you out on every other device; this one stays signed in."
      >
        <PasswordForm />
      </SettingsSection>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function ReadOnlyProfile() {
  const me = useMe();
  return (
    <div className="space-y-2">
      <div className="divide-y">
        <Row label="Name" value={me.user.name} />
        <Row label="Username" value={`@${me.user.username ?? ""}`} />
        <Row label="Role" value={ROLE_LABEL[me.user.role]} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        Your name comes from your profile — ask a parent if it needs to change.
      </p>
    </div>
  );
}

function ParentProfileForm() {
  const me = useMe();
  const refreshMe = useRefreshMe();
  const [name, setName] = useState(me.user.name);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setState("saving");
    try {
      await updateMyName(name);
      await refreshMe();
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setState("idle");
          }}
          required
        />
      </div>
      <div className="divide-y">
        <Row label="Email (sign-in)" value={me.user.email} />
        <Row label="Role" value={ROLE_LABEL[me.user.role]} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={state === "saving" || name.trim() === me.user.name}
        >
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save name"}
        </Button>
        {state === "saved" ? (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        ) : null}
        {state === "error" ? (
          <span className="text-[12px] text-destructive">Could not save the name.</span>
        ) : null}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setDone(false);
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    if (next !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      setError("That current password is not right.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Change password"}
        </Button>
        {done ? (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Password changed. Other devices were signed out.
          </span>
        ) : null}
      </div>
    </form>
  );
}
