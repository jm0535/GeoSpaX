import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountMarinePanel } from "./panel";
import "./style.css";
export const PLUGIN_VERSION = "2.0.0";
let unregister: (()=>void)|null=null;
export const plugin: GeoLibrePlugin = {
  id: "geospax-marine",
  name: "GeoSpaX Marine",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister = app.registerRightPanel?.({
      id: "geospax-marine",
      title: () => app.translate?.("geospax.marine.title", "GeoSpaX Marine") ?? "GeoSpaX Marine",
      dock: "right-of-layers",
      render: (c: HTMLElement) => mountMarinePanel(c, app),
    }) ?? null;
    if (!unregister) return false;
    return true;
  },
  deactivate() { unregister?.(); unregister=null; },
};
export default plugin;
