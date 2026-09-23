// GeoSpaX Biodiversity panel — GBIF/OBIS/iNat live fetch + richness/diversity.
// Vanilla DOM, scoped .gsp-bio-* CSS, provenance-stamped layers, citation-carried.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { GBIF_META, fetchGbifOccurrences, gbifSearchUrl } from "@geospax/data";
import { OBIS_META, fetchObisOccurrences, obisSearchUrl } from "@geospax/data";
import { INAT_META, fetchInatObservations, inatSearchUrl } from "@geospax/data";
import { WORMS_META, fetchWormsAphia, wormsAphiaUrl } from "@geospax/data";
import { citationString } from "@geospax/data";
import { richness, shannon, simpson } from "@geospax/analysis";
import { makeProvenance, PROVENANCE_KEY } from "@geospax/analysis";

function el<K extends keyof HTMLElementTagNameMap>(tag:K, cls?:string, text?:string): HTMLElementTagNameMap[K] {
  const n=document.createElement(tag); if(cls) n.className=cls; if(text!==undefined) n.textContent=text; return n;
}
function tr(table:HTMLTableElement, cells:string[], header=false){ const r=table.insertRow(); for(const c of cells){ const cc=r.insertCell(); cc.textContent=c; if(header) cc.style.fontWeight="600"; } }

export function mountBiodiversityPanel(container:HTMLElement, app:GeoLibreAppAPI):()=>void{
  container.innerHTML="";
  const t=(k:string,fb:string)=> app.translate?.(k,fb) ?? fb;
  const root=el("div","gsp-bio-root");
  root.append(el("h3","gsp-bio-title", t("geospax.biodiversity.title","GeoSpaX Biodiversity")));
  root.append(el("p","gsp-bio-intro", t("geospax.biodiversity.intro","Query live occurrence archives (GBIF/OBIS/iNaturalist) and WoRMS taxonomy — results carry citation, provenance and _geospax lineage; compute richness/diversity over your layers.")));

  // --- Source + taxon ---
  const sourceSel=el("select","gsp-bio-select") as HTMLSelectElement;
  for(const [v,l] of [["gbif","GBIF"],["obis","OBIS (marine)"],["inat","iNaturalist"],["worms","WoRMS taxonomy"]] as const){ const o=el("option",undefined,l); o.value=v; sourceSel.appendChild(o); }
  const taxonInput=el("input","gsp-bio-input") as HTMLInputElement; taxonInput.placeholder="Scientific name e.g. Paradisaea apoda"; taxonInput.value="Paradisaea apoda";
  const limitInput=el("input","gsp-bio-input") as HTMLInputElement; limitInput.type="number"; limitInput.min="1"; limitInput.max="300"; limitInput.value="50"; limitInput.style.width="5rem";
  const useViewChk=el("input","gsp-bio-check") as HTMLInputElement; useViewChk.type="checkbox"; useViewChk.checked=true;
  const bboxRow=el("div","gsp-bio-row"); bboxRow.append(el("label","gsp-bio-label",t("geospax.biodiversity.source","Source")), sourceSel, el("label","gsp-bio-label"," Taxon"), taxonInput, el("label","gsp-bio-label"," Limit"), limitInput);
  const bboxChkRow=el("div","gsp-bio-row"); const bboxLabel=el("label","gsp-bio-label", t("geospax.biodiversity.bbox","Clip to current view bbox")); bboxChkRow.append(useViewChk,bboxLabel);
  root.append(bboxRow,bboxChkRow);

  const urlPreview=el("div","gsp-bio-url"); urlPreview.style.fontSize="11px"; urlPreview.style.wordBreak="break-all"; urlPreview.style.color="#666";
  root.append(urlPreview);

  const fetchBtn=el("button","gsp-bio-run", t("geospax.biodiversity.fetch","Fetch occurrences")); fetchBtn.type="button";
  root.append(fetchBtn);
  const status=el("div","gsp-bio-status"); root.append(status);
  const citeBox=el("div","gsp-bio-citation"); citeBox.style.fontSize="11px"; citeBox.style.color="#444"; root.append(citeBox);
  const occResults=el("div","gsp-bio-results"); root.append(occResults);

  function currentBbox(): [number,number,number,number]|undefined {
    if(!useViewChk.checked) return undefined;
    try{ const b=app.getViewBounds?.() as [number,number,number,number]|null; if(!b||b.length!==4) return undefined; return b; }catch{ return undefined; }
  }
  function refreshUrlPreview(){
    const taxon=taxonInput.value.trim()||"taxon"; const bbox=currentBbox(); const lim=parseInt(limitInput.value,10)||50;
    const src=sourceSel.value;
    let u=""; if(src==="gbif") u=gbifSearchUrl(taxon,bbox,lim); else if(src==="obis") u=obisSearchUrl(taxon,bbox,lim); else if(src==="inat") u=inatSearchUrl(taxon,bbox,lim); else if(src==="worms") u=wormsAphiaUrl(taxon);
    urlPreview.textContent=u;
  }
  sourceSel.addEventListener("change",refreshUrlPreview); taxonInput.addEventListener("input",refreshUrlPreview); limitInput.addEventListener("input",refreshUrlPreview); useViewChk.addEventListener("change",refreshUrlPreview);
  refreshUrlPreview();

  async function doFetch(){
    const taxon=taxonInput.value.trim();
    if(!taxon){ status.textContent=t("geospax.biodiversity.needTaxon","Enter a scientific name."); status.className="gsp-bio-status gsp-bio-warn"; return; }
    const lim=Math.max(1,Math.min(300, parseInt(limitInput.value,10)||50));
    const bbox=currentBbox();
    status.textContent=t("geospax.biodiversity.fetching","Fetching…"); status.className="gsp-bio-status";
    citeBox.textContent=""; occResults.innerHTML="";
    try{
      const src=sourceSel.value;
      if(src==="worms"){
        const {records, citation, url}=await fetchWormsAphia(taxon);
        citeBox.textContent=citationString(citation)+` — ${url}`;
        const tbl=el("table","gsp-bio-table") as HTMLTableElement; tr(tbl,["AphiaID","Scientificname","Authority","Status"],true);
        for(const r of records.slice(0,10) as any[]){ tr(tbl,[String(r.AphiaID??"—"), String(r.scientificname??r.scientificName??"—"), String(r.authority??"—"), String(r.status??"—")]); }
        occResults.append(tbl);
        status.textContent=t("geospax.biodiversity.doneTax","WoRMS lookup complete.");
        return;
      }
      let geojson:GeoJSON.FeatureCollection, citation:import("@geospax/data").Citation, url:string;
      if(src==="gbif"){ const r=await fetchGbifOccurrences({taxon,bbox,limit:lim}); geojson=r.geojson; citation=r.citation; url=r.url; citation=GBIF_META.citation; }
      else if(src==="obis"){ const r=await fetchObisOccurrences({taxon,bbox,limit:lim}); geojson=r.geojson; citation=r.citation; url=r.url; }
      else { const r=await fetchInatObservations({taxon,bbox,limit:lim}); geojson=r.geojson; citation=r.citation; url=r.url; }
      citeBox.textContent=citationString(citation)+` — ${url}`;
      const n=geojson.features.length;
      status.textContent=`${n} occurrence${n===1?"":"s"} — adding to map.`;
      if(n===0){ status.className="gsp-bio-status gsp-bio-warn"; status.textContent+=" No records for that query/bbox."; return; }
      const stamp=makeProvenance(src==="gbif"?"gbif":src==="obis"?"obis":"inat", src==="gbif"?"GBIF occurrences":src==="obis"?"OBIS occurrences":"iNaturalist research-grade", "EPSG:4326", { taxon, bbox: bbox??"global", limit: lim, url });
      // stamp into each feature
      for(const f of geojson.features){ (f.properties as any)[PROVENANCE_KEY]=stamp; (f.properties as any).citation=citationString(citation); }
      app.addGeoJsonLayer(`${taxon} — ${src.toUpperCase()} (${n})`, geojson as any);
      // stats
      const tbl=el("table","gsp-bio-table") as HTMLTableElement; tr(tbl,["Metric","Value"],true); tr(tbl,["Records",String(n)]); tr(tbl,["Source",src]); tr(tbl,["Taxon",taxon]);
      occResults.append(tbl);
      const warn=el("div","gsp-bio-hint"); warn.textContent=t("geospax.biodiversity.liveCaveat","Live query: archives update continuously; cite the access date and URL shown above in any publication.");
      occResults.append(warn);
    }catch(e){ status.textContent=String(e); status.className="gsp-bio-status gsp-bio-warn"; }
  }
  fetchBtn.addEventListener("click",()=>void doFetch());

  // --- Diversity indices over existing layers ---
  const div=el("div","gsp-bio-divider"); div.style.margin="12px 0"; div.style.borderTop="1px solid #ddd"; root.append(div);
  root.append(el("h4","gsp-bio-subtitle", t("geospax.biodiversity.diversity","Diversity indices (over your layers)")));
  root.append(el("p","gsp-bio-hint", t("geospax.biodiversity.diversityHint","Pick up to 3 polygon/point layers as pseudo-communities — counts per layer drive Shannon/Simpson; union drives richness. Equal-area is not required for indices, but provenance is still stamped.")));
  const layerA=el("select","gsp-bio-select") as HTMLSelectElement;
  const layerB=el("select","gsp-bio-select") as HTMLSelectElement;
  const layerC=el("select","gsp-bio-select") as HTMLSelectElement;
  function refreshLayers(){
    const layers=app.listLayers?.() ?? [];
    for(const sel of [layerA,layerB,layerC]){
      const prev=sel.value; sel.innerHTML=""; const ph=el("option",undefined,"—"); ph.value=""; sel.appendChild(ph);
      for(const l of layers){ const o=el("option",undefined,l.name); o.value=l.id; if(l.id===prev) o.selected=true; sel.appendChild(o); }
    }
  }
  const rowA=el("div","gsp-bio-row"); rowA.append(el("label","gsp-bio-label","Community A"), layerA);
  const rowB=el("div","gsp-bio-row"); rowB.append(el("label","gsp-bio-label","Community B"), layerB);
  const rowC=el("div","gsp-bio-row"); rowC.append(el("label","gsp-bio-label","Community C (optional)"), layerC);
  root.append(rowA,rowB,rowC);
  const idxBtn=el("button","gsp-bio-run", t("geospax.biodiversity.calc","Compute richness / Shannon / Simpson")); idxBtn.type="button";
  root.append(idxBtn);
  const idxStatus=el("div","gsp-bio-status"); root.append(idxStatus);
  const idxResults=el("div","gsp-bio-results"); root.append(idxResults);
  async function computeIndices(){
    idxResults.innerHTML=""; idxStatus.textContent="";
    const ids=[layerA.value,layerB.value,layerC.value].filter(Boolean);
    if(ids.length===0){ idxStatus.textContent=t("geospax.biodiversity.pickLayer","Pick at least one layer."); idxStatus.className="gsp-bio-status gsp-bio-warn"; return; }
    try{
      const communities: string[][] = [];
      const counts:number[]=[];
      for(const id of ids){
        const feats=app.getLayerFeatures?.(id) ?? [];
        // use a property if present else feature id
        const taxa=feats.map((f:any)=> String(f.properties?.scientificName ?? f.properties?.taxon ?? f.properties?.species ?? f.id ?? "sp")).filter(Boolean);
        communities.push(taxa);
        counts.push(taxa.length || feats.length);
      }
      const r=richness(communities as any);
      const h=shannon(counts);
      const d=simpson(counts);
      const tbl=el("table","gsp-bio-table") as HTMLTableElement; tr(tbl,["Index","Value"],true);
      tr(tbl,["Richness (union taxa)", String(r)]);
      tr(tbl,["Shannon H′", h===null?"— (need >0 counts)": h.toFixed(4)]);
      tr(tbl,["Simpson 1-D", d===null?"— (need total>1)": d.toFixed(4)]);
      tr(tbl,["Counts per community", counts.join(", ")]);
      idxResults.append(tbl);
      idxStatus.textContent=t("geospax.biodiversity.doneIdx","Indices computed — add a citation for any occurrence layer you queried.");
    }catch(e){ idxStatus.textContent=String(e); idxStatus.className="gsp-bio-status gsp-bio-warn"; }
  }
  idxBtn.addEventListener("click",()=>void computeIndices());
  refreshLayers();
  document.addEventListener("geospax-biodiversity:refresh", refreshLayers);
  container.appendChild(root);
  return ()=>{ document.removeEventListener("geospax-biodiversity:refresh", refreshLayers); container.innerHTML=""; };
}
