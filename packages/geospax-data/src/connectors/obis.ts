import type { ConnectorMeta } from "../types";

export const OBIS_META: ConnectorMeta = {
  id: "obis", tier: "live", label: "OBIS Marine Occurrences",
  citation: { title: "Ocean Biodiversity Information System", publisher: "OBIS", year: 2024, url:"https://obis.org", accessedAt: new Date().toISOString().slice(0,10) }
};

export function obisSearchUrl(taxon: string, bbox?: [number,number,number,number], limit=100): string {
  const u = new URL("https://api.obis.org/v3/occurrence");
  if (taxon) u.searchParams.set("scientificname", taxon);
  if (bbox) u.searchParams.set("geometry", `POLYGON((${bbox[0]} ${bbox[1]},${bbox[2]} ${bbox[1]},${bbox[2]} ${bbox[3]},${bbox[0]} ${bbox[3]},${bbox[0]} ${bbox[1]}))`);
  u.searchParams.set("size", String(Math.max(1, Math.min(1000, limit))));
  return u.toString();
}
