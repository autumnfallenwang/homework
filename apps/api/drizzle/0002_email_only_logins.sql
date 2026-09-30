-- ADR 0005: email is the only sign-in. A login whose stored email is a
-- placeholder (every child login made under ADR 0004) cannot sign in without a
-- username, so it is removed; its sessions and password cascade with it, its
-- child profile and history are untouched, and the parent sends a new invite.
DELETE FROM "users" WHERE "email" LIKE '%@homework.invalid';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "display_username";