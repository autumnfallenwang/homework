// Shared types for the TeacherEase scraper. Pure module — no platform imports.
// Ported verbatim from the desktop app (src/lib/scraper/types.ts), with one
// change: ChildRecord.id is a uuid string (M02 schema), not a number.

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

// Child row shape the scraper needs. Subset of the DB row; id is a uuid string.
export interface ChildRecord {
  readonly id: string;
  readonly displayName: string;
  readonly portalType: string;
  readonly baseUrl: string;
  readonly username: string;
  readonly grade: string | null;
  readonly school: string | null;
  readonly homeworkUrl: string | null;
  readonly createdAt: string;
}

// Grades overview (the GradeViewAllWithProgress page).
export interface ClassOverview {
  readonly name: string;
  readonly instructor: string;
  readonly status: "meeting" | "needs_attention" | "not_assessed";
  readonly statusCode: number;
  readonly needsAttention: boolean;
  readonly targetsMeeting: number;
  readonly targetsNotMeeting: number;
  readonly totalTargets: number;
  readonly classId: number;
  readonly cgpId: number;
}

export interface GradesOverview {
  readonly classes: readonly ClassOverview[];
  readonly summary: {
    readonly totalClasses: number;
    readonly meetingExpectations: number;
    readonly needsAttention: number;
    readonly notAssessed: number;
    readonly totalTargetsMeeting: number;
    readonly totalTargetsNotMeeting: number;
  };
}

// Class detail (StudentProgressStandardsDetails page).
export interface Assignment {
  readonly testNameId: number;
  readonly dueDate: string;
  readonly name: string;
  readonly weight: string;
  readonly grade: string;
  readonly gradeNumeric: number;
  readonly gradeLetter: string;
  readonly isMissing: boolean;
  readonly feedback: string;
}

export interface Standard {
  readonly name: string;
  readonly score: string;
  readonly scoreNumeric: number;
  readonly scoreLetter: string;
  readonly isMeeting: boolean;
  readonly children: readonly Standard[];
  readonly assignments: readonly Assignment[];
  readonly missingCount: number;
  readonly lowScoreCount: number;
}

export interface ClassDetails {
  readonly className: string;
  readonly standards: readonly Standard[];
  readonly summary: {
    readonly missingAssignments: number;
  };
}

// Homework (Google Sites daily homework page).
export interface HomeworkSubject {
  readonly name: string;
  readonly content: string;
  readonly dueDate: string | null;
}

export interface HomeworkEntry {
  readonly date: string;
  readonly subjects: readonly HomeworkSubject[];
}
