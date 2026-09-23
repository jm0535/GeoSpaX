import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountAgriculturePanel } from "./panel";
import "./style.css";
export const PLUGIN_VERSION = "2.0.0";
let unregister: (()=>void)|null=null;
export const plugin: GeoLibrePlugin = {
  id: "geospax-agriculture",
  name: "GeoSpaX Agriculture",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister = app.registerRightPanel?.({
      id: "geospax-agriculture",
      title: () => app.translate?.("geospax.agriculture.title", "GeoSpaX Agriculture") ?? "GeoSpaX Agriculture",
      dock: "right-of-layers",
      render: (c: HTMLElement) => mountAgriculturePanel(c, app),
    }) ?? null;
    if (!unregister) return false;
    return true;
  },
  deactivate() { unregister?.(); unregister=null; },
};
export default plugin;
