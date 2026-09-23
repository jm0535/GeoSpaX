import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountForestryPanel } from "./panel";
import "../shared/style.css";
import "./style.css";
export const PLUGIN_VERSION = "2.0.0";
let unregister: (() => void) | null = null;
export const plugin: GeoLibrePlugin = {
  id: "geospax-forestry",
  name: "GSX Forestry",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-forestry",
        title: () =>
          app.translate?.("geospax.forestry.title", "GSX Forestry") ?? "GSX Forestry",
        dock: "right-of-style",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountForestryPanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-forestry");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};
export default plugin;
