-- ADR 0007: the child picks the day homework was given (assigned_on), so
-- "that's everything for today" (homework_days) goes. assigned_on was the entry
-- day until now; an item entered after its due day is pulled back to that day so
-- the new rule (given on or before due) holds for every row.
DROP TABLE "homework_days" CASCADE;--> statement-breakpoint
UPDATE "homework_items" SET "assigned_on" = "due_on" WHERE "assigned_on" > "due_on";--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_given_by_due" CHECK ("homework_items"."assigned_on" <= "homework_items"."due_on");
