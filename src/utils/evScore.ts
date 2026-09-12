/**
 * Utility functions for calculating and styling EV Score (0 - 100).
 * Represents the probability (0% - 100%) of opening singles value
 * equal to or greater than the sealed market price.
 */

export function calculateEvScore(
  marketPrice: number,
  evAvg: number,
  evMin?: number,
  evMid90?: number,
  evMax?: number,
  isDeterministic = false,
  quantiles?: number[],
  packsCount = 1
): number | null {
  if (!marketPrice || marketPrice <= 0) return null;

  // 1. Empirical 100-sample quantiles from 10,000 / 5,000 pack simulation
  if (quantiles && quantiles.length >= 100) {
    const firstAboveIndex = quantiles.findIndex((q) => q >= marketPrice);
    if (firstAboveIndex === -1) {
      // 100% of opened boxes/packs opened value below market price
      return 0;
    }
    // firstAboveIndex is the percentage of outcomes below market price.
    // EV Score = 100 - firstAboveIndex (percentage of outcomes >= market price)
    return 100 - firstAboveIndex;
  }

  // 2. Deterministic / zero-variance items (precon decks, fixed sets, promo packs)
  // When an item has zero collation variance, every copy contains identical cards.
  // The probability of singles value exceeding sealed market price is strictly binary: 100 or 0.
  if (isDeterministic || packsCount === 0 || (!evMin && !evMax) || Math.abs((evMin ?? 0) - (evMax ?? 0)) < 0.01) {
    return evAvg >= marketPrice ? 100 : 0;
  }

  // Pure empirical enforcement: NO synthetic piecewise linear estimation fallback.
  // If true empirical 100-sample quantiles are unavailable, return null instead of generating synthetic values.
  return null;
}

export function simulateCompositeQuantiles(
  packItems: Array<{ count: number; quantiles?: number[]; evAverage?: number; fixed?: boolean }>,
  iterations: number = 5000,
  variableSlots: Array<Array<{ probability: number; value: number }>> = []
): number[] | undefined {
  if ((!packItems || packItems.length === 0) && variableSlots.length === 0) return undefined;

  // Random pack items require empirical quantiles; fixed inclusions use their deterministic EV.
  for (const item of packItems) {
    if (!item.fixed && (!item.quantiles || item.quantiles.length < 100)) {
      console.warn('Simulation Error: Missing empirical quantiles for pack item in composite simulation.', item);
      return undefined;
    }
  }

  const sums = new Float32Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let iterationSum = 0;

    for (const item of packItems) {
      if (item.fixed) {
        iterationSum += (item.evAverage || 0) * item.count;
        continue;
      }
      const qLen = item.quantiles!.length;
      for (let c = 0; c < item.count; c++) {
        const randomIndex = Math.floor(Math.random() * qLen);
        iterationSum += item.quantiles![randomIndex];
      }
    }

    for (const options of variableSlots) {
      const randomValue = Math.random();
      let cumulativeProbability = 0;
      const selected = options.find((option) => {
        cumulativeProbability += option.probability;
        return randomValue < cumulativeProbability;
      });
      iterationSum += selected?.value ?? options[options.length - 1]?.value ?? 0;
    }

    sums[i] = iterationSum;
  }

  sums.sort();

  const compositeQuantiles: number[] = [];
  for (let p = 1; p <= 100; p++) {
    const idx = Math.max(0, Math.min(iterations - 1, Math.floor((p / 100) * iterations) - 1));
    compositeQuantiles.push(Number(sums[idx].toFixed(2)));
  }

  return compositeQuantiles;
}

export function getEvScoreColorClass(score: number | null | undefined): string {
  if (score == null) return 'text-slate-400';
  if (score >= 70) return 'text-emerald-600';
  if (score >= 30) return 'text-amber-600';
  return 'text-rose-600';
}

export function getEvScoreBadgeClass(score: number | null | undefined): string {
  if (score == null) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (score >= 70) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (score >= 30) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function getEvScoreDarkBadgeClass(score: number | null | undefined): string {
  if (score == null) return 'bg-slate-800 text-slate-400 border-slate-700';
  if (score >= 70) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  }
  if (score >= 30) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  }
  return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
}
