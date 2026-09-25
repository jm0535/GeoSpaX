import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Applies the dependency patches in ./patches via patch-package.
//
// Two modes:
//
//   (default)  Invoked from the root `postinstall`. On Vercel, defer patching
//   entirely until the build step: during `npm ci` its install tree is not
//   reliable enough to run the patch CLI (even checking that index.js exists
//   before spawning it has failed there). For other installs, skip when the
//   desktop dependencies or patch tool are absent, e.g. workspace-scoped
//   worker image installs. The build step must apply patches before shipping.
//
//   --required  Fatal — invoked from vercel.json's buildCommand. If
//   `patch-package` is missing, reify from the lockfile with scripts disabled
//   (so recovery cannot recursively run this postinstall), then apply the
//   patches. If they cannot be applied, fail the build: never ship unpatched.
//
// The CLI entry is invoked directly with node instead of relying on the
// node_modules/.bin shim being on PATH — PATH is not guaranteed to include
// .bin in every install environment.

const REQUIRED = process.argv.includes("--required");

// Vercel's npm lifecycle can observe a transient/partial node_modules tree.
// Do not invoke *any* dependency CLI from its postinstall. vercel.json runs
// --required after npm ci finishes, when it is safe to apply the patches.
// The explicit flag in installCommand also covers builds without VERCEL=1.
if (
  !REQUIRED &&
  (process.env.GEOSPAX_DEFER_PATCHES === "1" ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV))
) {
  console.log("[apply-dependency-patches] Deferring patches until the Vercel build step.");
  process.exit(0);
}

const patchTool = "node_modules/patch-package/index.js";
// One of the patched packages; doubles as the "is this a full install?"
// probe. Every patched package is a dependency of the desktop app, so a
// tree that needs the patches has all of them.
const probePackage = "node_modules/@cogeotiff/core/package.json";

function runPatchPackage() {
  const result = spawnSync(process.execPath, [resolve(patchTool)], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function recoverPatchPackage() {
  console.log(
    "[apply-dependency-patches] patch-package is missing from node_modules; " +
      "reifying the lockfile (npm install --no-save --ignore-scripts) to restore it...",
  );
  const result = spawnSync(
    "npm",
    ["install", "--no-save", "--no-audit", "--no-fund", "--include=dev", "--ignore-scripts"],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status === 0 && existsSync(resolve(patchTool));
}

if (REQUIRED && !existsSync(resolve(patchTool))) {
  // A full lockfile reify restores patch-package (and anything else the
  // install left out of the tree).
  if (!recoverPatchPackage()) {
    console.error(
      "[apply-dependency-patches] patch-package is still missing after " +
        "recovery; aborting so the build does not ship unpatched dependencies.",
    );
    process.exit(1);
  }
}

if (!existsSync(resolve(probePackage))) {
  // Nothing to patch in this tree (e.g. `npm ci --omit=dev` for a worker
  // image). In required mode that means the build would ship unpatched
  // dependencies — fail loudly instead.
  if (REQUIRED) {
    console.error(
      `[apply-dependency-patches] --required but ${probePackage} is not in the ` +
        "install tree; the build cannot guarantee patched dependencies.",
    );
    process.exit(1);
  }
  process.exit(0);
}

if (!REQUIRED && !existsSync(resolve(patchTool))) {
  console.warn(
    "[apply-dependency-patches] patch-package is not in node_modules; " +
      "skipping (best-effort mode). The build step applies the patches with --required.",
  );
  process.exit(0);
}

process.exit(runPatchPackage());
