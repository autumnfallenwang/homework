CREATE TABLE "homework_item_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"te_assignment_id" integer NOT NULL,
	"class_name" text NOT NULL,
	"assignment_name" text NOT NULL,
	"due_date" text,
	"confidence" text,
	"reason" text,
	"source" text NOT NULL,
	"state" text NOT NULL,
	"teacher_reported_score" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_item_assignments_confidence_valid" CHECK ("homework_item_assignments"."confidence" IS NULL OR "homework_item_assignments"."confidence" IN ('high', 'medium', 'low')),
	CONSTRAINT "homework_item_assignments_source_valid" CHECK ("homework_item_assignments"."source" IN ('model', 'parent')),
	CONSTRAINT "homework_item_assignments_state_valid" CHECK ("homework_item_assignments"."state" IN ('suggested', 'confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "homework_match_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"candidates_hash" text NOT NULL,
	"model" text,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homework_item_assignments" ADD CONSTRAINT "homework_item_assignments_item_id_homework_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."homework_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_match_attempts" ADD CONSTRAINT "homework_match_attempts_item_id_homework_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."homework_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "homework_item_assignments_item_te_unique" ON "homework_item_assignments" USING btree ("item_id","te_assignment_id");--> statement-breakpoint
CREATE INDEX "homework_match_attempts_item_idx" ON "homework_match_attempts" USING btree ("item_id","at");