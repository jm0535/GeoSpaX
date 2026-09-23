// Classification — Jenks natural breaks and equal-interval helpers.

export function equalInterval(values: number[], classes: number): number[] | null {
  if (!values || values.length === 0 || classes <= 0) return null;
  const finite = values.filter((v)=>Number.isFinite(v));
  if (finite.length === 0) return null;
  const lo = Math.min(...finite), hi = Math.max(...finite);
  if (lo === hi) return Array(classes).fill(lo);
  const step = (hi - lo) / classes;
  return Array.from({length: classes}, (_,i)=> lo + step*(i+1));
}

// Very small Jenks stub (exact Jenks is heavy; this returns equal-interval as fall-back
// but with provenance honesty). Full implementation lives in Whitebox Classify tools.
export function jenksBreaks(values: number[], classes: number): number[] | null {
  return equalInterval(values, classes);
}
