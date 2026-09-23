import type { Citation, ConnectorMeta } from "../types";

export const GBIF_META: ConnectorMeta = {
  id: "gbif",
  tier: "live",
  label: "GBIF Occurrences",
  citation: {
    title: "GBIF Occurrence Download",
    publisher: "GBIF",
    year: 2024,
    doi: "10.15468/dl.example",
    url: "https://www.gbif.org/occurrence/search",
    accessedAt: new Date().toISOString().slice(0,10),
  },
};

export function gbifSearchUrl(taxon: string, bbox?: [number,number,number,number], limit=100): string {
  const u = new URL("https://api.gbif.org/v1/occurrence/search");
  if (taxon) u.searchParams.set("scientificName", taxon);
  if (bbox) {
    const [w,s,e,n] = bbox;
    // GBIF uses decimalLongitude,decimalLatitude ranges via geometry param; simplify to bounding box:
    u.searchParams.set("decimalLongitude", `${w},${e}`);
    u.searchParams.set("decimalLatitude", `${s},${n}`);
  }
  u.searchParams.set("limit", String(Math.max(1, Math.min(300, limit))));
  u.searchParams.set("hasCoordinate", "true");
  return u.toString();
}

export function gbifCitation(): string {
  return `${GBIF_META.citation.publisher} (${GBIF_META.citation.year}). ${GBIF_META.citation.title}.`;
}
