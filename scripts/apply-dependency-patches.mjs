import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Applies the dependency patches in ./patches via patch-package.
//
// Two modes:
//
//   (default)  Best-effort — invoked from the root `postinstall`. A plain
//   `npm ci` must never be aborted just because the install environment
//   does not need the patches (workspace-scoped production installs such as
//   the collaboration worker image install none of the patched packages,
//   and some build machines — Vercel observed — finish `npm ci` without
//   `patch-package` in the tree). In those cases log and exit 0; the build
//   step (which runs `--required`) is responsible for guaranteeing the
//   patches are actually applied before anything ships.
//
//   --required  Fatal — invoked from vercel.json's buildCommand. If
//   `patch-package` is missing from node_modules, self-heal by reifying the
//   lockfile (`npm install --no-save` materializes whatever is missing),
//   then apply the patches. If they still cannot be applied, fail the build:
//   shipping unpatched dependencies is not an option.
//
// The CLI entry is invoked directly with node instead of relying on the
// node_modules/.bin shim being on PATH — PATH is not guaranteed to include
// .bin in every install environment.

const REQUIRED = process.argv.includes("--required");

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
      "reifying the lockfile (npm install --no-save) to restore it...",
  );
  const result = spawnSync(
    "npm",
    ["install", "--no-save", "--no-audit", "--no-fund", "--include=dev"],
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
