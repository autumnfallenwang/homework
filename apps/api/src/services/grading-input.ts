// Load what one grade looks at (ADR 0014): the item, its class, the child's
// school grade and the photos she still sees — sheet photos first, then her
// solution photos, each in the order her page shows them.

import { OTHER_CLASS_LABEL } from "@homework/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { childClasses, children, homeworkItems, homeworkPhotos } from "../db/schema.js";
import type { GradingInput, GradingPhoto } from "./grading-prompt.js";

/** The item as it stands now, or null when it is gone or was never submitted. */
export async function loadGradingInput(
  db: Database,
  itemId: string,
  instructions: string,
): Promise<GradingInput | null> {
  const [row] = await db
    .select({
      id: homeworkItems.id,
      kind: homeworkItems.kind,
      title: homeworkItems.title,
      details: homeworkItems.details,
      assignedOn: homeworkItems.assignedOn,
      dueOn: homeworkItems.dueOn,
      submittedAt: homeworkItems.submittedAt,
      note: homeworkItems.solutionNote,
      className: childClasses.name,
      schoolGrade: children.grade,
      childId: children.id,
      childName: children.displayName,
    })
    .from(homeworkItems)
    .innerJoin(children, eq(children.id, homeworkItems.childId))
    .leftJoin(childClasses, eq(childClasses.id, homeworkItems.classId))
    .where(eq(homeworkItems.id, itemId));
  if (!row?.submittedAt) return null;

  const photos = await db
    .select({
      id: homeworkPhotos.id,
      kind: homeworkPhotos.kind,
      contentType: homeworkPhotos.contentType,
      bytes: homeworkPhotos.bytes,
    })
    .from(homeworkPhotos)
    .where(and(eq(homeworkPhotos.itemId, itemId), isNull(homeworkPhotos.removedAt)))
    .orderBy(
      sql`case when ${homeworkPhotos.kind} = 'sheet' then 0 else 1 end`,
      asc(homeworkPhotos.createdAt),
      asc(homeworkPhotos.id),
    );

  return {
    itemId: row.id,
    childId: row.childId,
    childName: row.childName,
    schoolGrade: row.schoolGrade?.trim() || null,
    className: row.className ?? OTHER_CLASS_LABEL,
    kind: row.kind as GradingInput["kind"],
    title: row.title,
    details: row.details,
    assignedOn: row.assignedOn,
    dueOn: row.dueOn,
    submittedAt: row.submittedAt,
    note: row.note,
    photos: photos.map(
      (p): GradingPhoto => ({
        id: p.id,
        kind: p.kind === "solution" ? "solution" : "sheet",
        contentType: p.contentType,
        bytes: Buffer.from(p.bytes),
      }),
    ),
    instructions,
  };
}
