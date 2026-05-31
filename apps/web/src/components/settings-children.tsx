"use client";

import { Loader2, Lock, Pencil, Plus, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { writeSelectedChildId } from "@/hooks/use-selected-child";
import {
  addChild,
  type ChildRecord,
  getChildPassword,
  getChildren,
  removeChild,
  setHomeworkUrl,
  updateChildIdentity,
  updateChildPassword,
  validateHomeworkUrl,
  validateLogin,
} from "@/lib/api";

function notifyChildDataRefreshed() {
  window.dispatchEvent(new CustomEvent(CHILD_DATA_REFRESHED_EVENT));
}

// Maps a scraper login error code (from validateLogin) to an English message.
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  noNetwork: "Couldn't reach TeacherEase. Check your internet connection.",
  loginPageFetchFailed: "Couldn't load the login page.",
  badCredentials: "Couldn't log in to TeacherEase. Double-check your email and password.",
  unexpectedStatus: "TeacherEase login failed.",
  unknown: "Couldn't log in to TeacherEase.",
};

// Maps a homework-URL error code (from validateHomeworkUrl) to an English message.
const HOMEWORK_ERROR_MESSAGES: Record<string, string> = {
  invalidUrl: "That doesn't look like a valid URL. It should start with https://sites.google.com/",
  notGoogleSites:
    "Homework URL must be a Google Sites page (starts with https://sites.google.com/).",
  unreachable: "Couldn't reach that page. Check your internet connection and the URL.",
  unreachableHttp: "Couldn't reach that page. Double-check the URL.",
  notGoogleSitesPage: "Doesn't look like a Google Sites homework page. Double-check the URL.",
};

function loginErrorMessage(code: string | undefined): string {
  return (code && LOGIN_ERROR_MESSAGES[code]) || LOGIN_ERROR_MESSAGES.unknown;
}

function homeworkErrorMessage(code: string | undefined): string {
  return (code && HOMEWORK_ERROR_MESSAGES[code]) || HOMEWORK_ERROR_MESSAGES.notGoogleSitesPage;
}

/** Thrown when a credential/URL check fails, carrying a ready-to-show message. */
class ValidationError extends Error {}

interface EditChildChanges {
  readonly trimmedName: string;
  readonly trimmedUsername: string;
  readonly typedPassword: string;
  readonly trimmedHwUrl: string;
}

function hwUrlChanged(child: ChildRecord, c: EditChildChanges): boolean {
  return c.trimmedHwUrl !== (child.homeworkUrl ?? "");
}

async function validateChanges(child: ChildRecord, c: EditChildChanges): Promise<void> {
  const usernameChanged = c.trimmedUsername !== child.username;
  const passwordTyped = c.typedPassword.length > 0;
  if (usernameChanged || passwordTyped) {
    // Security: fetch stored password on-demand only — never cached in form state.
    const effective = passwordTyped ? c.typedPassword : ((await getChildPassword(child.id)) ?? "");
    const result = await validateLogin({
      baseUrl: child.baseUrl,
      username: c.trimmedUsername,
      password: effective,
    });
    if (!result.ok) throw new ValidationError(loginErrorMessage(result.code));
  }
  if (hwUrlChanged(child, c) && c.trimmedHwUrl) {
    const result = await validateHomeworkUrl(c.trimmedHwUrl);
    if (!result.ok) throw new ValidationError(homeworkErrorMessage(result.code));
  }
}

async function persistChanges(child: ChildRecord, c: EditChildChanges): Promise<void> {
  const identityChanged =
    c.trimmedName !== child.displayName || c.trimmedUsername !== child.username;
  if (identityChanged) {
    await updateChildIdentity(child.id, {
      displayName: c.trimmedName,
      username: c.trimmedUsername,
    });
  }
  if (c.typedPassword.length > 0) {
    await updateChildPassword(child.id, c.typedPassword);
  }
  if (hwUrlChanged(child, c)) {
    await setHomeworkUrl(child.id, c.trimmedHwUrl || null);
  }
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function SettingsChildren() {
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    setChildren(await getChildren());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRemove = useCallback(
    async (childId: string) => {
      // Confirmation happens inline inside ChildRow — this callback is
      // only reached after the user clicks the explicit Remove button.
      await removeChild(childId);
      await refresh();
      notifyChildDataRefreshed();
    },
    [refresh],
  );

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Children"
        help="The kids this app tracks. Each row edits name, TeacherEase login, and optional homework URL."
        card={false}
      >
        {children.length === 0 && !showAdd ? (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <p className="text-[13px] text-muted-foreground">No children added yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {children.map((child) => (
              <ChildRow key={child.id} child={child} onRemove={handleRemove} onChanged={refresh} />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Add a child"
        help="Validates the TeacherEase login before saving so a bad password doesn't silently land. Homework URL is optional."
        card={false}
      >
        {showAdd ? (
          <AddChildForm
            onDone={async () => {
              setShowAdd(false);
              await refresh();
              notifyChildDataRefreshed();
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add another child
          </Button>
        )}
      </SettingsSection>
    </div>
  );
}

function ChildRow({
  child,
  onRemove,
  onChanged,
}: {
  child: ChildRecord;
  onRemove: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onRemove(child.id);
      // Parent will unmount this row via the refresh; no further state to reset.
    } finally {
      setDeleting(false);
    }
  };

  if (confirmingDelete) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <User className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">Remove {child.displayName}?</p>
            <p className="text-[12px] text-muted-foreground">
              Deletes all local grade and homework history. TeacherEase is not affected.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            onClick={handleConfirmDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <EditChildForm
        child={child}
        onDone={async () => {
          setEditing(false);
          await onChanged();
          notifyChildDataRefreshed();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="group rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{child.displayName}</p>
          <p className="truncate text-[12px] text-muted-foreground">{child.username}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[11px]"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Remove child"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      <div className="mt-2 pl-11 text-[11px] text-muted-foreground">
        {child.homeworkUrl ? `Homework: ${child.homeworkUrl}` : "Homework: not set"}
      </div>
    </div>
  );
}

function EditChildForm({
  child,
  onDone,
  onCancel,
}: {
  child: ChildRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(child.displayName);
  const [username, setUsername] = useState(child.username);
  const [password, setPassword] = useState("");
  const [homeworkUrl, setHomeworkUrlInput] = useState(child.homeworkUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const changes = {
        trimmedName: displayName.trim() || "My Child",
        trimmedUsername: username.trim(),
        typedPassword: password, // don't trim — passwords can contain spaces
        trimmedHwUrl: homeworkUrl.trim(),
      };
      await validateChanges(child, changes);
      await persistChanges(child, changes);
      await onDone();
    } catch (err) {
      setError(describeError(err, "Couldn't save changes."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        Credentials stored securely on this computer
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edit-name-${child.id}`} className="text-[13px]">
          Child's name
        </Label>
        <Input
          id={`edit-name-${child.id}`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`edit-email-${child.id}`} className="text-[13px]">
          TeacherEase email
        </Label>
        <Input
          id={`edit-email-${child.id}`}
          type="email"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`edit-pass-${child.id}`} className="text-[13px]">
          Password
        </Label>
        <Input
          id={`edit-pass-${child.id}`}
          type="password"
          placeholder="Leave blank to keep current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edit-homework-${child.id}`} className="text-[13px]">
          Homework page URL
        </Label>
        <Input
          id={`edit-homework-${child.id}`}
          type="url"
          placeholder="https://sites.google.com/..."
          value={homeworkUrl}
          onChange={(e) => setHomeworkUrlInput(e.target.value)}
          className="h-9 rounded-lg"
        />
        <p className="text-[11px] text-muted-foreground">Optional — leave blank to skip.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddChildForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [homeworkUrl, setHomeworkUrlInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError(null);

    try {
      const baseUrl = "https://www.teacherease.com";
      const loginResult = await validateLogin({ baseUrl, username, password });
      if (!loginResult.ok) throw new ValidationError(loginErrorMessage(loginResult.code));
      const trimmedHwUrl = homeworkUrl.trim();
      if (trimmedHwUrl) {
        const hwResult = await validateHomeworkUrl(trimmedHwUrl);
        if (!hwResult.ok) throw new ValidationError(homeworkErrorMessage(hwResult.code));
      }
      const newChildId = await addChild({
        displayName: displayName || "My Child",
        baseUrl,
        username,
        password,
        homeworkUrl: trimmedHwUrl || null,
      });
      // Auto-select the newly added child so the sidebar highlights them
      // and Today immediately scopes to them. The Refresh button still
      // needs to be clicked to populate their first scrape.
      writeSelectedChildId(newChildId);
      await onDone();
    } catch (err) {
      setError(describeError(err, "Login failed"));
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        Credentials stored securely on this computer
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="add-name" className="text-[13px]">
          Child's name
        </Label>
        <Input
          id="add-name"
          placeholder="e.g. Alex"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-email" className="text-[13px]">
          TeacherEase email
        </Label>
        <Input
          id="add-email"
          type="email"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-pass" className="text-[13px]">
          Password
        </Label>
        <Input
          id="add-pass"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="add-homework" className="text-[13px]">
          Homework page URL
        </Label>
        <Input
          id="add-homework"
          type="url"
          placeholder="https://sites.google.com/..."
          value={homeworkUrl}
          onChange={(e) => setHomeworkUrlInput(e.target.value)}
          className="h-9 rounded-lg"
        />
        <p className="text-[11px] text-muted-foreground">Optional — leave blank to skip.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isValidating}>
          {isValidating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {isValidating ? "Verifying..." : "Add child"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
