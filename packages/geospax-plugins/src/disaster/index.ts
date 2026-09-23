// GSX Disaster plugin — bundled drop-in entry.

import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountDisasterPanel } from "./panel";
import "../shared/style.css";

export const PLUGIN_VERSION = "2.0.0";

let unregister: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
  id: "geospax-disaster",
  name: "GSX Disaster",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-disaster",
        title: () =>
          app.translate?.("geospax.disaster.title", "GSX Disaster") ?? "GSX Disaster",
        dock: "right-of-style",
        deactivatePluginOnClose: true,
        defaultWidth: 400,
        render: (c: HTMLElement) => mountDisasterPanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-disaster");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};

export default plugin;
