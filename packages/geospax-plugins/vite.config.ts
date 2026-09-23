// Lib-mode build of the GeoSpaX plugin drop-ins into the app's bundled
// folder: apps/geolibre-desktop/public/plugins/geospax-*/.
// The entry must be a self-contained ESM bundle (the external-plugin loader
// does not resolve relative imports inside the drop-in), so every dependency
// — including @geospax/analysis, Turf modules and proj4 — is inlined.
//
// `GEOSPAX_PLUGIN=geospax-environment npx vite build -c vite.config.ts`
// builds a single plugin; scripts/build.mjs builds all plugins discovered in
// src/* (the normal `npm run build -w @geospax/plugins` path).

import { resolve } from "node:path";
import { defineConfig } from "vite";

const pkgRoot = import.meta.dirname;
const pluginId = process.env.GEOSPAX_PLUGIN ?? "geospax-conservation";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(pkgRoot, `src/${pluginId}/index.ts`),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "style",
    },
    outDir: resolve(pkgRoot, `../../apps/geolibre-desktop/public/plugins/${pluginId}/dist`),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
