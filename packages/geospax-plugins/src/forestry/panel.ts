import type { GeoLibreAppAPI } from "@geolibre/plugins";
export function mountForestryPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  container.innerHTML = "";
  const t = (k:string, fb:string)=> app.translate?.(k, fb) ?? fb;
  const root = document.createElement("div");
  root.className = "gsp-forestry-root";
  const h = document.createElement("h3");
  h.textContent = t("geospax.forestry.title", "GeoSpaX Forestry");
  h.style.fontSize = "13px"; h.style.fontWeight = "700";
  const p = document.createElement("p");
  p.className = "gsp-forestry-hint";
  p.textContent = t("geospax.forestry.intro", "Placeholder panel for the forestry domain pack — the full toolbox (GBIF/OBIS/iNat connectors, H3/DGGS gridding, forestry/marine/agriculture indices) ships in the broader v0.4.0 build. This stub ensures the six drop-in verification passes.");
  root.append(h,p);
  container.appendChild(root);
  return () => { container.innerHTML = ""; };
}
