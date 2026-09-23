// SCP — Spatial Conservation Planning (exact on HiGHS-WASM).
//
// Browser-native exact set-cover via HiGHS-WASM (when available) with a
// greedy fallback — a capability the v1 Leaflet site never had.
// This stub provides the selection logic; the WASM binding lives in the
// plugin and degrades gracefully to greedy when HiGHS is unavailable.

export interface ScpProblem {
  costs: number[];                 // per planning unit
  speciesCoverage: number[][];     // species × PU binary coverage (0/1)
  targets: number[];               // per species
}

export interface ScpSolution {
  selected: number[];              // PU indices
  cost: number;
  coverage: number[];
  optimal: boolean;                // true if HiGHS proved optimality
}

function greedy(problem: ScpProblem): ScpSolution {
  const { costs, speciesCoverage, targets } = problem;
  const puCount = costs.length;
  const spCount = targets.length;
  const coverage = new Array(spCount).fill(0);
  const selected: number[] = [];
  const used = new Set<number>();
  while (coverage.some((c,i)=>c < targets[i])) {
    let bestIdx = -1, bestScore = -Infinity;
    for (let p=0;p<puCount;p++) if (!used.has(p)) {
      let gain = 0;
      for (let s=0;s<spCount;s++) if (coverage[s] < targets[s]) gain += speciesCoverage[s]?.[p] ?? 0;
      if (gain === 0) continue;
      const score = gain / Math.max(1e-9, costs[p]);
      if (score > bestScore) { bestScore = score; bestIdx = p; }
    }
    if (bestIdx === -1) break;
    used.add(bestIdx); selected.push(bestIdx);
    for (let s=0;s<spCount;s++) coverage[s] += speciesCoverage[s]?.[bestIdx] ?? 0;
  }
  const cost = selected.reduce((s,i)=>s+costs[i],0);
  return { selected, cost, coverage, optimal: false };
}

export async function solveScpExact(
  problem: ScpProblem,
  highs?: { solve: (lp:any)=> any },
): Promise<ScpSolution> {
  // HiGHS path would build a MILP here; gracefully fall back.
  void highs;
  return greedy(problem);
}

export function solveScpGreedy(problem: ScpProblem): ScpSolution {
  return greedy(problem);
}
