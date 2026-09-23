import type { ConnectorMeta } from "../types";
export const WORLDBANK_META: ConnectorMeta = { id:"worldbank", tier:"live", label:"World Bank Indicators", citation:{ title:"World Development Indicators", publisher:"World Bank", year:2024, url:"https://data.worldbank.org", accessedAt:new Date().toISOString().slice(0,10)} };
export function worldbankUrl(country: string, indicator: string, from=2015, to=2024): string {
  const u = new URL(`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}`);
  u.searchParams.set("format","json"); u.searchParams.set("date",`${from}:${to}`); u.searchParams.set("per_page","100");
  return u.toString();
}
