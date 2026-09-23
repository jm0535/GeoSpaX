import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

// A plugin can register successfully and appear active in the Plugins menu
// without appearing in the panel rail. The rail is populated only when the
// plugin also calls openRightPanel. Audit every GeoSpaX right-panel entry point
// so those two parts of the activation contract cannot drift apart again.
const PLUGIN_ROOT = resolve(import.meta.dirname, "..", "packages", "geospax-plugins", "src");

const EXPECTED_PANEL_IDS = [
  "geospax-agriculture",
  "geospax-biodiversity",
  "geospax-climate",
  "geospax-conservation",
  "geospax-disaster",
  "geospax-environment",
  "geospax-forestry",
  "geospax-geoscience",
  "geospax-hydrology",
  "geospax-lulc",
  "geospax-marine",
  "geospax-soil",
];

interface PanelPluginSource {
  id: string;
  name: string;
  source: string;
}

/** Remove comments so an example or explanation cannot satisfy the audit. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length));
}

function panelPluginSources(): PanelPluginSource[] {
  return readdirSync(PLUGIN_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const indexPath = join(PLUGIN_ROOT, entry.name, "index.ts");
      const manifestPath = join(PLUGIN_ROOT, entry.name, "plugin.json");
      if (!existsSync(indexPath) || !existsSync(manifestPath)) return [];

      const source = withoutComments(readFileSync(indexPath, "utf8"));
      if (!source.includes("registerRightPanel")) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { id?: unknown };
      assert.equal(typeof manifest.id, "string", `${entry.name}/plugin.json needs an id`);
      return [{ id: manifest.id, name: entry.name, source }];
    });
}

function registeredPanelIds(source: string): string[] {
  return [
    ...source.matchAll(/\bapp\.registerRightPanel\?\.\(\s*\{[\s\S]*?\bid:\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

function openedPanelIds(source: string): string[] {
  return [...source.matchAll(/\bapp\.openRightPanel\?\.\(\s*["']([^"']+)["']\s*\)/g)].map(
    (match) => match[1],
  );
}

const panelPlugins = panelPluginSources();

describe("GeoSpaX plugin panel rail contract", () => {
  it("audits all six domain panel plugins", () => {
    assert.deepEqual(panelPlugins.map(({ id }) => id).sort(), [...EXPECTED_PANEL_IDS].sort());
  });

  for (const { id, name, source } of panelPlugins) {
    it(`${name} opens the panel it registers`, () => {
      assert.deepEqual(registeredPanelIds(source), [id]);
      assert.deepEqual(openedPanelIds(source), [id]);
      assert.ok(
        source.indexOf("openRightPanel") > source.indexOf("registerRightPanel"),
        `${id} must open only after registering its panel`,
      );
    });
  }
});
