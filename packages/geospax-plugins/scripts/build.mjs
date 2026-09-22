// Builds the geospax-conservation drop-in and copies its manifest next to
// the bundle, producing the layout the app's bundled-plugin discovery scans:
//
//   apps/geolibre-desktop/public/plugins/geospax-conservation/
//     plugin.json
//     dist/index.js
//     dist/style.css
//
// Run: npm run build -w @geospax/plugins
// (Discovery happens at dev-server start / app build, so run this before
// `npm run dev` or the app build in CI.)

import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

const pkgRoot = resolve(import.meta.dirname, "..");
const outRoot = resolve(
  pkgRoot,
  "../../apps/geolibre-desktop/public/plugins/geospax-conservation",
);

await build({ configFile: resolve(pkgRoot, "vite.config.ts"), logLevel: "info" });
mkdirSync(outRoot, { recursive: true });
cpSync(resolve(pkgRoot, "src/conservation/plugin.json"), resolve(outRoot, "plugin.json"));
console.log(`[geospax] drop-in ready: ${outRoot}`);
