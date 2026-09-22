# @geospax/plugins

GeoSpaX domain plugins, built as **bundled drop-ins** for the app's
`public/plugins/` directory — the GeoLibre mechanism that auto-loads plugins
with no upstream source edits (see `docs/plugin-api.md` §External plugins →
§Bundled plugins).

## Plugins

| id | Status | Contents |
|---|---|---|
| `geospax-conservation` | increment 1 | Right-panel "Conservation Planning": protection gap analysis with equal-area hectares, method declarations, closure checks, provenance-stamped result layers |

## Build

```bash
npm run build -w @geospax/plugins
```

Emits, for each plugin:

```text
apps/geolibre-desktop/public/plugins/<id>/
  plugin.json          (copied from src/<plugin>/plugin.json)
  dist/index.js        (self-contained ESM bundle - analysis core, turf, proj4 inlined)
  dist/style.css
```

Bundled-plugin discovery runs at **dev-server start / app build**, so run this
before `npm run dev` (restart the dev server after rebuilding). The drop-in
folders are git-ignored by upstream convention (`public/plugins/.gitignore`):
bundles are build artefacts, produced in CI before `npm run build`.

`plugin.json` sets `"activeByDefault": true` (honoured for bundled drop-ins),
so the panel is live on first run without visiting the Plugins menu.

## Typecheck note

`npm run typecheck -w @geospax/plugins` follows type imports into upstream
`@geolibre/*` sources and currently surfaces one pre-existing upstream error
(`packages/plugins/src/plugins/local-netcdf.ts` — `WorkerGlobalScope` needs the
app's lib config). **Zero errors originate in geospax sources** — verify with:

```bash
npx tsc --noEmit -p packages/geospax-plugins/tsconfig.json 2>&1 | grep geospax
```

## Conventions

- Plugins never mutate MapLibre directly: results go through
  `app.addGeoJsonLayer` / store APIs (GeoLibre's one-way data rule).
- Every result layer carries `_geospax` provenance (tool, method that
  actually ran, CRS, params, timestamp, engine version, lineage).
- UI strings go through `app.translate(key, default)`; scoped CSS only
  (`.gsp-cons-*` prefixes).
- Plugin `version` must match `plugin.json` `version` (loader-validated);
  bump both together.
