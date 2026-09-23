// GSX LULC plugin — bundled drop-in entry.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountLulcPanel } from "./panel";
import "../shared/style.css";

export const PLUGIN_VERSION = "2.0.0";

let unregister: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-lulc",
  name: "GSX LULC",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-lulc",
        title: () => app.translate?.("geospax.lulc.title", "GSX LULC") ?? "GSX LULC",
        dock: "right-of-style",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountLulcPanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-lulc");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};

export default plugin;
