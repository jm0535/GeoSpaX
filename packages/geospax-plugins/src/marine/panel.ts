// GeoSpaX Marine panel — OBIS marine, GEBCO bathymetry, marine/ecoregion catalogue.
// Vanilla DOM, scoped .gsp-mar-* CSS, citation-carried, provenance-stamped.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { fetchObisOccurrences, obisSearchUrl, OBIS_META } from "@geospax/data";
import { GEBCO_META, gebcoTileUrl, GEBCO_TIERS } from "@geospax/data";
import { MARINE_META, MARINE_LAYERS } from "@geospax/data";
import { ECOREGION_META, ECOREGION_CATALOGUE } from "@geospax/data";
import { SPREP_META } from "@geospax/data";
import { citationString } from "@geospax/data";
import { makeProvenance, PROVENANCE_KEY } from "@geospax/analysis";

function el<K extends keyof HTMLElementTagNameMap>(tag:K, cls?:string, text?:string): HTMLElementTagNameMap[K] {
  const n=document.createElement(tag); if(cls) n.className=cls; if(text!==undefined) n.textContent=text; return n;
}
function tr(table:HTMLTableElement, cells:string[], header=false){ const r=table.insertRow(); for(const c of cells){ const cc=r.insertCell(); cc.textContent=c; if(header) cc.style.fontWeight="600"; } }

export function mountMarinePanel(container:HTMLElement, app:GeoLibreAppAPI):()=>void{
  container.innerHTML="";
  const t=(k:string,fb:string)=> app.translate?.(k,fb) ?? fb;
  const root=el("div","gsp-mar-root");
  root.append(el("h3","gsp-mar-title", t("geospax.marine.title","GeoSpaX Marine")));
  root.append(el("p","gsp-mar-intro", t("geospax.marine.intro","Marine occurrences (OBIS), bathymetry (GEBCO), and ecoregion / SPREP catalogues — every result carries its citation and _geospax provenance.")));

  const catBox=el("div","gsp-mar-catalogue"); catBox.style.fontSize="11px"; catBox.style.color="#555";
  catBox.innerHTML = `Catalogues — ${citationString(ECOREGION_META.citation)}<br/>` + ECOREGION_CATALOGUE.map(c=>`${c.label}: ${c.count}`).join(" · ") + `<br/>` + MARINE_LAYERS.map(l=>l.id).join(" · ") + ` · GEBCO tiers: ${GEBCO_TIERS.join(", ")}`;
  root.append(catBox);

  // OBIS fetch
  const taxon=el("input","gsp-mar-input") as HTMLInputElement; taxon.placeholder="Marine taxon e.g. Thunnus albacares"; taxon.value="Thunnus albacares";
  const limit=el("input","gsp-mar-input") as HTMLInputElement; limit.type="number"; limit.min="1"; limit.max="1000"; limit.value="50"; limit.style.width="5rem";
  const useView=el("input","gsp-mar-check") as HTMLInputElement; useView.type="checkbox"; useView.checked=true;
  const row1=el("div","gsp-mar-row"); row1.append(el("label","gsp-mar-label","Taxon"), taxon, el("label","gsp-mar-label"," Limit"), limit); root.append(row1);
  const row2=el("div","gsp-mar-row"); row2.append(useView, el("label","gsp-mar-label","Clip to current view bbox")); root.append(row2);
  const urlPrev=el("div","gsp-mar-url"); urlPrev.style.fontSize="11px"; urlPrev.style.wordBreak="break-all"; urlPrev.style.color="#666"; root.append(urlPrev);
  const fetchBtn=el("button","gsp-mar-run", t("geospax.marine.fetch","Fetch OBIS marine occurrences")); fetchBtn.type="button"; root.append(fetchBtn);
  const status=el("div","gsp-mar-status"); root.append(status);
  const cite=el("div","gsp-mar-citation"); cite.style.fontSize="11px"; cite.style.color="#444"; root.append(cite);
  const results=el("div","gsp-mar-results"); root.append(results);

  function bbox(): [number,number,number,number]|undefined { if(!useView.checked) return undefined; try{ const b=app.getViewBounds?.() as [number,number,number,number]|null; if(!b||b.length!==4) return undefined; return b; }catch{ return undefined; } }
  function refreshUrl(){ urlPrev.textContent=obisSearchUrl(taxon.value.trim()||"taxon", bbox(), parseInt(limit.value,10)||50); }
  taxon.addEventListener("input",refreshUrl); limit.addEventListener("input",refreshUrl); useView.addEventListener("change",refreshUrl); refreshUrl();

  async function doFetch(){
    const tx=taxon.value.trim(); if(!tx){ status.textContent="Enter a taxon."; status.className="gsp-mar-status gsp-mar-warn"; return; }
    const lim=Math.max(1,Math.min(1000, parseInt(limit.value,10)||50)); const bb=bbox();
    status.textContent="Fetching OBIS…"; status.className="gsp-mar-status"; cite.textContent=""; results.innerHTML="";
    try{
      const r=await fetchObisOccurrences({taxon:tx, bbox:bb, limit:lim});
      cite.textContent=citationString(r.citation)+` — ${r.url}`;
      const n=r.geojson.features.length;
      status.textContent=`${n} record${n===1?"":"s"} — adding to map.`;
      if(n===0){ status.className="gsp-mar-status gsp-mar-warn"; status.textContent+=" No marine records for that query/bbox."; return; }
      const stamp=makeProvenance("obis","OBIS occurrence fetch","EPSG:4326",{ taxon:tx, bbox:bb??"global", limit:lim, url:r.url });
      for(const f of r.geojson.features){ (f.properties as any)[PROVENANCE_KEY]=stamp; (f.properties as any).citation=citationString(r.citation); }
      app.addGeoJsonLayer(`${tx} — OBIS (${n})`, r.geojson as any);
      const tbl=el("table","gsp-mar-table") as HTMLTableElement; tr(tbl,["Metric","Value"],true); tr(tbl,["Records",String(n)]); tr(tbl,["Taxon",tx]);
      results.append(tbl);
    }catch(e){ status.textContent=String(e); status.className="gsp-mar-status gsp-mar-warn"; }
  }
  fetchBtn.addEventListener("click",()=>void doFetch());

  // GEBCO preview helper
  const divider=el("div","gsp-mar-divider"); divider.style.margin="12px 0"; divider.style.borderTop="1px solid #ddd"; root.append(divider);
  root.append(el("h4","gsp-mar-subtitle","GEBCO bathymetry"));
  root.append(el("p","gsp-mar-hint","GEBCO is a global gridded bathymetry (cite GEBCO 2024). Use the tile URL pattern below in an XYZ layer, or copy the z/x/y preview for the current view centre."));
  const gebcoInfo=el("div","gsp-mar-gebco"); gebcoInfo.style.fontSize="11px"; gebcoInfo.style.color="#444";
  gebcoInfo.textContent=`${citationString(GEBCO_META.citation)} — tile pattern: ${gebcoTileUrl(0,0,0)} (z/x/y)`;
  root.append(gebcoInfo);
  const gebcoBtn=el("button","gsp-mar-run","Add GEBCO XYZ layer (preview)"); gebcoBtn.type="button"; gebcoBtn.style.marginTop="6px";
  gebcoBtn.addEventListener("click",()=>{
    // Host app may support addRasterLayer / addTileLayer; we fall back to informational note
    try{
      const centre=(()=>{
        try{ const b=app.getViewBounds?.() as [number,number,number,number]|null; if(!b) return null; return [(b[0]+b[2])/2,(b[1]+b[3])/2] as [number,number]; }catch{ return null; }
      })();
      // Try known APIs
      const anyApp=app as any;
      const url="https://tiles.gebco.net/gebco/{z}/{x}/{y}.png";
      if(typeof anyApp.addTileLayer==="function") anyApp.addTileLayer(`GEBCO Bathymetry`, url, { attribution: citationString(GEBCO_META.citation) });
      else if(typeof anyApp.addXyzLayer==="function") anyApp.addXyzLayer(`GEBCO Bathymetry`, url, { attribution: citationString(GEBCO_META.citation) });
      else {
        status.textContent=`Add an XYZ layer manually: ${url} — centre ${centre?centre.join(", "):"unknown"} — attribution: ${citationString(GEBCO_META.citation)}`;
        status.className="gsp-mar-status";
      }
    }catch(e){ status.textContent=String(e); status.className="gsp-mar-status gsp-mar-warn"; }
  });
  root.append(gebcoBtn);
  const sprepBox=el("div","gsp-mar-sprep"); sprepBox.style.fontSize="11px"; sprepBox.style.color="#555"; sprepBox.style.marginTop="8px";
  sprepBox.textContent=`SPREP: ${citationString(SPREP_META.citation)} — Pacific Protected Areas, mangroves (GeoJSON/GeoParquet). Add via Data → URL.`;
  root.append(sprepBox);

  container.appendChild(root);
  return ()=>{ container.innerHTML=""; };
}
