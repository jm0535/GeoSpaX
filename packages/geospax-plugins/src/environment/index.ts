// GeoSpaX Environment plugin — bundled drop-in entry.
//
// Terrain (Horn slope/zones) + spectral index (NDVI/NDWI/NDBI/NBR, Otsu,
// polygonized extent). Registers a right-sidebar panel that samples the
// current raster window (via `readRasterWindow` + `getViewBounds`) — the same
// mechanism the Whitebox raster tools use — so results are view-dependent and
// honest about their sampled resolution.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import {
  applyPanelState,
  getPanelState,
  mountEnvironmentPanel,
  type EnvironmentPanelState,
} from "./panel";
import "./style.css";

/** Must match plugin.json "version" — the loader validates the pair. */
export const PLUGIN_VERSION = "2.0.0";

let unregisterPanel: (() => void) | null = null;
let appRef: GeoLibreAppAPI | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-environment",
  name: "GeoSpaX Environment",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],

  activate(app: GeoLibreAppAPI) {
    appRef = app;
    unregisterPanel =
      app.registerRightPanel?.({
        id: "geospax-environment",
        title: () => app.translate?.("geospax.environment.title", "Environment") ?? "Environment",
        dock: "right-of-layers",
        defaultWidth: 400,
        render: (container: HTMLElement) => mountEnvironmentPanel(container, app),
        onOpen: () => {
          document.dispatchEvent(new CustomEvent("geospax-environment:refresh"));
        },
      }) ?? null;
    if (!unregisterPanel) return false;
    app.openRightPanel?.("geospax-environment");
    return true;
  },

  deactivate() {
    unregisterPanel?.();
    unregisterPanel = null;
    appRef = null;
  },

  // Persist working context (layer choices by NAME — ids are session-scoped —
  // band numbers, breaks, preset, threshold) inside the project file.
  getProjectState(): EnvironmentPanelState {
    return getPanelState();
  },

  applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
    if (!state || typeof state !== "object") return false;
    applyPanelState(state as EnvironmentPanelState);
    return true;
  },
};

export default plugin;
