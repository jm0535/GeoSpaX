# Upstream-file divergence registry (thin-diff rule)

Every file in this repo that is **not purely additive** over `opengeos/GeoLibre`
is listed here. On upstream merges: take upstream for these files, then re-apply
(scripted where possible). Anything not listed here must stay byte-identical to
upstream — if you must touch another upstream file, add it here with a reason.

| File | Divergence | Re-apply |
|---|---|---|
| `apps/geolibre-desktop/index.html` | GeoSpaX title, PWA title, description meta | `python3 scripts/geospax/rebrand.py` |
| `apps/geolibre-desktop/src/components/layout/TopToolbar.tsx` | `appTitle` → GeoSpaX (one line) | `scripts/geospax/rebrand.py` |
| `apps/geolibre-desktop/src/i18n/locales/*.json` (19) | Value-side GeoLibre → GeoSpaX; en.json About attribution; keys untouched | `scripts/geospax/rebrand.py` |
| `apps/geolibre-desktop/public/admin-profile.json` | Was upstream placeholder `null`; now the GeoSpaX curation preset (25 hidden plugins, non-locked) | Manual (small file, product-owned) |
| `apps/geolibre-desktop/vite.config.ts` | 2 lines in `server:` — `GEOSPAX_DEV_HOST` env override for `host`, `.e2b.app` added to `allowedHosts` (sandbox preview) | Manual (2 lines) |
| `package.json` (root) | `workspaces` glob `packages/*` already covers `packages/geospax-*` — no edit needed | — |
| `package-lock.json` | Workspace entries for `@geospax/analysis`, `@geospax/plugins` (npm-managed; deps all pre-existing in lockfile) | `npm install` |

**Not divergences (additive-only, conflict-free):**
`planning/`, `GEOSPAX_PLAN.md`, `scripts/geospax/`, `packages/geospax-analysis/`,
`packages/geospax-plugins/`, `tests/geospax-*.test.ts`,
`apps/geolibre-desktop/public/samples/geospax/`.

Bundled plugin drop-ins under `apps/geolibre-desktop/public/plugins/` are build
artefacts (git-ignored by upstream convention) — produced by
`npm run build -w @geospax/plugins`, never committed.
