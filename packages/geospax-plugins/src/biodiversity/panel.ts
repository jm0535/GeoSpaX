import type { GeoLibreAppAPI } from "@geolibre/plugins";
export function mountBiodiversityPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  container.innerHTML = "";
  const t = (k:string, fb:string)=> app.translate?.(k, fb) ?? fb;
  const root = document.createElement("div");
  root.className = "gsp-biodiversity-root";
  const h = document.createElement("h3");
  h.textContent = t("geospax.biodiversity.title", "GeoSpaX Biodiversity");
  h.style.fontSize = "13px"; h.style.fontWeight = "700";
  const p = document.createElement("p");
  p.className = "gsp-biodiversity-hint";
  p.textContent = t("geospax.biodiversity.intro", "Placeholder panel for the biodiversity domain pack — the full toolbox (GBIF/OBIS/iNat connectors, H3/DGGS gridding, forestry/marine/agriculture indices) ships in the broader v0.4.0 build. This stub ensures the six drop-in verification passes.");
  root.append(h,p);
  container.appendChild(root);
  return () => { container.innerHTML = ""; };
}
