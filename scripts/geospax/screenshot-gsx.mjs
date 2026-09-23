// Capture screenshots of the twelve GSX workbench panels for the README
// showcase. Requires the dev server (npm run dev) and `npx playwright install
// chromium` once. Output: docs/assets/gsx/gsx-<slug>.png plus gsx-overview.png
// (full viewport with a panel open). Note docs/assets/screenshots/ is
// gitignored (upstream hosts doc shots on R2); gsx/ is the committed location.
//
//   node scripts/geospax/screenshot-gsx.mjs [baseUrl]

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/assets/gsx",
);
mkdirSync(OUT, { recursive: true });

const PLUGINS = [
  ["GSX Agriculture", "gsx-agriculture"],
  ["GSX Biodiversity", "gsx-biodiversity"],
  ["GSX Climate", "gsx-climate"],
  ["GSX Conservation", "gsx-conservation"],
  ["GSX Disaster", "gsx-disaster"],
  ["GSX Environment", "gsx-environment"],
  ["GSX Forestry", "gsx-forestry"],
  ["GSX Geoscience", "gsx-geoscience"],
  ["GSX Hydrology", "gsx-hydrology"],
  ["GSX LULC", "gsx-lulc"],
  ["GSX Marine", "gsx-marine"],
  ["GSX Soil", "gsx-soil"],
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 950 },
  deviceScaleFactor: 2,
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.getByTestId("map-canvas").waitFor({ timeout: 60_000 });
await page.locator(".maplibregl-canvas").waitFor({ timeout: 60_000 });
await page.waitForTimeout(6000); // let basemap tiles settle

for (const [name, slug] of PLUGINS) {
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  const panel = page.getByRole("complementary", { name, exact: true });
  await panel.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500); // let the panel populate
  await panel.screenshot({ path: join(OUT, `${slug}.png`) });
  console.log(`captured ${slug}`);
  // Full-viewport shot for one representative workbench.
  if (slug === "gsx-conservation") {
    await page.screenshot({ path: join(OUT, "gsx-overview.png") });
    console.log("captured gsx-overview");
  }
  // Closing the panel deactivates the plugin (deactivatePluginOnClose),
  // keeping the rail clean for the next capture.
  await panel.getByRole("button", { name: "Close panel" }).click();
  await panel.waitFor({ state: "hidden", timeout: 10_000 });
}

await browser.close();
console.log(`done → ${OUT}`);
