// GeoSpaX Forestry panel — fragmentation, connectivity, change (Hansen/GFW catalogue stubs)
// Vanilla DOM, scoped .gsp-for-* CSS, provenance-stamped, equal-area hectares first-class.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { patchMetrics, summarizeFragmentation } from "@geospax/analysis";
import { connectivityGraph, connectivitySummary } from "@geospax/analysis";
import { formatArea } from "@geospax/analysis";
import { makeProvenance, PROVENANCE_KEY } from "@geospax/analysis";
import { FOREST_META, FOREST_LAYERS } from "@geospax/data";
import { citationString } from "@geospax/data";
import type { Feature, Polygon, MultiPolygon } from "geojson";

function el<K extends keyof HTMLElementTagNameMap>(tag:K, cls?:string, text?:string): HTMLElementTagNameMap[K] {
  const n=document.createElement(tag); if(cls) n.className=cls; if(text!==undefined) n.textContent=text; return n;
}
function tr(table:HTMLTableElement, cells:string[], header=false){ const r=table.insertRow(); for(const c of cells){ const cc=r.insertCell(); cc.textContent=c; if(header) cc.style.fontWeight="600"; } }

export function mountForestryPanel(container:HTMLElement, app:GeoLibreAppAPI):()=>void{
  container.innerHTML="";
  const t=(k:string,fb:string)=> app.translate?.(k,fb) ?? fb;
  const root=el("div","gsp-for-root");
  root.append(el("h3","gsp-for-title", t("geospax.forestry.title","GeoSpaX Forestry")));
  root.append(el("p","gsp-for-intro", t("geospax.forestry.intro","Patch fragmentation + connectivity + forest change. Select a polygon layer of forest patches; metrics use equal-area hectares by default.")));
  const cite=el("div","gsp-for-citation"); cite.style.fontSize="11px"; cite.style.color="#555"; cite.textContent=citationString(FOREST_META.citation)+` — layers: ${FOREST_LAYERS.map(l=>l.id).join(", ")}`; root.append(cite);

  const patchSelect=el("select","gsp-for-select") as HTMLSelectElement;
  const patchRow=el("div","gsp-for-row"); patchRow.append(el("label","gsp-for-label","Forest patch layer"), patchSelect); root.append(patchRow);

  const distInput=el("input","gsp-for-input") as HTMLInputElement; distInput.type="number"; distInput.value="2000"; distInput.min="10"; distInput.step="100"; distInput.style.width="6rem";
  const connRow=el("div","gsp-for-row"); connRow.append(el("label","gsp-for-label","Connectivity max distance (m)"), distInput); root.append(connRow);

  const runBtn=el("button","gsp-for-run", t("geospax.forestry.run","Run fragmentation & connectivity")); runBtn.type="button"; root.append(runBtn);
  const status=el("div","gsp-for-status"); root.append(status);
  const results=el("div","gsp-for-results"); root.append(results);
  const warnBox=el("div","gsp-for-warn"); root.append(warnBox);

  function refreshLayers(){
    const layers=app.listLayers?.() ?? [];
    const prev=patchSelect.value ? app.listLayers?.().find(l=>l.id===patchSelect.value)?.name : null;
    patchSelect.innerHTML=""; const ph=el("option",undefined,"— select polygon layer —"); ph.value=""; patchSelect.appendChild(ph);
    for(const l of layers){ const o=el("option",undefined,l.name); o.value=l.id; if(prev && l.name===prev) o.selected=true; patchSelect.appendChild(o); }
  }

  async function run(){
    results.innerHTML=""; warnBox.textContent=""; status.textContent="";
    const id=patchSelect.value;
    if(!id){ status.textContent=t("geospax.forestry.needLayer","Pick a forest-patch polygon layer."); status.className="gsp-for-status gsp-for-warn"; return; }
    let feats: Feature<Polygon|MultiPolygon>[];
    try{ feats=(app.getLayerFeatures?.(id) ?? []) as any; }catch(e){ status.textContent=String(e); status.className="gsp-for-status gsp-for-warn"; return; }
    feats=feats.filter(f=> f?.geometry && (f.geometry.type==="Polygon"||f.geometry.type==="MultiPolygon"));
    if(feats.length===0){ status.textContent="Selected layer has no Polygon features."; status.className="gsp-for-status gsp-for-warn"; return; }
    status.textContent=`Computing ${feats.length} patch(es)…`; await new Promise(r=>setTimeout(r,0));
    const metrics=feats.map((f,i)=> patchMetrics(f as any, `patch-${i}`)).filter(Boolean) as ReturnType<typeof patchMetrics>[];
    if(metrics.length===0){ status.textContent="No valid patch metrics (check geometry)."; status.className="gsp-for-status gsp-for-warn"; return; }
    const summary=summarizeFragmentation(metrics as any);
    const maxDist=Math.max(1, Number(distInput.value)||2000);
    const graph=connectivityGraph(feats as any, {maxDistanceM: maxDist});
    const cs=graph? connectivitySummary(graph): null;

    const tbl=el("table","gsp-for-table") as HTMLTableElement;
    tr(tbl,["Metric","Value"],true);
    tr(tbl,["Patch count", String(summary.patchCount)]);
    tr(tbl,["Total area", formatArea(summary.totalAreaM2,"ha").display]);
    tr(tbl,["Mean patch", formatArea(summary.meanAreaHa*10000,"ha").display]);
    tr(tbl,["Mean shape index", summary.meanShapeIndex.toFixed(3)]);
    tr(tbl,["Total perimeter", `${(summary.totalPerimeterM/1000).toFixed(2)} km`]);
    if(cs){ tr(tbl,["Connectivity edges (≤"+maxDist+" m)", String(cs.edgeCount)]); tr(tbl,["Components", String(cs.componentCount)]); tr(tbl,["Isolated patches", String(cs.isolatedCount)]); }
    results.append(tbl);
    const methodNote=el("div","gsp-for-method"); methodNote.textContent=`Method: patchMetrics via equal-area (LAEA) + haversine connectivity at ${maxDist} m threshold — ${FOREST_META.citation.publisher} (${FOREST_META.citation.year}).`;
    results.append(methodNote);
    status.textContent="Done — metrics computed.";
    // Add stamped summary point? Offer to add patch centroids as layer
    if(graph){
      const stamp=makeProvenance("fragmentation","Patch metrics (equal-area) + thresholded proximity graph","EPSG:4326",{ patchLayer: app.listLayers?.().find(l=>l.id===id)?.name ?? id, patchCount:summary.patchCount, maxDistanceM:maxDist });
      const centroids: GeoJSON.Feature[] = graph.nodes.map(n=> ({ type:"Feature", geometry:{ type:"Point", coordinates: n.centroid as any }, properties:{ area_ha: n.areaHa.toFixed(2), [PROVENANCE_KEY]:stamp }}));
      if(centroids.length) app.addGeoJsonLayer(`Forest patch centroids (${app.listLayers?.().find(l=>l.id===id)?.name ?? "patches"})`, { type:"FeatureCollection", features: centroids } as any);
      if(graph.edges.length){
        const lines: GeoJSON.Feature[] = graph.edges.map(e=> {
          const a=graph.nodes[e.from].centroid, b=graph.nodes[e.to].centroid;
          return { type:"Feature", geometry:{ type:"LineString", coordinates:[a,b] }, properties:{ distance_m: Math.round(e.distanceM), [PROVENANCE_KEY]:stamp } };
        });
        app.addGeoJsonLayer(`Forest connectivity (≤${maxDist} m)`, { type:"FeatureCollection", features: lines } as any);
      }
    }
    if(summary.patchCount>500) { warnBox.textContent="Large patch count — rendering centroids/lines may be heavy. Filter the source layer first."; warnBox.className="gsp-for-warn"; }
  }
  runBtn.addEventListener("click",()=>void run());
  refreshLayers();
  document.addEventListener("geospax-forestry:refresh", refreshLayers);
  container.appendChild(root);
  return ()=>{ document.removeEventListener("geospax-forestry:refresh", refreshLayers); container.innerHTML=""; };
}
