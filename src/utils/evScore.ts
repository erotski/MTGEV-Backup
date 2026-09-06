/**
 * Utility functions for calculating and styling EV Score (0 - 100).
 * Represents the probability or value-retention ratio of opening singles
 * value equal to or greater than the sealed market price.
 */

export function calculateEvScore(
  marketPrice: number,
  evAvg: number,
  evMin?: number,
  evMid90?: number,
  evMax?: number,
  isDeterministic = false
): number {
  if (marketPrice <= 0) return 100;
  if (isDeterministic || !evMin || !evMax || Math.abs((evMin ?? 0) - (evMax ?? 0)) < 0.01) {
    if (evAvg >= marketPrice) return 100;
    return Math.max(0, Math.min(99, Math.round((evAvg / marketPrice) * 100)));
  }

  const min5 = evMin > 0 ? evMin : evAvg * 0.25;
  const max5 = evMax > 0 ? evMax : evAvg * 3.5;
  const mid90 = evMid90 && evMid90 > 0 ? evMid90 : evAvg;

  if (marketPrice <= min5) return 100;
  if (marketPrice >= max5) return 0;
  if (marketPrice <= mid90) {
    const denom = Math.max(0.01, mid90 - min5);
    const pct = 95 - ((marketPrice - min5) / denom) * 45;
    return Math.round(Math.max(50, Math.min(95, pct)));
  } else {
    const denom = Math.max(0.01, max5 - mid90);
    const pct = 50 - ((marketPrice - mid90) / denom) * 45;
    return Math.round(Math.max(5, Math.min(50, pct)));
  }
}

export function getEvScoreBadgeClass(score: number): string {
  if (score >= 80) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (score >= 50) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function getEvScoreDarkBadgeClass(score: number): string {
  if (score >= 80) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  }
  if (score >= 50) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  }
  return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
}
