/** Small statistics for the latency test: percentiles and a summary of a list of seconds. */

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export interface Summary {
  n: number;
  min: number;
  p50: number;
  p90: number;
  max: number;
  mean: number;
}

export function summarize(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / (sorted.length || 1);
  return { n: sorted.length, min: sorted[0], p50: percentile(sorted, 50), p90: percentile(sorted, 90), max: sorted.at(-1) as number, mean };
}
