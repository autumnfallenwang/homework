// HTTP client for the Hono backend — the web's transport layer. Replaces the
// desktop app's Tauri IPC facade (`src/lib/ipc.ts`); function names/shapes
// mirror it 1:1 so the ported components are unchanged apart from the import
// path and uuid string ids. Desktop-only IPC (scheduler tick, tray events,
// updater, autostart, OS log, direct SMTP send) is dropped — those now live
// server-side (M03/M05) or are gone.

import type {
  AssignmentRecord,
  AttentionConfig,
  ChildLogin,
  ChildProfile,
  ChildRecord,
  ClassDetails,
  ClassRecord,
  CreateHomeworkItemInput,
  FetchRunRecord,
  GradeRecord,
  HomeworkClass,
  HomeworkClassListInput,
  HomeworkClassSuggestions,
  HomeworkDay,
  HomeworkItem,
  HomeworkItemList,
  HomeworkMonth,
  HomeworkPhotoRef,
  HomeworkRecord,
  HomeworkSource,
  InvitePurpose,
  IssuedInvite,
  StatusHistoryEntry,
  UpdateHomeworkItemInput,
} from "@homework/shared";

// Re-export the entity types so components can `import { type X } from "@/lib/api"`
// exactly as they did from the desktop ipc module.
export type {
  AssignmentRecord,
  AttentionConfig,
  ChildRecord,
  ClassDetails,
  ClassRecord,
  FetchRunRecord,
  GradeRecord,
  HomeworkRecord,
  StatusHistoryEntry,
} from "@homework/shared";

export type FetchRunStatus = "success" | "failed" | "parser_error";

export interface AddChildParams {
  displayName: string;
  baseUrl: string;
  username: string;
  password: string;
  grade?: string;
  school?: string;
  homeworkUrl?: string | null;
}

/** Result of POST /children/:id/fetch (the FetchRunner summary). */
export interface FetchRunnerSummary {
  successes: number;
  failures: number;
  skipped: number;
  runs: ReadonlyArray<{
    source: string;
    fetchRunId: string;
    status: FetchRunStatus;
    durationMs: number;
    errorMessage?: string;
  }>;
}

// --- Base URL + low-level request -----------------------------------------

/**
 * Dual-context base URL:
 * - Server (SSR): `API_URL` (in-cluster Service DNS) → `NEXT_PUBLIC_API_URL`.
 * - Browser: `NEXT_PUBLIC_API_URL` (public ingress, baked at build).
 * Falls back to the local dev API port.
 */
export function apiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.error);
    this.name = "ApiClientError";
  }
}

/** Pages that talk to the API before anyone is signed in. */
export function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/sign-in") || pathname.startsWith("/join");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  // Session gone (expired, signed out elsewhere, password reset): back to the
  // door. The sign-in and join pages handle their own 401s.
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !isAuthPage(window.location.pathname)
  ) {
    window.location.assign("/sign-in");
  }
  if (!res.ok) {
    let body: ApiError;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = { error: `HTTP ${res.status}` };
    }
    throw new ApiClientError(res.status, body);
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined });
const patch = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined });
const put = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

/** Low-level escape hatch (mirrors the desktop `api.{get,post,...}` shape). */
export const api = { get, post, patch, put, delete: del };

// --- Children -------------------------------------------------------------

export function getChildren(): Promise<ChildRecord[]> {
  return get<ChildRecord[]>("/api/children");
}

export async function getChild(childId: string): Promise<ChildRecord | null> {
  try {
    return await get<ChildRecord>(`/api/children/${childId}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return null;
    throw err;
  }
}

export async function addChild(params: AddChildParams): Promise<string> {
  const child = await post<ChildRecord>("/api/children", params);
  return child.id;
}

export function removeChild(childId: string): Promise<void> {
  return del<void>(`/api/children/${childId}`);
}

export function updateChildPassword(childId: string, password: string): Promise<unknown> {
  return patch(`/api/children/${childId}`, { password });
}

export function updateChildIdentity(
  childId: string,
  params: { displayName: string; username: string },
): Promise<unknown> {
  return patch(`/api/children/${childId}`, params);
}

export function setHomeworkUrl(childId: string, url: string | null): Promise<unknown> {
  return patch(`/api/children/${childId}`, { homeworkUrl: url });
}

export async function getChildPassword(childId: string): Promise<string | null> {
  const res = await get<{ password: string | null }>(`/api/children/${childId}/password`);
  return res.password;
}

// --- Fetch runs + trigger -------------------------------------------------

export interface FetchRunsQuery {
  latest?: boolean;
  successful?: boolean;
  source?: string;
  limit?: number;
}

export function getFetchRunsForChild(
  childId: string,
  query: FetchRunsQuery = {},
): Promise<FetchRunRecord[]> {
  const p = new URLSearchParams();
  if (query.latest) p.set("latest", "true");
  if (query.successful) p.set("successful", "true");
  if (query.source) p.set("source", query.source);
  if (query.limit != null) p.set("limit", String(query.limit));
  const qs = p.toString();
  return get<FetchRunRecord[]>(`/api/children/${childId}/fetch-runs${qs ? `?${qs}` : ""}`);
}

export async function getLatestFetchRun(childId: string): Promise<FetchRunRecord | null> {
  const runs = await getFetchRunsForChild(childId, { latest: true });
  return runs[0] ?? null;
}

export async function getLatestSuccessfulFetchRun(
  childId: string,
  source: string,
): Promise<FetchRunRecord | null> {
  const runs = await getFetchRunsForChild(childId, { latest: true, successful: true, source });
  return runs[0] ?? null;
}

/** Trigger a synchronous fetch for one child ("Fetch now"). */
export function triggerFetch(childId: string): Promise<FetchRunnerSummary> {
  return post<FetchRunnerSummary>(`/api/children/${childId}/fetch`);
}

// --- Grades / classes / standards -----------------------------------------

/** Latest successful run's grades. Empty array when there's no run yet. */
export function getLatestGrades(childId: string): Promise<GradeRecord[]> {
  return get<GradeRecord[]>(`/api/children/${childId}/grades`);
}

export function getGradesForFetchRun(fetchRunId: string): Promise<GradeRecord[]> {
  return get<GradeRecord[]>(`/api/fetch-runs/${fetchRunId}/grades`);
}

export function getAssignmentsForFetchRun(fetchRunId: string): Promise<AssignmentRecord[]> {
  return get<AssignmentRecord[]>(`/api/fetch-runs/${fetchRunId}/assignments`);
}

export function getClasses(childId: string): Promise<ClassRecord[]> {
  return get<ClassRecord[]>(`/api/children/${childId}/classes`);
}

export function getAllStatusHistory(
  childId: string,
  limit = 5,
): Promise<Record<string, StatusHistoryEntry[]>> {
  return get<Record<string, StatusHistoryEntry[]>>(
    `/api/children/${childId}/status-history?limit=${limit}`,
  );
}

export function getAllClassDetails(fetchRunId: string): Promise<ClassDetails[]> {
  return get<ClassDetails[]>(`/api/fetch-runs/${fetchRunId}/standards`);
}

export async function getClassDetail(
  fetchRunId: string,
  className: string,
): Promise<ClassDetails | null> {
  try {
    return await get<ClassDetails>(
      `/api/fetch-runs/${fetchRunId}/standards?class=${encodeURIComponent(className)}`,
    );
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return null;
    throw err;
  }
}

// --- Homework -------------------------------------------------------------

export function getHomeworkForDay(childId: string, iso: string): Promise<HomeworkRecord[]> {
  return get<HomeworkRecord[]>(`/api/children/${childId}/homework?date=${iso}`);
}

export function getHomeworkByMonth(childId: string, yearMonth: string): Promise<HomeworkRecord[]> {
  return get<HomeworkRecord[]>(`/api/children/${childId}/homework?month=${yearMonth}`);
}

export function getHomeworkMonths(childId: string): Promise<HomeworkMonth[]> {
  return get<HomeworkMonth[]>(`/api/children/${childId}/homework/months`);
}

// --- Settings -------------------------------------------------------------

export async function getSettingString(key: string, defaultValue: string): Promise<string> {
  try {
    const res = await get<{ key: string; value: string }>(`/api/settings/${key}`);
    return res.value;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return defaultValue;
    throw err;
  }
}

export async function setSettingString(key: string, value: string): Promise<void> {
  await put(`/api/settings/${key}`, { value });
}

export async function getSettingBool(key: string, defaultValue: boolean): Promise<boolean> {
  const v = await getSettingString(key, defaultValue ? "1" : "0");
  return v === "1";
}

export async function setSettingBool(key: string, value: boolean): Promise<void> {
  await setSettingString(key, value ? "1" : "0");
}

export function getAttentionConfig(): Promise<AttentionConfig> {
  return get<AttentionConfig>("/api/attention-config");
}

// --- Scraper validation ---------------------------------------------------

export interface LoginCheckResult {
  ok: boolean;
  code?: string;
}

export function validateLogin(args: {
  baseUrl: string;
  username: string;
  password: string;
}): Promise<LoginCheckResult> {
  return post<LoginCheckResult>("/api/scraper/login", args);
}

export function validateHomeworkUrl(url: string): Promise<LoginCheckResult> {
  return post<LoginCheckResult>("/api/scraper/validate-homework-url", { url });
}

// --- Digest (M05) ---------------------------------------------------------

export function sendDigestTest(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/digest/test");
}

export function sendDigestNow(): Promise<{ sent: boolean }> {
  return post<{ sent: boolean }>("/api/digest/send");
}

// --- App ------------------------------------------------------------------

export function resetAllAppData(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/app/reset");
}

export async function getAppVersion(): Promise<string> {
  const res = await get<{ version: string }>("/api/app/version");
  return res.version;
}

// --- Child logins (ADR 0004) ------------------------------------------------

/** A profile's child login and any open invite link — for its card in Settings. */
export function getChildLogin(childId: string): Promise<ChildLogin> {
  return get(`/api/children/${childId}/login`);
}

/** Issue a one-time link. The token is returned once; only its hash is stored. */
export function createInvite(childId: string, purpose: InvitePurpose): Promise<IssuedInvite> {
  return post(`/api/children/${childId}/invites`, { purpose });
}

export function removeChildLogin(childId: string): Promise<void> {
  return del(`/api/children/${childId}/login`);
}

/** What a signed-in child may read about their own profile. */
export function getChildProfile(): Promise<ChildProfile> {
  return get("/api/child/profile");
}

// --- Child-entered homework (ADR 0006) ---------------------------------------

/** The "Child enters homework" switch on a child's card. */
export function setHomeworkSource(childId: string, source: HomeworkSource): Promise<ChildRecord> {
  return patch(`/api/children/${childId}`, { homeworkSource: source });
}

export function getHomeworkClasses(childId: string): Promise<HomeworkClass[]> {
  return get(`/api/children/${childId}/homework-classes`);
}

/** Replace the whole list, in order (an entry with an id keeps that class). */
export function saveHomeworkClasses(
  childId: string,
  classes: HomeworkClassListInput["classes"],
): Promise<HomeworkClass[]> {
  return put(`/api/children/${childId}/homework-classes`, { classes });
}

export function getHomeworkClassSuggestions(childId: string): Promise<HomeworkClassSuggestions> {
  return get(`/api/children/${childId}/homework-classes/suggestions`);
}

/** A child's list, read only (the parent's Review tab and Today). */
export function getChildHomeworkItems(childId: string): Promise<HomeworkItemList> {
  return get(`/api/children/${childId}/homework-items`);
}

export function getHomeworkItem(itemId: string): Promise<HomeworkItem> {
  return get(`/api/homework-items/${itemId}`);
}

export function homeworkPhotoUrl(itemId: string, photoId: string): string {
  return `${apiBaseUrl()}/api/homework-items/${itemId}/photos/${photoId}`;
}

// The signed-in child's own (the child id comes from the session).

export function getMyHomework(): Promise<HomeworkItemList> {
  return get("/api/child/homework");
}

export function getMyHomeworkItem(itemId: string): Promise<HomeworkItem> {
  return get(`/api/child/homework/${itemId}`);
}

export function createMyHomework(input: CreateHomeworkItemInput): Promise<HomeworkItem> {
  return post("/api/child/homework", input);
}

export function updateMyHomework(
  itemId: string,
  input: UpdateHomeworkItemInput,
): Promise<HomeworkItem> {
  return patch(`/api/child/homework/${itemId}`, input);
}

export function deleteMyHomework(itemId: string): Promise<void> {
  return del(`/api/child/homework/${itemId}`);
}

/** Upload one (already shrunk) photo as the raw request body. */
export function uploadMyHomeworkPhoto(itemId: string, photo: Blob): Promise<HomeworkPhotoRef> {
  return request(`/api/child/homework/${itemId}/photos`, {
    method: "POST",
    body: photo,
    headers: { "Content-Type": photo.type || "image/jpeg" },
  });
}

export function deleteMyHomeworkPhoto(itemId: string, photoId: string): Promise<void> {
  return del(`/api/child/homework/${itemId}/photos/${photoId}`);
}

export function myHomeworkPhotoUrl(itemId: string, photoId: string): string {
  return `${apiBaseUrl()}/api/child/homework/${itemId}/photos/${photoId}`;
}

export function getMyHomeworkClasses(): Promise<HomeworkClass[]> {
  return get("/api/child/homework-classes");
}

/** "That's everything for today" — or take it back. */
export function setMyDayComplete(complete: boolean): Promise<HomeworkDay> {
  return complete ? put("/api/child/homework-day") : del("/api/child/homework-day");
}
