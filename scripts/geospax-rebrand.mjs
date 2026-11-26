#!/usr/bin/env node
// Rebrand user-facing text from GeoLibre to GeoSpaX.
//
// GeoSpaX is an independent app built on the GeoLibre platform (MIT). Internal
// code names (@geolibre/* packages, apps/geolibre-desktop, the .geolibre.json
// project format, the `geolibre` Python module) are deliberately kept so that
// upstream updates keep merging cleanly. Everything a user reads — UI strings,
// messages, docs — says GeoSpaX.
//
// Run after every upstream merge:  npm run geospax:rebrand
// (On a merge conflict in a rebranded line, take upstream's side, then re-run.)
// `--check` exits non-zero if anything still needs rebranding (no writes).
//
// Kept on purpose (accurate credits and names of GeoLibre-run services):
//   opengeos/GeoLibre links, "built on / based on / fork of GeoLibre",
//   "GeoLibre <version>", "GeoLibre platform", "GeoLibre plugin registry",
//   "GeoLibre datasets", "Share.GeoLibre", upstream issue refs "GeoLibre#123",
//   GeoLibre's privacy policy and terms (they govern GeoLibre-run services),
//   and service hosts such as tiles./assets./share./datasets.geolibre.app.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");

// ---------------------------------------------------------------- rules

const CREDIT_BEFORE =
  /(?:opengeos\/|Share\.|[\w./@-]|(?:[Bb]uilt|[Bb]ased) (?:on|upon) |[Ff]ork(?:ed)? (?:of|from) |[Uu]pstream )$/;
const KEEP_AFTER =
  /^(?:\]\(https?:\/\/github\.com\/opengeos\/|#\d| v?\d| platform\b| plugin registry\b| datasets\b| (?:privacy|Privacy|terms|Terms)\b|\.app\b|\/)/;

/** Replace the product name GeoLibre with GeoSpaX, keeping credits and service names. */
export function rebrandText(text) {
  return text.replace(/\bGeoLibre\b/g, (match, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 24), offset);
    const after = whole.slice(
      offset + match.length,
      offset + match.length + 24
    );
    if (CREDIT_BEFORE.test(before) || KEEP_AFTER.test(after)) return match;
    return "GeoSpaX";
  });
}

/** Links that should lead to GeoSpaX's own app, docs, issues and releases. */
export function rebrandUrls(text) {
  return (
    text
      .replace(
        /(?<![\w.-])https?:\/\/web\.geolibre\.app(?![\w.-])/g,
        "https://geospax2.in4metrix.dev"
      )
      .replace(
        /(?<![\w.-])https?:\/\/geolibre\.app\/demo(?=\/|\b)/g,
        "https://geospax2.in4metrix.dev"
      )
      // Schema ids are identifiers that saved files are validated against, not
      // links: rebranding them would make GeoSpaX reject existing files.
      .replace(
        /(?<![\w.-])https?:\/\/geolibre\.app(?![\w.-])(?!\/(?:schemas|privacy|terms)\/)/g,
        "https://jm0535.github.io/GeoSpaX"
      )
      .replace(
        /github\.com\/opengeos\/GeoLibre\/(issues|releases|discussions)/g,
        "github.com/jm0535/GeoSpaX/$1"
      )
      .replace(
        /api\.github\.com\/repos\/opengeos\/GeoLibre\//g,
        "api.github.com/repos/jm0535/GeoSpaX/"
      )
      // Source checkouts are of GeoSpaX itself.
      .replace(
        /(git clone (?:--depth \d+ )?)https:\/\/github\.com\/opengeos\/GeoLibre(\.git)?/g,
        "$1https://github.com/jm0535/GeoSpaX$2"
      )
      .replace(/(github\.com\/[A-Z_]+\/)GeoLibre(\.git)?\b/g, "$1GeoSpaX$2")
      .replace(/^(\s*)cd GeoLibre\b/gm, "$1cd GeoSpaX")
  );
}

/** Python install/import lines in prose (the distribution is `geospax`). */
export function rebrandPython(text) {
  return text
    .replace(/pip install (["']?)geolibre(?![\w-])/g, "pip install $1geospax")
    .replace(/(["'])geolibre\[/g, "$1geospax[")
    .replace(/\bgeolibre-mcp\b/g, "geospax-mcp")
    .replace(/\bimport geolibre\b(?!_)/g, "import geospax")
    .replace(/\bfrom geolibre import\b/g, "from geospax import")
    .replace(/\bgeolibre\.(Map|Layer|Feature|DashMap)\b/g, "geospax.$1");
}

// Lines that are code comments keep upstream wording (issue refs, provenance).
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

function rebrandSource(text) {
  return text
    .split("\n")
    .map((line) =>
      COMMENT_LINE.test(line) ? line : rebrandUrls(rebrandText(line))
    )
    .join("\n");
}

function rebrandJsonStrings(text) {
  const data = JSON.parse(text);
  const walk = (value) => {
    if (typeof value === "string") return rebrandUrls(rebrandText(value));
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) value[key] = walk(value[key]);
    }
    return value;
  };
  return `${JSON.stringify(walk(data), null, 2)}\n`;
}

// Lines citing published videos keep their real titles (they are GeoLibre's).
const VIDEO_LINE = /youtu\.?be/;

// Passages written about GeoLibre itself are wrapped in
// <!-- geospax:keep --> … <!-- /geospax:keep --> and left untouched.
const KEEP_START = "<!-- geospax:keep -->";
const KEEP_END = "<!-- /geospax:keep -->";

function rebrandMarkdown(text) {
  let keep = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.includes(KEEP_START)) keep = true;
      const out =
        keep || VIDEO_LINE.test(line)
          ? line
          : rebrandPython(rebrandUrls(rebrandText(line)));
      if (line.includes(KEEP_END)) keep = false;
      return out;
    })
    .join("\n");
}

// ---------------------------------------------------------------- targets

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-embed",
  "target",
  "static",
  "site",
]);

function* walkFiles(dir, exts) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walkFiles(path, exts);
    else if (exts.includes(extname(name))) yield path;
  }
}

// Pages that are credits or about GeoLibre itself, kept verbatim.
const KEEP_FILES = new Set([
  "docs/acknowledgements.md",
  "docs/citation.md",
  "tests/geospax-rebrand.test.ts", // its fixtures name GeoLibre on purpose
  // Tests of the GeoLibre-run edge workers (workers/ is not rebranded).
  "tests/cctv-proxy.test.ts",
  "tests/ocean-data-platform.test.ts",
  "tests/edge-proxy-redirect.test.ts",
]);

const targets = [
  {
    files: walkFiles(join(ROOT, "apps/geolibre-desktop/src/i18n/locales"), [
      ".json",
    ]),
    fn: rebrandJsonStrings,
  },
  {
    files: walkFiles(join(ROOT, "apps/geolibre-desktop/src"), [".ts", ".tsx"]),
    fn: rebrandSource,
  },
  {
    files: walkFiles(join(ROOT, "packages"), [".ts", ".tsx"]),
    fn: rebrandSource,
  },
  { files: walkFiles(join(ROOT, "tests"), [".ts", ".tsx"]), fn: rebrandSource },
  { files: walkFiles(join(ROOT, "docs"), [".md"]), fn: rebrandMarkdown },
  {
    files: [join(ROOT, "python/README.md"), join(ROOT, "CONTRIBUTING.md")],
    fn: rebrandMarkdown,
  },
  {
    files: [join(ROOT, "apps/geolibre-desktop/index.html")],
    fn: (t) => rebrandUrls(rebrandText(t)),
  },
  {
    files: walkFiles(join(ROOT, "extensions"), [
      ".mjs",
      ".js",
      ".html",
      ".json",
    ]),
    fn: rebrandSource,
  },
  { files: walkFiles(join(ROOT, "extensions"), [".md"]), fn: rebrandMarkdown },
  // Fixtures that record the app's own output (not files other tools write).
  {
    files: [join(ROOT, "tests/fixtures/cesium-layer-sync-call-log.json")],
    fn: rebrandSource,
  },
];

function run() {
  let changed = 0;
  for (const { files, fn } of targets) {
    for (const path of files) {
      const rel = relative(ROOT, path);
      if (KEEP_FILES.has(rel) || !existsSync(path)) continue;
      const before = readFileSync(path, "utf8");
      // Locale catalogs are rewritten through JSON.parse/stringify; only touch
      // files that actually mention the name so formatting elsewhere is kept.
      if (!/GeoLibre|geolibre\.app|opengeos\/GeoLibre|geolibre/.test(before))
        continue;
      const after = fn(before);
      if (after === before) continue;
      changed++;
      if (CHECK) console.log(`needs rebrand: ${rel}`);
      else writeFileSync(path, after);
    }
  }
  console.log(
    `${CHECK ? "files needing rebrand" : "files rebranded"}: ${changed}`
  );
  if (CHECK && changed) process.exit(1);
}

// Only run when executed directly, never on import (tests import the rules).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  run();
