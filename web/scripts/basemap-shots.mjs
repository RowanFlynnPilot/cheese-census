// Review helper (not part of the build): capture the map pane under each
// basemap look, on desktop (statewide and zoomed into a town) and on a phone.
//   node scripts/basemap-shots.mjs <out-dir>   (dev server on :5174 running)
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "basemap-shots";
mkdirSync(out, { recursive: true });
const base = "http://localhost:5174/cheese-census/";
const looks = [
  ["esri", ""],
  ["protomaps", "?basemap=protomaps"],
  ["quiet", "?basemap=protomaps-quiet"],
];
const browser = await chromium.launch();
for (const [name, query] of looks) {
  for (const [kind, options] of [
    ["desktop", { viewport: { width: 1280, height: 800 } }],
    ["phone", devices["Pixel 7"]],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base + query);
    await page.waitForSelector(".leaflet-marker-pane .marker", { state: "attached" });
    if (kind === "phone") await page.getByRole("button", { name: "Show map" }).click();
    await page.waitForTimeout(4000);
    await page.locator(".map-pane").screenshot({ path: `${out}/${name}-${kind}-state.png` });
    if (kind === "desktop") {
      for (let i = 0; i < 3; i++) {
        await page.locator(".leaflet-control-zoom-in").click();
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(3500);
      await page.locator(".map-pane").screenshot({ path: `${out}/${name}-${kind}-town.png` });
    }
    console.log(name, kind, errors.length ? `console errors: ${errors.join(" | ").slice(0, 200)}` : "clean");
    await context.close();
  }
}
await browser.close();
