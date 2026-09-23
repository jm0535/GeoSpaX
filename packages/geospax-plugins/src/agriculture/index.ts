import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountAgriculturePanel } from "./panel";
import "../shared/style.css";
import "./style.css";
export const PLUGIN_VERSION = "2.0.0";
let unregister: (() => void) | null = null;
export const plugin: GeoLibrePlugin = {
  id: "geospax-agriculture",
  name: "GSX Agriculture",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-agriculture",
        title: () =>
          app.translate?.("geospax.agriculture.title", "GSX Agriculture") ??
          "GSX Agriculture",
        dock: "right-of-layers",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountAgriculturePanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-agriculture");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};
export default plugin;
