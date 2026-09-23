import type { ConnectorMeta } from "../types";
export const WORMS_META: ConnectorMeta = { id:"worms", tier:"live", label:"WoRMS Taxonomy", citation:{ title:"World Register of Marine Species", publisher:"WoRMS", year:2024, url:"https://www.marinespecies.org", accessedAt:new Date().toISOString().slice(0,10)} };
export function wormsAphiaUrl(taxon: string): string {
  const u = new URL("https://www.marinespecies.org/rest/AphiaRecordsByName/"+encodeURIComponent(taxon));
  u.searchParams.set("like","false"); u.searchParams.set("marine_only","false");
  return u.toString();
}
