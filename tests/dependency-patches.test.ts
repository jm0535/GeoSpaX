import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/apply-dependency-patches.mjs", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "geospax-patches-"));
  const tool = join(root, "node_modules/patch-package/index.js");
  const marker = join(root, "patch-tool-ran");
  mkdirSync(join(root, "node_modules/@cogeotiff/core"), { recursive: true });
  mkdirSync(join(root, "node_modules/patch-package"), { recursive: true });
  writeFileSync(join(root, "node_modules/@cogeotiff/core/package.json"), "{}");
  return { root, tool, marker };
}

function run(root: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL: "",
      VERCEL_ENV: "",
      GEOSPAX_DEFER_PATCHES: "",
      ...env,
    },
  });
}

describe("dependency patch lifecycle", () => {
  it("configures both Vercel project roots to defer installation and require patches on build", () => {
    const repo = fileURLToPath(new URL("..", import.meta.url));
    const rootConfig = JSON.parse(readFileSync(join(repo, "vercel.json"), "utf8"));
    const appConfig = JSON.parse(
      readFileSync(join(repo, "apps/geolibre-desktop/vercel.json"), "utf8"),
    );
    for (const config of [rootConfig, appConfig]) {
      assert.match(config.installCommand, /GEOSPAX_DEFER_PATCHES=1/);
      assert.match(config.buildCommand, /apply-dependency-patches\.mjs --required &&/);
    }
    assert.equal(rootConfig.outputDirectory, "apps/geolibre-desktop/dist");
    assert.equal(appConfig.outputDirectory, "dist");
  });

  it("never runs the patch CLI during a Vercel npm postinstall", () => {
    const { root, tool, marker } = fixture();
    try {
      writeFileSync(tool, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`);
      const result = run(root, [], { VERCEL: "1" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Deferring patches until the Vercel build step/);
      assert.equal(existsSync(marker), false);

      // Also work if the patch tool hasn't been installed at all.
      rmSync(tool);
      assert.equal(run(root, [], { GEOSPAX_DEFER_PATCHES: "1" }).status, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs patches in --required mode even on Vercel, and propagates failures", () => {
    const { root, tool, marker } = fixture();
    try {
      writeFileSync(tool, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`);
      const result = run(root, ["--required"], { VERCEL: "1" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(marker), true);

      writeFileSync(tool, "process.exit(9);");
      assert.equal(run(root, ["--required"], { VERCEL: "1" }).status, 9);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps patching non-Vercel installs when the full tree is present", () => {
    const { root, tool, marker } = fixture();
    try {
      writeFileSync(tool, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`);
      assert.equal(run(root, []).status, 0);
      assert.equal(existsSync(marker), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
