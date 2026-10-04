// Rollback helper for credentials at rest (ADR 0010). Writes the TeacherEase and
// SMTP passwords back as plaintext, so an image from before ADR 0010 can run, or
// before BETTER_AUTH_SECRET is rotated. Run it in the api pod BEFORE switching:
//
//   kubectl -n homework exec deploy/homework-api -- \
//     node --import tsx src/scripts/unseal-credentials.ts
//
// The next boot of a current image seals them again. Prints a count, never a value.

import { closeDb, db } from "../db/index.js";
import { log } from "../lib/logger.js";
import { unsealStoredCredentials } from "../services/credentials.js";

const count = await unsealStoredCredentials(db);
log.info(
  { event: "credentials.unsealed_cli", count },
  "credentials unsealed from the command line",
);
process.stdout.write(
  `Unsealed ${count} credential(s). They are plaintext until the API boots again.\n`,
);
await closeDb();
