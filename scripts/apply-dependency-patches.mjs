import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Workspace-scoped production installs, such as the collaboration worker
// image, do not install the desktop app's dependencies (every patched package
// is one of them). There is nothing to patch in those trees, and asking
// patch-package to find @cogeotiff/core would make an otherwise valid
// `npm ci --omit=dev` fail.
if (!existsSync("node_modules/@cogeotiff/core/package.json")) {
  process.exit(0);
}

// Invoke the CLI entry directly with node instead of relying on the
// node_modules/.bin shim being on PATH — PATH is not guaranteed to include
// .bin in every install environment (Vercel's build container ENOENTs).
const result = spawnSync(
  process.execPath,
  [resolve("node_modules/patch-package/index.js")],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
