// GeoSpaX Conservation Planning plugin - bundled drop-in entry.
//
// Registered automatically from apps/geolibre-desktop/public/plugins/ (see
// scripts/build.mjs). Ships a right-sidebar panel; all heavy logic lives in
// @geospax/analysis (inlined into the bundle by the lib build).

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import {
  applyPanelState,
  getPanelState,
  mountConservationPanel,
  type ConservationPanelState,
} from "./panel";
import "../shared/style.css";
import "./style.css";

/** Must match plugin.json "version" - the loader validates the pair. */
export const PLUGIN_VERSION = "2.0.0";

let unregisterPanel: (() => void) | null = null;
let appRef: GeoLibreAppAPI | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-conservation",
  name: "GeoSpaX Conservation Planning",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],

  activate(app: GeoLibreAppAPI) {
    appRef = app;
    unregisterPanel =
      app.registerRightPanel?.({
        id: "geospax-conservation",
        title: () =>
          app.translate?.("geospax.conservation.title", "Conservation Planning") ??
          "Conservation Planning",
        dock: "right-of-layers",
        defaultWidth: 400,
        render: (container: HTMLElement) => mountConservationPanel(container, app),
        onOpen: () => {
          // Refresh the layer pickers whenever the panel is opened.
          document.dispatchEvent(new CustomEvent("geospax-conservation:refresh"));
        },
      }) ?? null;
    if (!unregisterPanel) return false;
    app.openRightPanel?.("geospax-conservation");
    return true;
  },

  deactivate() {
    unregisterPanel?.();
    unregisterPanel = null;
    appRef = null;
  },

  // Persist the working context (layer choices by NAME - ids are session
  // scoped - and the area method) inside the project file.
  getProjectState(): ConservationPanelState {
    return getPanelState();
  },

  applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
    if (!state || typeof state !== "object") return false;
    applyPanelState(state as ConservationPanelState);
    return true;
  },
};

export default plugin;
