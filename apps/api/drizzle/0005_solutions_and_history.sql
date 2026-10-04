-- ADR 0008: the solution (note + photos tagged "solution") lives on the item;
-- photos removed after the first day are kept (removed_at) for the parent;
-- homework_item_events records every change after the first day. Additive only.
CREATE TABLE "homework_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"section" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_id" uuid,
	CONSTRAINT "homework_item_events_section_valid" CHECK ("homework_item_events"."section" IN ('homework', 'solution')),
	CONSTRAINT "homework_item_events_action_valid" CHECK ("homework_item_events"."action" IN ('edited', 'photo_added', 'photo_removed'))
);
--> statement-breakpoint
ALTER TABLE "homework_items" ADD COLUMN "solution_note" text;--> statement-breakpoint
ALTER TABLE "homework_items" ADD COLUMN "solution_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homework_photos" ADD COLUMN "kind" text DEFAULT 'sheet' NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_photos" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homework_item_events" ADD CONSTRAINT "homework_item_events_item_id_homework_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."homework_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_item_events" ADD CONSTRAINT "homework_item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_item_events" ADD CONSTRAINT "homework_item_events_photo_id_homework_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."homework_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_item_events_item_idx" ON "homework_item_events" USING btree ("item_id","at");--> statement-breakpoint
ALTER TABLE "homework_photos" ADD CONSTRAINT "homework_photos_kind_valid" CHECK ("homework_photos"."kind" IN ('sheet', 'solution'));