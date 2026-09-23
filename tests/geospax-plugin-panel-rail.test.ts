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
  panelSource: string;
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
      const panelPath = join(PLUGIN_ROOT, entry.name, "panel.ts");
      if (!existsSync(indexPath) || !existsSync(manifestPath)) return [];

      const source = withoutComments(readFileSync(indexPath, "utf8"));
      if (!source.includes("registerRightPanel")) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { id?: unknown };
      assert.equal(typeof manifest.id, "string", `${entry.name}/plugin.json needs an id`);
      const panelSource = existsSync(panelPath)
        ? withoutComments(readFileSync(panelPath, "utf8"))
        : "";
      return [{ id: manifest.id, name: entry.name, source, panelSource }];
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

  for (const { id, name, source, panelSource } of panelPlugins) {
    it(`${name} opens the panel it registers`, () => {
      assert.deepEqual(registeredPanelIds(source), [id]);
      assert.deepEqual(openedPanelIds(source), [id]);
      assert.ok(
        source.indexOf("openRightPanel") > source.indexOf("registerRightPanel"),
        `${id} must open only after registering its panel`,
      );
    });

    it(`${name} docks on the right edge`, () => {
      assert.ok(
        source.includes('dock: "right-of-style"'),
        `${id} must declare dock: "right-of-style" so the panel opens on the right side`,
      );
    });

    it(`${name} links its published user guide`, () => {
      assert.ok(
        panelSource.includes("guideUrl") && panelSource.includes(`/${name}/`),
        `${name} must pass guideUrl pointing at docs/user-guide/gsx-plugins/${name}`,
      );
    });

    it(`${name} deactivates when its panel is closed`, () => {
      assert.ok(
        source.includes("deactivatePluginOnClose: true"),
        `${id} must declare deactivatePluginOnClose so closing the panel unchecks it in the Plugins menu`,
      );
    });
  }
});
