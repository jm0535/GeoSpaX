#!/usr/bin/env python3
"""GeoSpaX branding patch-set (idempotent).

Re-applies the GeoSpaX product identity on top of pristine GeoLibre sources.
Run after every upstream merge that touched the files below:

    python3 scripts/geospax/rebrand.py [--check]

Scope (deliberately minimal — the thin-diff rule from planning/PLAN.md):
  1. apps/geolibre-desktop/index.html          title / PWA title / description meta
  2. apps/geolibre-desktop/src/components/layout/TopToolbar.tsx   appTitle constant
  3. apps/geolibre-desktop/src/i18n/locales/*.json                value-side "GeoLibre"
     -> "GeoSpaX" with exceptions; en.json about.description gets the
     built-on-GeoLibre attribution sentence.

Exceptions that intentionally KEEP the GeoLibre name (external services and
file-format identities):
  - "Share.GeoLibre"                     (the share.geolibre.app service)
  - "GeoLibre plugin registry"           (plugins.geolibre.app registry)
  - "GeoLibre Whitebox language pack"    (language-pack file format name)

JSON keys are never touched (i18next types and t() call sites depend on them):
replacement happens only in the value part of "key": "value" lines.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
APP = REPO / "apps/geolibre-desktop"

# Matches standalone "GeoLibre" except the three keep-list cases.
BRAND_RE = re.compile(r"(?<!Share\.)GeoLibre(?! plugin registry)(?! Whitebox language pack)")
NEW_BRAND = "GeoSpaX"

ABOUT_DESCRIPTION = (
    "GeoSpaX is a multi-domain geospatial analysis GIS — twelve GSX workbenches "
    "spanning agriculture, biodiversity, climate, conservation, disaster, "
    "environment, forestry, geoscience, hydrology, land cover, marine and soil "
    "— built on the open-source GeoLibre platform."
)
HTML_DESCRIPTION = (
    "GeoSpaX is a free and open-source, multi-domain geospatial analysis GIS — "
    "twelve GSX workbenches for agriculture, biodiversity, climate, "
    "conservation, disaster, environment, forestry, geoscience, hydrology, "
    "land cover, marine and soil — built on the GeoLibre platform while "
    "keeping your data local and private."
)

INDEX_HTML = APP / "index.html"
TOP_TOOLBAR = APP / "src/components/layout/TopToolbar.tsx"
LOCALES = APP / "src/i18n/locales"

CHANGES: list[str] = []


def rebrand_text(text: str, label: str) -> str:
    out = BRAND_RE.sub(NEW_BRAND, text)
    if out != text:
        CHANGES.append(label)
    return out


def rebrand_index_html(check: bool) -> None:
    text = INDEX_HTML.read_text(encoding="utf-8")
    orig = text
    text = text.replace("<title>GeoLibre</title>", f"<title>{NEW_BRAND}</title>")
    text = text.replace(
        '<meta name="apple-mobile-web-app-title" content="GeoLibre" />',
        f'<meta name="apple-mobile-web-app-title" content="{NEW_BRAND}" />',
    )
    # The description meta is one long content="..." attribute on its own line.
    text = re.sub(
        r'(<meta\s+name="description"\s+content=")[^"]*(")',
        lambda m: m.group(1) + HTML_DESCRIPTION + m.group(2),
        text,
        count=1,
    )
    if text != orig:
        CHANGES.append(str(INDEX_HTML.relative_to(REPO)))
        if not check:
            INDEX_HTML.write_text(text, encoding="utf-8")


def rebrand_toolbar(check: bool) -> None:
    text = TOP_TOOLBAR.read_text(encoding="utf-8")
    orig = text
    text = text.replace(
        'const appTitle = isTauri() && !isMobile() ? "GeoLibre Desktop" : "GeoLibre";',
        f'const appTitle = isTauri() && !isMobile() ? "{NEW_BRAND} Desktop" : "{NEW_BRAND}";',
    )
    if text != orig:
        CHANGES.append(str(TOP_TOOLBAR.relative_to(REPO)))
        if not check:
            TOP_TOOLBAR.write_text(text, encoding="utf-8")


def rebrand_locale_value_part(line: str) -> str:
    """Replace the brand only in the value portion of a "key": "value" line."""
    sep = line.find('": "')
    if sep == -1:
        return line  # structural line, key-only line, or non-string value
    key_part, value_part = line[: sep + 2], line[sep + 2 :]
    if BRAND_RE.search(key_part):
        # A JSON *key* contains the brand: never rewrite keys (typed i18n).
        CHANGES.append(f"SKIPPED KEY containing GeoLibre: {key_part.strip()[:60]}")
        return line
    return key_part + BRAND_RE.sub(NEW_BRAND, value_part)


def rebrand_locales(check: bool) -> None:
    for path in sorted(LOCALES.glob("*.json")):
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        out = [rebrand_locale_value_part(line) for line in lines]
        text = "".join(out)
        # en.json carries the source-of-truth About description with attribution.
        if path.name == "en.json":
            data = json.loads(text)
            about = data.get("about", {})
            if about.get("description") not in (None, ABOUT_DESCRIPTION):
                about["description"] = ABOUT_DESCRIPTION
                text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
                CHANGES.append(f"{path.name}: about.description attribution")
        if text != "".join(lines):
            CHANGES.append(str(path.relative_to(REPO)))
            if not check:
                path.write_text(text, encoding="utf-8")
        # Always validate JSON after (or before, in check mode) processing.
        json.loads(text)


def main() -> int:
    check = "--check" in sys.argv
    rebrand_index_html(check)
    rebrand_toolbar(check)
    rebrand_locales(check)
    verb = "Would change" if check else "Changed"
    if CHANGES:
        print(f"{verb} ({len(CHANGES)}):")
        for c in CHANGES:
            print(f"  - {c}")
    else:
        print("Nothing to do: branding already applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
