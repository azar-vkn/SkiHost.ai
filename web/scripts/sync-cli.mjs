// Copies ../cli/skihost.mjs into public/cli so the site serves the exact CLI in this repo.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "..", "public", "cli");
mkdirSync(dest, { recursive: true });
copyFileSync(join(here, "..", "..", "cli", "skihost.mjs"), join(dest, "skihost.mjs"));
console.log("synced cli/skihost.mjs → public/cli/skihost.mjs");
