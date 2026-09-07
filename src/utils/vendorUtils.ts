import { Vendor, BoosterEVRecord } from '../types';

export interface VendorOption {
  value: Vendor;
  label: string;
  shortLabel: string;
  description: string;
}

export const VENDOR_OPTIONS: VendorOption[] = [
  {
    value: 'all',
    label: 'All vendors ( cheapest )',
    shortLabel: 'All (Cheapest)',
    description: 'Cheapest variation based on all vendors out there (lowest individual card/booster costs)',
  },
  {
    value: 'all_average',
    label: 'All vendors ( average )',
    shortLabel: 'All (Average)',
    description: 'Average among all vendor prices: TCGplayer, Cardmarket, Card Kingdom, Manapool',
  },
  {
    value: 'tcgplayer',
    label: 'TCGplayer',
    shortLabel: 'TCGplayer',
    description: 'TCGplayer Market / Direct pricing',
  },
  {
    value: 'cardmarket',
    label: 'Cardmarket',
    shortLabel: 'Cardmarket',
    description: 'Cardmarket European market pricing',
  },
  {
    value: 'cardkingdom',
    label: 'Card Kingdom',
    shortLabel: 'Card Kingdom',
    description: 'Card Kingdom retail singles pricing',
  },
  {
    value: 'manapool',
    label: 'Manapool',
    shortLabel: 'Manapool',
    description: 'Manapool competitive vendor pricing',
  },
];

export function normalizeVendor(vendor?: string | null): Vendor {
  if (!vendor) return 'all';
  const v = vendor.toLowerCase().trim();
  if (v === 'all_cheapest' || v === 'all') return 'all';
  if (v === 'all_average' || v === 'average' || v === 'all_avg') return 'all_average';
  if (v === 'tcgplayer' || v === 'tcg') return 'tcgplayer';
  if (v === 'cardmarket' || v === 'mkm') return 'cardmarket';
  if (v === 'cardkingdom' || v === 'ck') return 'cardkingdom';
  if (v === 'manapool' || v === 'mp') return 'manapool';
  return 'all';
}

export function getVendorLabel(vendor: Vendor | string): string {
  const norm = normalizeVendor(vendor);
  const found = VENDOR_OPTIONS.find((opt) => opt.value === norm);
  return found ? found.label : 'All vendors ( cheapest )';
}

export function getVendorShortLabel(vendor: Vendor | string): string {
  const norm = normalizeVendor(vendor);
  const found = VENDOR_OPTIONS.find((opt) => opt.value === norm);
  return found ? found.shortLabel : 'All (Cheapest)';
}

/**
 * Resolves an individual card price for the selected vendor.
 * NO simulated platform fee is subtracted or added.
 */
export function resolveCardPrice(
  card: { price?: number; foilPrice?: number; prices?: Record<string, number> },
  vendor: Vendor | string,
  isFoil = false
): number {
  const prices = card.prices || {};
  const v = normalizeVendor(vendor);

  if (v === 'all') {
    if (prices.all !== undefined && prices.all > 0) return prices.all;
    const vals = [prices.tcgplayer, prices.cardmarket, prices.cardkingdom, prices.manapool].filter(
      (p): p is number => typeof p === 'number' && p > 0
    );
    return vals.length > 0 ? Math.min(...vals) : (isFoil ? (card.foilPrice || card.price || 0) : (card.price || 0));
  }

  if (v === 'all_average') {
    if (prices.all_average !== undefined && prices.all_average > 0) return prices.all_average;
    const vals = [prices.tcgplayer, prices.cardmarket, prices.cardkingdom, prices.manapool].filter(
      (p): p is number => typeof p === 'number' && p > 0
    );
    return vals.length > 0
      ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
      : (isFoil ? (card.foilPrice || card.price || 0) : (card.price || 0));
  }

  if (prices[v] !== undefined && prices[v] > 0) {
    return prices[v];
  }

  const baseTcg = isFoil ? (card.foilPrice || card.price || 0) : (prices.tcgplayer || card.price || 0);
  if (v === 'cardmarket') return Number((baseTcg * 0.868).toFixed(2));
  if (v === 'cardkingdom') return Number((baseTcg * 1.15).toFixed(2));
  if (v === 'manapool') return prices.all || Number((baseTcg * 0.98).toFixed(2));
  return baseTcg;
}

/**
 * Looks up booster EV calculation for a given set, boosterName, priceMode, and vendor.
 */
export function findBoosterEv(
  boosterEvMap: Record<string, BoosterEVRecord[]>,
  setCode: string,
  boosterName: string,
  priceMode = 'direct',
  vendor: Vendor | string = 'all'
): BoosterEVRecord | undefined {
  const sUpper = (setCode || '').toUpperCase().trim();
  const records = boosterEvMap[sUpper] || [];
  if (records.length === 0) return undefined;

  const targetBooster = (boosterName || 'draft').toLowerCase().trim();
  const targetMode = (priceMode || 'direct').toLowerCase().trim();
  const vNorm = normalizeVendor(vendor);

  // 1. Exact match: boosterName + priceMode + vendor
  let match = records.find(
    (r) =>
      r.boosterName.toLowerCase() === targetBooster &&
      (r.priceMode || 'direct').toLowerCase() === targetMode &&
      normalizeVendor(r.vendor) === vNorm
  );
  if (match) return match;

  // 2. Fallback priceMode for same vendor
  match = records.find(
    (r) =>
      r.boosterName.toLowerCase() === targetBooster &&
      normalizeVendor(r.vendor) === vNorm
  );
  if (match) return match;

  // 3. Fallback to 'all' or 'tcgplayer'
  match = records.find(
    (r) =>
      r.boosterName.toLowerCase() === targetBooster &&
      (r.priceMode || 'direct').toLowerCase() === targetMode &&
      normalizeVendor(r.vendor) === 'all'
  );
  if (match) return match;

  return records.find((r) => r.boosterName.toLowerCase() === targetBooster);
}
