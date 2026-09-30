"use client";

import type { ChildLogin, IssuedInvite } from "@homework/shared";
import { Check, Copy, KeyRound, Link2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite, getChildLogin, removeChildLogin } from "@/lib/api";
import { copyText } from "@/lib/clipboard";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * A profile's child login, on its card in Settings → Children (ADR 0004): give
 * the child a one-time invite link, reset their password with another link, or
 * remove the login. A link is shown ONCE, right after it is made — the server
 * keeps only its hash.
 */
export function ChildLoginPanel({ childId, childName }: { childId: string; childName: string }) {
  const [state, setState] = useState<ChildLogin | null>(null);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getChildLogin(childId));
    } catch {
      setError("Could not load the login.");
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue(purpose: "join" | "reset") {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setIssued(await createInvite(childId, purpose));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await removeChildLogin(childId);
      setConfirmingRemove(false);
      setIssued(null);
      await load();
    } catch {
      setError("Could not remove the login.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <div className="mt-2 pl-11 text-[11px] text-muted-foreground">
        {error ?? <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    );
  }

  const url =
    issued && typeof window !== "undefined" ? `${window.location.origin}${issued.path}` : "";

  return (
    <div className="mt-3 space-y-2 border-t pt-3 pl-11" data-testid="child-login">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        {state.login ? (
          <span>
            Login: <span className="font-medium">{state.login.email}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Login: none</span>
        )}
        {state.invite && !issued ? (
          <span className="text-muted-foreground">
            · {state.invite.purpose === "join" ? "invite" : "reset"} link open until{" "}
            {when(state.invite.expiresAt)}
          </span>
        ) : null}
      </div>

      {issued ? (
        <div className="space-y-1.5 rounded-md bg-secondary/60 p-2.5">
          <p className="text-[12px]">
            {issued.purpose === "join"
              ? `Send this link to ${childName}. It creates their login and works once.`
              : `Send this link to ${childName}. It sets a new password and works once.`}
          </p>
          <div className="flex gap-1.5">
            <Input
              readOnly
              value={url}
              className="h-8 font-mono text-[11px]"
              data-testid="invite-url"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={async () => setCopied(await copyText(url))}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Expires {when(issued.expiresAt)}. It is shown only now — make a new one if it gets lost.
          </p>
        </div>
      ) : null}

      {confirmingRemove ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span>Remove {childName}'s login? Their grades and history stay.</span>
          <Button size="sm" variant="destructive" className="h-7" onClick={remove} disabled={busy}>
            Remove
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setConfirmingRemove(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {state.login ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                onClick={() => issue("reset")}
                disabled={busy}
              >
                <Link2 className="h-3 w-3" />
                Reset password link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-destructive"
                onClick={() => setConfirmingRemove(true)}
                disabled={busy}
              >
                Remove login
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              onClick={() => issue("join")}
              disabled={busy}
            >
              <Link2 className="h-3 w-3" />
              {state.invite ? "Create a new invite link" : "Create invite link"}
            </Button>
          )}
        </div>
      )}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
