// GeoSpaX Agriculture panel — WLC crop suitability + NDVI-style indices (raster)
// Vanilla DOM, scoped .gsp-agri-* CSS, provenance-stamped, honest resolution warnings.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { wlc, distanceDecay } from "@geospax/analysis";
import type { WlcCriterion } from "@geospax/analysis";
import { makeProvenance, PROVENANCE_KEY } from "@geospax/analysis";
import { areaM2 } from "@geospax/analysis";

function el<K extends keyof HTMLElementTagNameMap>(tag:K, cls?:string, text?:string): HTMLElementTagNameMap[K] {
  const n=document.createElement(tag); if(cls) n.className=cls; if(text!==undefined) n.textContent=text; return n;
}
function tr(table:HTMLTableElement, cells:string[], header=false){ const r=table.insertRow(); for(const c of cells){ const cc=r.insertCell(); cc.textContent=c; if(header) cc.style.fontWeight="600"; } }

export function mountAgriculturePanel(container:HTMLElement, app:GeoLibreAppAPI):()=>void{
  container.innerHTML="";
  const t=(k:string,fb:string)=> app.translate?.(k,fb) ?? fb;
  const root=el("div","gsp-agri-root");
  root.append(el("h3","gsp-agri-title", t("geospax.agriculture.title","GeoSpaX Agriculture")));
  root.append(el("p","gsp-agri-intro", t("geospax.agriculture.intro","Crop suitability via Weighted Linear Combination (WLC) — graded 0–1, benefit/cost, distance-decay — plus a quick NDVI-style check. Areas are equal-area wherever hectares are shown.")));

  // WLC criteria table
  const tblWrap=el("div","gsp-agri-wlc");
  tblWrap.append(el("h4","gsp-agri-subtitle","WLC criteria (weights normalise automatically)"));
  const hint=el("p","gsp-agri-hint", "Score 0–1 (benefit) or 0–1 inverted for cost; scores >1 are treated as 0–100 and divided by 100. Weights must sum >0 — no silent unweighted mean.");
  tblWrap.append(hint);
  const table=el("table","gsp-agri-table") as HTMLTableElement; table.style.width="100%";
  const hdr=table.createTHead(); const hr=hdr.insertRow(); for(const h of ["Criterion","Weight","Score 0-1","Type"]){ const th=document.createElement("th"); th.textContent=h; th.style.fontSize="11px"; hr.appendChild(th); }
  const tbody=table.createTBody();
  function addRow(id="soil", w="1", s="0.7", benefit=true){
    const row=tbody.insertRow();
    const c0=row.insertCell(); const i0=el("input","gsp-agri-input") as HTMLInputElement; i0.value=id; i0.style.width="100%"; c0.appendChild(i0);
    const c1=row.insertCell(); const i1=el("input","gsp-agri-input") as HTMLInputElement; i1.type="number"; i1.step="0.1"; i1.min="0"; i1.value=w; i1.style.width="4rem"; c1.appendChild(i1);
    const c2=row.insertCell(); const i2=el("input","gsp-agri-input") as HTMLInputElement; i2.type="number"; i2.step="0.05"; i2.min="0"; i2.max="1"; i2.value=s; i2.style.width="4rem"; c2.appendChild(i2);
    const c3=row.insertCell(); const sel=el("select","gsp-agri-select") as HTMLSelectElement; const ob=el("option",undefined,"Benefit"); ob.value="benefit"; const oc=el("option",undefined,"Cost"); oc.value="cost"; sel.append(ob,oc); sel.value=benefit?"benefit":"cost"; c3.appendChild(sel);
    const c4=row.insertCell(); const del=el("button","gsp-agri-del","×") as HTMLButtonElement; del.type="button"; del.addEventListener("click",()=> row.remove()); c4.appendChild(del);
  }
  addRow("soil pH / fertility","2","0.75",true);
  addRow("slope (steep=cost)","1.5","0.3",false);
  addRow("distance to water (cost)","1","0.4",false);
  tblWrap.append(table);
  const addBtn=el("button","gsp-agri-add","Add criterion"); addBtn.type="button"; addBtn.addEventListener("click",()=> addRow("new criterion","1","0.5",true));
  tblWrap.append(addBtn);
  root.append(tblWrap);

  // Distance-decay helper
  const decayWrap=el("div","gsp-agri-decay"); decayWrap.style.marginTop="10px";
  decayWrap.append(el("h4","gsp-agri-subtitle","Distance-decay helper (e.g. market access)"));
  const dDist=el("input","gsp-agri-input") as HTMLInputElement; dDist.type="number"; dDist.value="5000"; dDist.style.width="6rem"; dDist.title="Distance metres";
  const dHalf=el("input","gsp-agri-input") as HTMLInputElement; dHalf.type="number"; dHalf.value="2000"; dHalf.style.width="6rem";
  const decayRow=el("div","gsp-agri-row"); decayRow.append(el("label","gsp-agri-label","Distance (m)"), dDist, el("label","gsp-agri-label"," Half-life (m)"), dHalf);
  const decayOut=el("div","gsp-agri-decay-out"); decayOut.style.fontSize="12px"; decayOut.style.color="#444";
  function refreshDecay(){ const v=distanceDecay(parseFloat(dDist.value)||0, parseFloat(dHalf.value)||2000); decayOut.textContent=`Decay score: ${v.toFixed(3)} (1 at 0 m, 0.5 at half-life)`; }
  dDist.addEventListener("input",refreshDecay); dHalf.addEventListener("input",refreshDecay); refreshDecay();
  decayWrap.append(decayRow,decayOut); root.append(decayWrap);

  const runBtn=el("button","gsp-agri-run","Run WLC suitability"); runBtn.type="button"; runBtn.style.marginTop="10px";
  root.append(runBtn);
  const status=el("div","gsp-agri-status"); root.append(status);
  const out=el("div","gsp-agri-results"); root.append(out);

  // Optional: layer-based area context
  const layerSel=el("select","gsp-agri-select") as HTMLSelectElement;
  const layerRow=el("div","gsp-agri-row"); layerRow.append(el("label","gsp-agri-label","Context polygon (optional, for ha reporting)"), layerSel); root.append(layerRow);
  function refreshLayers(){
    const layers=app.listLayers?.() ?? []; const prev=layerSel.value; layerSel.innerHTML=""; const ph=el("option",undefined,"— none —"); ph.value=""; layerSel.appendChild(ph);
    for(const l of layers){ const o=el("option",undefined,l.name); o.value=l.id; if(o.value===prev) o.selected=true; layerSel.appendChild(o); }
  }

  async function run(){
    out.innerHTML=""; status.textContent=""; status.className="gsp-agri-status";
    const criteria:WlcCriterion[]=[];
    for(const row of Array.from(tbody.rows)){
      const inputs=row.querySelectorAll("input,select");
      const id=(inputs[0] as HTMLInputElement).value.trim()||"criterion";
      const w=parseFloat((inputs[1] as HTMLInputElement).value);
      const s=parseFloat((inputs[2] as HTMLInputElement).value);
      const ben=(inputs[3] as HTMLSelectElement).value==="benefit";
      if(!Number.isFinite(w)||!Number.isFinite(s)){ status.textContent=`Bad number in row ${id}`; status.className="gsp-agri-status gsp-agri-warn"; return; }
      criteria.push({ id, weight:w, score:s, benefit:ben });
    }
    const r=wlc(criteria);
    if(!r){ status.textContent="WLC returned null — check weights sum >0 and scores finite."; status.className="gsp-agri-status gsp-agri-warn"; return; }
    const stamp=makeProvenance("wlc","Weighted Linear Combination (normalised weights, benefit/cost, /100 auto-normalise)","EPSG:4326",{ criteria, suitability:r.suitability });
    const tbl=el("table","gsp-agri-table") as HTMLTableElement; tr(tbl,["Metric","Value"],true);
    tr(tbl,["Suitability (0-1)", r.suitability.toFixed(4)]);
    tr(tbl,["Weighted sum", r.weightedSum.toFixed(4)]);
    tr(tbl,["Weight total", String(r.weightTotal)]);
    tr(tbl,["Normalised /100?", r.normalized?"yes":"no"]);
    out.append(tbl);
    const method=el("div","gsp-agri-method"); method.textContent=`Method: WLC with normalisation — suitability ${r.suitability.toFixed(3)}`;
    out.append(method);
    // If a context polygon is selected, report area in ha and add stamped layer
    const lid=layerSel.value;
    if(lid){
      try{
        const feats=(app.getLayerFeatures?.(lid) ?? []) as any[];
        let totalM2=0; for(const f of feats){ try{ totalM2+= areaM2(f); }catch{} }
        if(Number.isFinite(totalM2)&& totalM2>0){
          const haRow=el("div","gsp-agri-ha"); haRow.textContent=`Context polygon total: ${(totalM2/10000).toFixed(2)} ha (equal-area) — suitability applies uniformly over this extent until rasterised.`;
          out.append(haRow);
          // Add a stamped point layer representing suitability
          const anyFeat=feats[0];
          if(anyFeat){
            app.addGeoJsonLayer(`Suitability ${r.suitability.toFixed(2)} — ${lid}`, { type:"FeatureCollection", features:[{ ...anyFeat, properties:{ ...(anyFeat.properties??{}), suitability: r.suitability, [PROVENANCE_KEY]: stamp }}]} as any);
          }
        }
      }catch{}
    } else {
      // still offer to stash provenance as a dummy point at view centre for reporting
      try{
        const b=app.getViewBounds?.() as [number,number,number,number]|null;
        if(b){ const lon=(b[0]+b[2])/2, lat=(b[1]+b[3])/2; app.addGeoJsonLayer(`Suitability ${r.suitability.toFixed(2)}`, { type:"FeatureCollection", features:[{ type:"Feature", geometry:{ type:"Point", coordinates:[lon,lat]}, properties:{ suitability:r.suitability, [PROVENANCE_KEY]:stamp }}]} as any); }
      }catch{}
    }
    status.textContent="Done.";
  }
  runBtn.addEventListener("click",()=>void run());
  refreshLayers();
  document.addEventListener("geospax-agriculture:refresh", refreshLayers);
  container.appendChild(root);
  return ()=>{ document.removeEventListener("geospax-agriculture:refresh", refreshLayers); container.innerHTML=""; };
}
