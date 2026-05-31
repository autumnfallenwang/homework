// Scraper types. The pure data *payload* shapes (ClassDetails, Standard,
// Assignment, GradesOverview, ChildRecord, Homework*) now live in
// @homework/shared so the API, the web, and the attention engine share one
// definition; this module re-exports them for the scraper's existing imports.
// The runtime error classes and the I/O contracts (Session, FetchImpl) stay
// here — they are server-only and carry no value to the web bundle.

export type {
  Assignment,
  ChildRecord,
  ClassDetails,
  ClassOverview,
  GradesOverview,
  HomeworkEntry,
  HomeworkSubject,
  Standard,
} from "@homework/shared";

export interface LoginCredentials {
  readonly username: string;
  readonly password: string;
}

/**
 * An authenticated scraper session, scoped to a single scrape run. Holds the
 * pre-built Cookie header the rest of the scraper sends on authenticated requests.
 */
export interface Session {
  readonly baseUrl: string;
  readonly cookieHeader: string;
}

/**
 * Fetch implementation contract. Parameterized so tests can inject a mock and
 * the production caller injects a Node fetch without touching function bodies.
 */
export type FetchImpl = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Login error codes. Stay as codes (not English) so callers can translate.
 * - `noNetwork` — fetch threw (DNS, offline, etc.)
 * - `loginPageFetchFailed` — login page returned non-2xx (status in vars)
 * - `badCredentials` — server bounced us back to the login page
 * - `unexpectedStatus` — server replied with something we can't read
 * - `unknown` — fallback used by call sites
 */
export type LoginErrorCode =
  | "noNetwork"
  | "loginPageFetchFailed"
  | "badCredentials"
  | "unexpectedStatus"
  | "unknown";

/** Thrown when login fails. Carries a code (not English text). */
export class LoginError extends Error {
  readonly code: LoginErrorCode;
  readonly status?: number;

  constructor(code: LoginErrorCode, options?: ErrorOptions & { status?: number }) {
    super(code, options);
    this.name = "LoginError";
    this.code = code;
    this.status = options?.status;
  }
}

/**
 * Homework-URL validation error codes (mirrors LoginErrorCode shape).
 * - `invalidUrl` — `new URL()` threw
 * - `notGoogleSites` — hostname mismatch
 * - `unreachable` — fetch threw
 * - `unreachableHttp` — fetch returned non-2xx (status in vars)
 * - `notGoogleSitesPage` — fetched page lacks the homework-content selector
 */
export type HomeworkUrlErrorCode =
  | "invalidUrl"
  | "notGoogleSites"
  | "unreachable"
  | "unreachableHttp"
  | "notGoogleSitesPage";

export class HomeworkUrlError extends Error {
  readonly code: HomeworkUrlErrorCode;
  readonly status?: number;

  constructor(code: HomeworkUrlErrorCode, options?: ErrorOptions & { status?: number }) {
    super(code, options);
    this.name = "HomeworkUrlError";
    this.code = code;
    this.status = options?.status;
  }
}

/**
 * Thrown when parsing a fetched page fails in a way that should be recorded as
 * `parser_error` (distinct from a network/login `failed`). New in the port —
 * lets runFetch classify the fetch_run status.
 */
export class ParserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ParserError";
  }
}
