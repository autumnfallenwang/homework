// Homework-URL validation for the "validate before save" flow. Mirrors the
// desktop app's checks: must be a Google Sites URL, reachable, and actually a
// Google Sites homework page (carries the content selector parseHomework reads).
// Throws HomeworkUrlError with a code; the route maps it to a typed JSON body.

import * as cheerio from "cheerio";
import { HOMEWORK_CONTENT_SELECTOR } from "./homework-parser.js";
import { USER_AGENT } from "./transport.js";
import { type FetchImpl, HomeworkUrlError } from "./types.js";

export async function validateHomeworkUrl(url: string, fetchImpl: FetchImpl): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new HomeworkUrlError("invalidUrl", { cause: err });
  }

  if (!parsed.hostname.endsWith("sites.google.com")) {
    throw new HomeworkUrlError("notGoogleSites");
  }

  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    throw new HomeworkUrlError("unreachable", { cause: err });
  }

  if (!res.ok) {
    throw new HomeworkUrlError("unreachableHttp", { status: res.status });
  }

  const $ = cheerio.load(await res.text());
  if ($(HOMEWORK_CONTENT_SELECTOR).length === 0) {
    throw new HomeworkUrlError("notGoogleSitesPage");
  }
}
