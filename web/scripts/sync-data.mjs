// Copy the committed build/ tables into public/data/ so Vite serves them.
// public/data/ is gitignored: build/ stays the single source of truth.
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(dirname(web), "build");
const target = join(web, "public", "data");

// --draft (dev only): also serve queue/product_images.json as draft_images.json —
// hotlinked product photos, pending each creamery's permission. Without the flag
// any stale copy is DELETED, so `npm run build` can never ship it: everything in
// public/ lands in dist/, and the permission gate lives here, not in the UI.
const draft = process.argv.includes("--draft");
const draftSource = join(dirname(web), "queue", "product_images.json");
const draftTarget = join(web, "public", "data", "draft_images.json");

const TABLES = ["creameries", "cheeses", "people", "awards", "highlights"];

if (!existsSync(source)) {
  console.error(`sync-data: ${source} does not exist — run \`python build.py\` first`);
  process.exit(1);
}

const present = (await readdir(source)).filter((f) => f.endsWith(".json"));
const missing = TABLES.filter((t) => !present.includes(`${t}.json`));
if (missing.length) {
  console.error(
    `sync-data: build/ is missing ${missing.map((m) => `${m}.json`).join(", ")} — ` +
      `the build stops at the review gate until classifications and crosswalk are resolved`,
  );
  process.exit(1);
}

await mkdir(target, { recursive: true });
for (const table of TABLES) {
  await cp(join(source, `${table}.json`), join(target, `${table}.json`));
}

if (draft) {
  if (!existsSync(draftSource)) {
    console.error(
      `sync-data: --draft needs ${draftSource} — run \`python scripts/images.py\` first`,
    );
    process.exit(1);
  }
  await cp(draftSource, draftTarget);
  console.log(`sync-data: ${TABLES.length} tables + DRAFT image overlay -> web/public/data/`);
} else {
  await rm(draftTarget, { force: true });
  console.log(`sync-data: ${TABLES.length} tables -> web/public/data/`);
}
