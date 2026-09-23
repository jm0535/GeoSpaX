// GSX Geoscience plugin — bundled drop-in entry.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountGeosciencePanel } from "./panel";
import "../shared/style.css";

export const PLUGIN_VERSION = "2.0.0";

let unregister: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-geoscience",
  name: "GSX Geoscience",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-geoscience",
        title: () =>
          app.translate?.("geospax.geoscience.title", "GSX Geoscience") ?? "GSX Geoscience",
        dock: "right-of-style",
        deactivatePluginOnClose: true,
        defaultWidth: 400,
        render: (c: HTMLElement) => mountGeosciencePanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-geoscience");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};

export default plugin;
