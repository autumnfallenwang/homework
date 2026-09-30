// Fake signed-in users for route tests: `createApp({ resolveSession: asParent })`
// exercises a route as the parent without Better Auth or a database. The real
// session path is covered by auth.integration.test.ts.

import type { ResolveSession, SessionUser } from "../middleware/auth.js";

export const PARENT: SessionUser = {
  id: "00000000-0000-4000-8000-00000000000a",
  name: "Test Parent",
  email: "parent@example.com",
  role: "parent",
  childId: null,
};

export function childOf(childId: string): SessionUser {
  return {
    id: "00000000-0000-4000-8000-00000000000b",
    name: "Test Child",
    email: `child-${childId}@homework.invalid`,
    role: "child",
    childId,
  };
}

export const asParent: ResolveSession = async () => PARENT;
export const asChild =
  (childId = "00000000-0000-4000-8000-0000000000c1"): ResolveSession =>
  async () =>
    childOf(childId);
export const asNobody: ResolveSession = async () => null;
