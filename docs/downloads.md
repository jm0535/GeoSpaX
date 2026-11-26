# Get GeoSpaX

GeoSpaX is available as a web app today. Desktop installers and the Python
package are built from source; signed installers, app-store listings and a
PyPI release are not published yet.

## Web app

The full app in your browser, nothing to install. Your data stays in your
browser session.

[Launch GeoSpaX Web](https://geospax.fly.dev/){ .md-button .md-button--primary }

## Desktop app (Windows, macOS, Linux)

The desktop app adds local file dialogs, local MBTiles and raster reads,
project save/open, and the optional Python sidecar engines (Whitebox, raster
and conversion tools).

Build an installer for your platform from source:

```bash
git clone https://github.com/jm0535/GeoSpaX.git
cd GeoSpaX
npm install
npm run tauri:build
```

You need Node.js 22+, Rust (stable) and the
[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your
platform (on Linux: WebKitGTK and GTK 3 development packages). Installers are
written to `apps/geolibre-desktop/src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| Windows | `.msi`, `-setup.exe` |
| macOS | `.app`, `.dmg` (unsigned: right-click → **Open** the first time) |
| Linux | `.deb`, `.rpm`, `.AppImage` |

To run the desktop app without packaging it, use `npm run tauri:dev`.

<!-- geospax:keep -->
The desktop app identifier is `geospax.in4metrix.dev`, so GeoSpaX keeps its own
settings, data folder and keychain entries and can be installed alongside
GeoLibre.
<!-- /geospax:keep -->

## Python package (Jupyter)

The `geospax` package embeds GeoSpaX in Jupyter notebooks. Build and install
it from a checkout:

```bash
npm install && npm run build:embed
pip install ./python
```

See [Python Package](python.md).

## Self-hosting

To run GeoSpaX on your own server (Docker or static hosting), see
[Self-hosting](self-hosting.md).

## Release notes

Changes are listed on the
[GitHub releases page](https://github.com/jm0535/GeoSpaX/releases) and in the
repository history.
