// TeacherEase FetchSource. Wraps login + grades-overview + class-detail HTTP
// flow and hands parsed data to persistTeacherEaseData. Ported from the desktop
// app; the password comes from the child row (DB), and fetch is injected.

import type { Database } from "../db/index.js";
import { parseClassDetails, parseGradesOverview } from "../scraper/parser.js";
import { login } from "../scraper/teacherease.js";
import { USER_AGENT } from "../scraper/transport.js";
import { type ClassDetails, type GradesOverview, ParserError } from "../scraper/types.js";
import { persistTeacherEaseData } from "./persist.js";
import type { FetchContext, FetchSource } from "./types.js";

const GRADES_PATH = "/App/Parents/StandardGrade/GradeViewAllWithProgress";

export class TeacherEaseSource implements FetchSource {
  readonly name = "teacherease";

  constructor(
    private readonly db: Database,
    private readonly getPassword: (childId: string) => Promise<string | null>,
  ) {}

  isApplicable(_child: { portalType: string }): boolean {
    // TeacherEase is the only portal today. Future: gate on child.portalType.
    return true;
  }

  async run(ctx: FetchContext): Promise<void> {
    const password = await this.getPassword(ctx.childId);
    if (!password) throw new Error("No stored password — re-add this child");

    const session = await login(
      ctx.child.baseUrl,
      { username: ctx.child.username, password },
      ctx.fetchImpl,
    );

    const gradesUrl = new URL(GRADES_PATH, session.baseUrl).toString();
    const gradesRes = await ctx.fetchImpl(gradesUrl, {
      headers: { Cookie: session.cookieHeader, "User-Agent": USER_AGENT },
    });
    let overview: GradesOverview;
    try {
      overview = parseGradesOverview(await gradesRes.text());
    } catch (err) {
      throw new ParserError("Failed to parse grades overview", { cause: err });
    }

    const classDetails: ClassDetails[] = [];
    for (const cls of overview.classes) {
      const url = new URL(
        `/common/StudentProgressStandardsDetails.aspx?ClassID=${cls.classId}&CGPID=${cls.cgpId}`,
        session.baseUrl,
      ).toString();
      const res = await ctx.fetchImpl(url, {
        headers: { Cookie: session.cookieHeader, "User-Agent": USER_AGENT },
      });
      try {
        classDetails.push(parseClassDetails(await res.text(), cls.name));
      } catch (err) {
        throw new ParserError(`Failed to parse class details for ${cls.name}`, { cause: err });
      }
    }

    await persistTeacherEaseData(this.db, ctx.fetchRunId, overview, classDetails);
  }
}
