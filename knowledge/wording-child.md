---
name: wording-child
description: Say "child"/"children" everywhere — never "kid" — in code, API paths, role values, UI copy, tests and docs; a child PROFILE is a `children` row, a child LOGIN is a user with role `child`.
metadata:
  type: feedback
---

Use **"child" / "children"** for the young user everywhere: identifiers, API paths (`/api/child/*`),
web routes (`/child`), the role value (`'child'`), UI copy, test data, comments and docs. Do not
introduce the word "kid" in any file.

Two things share the word, so name which one:
- **child profile** — a `children` row: the student, their grades/homework, and the parent-managed
  data sources (TeacherEase login, homework page).
- **child login** — a Better Auth user with `role: 'child'` (signs in with email, ADR 0005),
  linked by `users.child_id`.

In generic code comments and copy, refer to a child as "they/their", not "she/her".

**Why:** the project owner asked for one consistent term (2026-09-29, during M09) after the first
draft of the auth work used "kid".

**How to apply:** grep before committing (`grep -rIin kid apps packages docs`); name functions
`…ChildLogin…` for login operations and keep `…Child…` / `children` for the profile. Related:
[[better-auth-parent-child]].
