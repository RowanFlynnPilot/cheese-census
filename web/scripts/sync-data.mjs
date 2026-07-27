// Copy the committed build/ tables into public/data/ so Vite serves them.
// public/data/ is gitignored: build/ stays the single source of truth.
import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(dirname(web), "build");
const target = join(web, "public", "data");

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
console.log(`sync-data: ${TABLES.length} tables -> web/public/data/`);
