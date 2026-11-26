// The GeoSpaX rebrand rules: product name and links become GeoSpaX, while
// credits, GeoLibre-run services, schema ids and code identifiers are kept.
// The last test fails if an upstream merge brought in un-rebranded text.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  rebrandPython,
  rebrandText,
  rebrandUrls,
} from "../scripts/geospax-rebrand.mjs";

describe("rebrandText", () => {
  it("rebrands the product name", () => {
    assert.equal(
      rebrandText("Save them before closing GeoLibre?"),
      "Save them before closing GeoSpaX?"
    );
    assert.equal(
      rebrandText("requires GeoLibre Desktop."),
      "requires GeoSpaX Desktop."
    );
    assert.equal(
      rebrandText("[GeoLibre] Could not load"),
      "[GeoSpaX] Could not load"
    );
  });

  it("keeps credits, services and identifiers", () => {
    for (const kept of [
      "Share.GeoLibre account",
      "the official GeoLibre plugin registry",
      "a GIS built on GeoLibre 3.3.0",
      "a GIS built on GeoLibre.",
      "(GeoLibre#1538)",
      "the GeoLibre platform",
      "GeoLibre datasets",
      "GeoLibre Privacy Policy",
      "https://github.com/opengeos/GeoLibre",
      "GeoLibreLayer and GeoLibreAppAPI",
    ]) {
      assert.equal(rebrandText(kept), kept, kept);
    }
  });
});

describe("rebrandUrls", () => {
  it("points app, docs, issues and releases at GeoSpaX", () => {
    assert.equal(
      rebrandUrls("https://web.geolibre.app"),
      "https://geospax.in4metrix.dev"
    );
    assert.equal(
      rebrandUrls("https://web.geolibre.app/"),
      "https://geospax.in4metrix.dev/"
    );
    assert.equal(
      rebrandUrls("https://geolibre.app/user-guide/"),
      "https://jm0535.github.io/GeoSpaX/user-guide/"
    );
    assert.equal(
      rebrandUrls(
        "https://api.github.com/repos/opengeos/GeoLibre/releases/latest"
      ),
      "https://api.github.com/repos/jm0535/GeoSpaX/releases/latest"
    );
    assert.equal(
      rebrandUrls("git clone https://github.com/opengeos/GeoLibre.git"),
      "git clone https://github.com/jm0535/GeoSpaX.git"
    );
  });

  it("keeps service hosts, schema ids and GeoLibre's legal pages", () => {
    for (const kept of [
      "https://tiles.geolibre.app/x",
      "https://share.geolibre.app",
      "https://geolibre.app/schemas/model-graph-v1.json",
      "https://geolibre.app/privacy/",
    ]) {
      assert.equal(rebrandUrls(kept), kept, kept);
    }
  });
});

describe("rebrandPython", () => {
  it("uses the geospax distribution but keeps other modules", () => {
    assert.equal(
      rebrandPython(
        'pip install "geolibre[mcp]"; geolibre-mcp; import geolibre; geolibre.Map()'
      ),
      'pip install "geospax[mcp]"; geospax-mcp; import geospax; geospax.Map()'
    );
    assert.equal(
      rebrandPython("import geolibre_server"),
      "import geolibre_server"
    );
  });
});

describe("repository", () => {
  it("is fully rebranded (run `npm run geospax:rebrand` after an upstream merge)", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/geospax-rebrand.mjs", "--check"],
      {
        encoding: "utf8",
      }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});
