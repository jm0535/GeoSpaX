// Connectivity — graph metrics for patch networks.
//
// Lightweight in-browser complement to Whitebox connectivity tools.
// Uses haversine distances between patch centroids; no proj4 needed for
// graph topology (equal-area is applied only when reporting areas).

import { haversineM } from "./geometry";
import type { Feature, Point, Polygon, MultiPolygon } from "geojson";
import { areaM2 } from "./units";

function centroidOfPolygon(coords: number[][][]): [number, number] {
  // Simple arithmetic centroid of outer ring (good enough for connectivity).
  const ring = coords[0];
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

function centroid(f: Feature<Polygon | MultiPolygon>): [number, number] {
  const g = f.geometry;
  if (g.type === "Polygon") return centroidOfPolygon(g.coordinates as number[][][]);
  const first = (g.coordinates as number[][][][])[0];
  return centroidOfPolygon(first as number[][][]);
}

export interface ConnectivityEdge {
  from: number;
  to: number;
  distanceM: number;
}

export interface ConnectivityGraph {
  nodes: Array<{ id: number; areaHa: number; centroid: [number, number] }>;
  edges: ConnectivityEdge[];
}

export interface ConnectivityOptions {
  maxDistanceM: number; // threshold to draw an edge
}

/** Build a thresholded proximity graph. */
export function connectivityGraph(
  patches: Feature<Polygon | MultiPolygon>[],
  options: ConnectivityOptions,
): ConnectivityGraph | null {
  if (!patches || patches.length === 0) return null;
  if (!Number.isFinite(options.maxDistanceM) || options.maxDistanceM <= 0) return null;
  const nodes = patches.map((f, i) => {
    const c = centroid(f);
    const aHa = areaM2(f) / 10000;
    return { id: i, areaHa: Number.isFinite(aHa) ? aHa : 0, centroid: c };
  });
  const edges: ConnectivityEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = haversineM(nodes[i].centroid, nodes[j].centroid);
      if (d <= options.maxDistanceM) edges.push({ from: i, to: j, distanceM: d });
    }
  }
  return { nodes, edges };
}

export function connectivitySummary(graph: ConnectivityGraph): { componentCount: number; edgeCount: number; isolatedCount: number } {
  if (!graph) return { componentCount: 0, edgeCount: 0, isolatedCount: 0 };
  const n = graph.nodes.length;
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) adj.set(i, new Set());
  for (const e of graph.edges) { adj.get(e.from)!.add(e.to); adj.get(e.to)!.add(e.from); }
  const visited = new Set<number>();
  let components = 0;
  for (let i = 0; i < n; i++) if (!visited.has(i)) {
    components++; const stack = [i]; visited.add(i);
    while (stack.length) { const cur = stack.pop()!; for (const nb of adj.get(cur)!) if (!visited.has(nb)) { visited.add(nb); stack.push(nb); } }
  }
  const isolatedCount = [...adj.values()].filter((s) => s.size === 0).length;
  return { componentCount: components, edgeCount: graph.edges.length, isolatedCount };
}
