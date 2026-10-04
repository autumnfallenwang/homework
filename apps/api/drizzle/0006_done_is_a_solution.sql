-- ADR 0008: done is no longer a tick; an item with a solution is done. Items
-- ticked done keep counting as done: they get the solution note "Marked done"
-- and their done time as the solution time. Then the tick's columns go.
UPDATE "homework_items" SET "solution_note" = 'Marked done', "solution_saved_at" = COALESCE("completed_at", "updated_at") WHERE "status" = 'done' AND "solution_note" IS NULL;--> statement-breakpoint
ALTER TABLE "homework_items" DROP CONSTRAINT "homework_items_status_valid";--> statement-breakpoint
ALTER TABLE "homework_items" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "homework_items" DROP COLUMN "completed_at";
