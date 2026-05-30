// TeacherEase login flow. The login form is a regular HTML form with a
// per-request CSRF token. Ported verbatim from the desktop app.
//
// Flow:
//   1. GET {baseUrl}/common/login.aspx — pick up hidden fields + session cookie.
//   2. POST {baseUrl}/app/Login/Login with hidden fields + email + password.
//   3. Success → 302 redirect. Failure → 200 back on the login page.

import * as cheerio from "cheerio";
import { CookieJar } from "./cookie-jar.js";
import { type FetchImpl, type LoginCredentials, LoginError, type Session } from "./types.js";

const LOGIN_PAGE_PATH = "/common/login.aspx";
const LOGIN_POST_PATH = "/app/Login/Login";

// Identifiable User-Agent so TeacherEase can contact us if needed.
export const USER_AGENT =
  "TeacherEaseParentCompanion/0.1.0 (+https://github.com/autumnfallenwang/teacherease-parent-companion)";

const FIELD_EMAIL = "email";
const FIELD_PASSWORD = "password";

/** Detects "the server bounced us back to the login page" (bad-credentials signal). */
function isLoginPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith("/login.aspx") || path.includes("/login/");
  } catch {
    return false;
  }
}

/**
 * Log in to TeacherEase and return an authenticated session. Throws LoginError
 * on wrong credentials, portal errors, or unexpected HTTP responses.
 */
export async function login(
  baseUrl: string,
  credentials: LoginCredentials,
  fetchImpl: FetchImpl = fetch,
): Promise<Session> {
  const jar = new CookieJar();
  const pageUrl = new URL(LOGIN_PAGE_PATH, baseUrl).toString();
  const postUrl = new URL(LOGIN_POST_PATH, baseUrl).toString();

  // Step 1: GET the login page for hidden fields + initial cookies.
  let pageRes: Response;
  try {
    pageRes = await fetchImpl(pageUrl, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    throw new LoginError("noNetwork", { cause: err });
  }
  if (!pageRes.ok) {
    throw new LoginError("loginPageFetchFailed", { status: pageRes.status });
  }
  jar.absorb(pageRes.headers.getSetCookie());
  const hiddenFields = extractLoginFormFields(await pageRes.text());

  // Step 2: POST credentials + hidden fields.
  const body = buildLoginFormBody(hiddenFields, credentials);
  let loginRes: Response;
  try {
    loginRes = await fetchImpl(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Cookie: jar.header(),
      },
      body,
      // The 302 IS the success signal; don't auto-follow it.
      redirect: "manual",
    });
  } catch (err) {
    throw new LoginError("noNetwork", { cause: err });
  }
  jar.absorb(loginRes.headers.getSetCookie());

  const isRedirect =
    loginRes.status === 302 || loginRes.status === 303 || loginRes.type === "opaqueredirect";
  if (isRedirect) {
    return { baseUrl, cookieHeader: jar.header() };
  }

  // Some clients auto-follow the 302; then success is a 200 whose final URL is
  // off the login page. Bounce back to login = bad credentials.
  if (loginRes.status === 200) {
    if (isLoginPageUrl(loginRes.url)) {
      throw new LoginError("badCredentials");
    }
    return { baseUrl, cookieHeader: jar.header() };
  }

  throw new LoginError("unexpectedStatus", { status: loginRes.status });
}

/** Parse every `<input type="hidden">` inside the login form into a map. */
export function extractLoginFormFields(html: string): Record<string, string> {
  const doc = cheerio.load(html);
  const fields: Record<string, string> = {};
  doc('form input[type="hidden"]').each((_i, el) => {
    const name = doc(el).attr("name");
    if (!name) return;
    fields[name] = doc(el).attr("value") ?? "";
  });
  return fields;
}

/** URL-encode the hidden fields + credentials into a form-encoded POST body. */
export function buildLoginFormBody(
  hiddenFields: Record<string, string>,
  credentials: LoginCredentials,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(hiddenFields)) {
    params.set(k, v);
  }
  params.set(FIELD_EMAIL, credentials.username);
  params.set(FIELD_PASSWORD, credentials.password);
  return params.toString();
}
