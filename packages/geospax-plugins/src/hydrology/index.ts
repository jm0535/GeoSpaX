// GSX Hydrology plugin — bundled drop-in entry.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountHydrologyPanel } from "./panel";
import "../shared/style.css";

export const PLUGIN_VERSION = "2.0.0";

let unregister: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-hydrology",
  name: "GSX Hydrology",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-hydrology",
        title: () =>
          app.translate?.("geospax.hydrology.title", "GSX Hydrology") ?? "GSX Hydrology",
        dock: "right-of-layers",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountHydrologyPanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-hydrology");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};

export default plugin;
