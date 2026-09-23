import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountBiodiversityPanel } from "./panel";
import "../shared/style.css";
import "./style.css";
export const PLUGIN_VERSION = "2.0.0";
let unregister: (() => void) | null = null;
export const plugin: GeoLibrePlugin = {
  id: "geospax-biodiversity",
  name: "GeoSpaX Biodiversity",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-biodiversity",
        title: () =>
          app.translate?.("geospax.biodiversity.title", "GeoSpaX Biodiversity") ??
          "GeoSpaX Biodiversity",
        dock: "right-of-layers",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountBiodiversityPanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-biodiversity");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};
export default plugin;
