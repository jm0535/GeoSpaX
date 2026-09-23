// GSX Soil plugin — bundled drop-in entry.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountSoilPanel } from "./panel";
import "../shared/style.css";

export const PLUGIN_VERSION = "2.0.0";

let unregister: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-soil",
  name: "GSX Soil",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-soil",
        title: () => app.translate?.("geospax.soil.title", "GSX Soil") ?? "GSX Soil",
        dock: "right-of-style",
        deactivatePluginOnClose: true,
        defaultWidth: 400,
        render: (c: HTMLElement) => mountSoilPanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-soil");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};

export default plugin;
