# 0012 — The parent can delete any homework item

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** project founder

## Context

[ADR 0008](./0008-solutions-on-the-item-and-a-change-history.md) left the parent with view only
and the child with Delete on an item's first day only, so a duplicate or a mistaken item noticed
after the next 7 AM stayed for good. ADR 0008 named a parent Delete as the first parent action
worth adding; the founder asked for it (2026-10-04).

## Decision

- The parent's item page has a red **Delete** at the bottom left. A click asks inline, the same
  way as the child's ("Delete this homework?" **Delete** / **Keep**); no browser dialog.
- It works on **every item, at any time**: no first-day rule, and whether or not homework entry is
  still on for that child.
- It deletes **for good**: the item, all its photos (removed ones too) and its history. Nothing is
  kept or recorded in the app; the API logs one `homework.deleted` line (item, child, `by:
  parent`).
- `DELETE /api/homework-items/:itemId` (parent-only by path, like the rest of
  `/api/homework-items`): 204, or 404 when there is no such item. Afterwards the page goes to
  Review.
- The child's rules do not change: Delete on the first day only.
- **Lists:** each row of the child's Homework list and the parent's Review list has a vertical ⋮
  menu on the right. Child: **Edit** (opens the item page) and, on the item's first day only,
  **Delete**. Parent: **View** and **Delete** (any item). Delete turns that row into
  `Delete “<title>”?` **Delete** / **Keep** (focus on Keep); the rest of the page stays put and the
  row disappears once the server confirms. The parent has no Edit: view and delete only.

Considered and rejected:
- *Soft delete (hidden, kept for the record)*: the history is there for the parent, and the
  parent is the one deleting; keeping hidden rows and photo bytes buys nothing here.
- *A browser `confirm()` or a modal for the list's Delete*: the inline row is the same pattern as
  the item pages and keeps the item's title next to the question.
- *Parent Edit*: offered and declined (2026-10-04): the parent views and deletes, nothing else.

## Consequences

**Positive:** duplicates and mistakes can be cleaned up at any time; still a single action, in
line with a parent who mostly looks.

**Negative / risks:**
- There is no undo and still **no backups** (ADR 0006): a deleted item's photos of the child's
  finished work are gone.
- The child sees the item disappear from their list with no message.

## Notes

- Amends ADR 0008 decision 5 ("The parent only views").
- Milestone: [11 — Solutions and change history](../milestones/11-solutions-and-history.md).
