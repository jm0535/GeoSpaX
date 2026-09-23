import type { ConnectorMeta } from "../types";
export const INAT_META: ConnectorMeta = { id:"inat", tier:"live", label:"iNaturalist Observations", citation:{ title:"iNaturalist Research-grade Observations", publisher:"iNaturalist", year:2024, url:"https://www.inaturalist.org", accessedAt:new Date().toISOString().slice(0,10)} };
export function inatSearchUrl(taxon: string, bbox?: [number,number,number,number], limit=100): string {
  const u = new URL("https://api.inaturalist.org/v1/observations");
  if (taxon) u.searchParams.set("taxon_name", taxon);
  if (bbox) u.searchParams.set("nelat", String(bbox[3])), u.searchParams.set("nelng", String(bbox[2])), u.searchParams.set("swlat", String(bbox[1])), u.searchParams.set("swlng", String(bbox[0]));
  u.searchParams.set("per_page", String(Math.max(1, Math.min(200, limit))));
  u.searchParams.set("quality_grade","research");
  return u.toString();
}
