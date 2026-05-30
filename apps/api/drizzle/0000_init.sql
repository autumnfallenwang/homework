CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetchRunId" uuid NOT NULL,
	"classId" uuid,
	"className" text NOT NULL,
	"assignmentName" text NOT NULL,
	"teAssignmentId" integer,
	"name" text,
	"score" text,
	"scoreNumeric" double precision,
	"scoreLetter" text,
	"maxScore" text,
	"status" text,
	"dueDate" text,
	"weight" integer,
	"isMissing" boolean DEFAULT false NOT NULL,
	"feedback" text
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"displayName" text NOT NULL,
	"portalType" text DEFAULT 'teacherease' NOT NULL,
	"baseUrl" text NOT NULL,
	"username" text NOT NULL,
	"portalPassword" text,
	"grade" text,
	"school" text,
	"homeworkUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"childId" uuid NOT NULL,
	"teClassId" integer NOT NULL,
	"teCgpid" integer NOT NULL,
	"name" text NOT NULL,
	"instructor" text,
	"gradingScale" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_child_te_class_unique" UNIQUE("childId","teClassId")
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"childId" uuid NOT NULL,
	"runAt" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"durationMs" integer,
	"errorMessage" text,
	"source" text DEFAULT 'teacherease' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetchRunId" uuid NOT NULL,
	"classId" uuid,
	"className" text NOT NULL,
	"currentGrade" text,
	"status" text,
	"needsAttention" boolean DEFAULT false NOT NULL,
	"targetsMeeting" integer,
	"targetsNotMeeting" integer,
	"targetsNotAssessed" integer
);
--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"childId" uuid NOT NULL,
	"hwDate" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"dueDate" text,
	"dueDateInferred" boolean DEFAULT false NOT NULL,
	"scrapedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_child_date_subject_unique" UNIQUE("childId","hwDate","subject")
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"fetchRunId" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetchRunId" uuid NOT NULL,
	"classId" uuid,
	"parentId" uuid,
	"name" text NOT NULL,
	"scoreNumeric" double precision,
	"scoreLetter" text,
	"isMeeting" boolean
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_fetchRunId_fetch_runs_id_fk" FOREIGN KEY ("fetchRunId") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_classId_classes_id_fk" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_childId_children_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_runs" ADD CONSTRAINT "fetch_runs_childId_children_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_fetchRunId_fetch_runs_id_fk" FOREIGN KEY ("fetchRunId") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_classId_classes_id_fk" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_childId_children_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_fetchRunId_fetch_runs_id_fk" FOREIGN KEY ("fetchRunId") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_fetchRunId_fetch_runs_id_fk" FOREIGN KEY ("fetchRunId") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_classId_classes_id_fk" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_parentId_standards_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."standards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_fetch_run_idx" ON "assignments" USING btree ("fetchRunId");--> statement-breakpoint
CREATE INDEX "classes_child_idx" ON "classes" USING btree ("childId");--> statement-breakpoint
CREATE INDEX "fetch_runs_child_run_idx" ON "fetch_runs" USING btree ("childId","runAt");--> statement-breakpoint
CREATE INDEX "fetch_runs_child_source_run_idx" ON "fetch_runs" USING btree ("childId","source","runAt");--> statement-breakpoint
CREATE INDEX "grades_fetch_run_idx" ON "grades" USING btree ("fetchRunId");--> statement-breakpoint
CREATE INDEX "homework_child_date_idx" ON "homework" USING btree ("childId","hwDate");--> statement-breakpoint
CREATE INDEX "standards_fetch_run_idx" ON "standards" USING btree ("fetchRunId");--> statement-breakpoint
CREATE INDEX "standards_class_fetch_run_idx" ON "standards" USING btree ("classId","fetchRunId");