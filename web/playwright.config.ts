import { defineConfig, devices } from "@playwright/test";

// The smoke test runs against the PRODUCTION build served by `vite preview`,
// at the same base path GitHub Pages uses — so it exercises what ships, with
// the draft overlays scrubbed. Three projects: a desktop, a phone with real
// touch (the cluster tap, the chooser, the sheet), and a desktop that asked
// for reduced motion (no view transitions). Chromium only: it is the one
// browser CI installs, and the pane this project is reviewed in.
const base = "http://localhost:4175/cheese-census/";

export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: base, trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview -- --port 4175 --strictPort",
    url: base,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "reduced-motion",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce",
      },
    },
  ],
});
