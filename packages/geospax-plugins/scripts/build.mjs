// Builds all geospax-* drop-ins and copies their manifests next to the bundle,
// producing the layout the app's bundled-plugin discovery scans:
//
//   apps/geolibre-desktop/public/plugins/geospax-*/
//     plugin.json
//     dist/index.js
//     dist/style.css
//
// Run: npm run build -w @geospax/plugins
// (Discovery happens at dev-server start / app build, so run this before
// `npm run dev` or the app build in CI.)
//
// Discovers every plugin in src/* that has an index.ts + plugin.json.

import { cpSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

const pkgRoot = resolve(import.meta.dirname, "..");
const srcRoot = resolve(pkgRoot, "src");
const outBase = resolve(pkgRoot, "../../apps/geolibre-desktop/public/plugins");

const srcDirNames = readdirSync(srcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter(
    (name) =>
      existsSync(resolve(srcRoot, name, "index.ts")) &&
      existsSync(resolve(srcRoot, name, "plugin.json")),
  );

if (srcDirNames.length === 0) {
  console.error("[geospax] no plugins found under", srcRoot);
  process.exit(1);
}

for (const srcDir of srcDirNames) {
  const manifestPath = resolve(srcRoot, srcDir, "plugin.json");
  const manifest = JSON.parse((await import("node:fs")).readFileSync(manifestPath, "utf8"));
  const pluginId = manifest.id || srcDir;
  const entry = resolve(srcRoot, srcDir, "index.ts");
  const outDir = resolve(outBase, pluginId, "dist");
  const viteConfig = {
    configFile: false,
    build: {
      lib: {
        entry,
        formats: ["es"],
        fileName: () => "index.js",
        cssFileName: "style",
      },
      outDir,
      emptyOutDir: true,
      sourcemap: true,
      target: "es2022",
    },
  };
  console.log(`[geospax] building ${srcDir} (${pluginId}) → ${outDir}`);
  await build(viteConfig);
  const destDir = resolve(outBase, pluginId);
  mkdirSync(destDir, { recursive: true });
  cpSync(manifestPath, resolve(destDir, "plugin.json"));
  console.log(`[geospax] drop-in ready: ${destDir}`);
}
