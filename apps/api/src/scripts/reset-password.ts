// Recovery for a forgotten password (ADR 0005). homework sends no email, so a
// parent who forgets theirs runs this in the api pod:
//
//   kubectl -n homework exec deploy/homework-api -- \
//     node --import tsx src/scripts/reset-password.ts you@example.com
//
// It sets a random one-time password, ends every session of that login, and
// prints the password ONCE to this terminal (never to the logs). Sign in with
// it, then change it in Settings → Account. Works for any login, parent or child.

import { randomBytes } from "node:crypto";
import { closeDb, db } from "../db/index.js";
import { log } from "../lib/logger.js";
import { findLoginByEmail, setLoginPassword } from "../services/logins.js";

const email = process.argv[2];
if (!email) {
  process.stderr.write("usage: reset-password.ts <email>\n");
  process.exit(2);
}

const login = await findLoginByEmail(db, email);
if (!login) {
  process.stderr.write(`No login with the email ${email}.\n`);
  await closeDb();
  process.exit(1);
}

const password = randomBytes(12).toString("base64url"); // 16 characters
await setLoginPassword(db, login.id, password);
// The event is logged; the password is not.
log.info(
  { event: "login.password_reset_cli", user_id: login.id },
  "password reset from the command line",
);
process.stdout.write(
  `New one-time password for ${login.email} (${login.role}): ${password}\n` +
    "Every session of this login was signed out. Sign in, then change it in Settings → Account.\n",
);
await closeDb();
process.exit(0);
