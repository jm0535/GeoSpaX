import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { mountMarinePanel } from "./panel";
import "../shared/style.css";
import "./style.css";
export const PLUGIN_VERSION = "2.0.0";
let unregister: (() => void) | null = null;
export const plugin: GeoLibrePlugin = {
  id: "geospax-marine",
  name: "GSX Marine",
  version: PLUGIN_VERSION,
  engines: ["maplibre"],
  activate(app: GeoLibreAppAPI) {
    unregister =
      app.registerRightPanel?.({
        id: "geospax-marine",
        title: () => app.translate?.("geospax.marine.title", "GSX Marine") ?? "GSX Marine",
        dock: "right-of-style",
        defaultWidth: 400,
        render: (c: HTMLElement) => mountMarinePanel(c, app),
      }) ?? null;
    if (!unregister) return false;
    app.openRightPanel?.("geospax-marine");
    return true;
  },
  deactivate() {
    unregister?.();
    unregister = null;
  },
};
export default plugin;
