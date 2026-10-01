-- Stage 2, child-entered homework (ADR 0006): a homework source per child
-- profile ('page' keeps today's behaviour), the parent-owned class list, the
-- child's items with their photos (bytea), and "that's everything for today".
-- Purely additive: no existing row changes.
CREATE TABLE "child_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_days" (
	"child_id" uuid NOT NULL,
	"day" date NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by" uuid,
	CONSTRAINT "homework_days_child_id_day_pk" PRIMARY KEY("child_id","day")
);
--> statement-breakpoint
CREATE TABLE "homework_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"class_id" uuid,
	"kind" text DEFAULT 'homework' NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"assigned_on" date NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_items_kind_valid" CHECK ("homework_items"."kind" IN ('homework', 'test', 'project', 'other')),
	CONSTRAINT "homework_items_status_valid" CHECK ("homework_items"."status" IN ('todo', 'done'))
);
--> statement-breakpoint
CREATE TABLE "homework_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "homework_source" text DEFAULT 'page' NOT NULL;--> statement-breakpoint
ALTER TABLE "child_classes" ADD CONSTRAINT "child_classes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_days" ADD CONSTRAINT "homework_days_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_days" ADD CONSTRAINT "homework_days_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_class_id_child_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."child_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_photos" ADD CONSTRAINT "homework_photos_item_id_homework_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."homework_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "child_classes_child_name_unique" ON "child_classes" USING btree ("child_id",lower("name"));--> statement-breakpoint
CREATE INDEX "homework_items_child_due_idx" ON "homework_items" USING btree ("child_id","due_on");--> statement-breakpoint
CREATE INDEX "homework_photos_item_idx" ON "homework_photos" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_homework_source_valid" CHECK ("children"."homework_source" IN ('page', 'child'));