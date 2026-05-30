CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetch_run_id" uuid NOT NULL,
	"class_id" uuid,
	"class_name" text NOT NULL,
	"assignment_name" text NOT NULL,
	"te_assignment_id" integer,
	"name" text,
	"score" text,
	"score_numeric" double precision,
	"score_letter" text,
	"max_score" text,
	"status" text,
	"due_date" text,
	"weight" integer,
	"is_missing" boolean DEFAULT false NOT NULL,
	"feedback" text
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"portal_type" text DEFAULT 'teacherease' NOT NULL,
	"base_url" text NOT NULL,
	"username" text NOT NULL,
	"portal_password" text,
	"grade" text,
	"school" text,
	"homework_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"te_class_id" integer NOT NULL,
	"te_cgpid" integer NOT NULL,
	"name" text NOT NULL,
	"instructor" text,
	"grading_scale" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_child_te_class_unique" UNIQUE("child_id","te_class_id")
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"source" text DEFAULT 'teacherease' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetch_run_id" uuid NOT NULL,
	"class_id" uuid,
	"class_name" text NOT NULL,
	"current_grade" text,
	"status" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"targets_meeting" integer,
	"targets_not_meeting" integer,
	"targets_not_assessed" integer
);
--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"hw_date" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"due_date" text,
	"due_date_inferred" boolean DEFAULT false NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_child_date_subject_unique" UNIQUE("child_id","hw_date","subject")
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"fetch_run_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetch_run_id" uuid NOT NULL,
	"class_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"score_numeric" double precision,
	"score_letter" text,
	"is_meeting" boolean
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_fetch_run_id_fetch_runs_id_fk" FOREIGN KEY ("fetch_run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_runs" ADD CONSTRAINT "fetch_runs_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_fetch_run_id_fetch_runs_id_fk" FOREIGN KEY ("fetch_run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_fetch_run_id_fetch_runs_id_fk" FOREIGN KEY ("fetch_run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_fetch_run_id_fetch_runs_id_fk" FOREIGN KEY ("fetch_run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_parent_id_standards_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_fetch_run_idx" ON "assignments" USING btree ("fetch_run_id");--> statement-breakpoint
CREATE INDEX "classes_child_idx" ON "classes" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "fetch_runs_child_run_idx" ON "fetch_runs" USING btree ("child_id","run_at");--> statement-breakpoint
CREATE INDEX "fetch_runs_child_source_run_idx" ON "fetch_runs" USING btree ("child_id","source","run_at");--> statement-breakpoint
CREATE INDEX "grades_fetch_run_idx" ON "grades" USING btree ("fetch_run_id");--> statement-breakpoint
CREATE INDEX "homework_child_date_idx" ON "homework" USING btree ("child_id","hw_date");--> statement-breakpoint
CREATE INDEX "standards_fetch_run_idx" ON "standards" USING btree ("fetch_run_id");--> statement-breakpoint
CREATE INDEX "standards_class_fetch_run_idx" ON "standards" USING btree ("class_id","fetch_run_id");