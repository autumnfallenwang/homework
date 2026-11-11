ALTER TABLE "homework_grades" ADD COLUMN "correct_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_grades" ADD COLUMN "child_note" text;