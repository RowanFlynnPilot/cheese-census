import { expect, test, type Page, type TestInfo } from "@playwright/test";
import counties from "../src/counties.json" with { type: "json" };

// The reader's path through the map, end to end, on the production build.
// Every test starts on the map with the data loaded, and ends by checking
// that nothing was logged as an error along the way.

const errors: string[] = [];

async function loaded(page: Page) {
  await page.goto("/cheese-census/");
  await expect(page.locator(".leaflet-marker-pane .marker")).toHaveCount(88);
  await expect(page.locator(".creamery-row")).toHaveCount(88);
}

/** Phones fold the county, sort and checkboxes behind one button. */
async function unfold(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: /Filters & sort/ }).click();
  }
}

/** The county outlines are drawn in the order of counties.json (by name). */
const MARATHON = counties.features.findIndex((f) => f.properties.name === "Marathon");

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await loaded(page);
});

test.afterEach(() => {
  expect(errors, "console errors").toEqual([]);
});

test("the census loads with every creamery on the map and in the list", async ({ page }) => {
  // Phones drop the noun; the tab names it.
  await expect(page.locator(".masthead .count")).toHaveText(/^88 of 88/);
  // The counties sit under the pins and the award winners wear their rings.
  await expect(page.locator(".leaflet-overlay-pane path.leaflet-interactive")).toHaveCount(72);
  expect(await page.locator(".leaflet-marker-pane .marker.has-award").count()).toBeGreaterThan(30);
});

test("the basemap is read by byte range from the site's own extract", async ({ page }) => {
  // PMTiles works only on a host that honours Range (GitHub Pages does, and
  // so must any host the census moves to): a 200 carrying all 38 MB is a
  // failure, and the pmtiles reader says so in the console.
  const slice = await page.request.get("map/wisconsin.pmtiles", { headers: { Range: "bytes=0-16383" } });
  expect(slice.status()).toBe(206);
  expect((await slice.body()).length).toBe(16384);
  // Tiles drawn from it, and OpenStreetMap credited on the map.
  await expect(page.locator(".leaflet-tile-pane canvas.leaflet-tile-loaded").first()).toBeAttached();
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
});

test("search shows its work and clears", async ({ page }) => {
  await page.getByLabel("Search creameries by name, city, county or cheese type").fill("gouda");
  await expect(page.locator(".result-strip")).toContainText("28");
  await expect(page.locator(".result-strip")).toContainText("match “gouda”");
  await expect(page.locator(".creamery-row")).toHaveCount(28);
  await expect(page.locator(".creamery-row .op-hint").first()).toHaveText("makes Gouda");
  await page.locator(".result-strip .linkish").click();
  await expect(page.locator(".creamery-row")).toHaveCount(88);
});

test("an empty search blames the filter, not the word", async ({ page }, testInfo) => {
  await unfold(page, testInfo);
  await page.getByLabel("Filter by county").selectOption("Burnett");
  await page.getByLabel("Search creameries by name, city, county or cheese type").fill("Marathon");
  await expect(page.locator(".empty-head")).toContainText("4 match “Marathon” statewide, none in Burnett County");
  await page.getByRole("button", { name: "Show all 4" }).click();
  await expect(page.locator(".creamery-row")).toHaveCount(4);
  await expect(page.locator(".filter-chip")).toHaveCount(0);
});

test("a creamery opens from the list and Escape returns focus to its row", async ({ page }) => {
  const row = page.getByRole("button", { name: /Hook's Cheese Company/ });
  await row.click();
  await expect(page.getByRole("heading", { name: "Hook's Cheese Company, Inc." })).toBeVisible();
  // Contact describes the pinned plant and dials its number.
  await expect(page.locator(".detail .tel-link")).toHaveAttribute("href", /^tel:\+1\d{10}/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect(row).toBeFocused();
});

test("near me sorts by distance, says so, and switches off", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 44.9591, longitude: -89.6301 });
  const nearMe = page.locator(".near-me");
  await nearMe.click();
  await expect(nearMe).toHaveText("Nearest first");
  await expect(nearMe).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".locate-note")).toContainText("Sorted nearest first: Mullins Cheese, Inc. in Mosinee is 17 mi away.");
  await expect(page.locator(".creamery-row").first()).toContainText("Mullins Cheese");
  await expect(page.getByLabel("Sort creameries")).toHaveValue("distance");
  await nearMe.click();
  await expect(nearMe).toHaveText("Near me");
  await expect(page.locator(".locate-note")).toHaveCount(0);
  await expect(page.getByLabel("Sort creameries")).toHaveValue("name");
});

test("a county tap filters the list and shows as a chip", async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "Show map" }).click();
  }
  // Marathon County's outline, pressed at its centre (Wausau, where no pin
  // sits). A raw press: an SVG path's actionability checks stall on a phone.
  // Somewhere near the Mosinee pin where the press reaches Marathon County's
  // own outline and no pin's hit box: pins pack differently at each zoom,
  // so the test looks outward from the pin for the first such point.
  await expect(page.locator(".leaflet-overlay-pane path.leaflet-interactive")).toHaveCount(72);
  const pin = page.locator('.leaflet-marker-icon[title="Mullins Cheese, Inc."]');
  const box = await pin.boundingBox();
  if (!box) throw new Error("the Mosinee pin has no box");
  const point = await page.evaluate(
    ([cx, cy, index]) => {
      const county = document.querySelectorAll(".leaflet-overlay-pane path.leaflet-interactive")[index];
      for (let r = 6; r <= 80; r += 6) {
        for (const [dx, dy] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [-1, -1]]) {
          const x = cx + dx * r;
          const y = cy + dy * r;
          if (document.elementFromPoint(x, y) === county) return [x, y];
        }
      }
      return null;
    },
    [box.x + box.width / 2, box.y + box.height / 2, MARATHON] as const,
  );
  if (!point) throw new Error("no free point on Marathon County near the Mosinee pin");
  if (testInfo.project.name === "phone") await page.touchscreen.tap(point[0], point[1]);
  else await page.mouse.click(point[0], point[1]);
  await expect(page).toHaveURL(/county=Marathon/);
  await expect(page.locator(".filter-chip")).toHaveText(/Marathon County/);
  await expect(page.locator(".leaflet-marker-pane .marker")).toHaveCount(4);
});

test("a cluster tap zooms with a label, then the chooser picks", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the thumb's path: touch only");
  await page.getByRole("button", { name: "Show map" }).click();
  // Raw touch at the pin's centre: a thumb, not an element click.
  const pin = page.locator('.leaflet-marker-icon[title="Emmi Roth USA"]');
  const tapPin = async () => {
    const box = await pin.boundingBox();
    if (!box) throw new Error("the Emmi Roth pin has no box");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await tapPin();
  await expect(page.locator(".map-zoom-hint")).toContainText("creameries here — zooming in");
  await expect(page.locator(".map-zoom-hint")).toBeEmpty({ timeout: 4_000 });
  await tapPin();
  const chooser = page.locator(".pin-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText("creameries here — pick one");
  await chooser.getByRole("button", { name: /Emmi Roth USA/ }).click();
  await expect(page.getByRole("heading", { name: "Emmi Roth USA" })).toBeVisible();
  await expect(page.locator(".sheet-back")).toHaveText("← Back to the map");
  await expect(page.locator(".detail .contact")).toContainText("The Monroe plant is pinned");
});

test("panels open without a view transition when motion is reduced", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "reduced-motion", "the reduced-motion project only");
  await page.getByRole("button", { name: /Agropur/ }).first().click();
  await expect(page.getByRole("heading", { name: "Agropur, Inc." })).toBeVisible();
  const transitioned = await page.evaluate(() =>
    document.getAnimations().some((a) => "animationName" in a && (a as CSSAnimation).animationName === "panel-in"),
  );
  expect(transitioned).toBe(false);
});
