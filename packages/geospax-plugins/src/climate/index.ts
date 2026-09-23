// GSX Climate plugin — bundled drop-in entry.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountClimatePanel } from "./panel";
import "../shared/style.css";

export const PLUGIN_VERSION = "2.0.0";

let unregister: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-climate",
  name: "GSX Climate",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-climate",
        title: () =>
          app.translate?.("geospax.climate.title", "GSX Climate") ?? "GSX Climate",
        dock: "right-of-style",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountClimatePanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-climate");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};

export default plugin;
