# 0009 — Homework photos open in one in-page viewer (yet-another-react-lightbox)

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** project founder

## Context

Photos of the sheet and of the child's solution showed differently on each side: the child saw a
small upload card with thumbnails, the parent a tall stack of full-size images on the item page.
The founder asked for one consistent way to look through an item's photos on both sides — small
tiles on the page, a click opens a large in-page view with left / right to roll through them — with
only the child able to add or remove photos.

## Decision

One shared viewer (`components/homework/photo-viewer.tsx`): `PhotoGrid` tiles on the page and a
lightbox from **yet-another-react-lightbox** (MIT, React 19 ready) with the Captions, Counter,
Thumbnails and Zoom plugins. The arrows run through every photo on the item, sheet first, captioned
"Homework · photo 1 of 2" / "Solution · photo 2 of 3"; keyboard, swipe, pinch and scroll zoom come
with it. The child's tiles carry ✕ and an Add tile; the parent's are view only, and a photo removed
after the first day opens on its own from the history. Photos are already ≤ 1600 px (ADR 0006), so
the viewer shows the stored file; no thumbnails are generated.

Considered and rejected:
- *PhotoSwipe*: excellent gestures, but every slide needs its width and height up front, and photo
  dimensions are not stored.
- *Our own dialog + carousel* on the existing Radix dialog: swipe, zoom and focus handling by hand —
  more code, worse on phones.

## Consequences

**Positive:** the same look and controls for child and parent; the parent's item page fits on one
screen; accessible (focus kept in the viewer, Esc closes).

**Negative:** one more web dependency (~20 KB gzipped with the plugins) and its CSS imported in the
viewer component. Tiles load the full photo scaled down, fine at ≤ 12 photos per item.

## Notes

- Milestone: [11 — Solutions and change history](../milestones/11-solutions-and-history.md).
