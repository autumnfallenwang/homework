// Homework FetchSource. Wraps fetch + parseHomework + persistHomework. Ported
// from the desktop app; fetch is injected and persistence is Drizzle.

import type { Database } from "../db/index.js";
import { parseHomework } from "../scraper/homework-parser.js";
import { USER_AGENT } from "../scraper/transport.js";
import { ParserError } from "../scraper/types.js";
import { persistHomework } from "./persist.js";
import type { FetchContext, FetchSource } from "./types.js";

export class HomeworkSource implements FetchSource {
  readonly name = "homework";

  constructor(private readonly db: Database) {}

  /** Only for a child whose homework comes from the page (ADR 0006). */
  isApplicable(child: { homeworkUrl: string | null; homeworkSource: string }): boolean {
    return Boolean(child.homeworkUrl) && child.homeworkSource !== "child";
  }

  async run(ctx: FetchContext): Promise<void> {
    const url = ctx.child.homeworkUrl;
    if (!url) throw new Error("homework url not set");

    const res = await ctx.fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Homework fetch failed: HTTP ${res.status}`);

    let entries: ReturnType<typeof parseHomework>;
    try {
      entries = parseHomework(await res.text());
    } catch (err) {
      throw new ParserError("Failed to parse homework page", { cause: err });
    }
    await persistHomework(this.db, ctx.childId, entries);
  }
}
