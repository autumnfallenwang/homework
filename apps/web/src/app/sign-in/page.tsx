"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useEffect, useState } from "react";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMe, getSetupState, homeFor, signIn, signUpParent } from "@/lib/auth-client";

/**
 * `/sign-in` — the only door (ADR 0004). Parents sign in with their email,
 * children with the email they gave on their invite link. On a fresh
 * install it asks for the parent account instead: the first account is the
 * parent, and sign-up closes behind it.
 */
export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "sign-in" | "first-parent">("loading");

  useEffect(() => {
    void (async () => {
      const me = await getMe().catch(() => null);
      if (me) {
        router.replace(homeFor(me));
        return;
      }
      const state = await getSetupState().catch(() => ({ needsFirstParent: false }));
      setMode(state.needsFirstParent ? "first-parent" : "sign-in");
    })();
  }, [router]);

  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return mode === "first-parent" ? <FirstParentForm /> : <SignInForm />;
}

function SignInForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
      const me = await getMe();
      router.replace(me ? homeFor(me) : "/");
    } catch {
      setError("That email or password is not right.");
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in to Homework">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email</Label>
          <Input
            id="identifier"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <FormError message={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
        <p className="text-center text-[12px] text-muted-foreground">
          Children: no login yet? Ask a parent for your invite link.
        </p>
      </form>
    </AuthCard>
  );
}

function FirstParentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await signUpParent(name, email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Create the parent account"
      subtitle="This is the first sign-in on this install. The account you create here manages children, their TeacherEase login and their invite links."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <FormError message={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create parent account"}
        </Button>
      </form>
    </AuthCard>
  );
}
