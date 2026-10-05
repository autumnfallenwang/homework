"use client";

import type { InvitePreview } from "@homework/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type SyntheticEvent, useEffect, useState } from "react";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite, previewInvite, signIn } from "@/lib/auth-client";

/**
 * `/join/<token>` — a one-time link from a parent (ADR 0004). A 'join' link
 * creates the child's login for the profile it was made for; a 'reset' link sets
 * a new password. Either way the child is signed in straight after.
 */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const [preview, setPreview] = useState<InvitePreview | "loading">("loading");

  useEffect(() => {
    void previewInvite(token)
      .then(setPreview)
      .catch(() => setPreview({ status: "invalid" }));
  }, [token]);

  if (preview === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (preview.status !== "valid") return <DeadLink status={preview.status} />;
  return <JoinForm token={token} preview={preview} />;
}

const DEAD: Record<"invalid" | "expired" | "used", string> = {
  invalid: "This link does not work. Check that you copied all of it.",
  expired: "This link has expired.",
  used: "This link has already been used.",
};

function DeadLink({ status }: { status: "invalid" | "expired" | "used" }) {
  return (
    <AuthCard title="Link not available" subtitle={DEAD[status]}>
      <div className="space-y-3 text-center">
        <p className="text-[0.8125rem] text-muted-foreground">Ask a parent for a new link.</p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </div>
    </AuthCard>
  );
}

function JoinForm({
  token,
  preview,
}: {
  token: string;
  preview: Extract<InvitePreview, { status: "valid" }>;
}) {
  const router = useRouter();
  const isJoin = preview.purpose === "join";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (isJoin && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return setError("Enter a valid email.");
    }
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      const accepted = await acceptInvite(token, {
        ...(isJoin ? { email: email.trim() } : {}),
        password,
      });
      await signIn(accepted.email, password);
      router.replace("/child");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={isJoin ? `Hi ${preview.childName}!` : "Set a new password"}
      subtitle={
        isJoin
          ? "Create your Homework login with your email and a password. You will use it to add your homework and hand in your work."
          : `Choose a new password for ${preview.email ?? preview.childName}.`
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {isJoin ? (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-[0.6875rem] text-muted-foreground">You will sign in with it.</p>
          </div>
        ) : null}
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
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isJoin ? (
            "Create my login"
          ) : (
            "Save new password"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
