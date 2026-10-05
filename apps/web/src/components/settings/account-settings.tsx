"use client";

import { Check, Loader2 } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { useMe, useRefreshMe } from "@/components/auth/session-gate";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, updateMe } from "@/lib/auth-client";

export const ROLE_LABEL = { parent: "Parent", child: "Child" } as const;

/**
 * Your own login (ADR 0004, ADR 0005) — the same page for both roles: name,
 * email (your sign-in), role, and a new password. A child's name comes from
 * their child profile, which only a parent edits, so it is shown locked.
 */
export function AccountSettings() {
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Profile"
        help="Your name is shown in the app; your email is your sign-in."
      >
        <ProfileForm />
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

function ProfileForm() {
  const me = useMe();
  const refreshMe = useRefreshMe();
  const nameLocked = me.user.role === "child";
  const [name, setName] = useState(me.user.name);
  const [email, setEmail] = useState(me.user.email);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const changed = {
    ...(!nameLocked && name.trim() !== me.user.name ? { name: name.trim() } : {}),
    ...(email.trim().toLowerCase() !== me.user.email ? { email: email.trim() } : {}),
  };
  const dirty = Object.keys(changed).length > 0;

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    if (!dirty) return;
    setState("saving");
    setError(null);
    try {
      await updateMe(changed);
      await refreshMe();
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setState("idle");
    }
  }

  const edit = () => {
    setState("idle");
    setError(null);
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          value={name}
          disabled={nameLocked}
          onChange={(e) => {
            setName(e.target.value);
            edit();
          }}
          required
        />
        {nameLocked ? (
          <p className="text-[0.75rem] text-muted-foreground">
            Your name comes from your profile — ask a parent if it needs to change.
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-email">Email</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            edit();
          }}
          required
        />
        <p className="text-[0.75rem] text-muted-foreground">You sign in with it.</p>
      </div>
      <div className="flex items-baseline justify-between gap-3 py-1.5 text-[0.8125rem]">
        <span className="text-muted-foreground">Role</span>
        <span className="font-medium">{ROLE_LABEL[me.user.role]}</span>
      </div>
      {error ? (
        <p role="alert" className="text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!dirty || state === "saving"}>
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save changes"}
        </Button>
        {state === "saved" ? (
          <span className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
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
        <p role="alert" className="text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Change password"}
        </Button>
        {done ? (
          <span className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Password changed. Other devices were signed out.
          </span>
        ) : null}
      </div>
    </form>
  );
}
