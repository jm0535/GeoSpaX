// Lib-mode build of the GeoSpaX conservation plugin into the app's bundled
// drop-in folder: apps/geolibre-desktop/public/plugins/geospax-conservation/.
// The entry must be a self-contained ESM bundle (the external-plugin loader
// does not resolve relative imports inside the drop-in), so every dependency
// - including @geospax/analysis, Turf modules and proj4 - is inlined.

import { resolve } from "node:path";
import { defineConfig } from "vite";

const pkgRoot = import.meta.dirname;

export default defineConfig({
  build: {
    lib: {
      entry: resolve(pkgRoot, "src/conservation/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "style",
    },
    outDir: resolve(
      pkgRoot,
      "../../apps/geolibre-desktop/public/plugins/geospax-conservation/dist",
    ),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
