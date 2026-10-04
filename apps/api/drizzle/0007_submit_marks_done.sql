-- ADR 0011: done is the child's Submit, not "has a solution". Items that already
-- have a solution (a note or a photo the child still sees) count as submitted at
-- their last solution save, so nothing done becomes open.
ALTER TABLE "homework_item_events" DROP CONSTRAINT "homework_item_events_action_valid";--> statement-breakpoint
ALTER TABLE "homework_items" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "homework_items" i SET "submitted_at" = COALESCE(i."solution_saved_at", i."updated_at") WHERE i."solution_note" IS NOT NULL OR EXISTS (SELECT 1 FROM "homework_photos" p WHERE p."item_id" = i."id" AND p."kind" = 'solution' AND p."removed_at" IS NULL);--> statement-breakpoint
ALTER TABLE "homework_item_events" ADD CONSTRAINT "homework_item_events_action_valid" CHECK ("homework_item_events"."action" IN ('edited', 'photo_added', 'photo_removed', 'submitted'));
