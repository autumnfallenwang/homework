CREATE TABLE "homework_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"score" integer,
	"summary" text,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stuck" boolean DEFAULT false NOT NULL,
	"retake_reason" text,
	"retake_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sheet_title" text,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"prompt_version" integer NOT NULL,
	"duration_ms" integer,
	"usage" jsonb,
	"error" text,
	"requested_by" uuid,
	"alerted_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_grades_status_valid" CHECK ("homework_grades"."status" IN ('graded', 'retake', 'not_gradable', 'failed')),
	CONSTRAINT "homework_grades_score_valid" CHECK (("homework_grades"."status" = 'graded') = ("homework_grades"."score" IS NOT NULL) AND ("homework_grades"."score" IS NULL OR "homework_grades"."score" BETWEEN 0 AND 100))
);
--> statement-breakpoint
ALTER TABLE "homework_grades" ADD CONSTRAINT "homework_grades_item_id_homework_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."homework_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_grades" ADD CONSTRAINT "homework_grades_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_grades_item_idx" ON "homework_grades" USING btree ("item_id","created_at");