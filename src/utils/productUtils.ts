/**
 * Utility functions for recursive product breakdown, card counts, pack counts,
 * and EV resolution across MTGJSON sealed products.
 */
import { BoosterEVRecord, PriceMode, Vendor, EvBasis } from '../types';
import { findBoosterEv, normalizeVendor, resolveCardPrice } from './vendorUtils';
import { simulateCompositeQuantiles } from './evScore';

export interface ChildItemResolution {
  type: 'pack' | 'card' | 'deck' | 'sealed' | 'variable' | 'other';
  name: string;
  count: number;
  cardsPerUnit: number;
  totalCards: number;
  unitEv: number;
  subtotalEv: number;
  details?: string;
  set?: string;
  code?: string;
  foil?: boolean;
  raw?: any;
}

export interface RecursiveProductBreakdownResult {
  totalCards: number;
  totalPacks: number;
  totalDecks: number;
  totalSealedUnits: number;
  totalFixedEv: number;
  totalVariableEv: number;
  totalEv: number;
  totalMinEv: number;
  totalMin5Ev: number;
  totalMid90Ev: number;
  totalMax5Ev: number;
  totalMaxEv: number;
  quantiles?: number[];
  items: ChildItemResolution[];
  packItems: Array<{
    packName: string;
    code: string;
    set: string;
    count: number;
    cardsPerPack: number;
    totalCards: number;
    unitEv: number;
    unitMid90: number;
    unitMin: number;
    unitMin5?: number;
    unitMax5?: number;
    unitMax: number;
    subtotalEv: number;
    quantiles?: number[];
  }>;
  cardItems: Array<{
    name: string;
    number: string;
    set: string;
    foil: boolean;
    count: number;
    unitEv: number;
    subtotalEv: number;
    prices: any;
    isEstimated: boolean;
  }>;
  sealedItems: Array<{
    name: string;
    count: number;
    set: string;
    uuid?: string;
    totalCards: number;
    unitEv: number;
    subtotalEv: number;
    childBreakdown?: RecursiveProductBreakdownResult;
  }>;
  deckItems: Array<{
    name: string;
    set: string;
    count: number;
    cardCount: number;
    totalCards: number;
    isFoil: boolean;
    isCommander?: boolean;
    finish: 'Foil' | 'Nonfoil';
    unitSinglesEv: number;
    subtotalSinglesEv: number;
    cards?: any[];
  }>;
  variableItems: Array<{
    slotIndex: number;
    configs: Array<{
      chance: number;
      weight: number;
      probabilityPct: number;
      description: string;
      items: Array<{
        type: 'card' | 'pack' | 'deck';
        name: string;
        count: number;
        foil?: boolean;
        set?: string;
        priceOrEv: number;
        uuid?: string;
      }>;
      configEv: number;
      weightedEv: number;
    }>;
    slotEv: number;
  }>;
  otherItems: Array<{
    name: string;
    count: number;
    category: string;
    ev: number;
    cards?: number;
  }>;
}

/**
 * Returns estimated cards per booster pack for a given booster code and set.
 */
export function getCardsPerPack(code?: string, category?: string, subtype?: string): number {
  const c = (code || '').toLowerCase();
  const sub = (subtype || '').toLowerCase();
  const cat = (category || '').toLowerCase();

  if (c.includes('sample') || sub.includes('sample') || cat.includes('sample')) {
    return 2;
  }
  if (c.includes('prerelease') || sub.includes('prerelease')) {
    // Prerelease promo pack typically contains 2 foil stamped cards (or 1 promo + 1 promo planeswalker/rare)
    return 2;
  }
  if (c.includes('collector') || sub.includes('collector')) {
    return 15;
  }
  if (c.includes('play') || c.includes('draft') || c.includes('set') || c.includes('default') || c === 'booster') {
    return 15;
  }
  if (c.includes('jumpstart')) {
    return 20;
  }
  if (c.includes('theme')) {
    return 35;
  }
  if (c.includes('box-topper') || c.includes('topper')) {
    return 1;
  }
  return 15; // Standard default MTG booster pack
}

/**
 * Resolves a single pack's EV and details.
 */
export function resolveBoosterPackEv(
  pk: { code?: string; set?: string; count?: number },
  parentSetCode: string,
  boosterEvMap: Record<string, BoosterEVRecord[]>,
  vendor: Vendor | string = 'all_cheapest',
  priceMode: PriceMode | string = 'direct',
  reprintMultiplier: number = 1.0
) {
  const pkSet = (pk.set || parentSetCode || '').toUpperCase();
  const pkCode = (pk.code || 'play').toLowerCase();

  const normVendor = normalizeVendor(vendor);
  const setBoosters = boosterEvMap[pkSet] || [];
  let matchedBooster = findBoosterEv(boosterEvMap, pkSet, pkCode, priceMode, normVendor);

  if (!matchedBooster) {
    matchedBooster = setBoosters.find(
      (b) => b.boosterName.toLowerCase() === pkCode && (b.priceMode === priceMode || b.priceMode === 'direct')
    );
  }
  if (!matchedBooster) {
    matchedBooster = setBoosters.find((b) => b.boosterName.toLowerCase() === pkCode);
  }

  // Alias & special cases
  if (!matchedBooster) {
    if (pkCode.includes('elemental')) {
      matchedBooster = {
        boosterName: 'fin-elementals',
        evAverage: 120.0,
        evMid90: 100.0,
        evMin: 60.0,
        evMax: 200.0,
      } as any;
    } else if (pkCode.includes('sample')) {
      const fullCollector = setBoosters.find((b) => b.boosterName.toLowerCase().includes('collector'));
      if (fullCollector) {
        matchedBooster = {
          ...fullCollector,
          evAverage: Number((fullCollector.evAverage * 0.2).toFixed(2)),
          evMid90: Number((fullCollector.evMid90 * 0.2).toFixed(2)),
          evMin: Number((fullCollector.evMin * 0.2).toFixed(2)),
          evMax: Number((fullCollector.evMax * 0.2).toFixed(2)),
        };
      }
    } else if (pkCode.includes('prerelease')) {
      // Prerelease stamped promo pack (typically 2 stamped rares/mythics)
      const draftBooster = setBoosters.find(
        (b) => b.boosterName.toLowerCase().includes('draft') || b.boosterName.toLowerCase().includes('play')
      );
      if (draftBooster) {
        matchedBooster = {
          ...draftBooster,
          boosterName: 'prerelease',
          evAverage: Number((draftBooster.evAverage * 0.75).toFixed(2)),
          evMid90: Number((draftBooster.evMid90 * 0.75).toFixed(2)),
          evMin: Number((draftBooster.evMin * 0.75).toFixed(2)),
          evMax: Number((draftBooster.evMax * 0.75).toFixed(2)),
        };
      }
    } else if (pkCode === 'default' || pkCode === 'booster') {
      matchedBooster = setBoosters[0];
    }
  }

  let unitEvAvg = matchedBooster ? matchedBooster.evAverage : 0;
  let unitEvMid90 = matchedBooster ? matchedBooster.evMid90 : unitEvAvg;
  let unitEvMin = matchedBooster ? matchedBooster.evMin : 0;
  let unitEvMin5 = matchedBooster && matchedBooster.evMin5 ? matchedBooster.evMin5 : (unitEvMin > 0 ? Number((unitEvMin * 1.5).toFixed(2)) : Number((unitEvAvg * 0.2).toFixed(2)));
  let unitEvMax5 = matchedBooster && matchedBooster.evMax5 ? matchedBooster.evMax5 : (unitEvMid90 > 0 ? Number((unitEvMid90 * 2.5).toFixed(2)) : Number((unitEvAvg * 3.5).toFixed(2)));
  let unitEvMax = matchedBooster ? matchedBooster.evMax : 0;
  
  let quantiles: number[] | undefined = matchedBooster?.quantiles;

  if (matchedBooster && matchedBooster.priceMode !== 'cheapest_reprint' && priceMode === 'cheapest_reprint') {
    unitEvAvg = Number((unitEvAvg * reprintMultiplier).toFixed(2));
    unitEvMid90 = Number((unitEvMid90 * reprintMultiplier).toFixed(2));
    unitEvMin = Number((unitEvMin * reprintMultiplier).toFixed(2));
    unitEvMin5 = Number((unitEvMin5 * reprintMultiplier).toFixed(2));
    unitEvMax5 = Number((unitEvMax5 * reprintMultiplier).toFixed(2));
    unitEvMax = Number((unitEvMax * reprintMultiplier).toFixed(2));
    if (quantiles) {
      quantiles = quantiles.map(q => Number((q * reprintMultiplier).toFixed(2)));
    }
  }

  return {
    setCode: pkSet,
    boosterCode: pkCode,
    unitEvAvg,
    unitEvMid90,
    unitEvMin,
    unitEvMin5,
    unitEvMax5,
    unitEvMax,
    quantiles,
  };
}

/**
 * Resolves a card's pricing and EV realization.
 */
export function resolveSingleCardEv(
  cd: any,
  parentSetCode: string,
  parentProduct: any,
  singleCardPrices: {
    byUuid?: Record<string, any>;
    byNameSet?: Record<string, any>;
    byName?: Record<string, any>;
  },
  vendor: Vendor | string = 'all',
  priceMode: PriceMode | string = 'direct',
  reprintMultiplier: number = 1.0
) {
  if (!cd) {
    return {
      name: 'Unknown Card',
      number: '',
      set: (parentSetCode || '').toUpperCase(),
      foil: false,
      price: 0,
      ev: 0,
      prices: { tcgplayer: 0, cardkingdom: 0, cardmarket: 0, all: 0 },
      isEstimated: false,
      uuid: '',
    };
  }

  const rawName = cd.name || 'Card';
  const rawNumber = cd.number || '';
  const cardSet = (cd.set || parentSetCode || '').toUpperCase();
  const isFoil = Boolean(
    cd.foil ||
    (cd.finishes && cd.finishes.includes('foil')) ||
    (parentProduct?.displayName && parentProduct.displayName.toLowerCase().includes('foil') && !parentProduct.displayName.toLowerCase().includes('non-foil'))
  );

  const cardPricesByUuid = singleCardPrices?.byUuid || {};
  const cardPricesByNameSet = singleCardPrices?.byNameSet || {};
  const cardPricesByName = singleCardPrices?.byName || {};

  const priceIdx =
    (cd.uuid && cardPricesByUuid[cd.uuid]) ||
    cardPricesByNameSet[`${rawName.toLowerCase()}___${cardSet.toLowerCase()}`] ||
    cardPricesByNameSet[`${rawName.toLowerCase()}_${cardSet.toLowerCase()}`] ||
    cardPricesByName[rawName.toLowerCase()];

  let rawPrice = 0;
  let isEstimated = false;

  if (priceIdx) {
    rawPrice = isFoil && priceIdx.foilPrice ? priceIdx.foilPrice : (priceIdx.price || priceIdx.foilPrice || 0);
  }
  
  if (!rawPrice || rawPrice <= 0) {
    if (cd.prices?.tcgplayer && Number(cd.prices.tcgplayer) > 0) {
      rawPrice = Number(cd.prices.tcgplayer);
    } else if (cd.prices?.cardmarket && Number(cd.prices.cardmarket) > 0) {
      rawPrice = Number(cd.prices.cardmarket);
    } else if (cd.price && Number(cd.price) > 0) {
      rawPrice = Number(cd.price);
    } else if (cd.ev && Number(cd.ev) > 0) {
      rawPrice = Number(cd.ev);
    } else {
      // Estimating reasonable value based on parent product market price or baseline
      const parentMkt = parentProduct?.marketPrice || parentProduct?.estimatedEv || 0;
      const parentCards = parentProduct?.cardCount || 5;
      const estFallback = parentMkt > 0 ? Math.max(1.5, Number((parentMkt / parentCards).toFixed(2))) : (isFoil ? 4.50 : 2.00);
      rawPrice = isFoil ? Number((estFallback * 1.35).toFixed(2)) : estFallback;
      isEstimated = true;
    }
  }

  // Adjust by vendor
  let vendorPrice = rawPrice;
  if (priceIdx?.vendorPrices) {
    const vp = priceIdx.vendorPrices;
    if (vendor === 'cardmarket' && vp.cardmarket) vendorPrice = vp.cardmarket;
    else if (vendor === 'cardkingdom' && vp.cardkingdom) vendorPrice = vp.cardkingdom;
    else if (vendor === 'tcgplayer' && vp.tcgplayer) vendorPrice = vp.tcgplayer;
    else if (vendor === 'manapool' && vp.manapool) vendorPrice = vp.manapool || vp.tcgplayer;
    else if (vendor === 'all_average') {
      const vals = [vp.tcgplayer, vp.cardmarket, vp.cardkingdom, vp.manapool].filter(Boolean);
      if (vals.length > 0) vendorPrice = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else if (vendor === 'all_cheapest' || vendor === 'all') {
      const vals = [vp.tcgplayer, vp.cardmarket, vp.cardkingdom, vp.manapool].filter(Boolean);
      if (vals.length > 0) vendorPrice = Math.min(...vals);
    }
  }

  if (priceMode === 'cheapest_reprint') {
    vendorPrice = Number((vendorPrice * reprintMultiplier).toFixed(2));
  }

  return {
    name: rawName,
    number: rawNumber,
    set: cardSet,
    foil: isFoil,
    price: Number(rawPrice.toFixed(2)),
    ev: Number(vendorPrice.toFixed(2)),
    prices: cd.prices || (priceIdx ? { tcgplayer: priceIdx.price } : {}),
    isEstimated,
    uuid: cd.uuid,
  };
}

interface PreconDeckIndex {
  byId: Map<string, any>;
  byExactName: Map<string, any>;
  bySet: Map<string, any[]>;
  bySetExactName: Map<string, any>;
  byStripped: Map<string, any>;
  cache: Map<string, any | undefined>;
}

const preconIndexCache = new WeakMap<object, PreconDeckIndex>();

function getOrBuildPreconIndex(preconDecks: Record<string, any>): PreconDeckIndex {
  let index = preconIndexCache.get(preconDecks);
  if (index) return index;

  const byId = new Map<string, any>();
  const byExactName = new Map<string, any>();
  const bySet = new Map<string, any[]>();
  const bySetExactName = new Map<string, any>();
  const byStripped = new Map<string, any>();
  const cache = new Map<string, any | undefined>();

  // If preconDecks has .decks or is a raw dictionary, iterate canonical decks
  const decksObj = (preconDecks as any).decks || preconDecks;
  const entries = Object.entries(decksObj);

  for (let i = 0; i < entries.length; i++) {
    const [key, rawD] = entries[i];
    const d: any = rawD;
    if (!d) continue;
    const lowerKey = key.toLowerCase().trim();
    byId.set(lowerKey, d);

    const s = (d.setCode || d.set || '').toLowerCase().trim();
    if (s) {
      let list = bySet.get(s);
      if (!list) {
        list = [];
        bySet.set(s, list);
      }
      list.push(d);
    }

    const n = (d.deckName || d.name || '').toLowerCase().trim();
    if (n) {
      if (!byExactName.has(n)) byExactName.set(n, d);
      if (s) {
        bySetExactName.set(`${n}___${s}`, d);
      }
      const stripped = n.replace(/[^a-z0-9]/g, '');
      if (stripped && !byStripped.has(stripped)) {
        byStripped.set(stripped, d);
      }
    }
  }

  index = { byId, byExactName, bySet, bySetExactName, byStripped, cache };
  preconIndexCache.set(preconDecks, index);
  return index;
}

/**
 * Finds a matching precon deck from preconDecks dictionary using high-performance indexed lookups.
 */
export function findMatchingPreconDeck(
  preconDecks: Record<string, any>,
  targetName?: string,
  targetSet?: string,
  targetId?: string
) {
  if (!preconDecks) return undefined;
  if (preconDecks.decks) preconDecks = preconDecks.decks;

  const index = getOrBuildPreconIndex(preconDecks);
  const cacheKey = `${targetId || ''}|${targetSet || ''}|${targetName || ''}`;
  if (index.cache.has(cacheKey)) {
    return index.cache.get(cacheKey);
  }

  // 1. Direct ID lookup if targetId provided
  if (targetId) {
    const lowerId = targetId.toLowerCase().trim();
    if (index.byId.has(lowerId)) {
      const match = index.byId.get(lowerId);
      index.cache.set(cacheKey, match);
      return match;
    }
  }

  if (!targetName) {
    index.cache.set(cacheKey, undefined);
    return undefined;
  }

  const cleanTarget = targetName.toLowerCase().trim();
  const lowerSet = targetSet ? targetSet.toLowerCase().trim() : '';

  // 2. Direct exact keys with set
  if (lowerSet) {
    const setKey = `${cleanTarget}___${lowerSet}`;
    if (index.bySetExactName.has(setKey)) {
      const match = index.bySetExactName.get(setKey);
      index.cache.set(cacheKey, match);
      return match;
    }
  }

  // 3. Normalize "Collector's Edition", "Secret Lair", "Superdrop", "Commander Deck", etc.
  const strippedTarget = cleanTarget
    .replace(/\bsecret\s+lair\s+drop\s+series:?\b/gi, '')
    .replace(/\bsecret\s+lair\s+drop:?\b/gi, '')
    .replace(/\bsecret\s+lair\s+bundle:?\b/gi, '')
    .replace(/\bsecret\s+lair:?\b/gi, '')
    .replace(/\b(spring|summer|fall|winter|autumn)\s+superdrop(\s+\d{4})?:?\b/gi, '')
    .replace(/\bsuperdrop(\s+\d{4})?:?\b/gi, '')
    .replace(/\bbundle:?\b/gi, '')
    .replace(/\bcollector'?s\s+edition\b/gi, '')
    .replace(/\bcollectors\s+edition\b/gi, '')
    .replace(/\bcollector'?s\b/gi, '')
    .replace(/\bcollector\b/gi, '')
    .replace(/\bedition\b/gi, '')
    .replace(/\bcommander\s+deck\b/gi, '')
    .replace(/\bcommander\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (strippedTarget && strippedTarget !== cleanTarget && lowerSet) {
    const strippedSetKey = `${strippedTarget}___${lowerSet}`;
    if (index.bySetExactName.has(strippedSetKey)) {
      const match = index.bySetExactName.get(strippedSetKey);
      index.cache.set(cacheKey, match);
      return match;
    }
  }

  const toAlpha = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTargetAlpha = toAlpha(cleanTarget);
  const strippedTargetAlpha = strippedTarget ? toAlpha(strippedTarget) : '';

  // 4. Exact set matches within scoped set decks ONLY (2-5 items, never 8,000!)
  if (lowerSet && index.bySet.has(lowerSet)) {
    const setDecks = index.bySet.get(lowerSet)!;
    for (let i = 0; i < setDecks.length; i++) {
      const d = setDecks[i];
      const dName = (d.deckName || d.name || '').toLowerCase().trim();
      if (dName === cleanTarget || (strippedTarget && dName === strippedTarget)) {
        index.cache.set(cacheKey, d);
        return d;
      }
      const dNameAlpha = toAlpha(dName);
      if (dNameAlpha && (dNameAlpha === cleanTargetAlpha || dNameAlpha === strippedTargetAlpha)) {
        index.cache.set(cacheKey, d);
        return d;
      }
      if (dName && (cleanTarget.includes(dName) || (strippedTarget && strippedTarget.includes(dName)))) {
        index.cache.set(cacheKey, d);
        return d;
      }
    }
  }

  // 5. Global name lookups via index
  if (index.byExactName.has(cleanTarget)) {
    const match = index.byExactName.get(cleanTarget);
    index.cache.set(cacheKey, match);
    return match;
  }
  if (strippedTarget && index.byExactName.has(strippedTarget)) {
    const match = index.byExactName.get(strippedTarget);
    index.cache.set(cacheKey, match);
    return match;
  }
  if (cleanTargetAlpha && index.byStripped.has(cleanTargetAlpha)) {
    const match = index.byStripped.get(cleanTargetAlpha);
    index.cache.set(cacheKey, match);
    return match;
  }

  index.cache.set(cacheKey, undefined);
  return undefined;
}

/**
 * Recursively resolves the complete product breakdown:
 * - Nested sealed items
 * - Packs with card counts (e.g. 15 for draft/collector, 2 for sample/prerelease promo)
 * - Singles & promo cards
 * - Precon decks with individual card lists
 * - Variable lottery slots
 * - Accessories
 */
export function resolveRecursiveProductAudit(
  product: any,
  productMap: Record<string, any> | Map<string, any>,
  arbitrageMap: Record<string, any>,
  boosterEvMap: Record<string, BoosterEVRecord[]>,
  preconDecks: Record<string, any>,
  singleCardPrices: {
    byUuid?: Record<string, any>;
    byNameSet?: Record<string, any>;
    byName?: Record<string, any>;
  },
  vendor: Vendor | string = 'all',
  priceMode: PriceMode = 'direct',
  multiplier: number = 1,
  visited = new Set<string>(),
  evBasis: EvBasis | string = 'avg'
): RecursiveProductBreakdownResult {
  const pId = product?.id || product?.uuid || '';
  const parentSet = (product?.setCode || product?.set_code || '').toUpperCase();
  const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;
  const cardPricesByUuid = singleCardPrices?.byUuid || {};
  const cardPricesByNameSet = singleCardPrices?.byNameSet || {};
  const cardPricesByName = singleCardPrices?.byName || {};
  const lookupProduct = (key: string, name?: string) => {
    if (key) {
      const byKey = productMap instanceof Map ? productMap.get(key) : productMap[key];
      if (byKey) return byKey;
    }
    if (name) {
      const normName = name.toLowerCase().trim();
      const normWithoutDrop = normName.replace(/^secret lair drop\s+/i, '').trim();
      const values = productMap instanceof Map ? Array.from(productMap.values()) : Object.values(productMap);
      return (
        values.find((p: any) => {
          const pName = (p.displayName || p.name || '').toLowerCase().trim();
          return (
            pName === normName ||
            pName === normWithoutDrop ||
            (p.id && (p.id === key || p.id === name)) ||
            (p.uuid && (p.uuid === key || p.uuid === name))
          );
        }) || null
      );
    }
    return null;
  };

  const packItems: RecursiveProductBreakdownResult['packItems'] = [];
  const cardItems: RecursiveProductBreakdownResult['cardItems'] = [];
  const sealedItems: RecursiveProductBreakdownResult['sealedItems'] = [];
  const deckItems: RecursiveProductBreakdownResult['deckItems'] = [];
  const variableItems: RecursiveProductBreakdownResult['variableItems'] = [];
  const otherItems: RecursiveProductBreakdownResult['otherItems'] = [];
  const items: ChildItemResolution[] = [];

  let totalCards = 0;
  let totalPacks = 0;
  let totalDecks = 0;
  let totalSealedUnits = 0;
  let totalFixedEv = 0;
  let totalVariableEv = 0;
  let totalEv = 0;
  let totalMinEv = 0;
  let totalMin5Ev = 0;
  let totalMid90Ev = 0;
  let totalMax5Ev = 0;
  let totalMaxEv = 0;

  const prodContents = product?.contents || product?.rawContents;

  if (!product || !prodContents) {
    // If leaf item with no explicit contents
    const directCards = product?.cardCount || 0;
    return {
      totalCards: directCards * multiplier,
      totalPacks: 0,
      totalDecks: 0,
      totalSealedUnits: 0,
      totalFixedEv: 0,
      totalVariableEv: 0,
      totalEv: 0,
      totalMinEv: 0,
      totalMin5Ev: 0,
      totalMid90Ev: 0,
      totalMax5Ev: 0,
      totalMaxEv: 0,
      items: [],
      packItems: [],
      cardItems: [],
      sealedItems: [],
      deckItems: [],
      variableItems: [],
      otherItems: [],
    };
  }

  // Prevent circular recursion loops
  if (pId) {
    if (visited.has(pId)) {
      return {
        totalCards: 0,
        totalPacks: 0,
        totalDecks: 0,
        totalSealedUnits: 0,
        totalFixedEv: 0,
        totalVariableEv: 0,
        totalEv: 0,
        totalMinEv: 0,
        totalMin5Ev: 0,
        totalMid90Ev: 0,
        totalMax5Ev: 0,
        totalMaxEv: 0,
        items: [],
        packItems: [],
        cardItems: [],
        sealedItems: [],
        deckItems: [],
        variableItems: [],
        otherItems: [],
      };
    }
    visited.add(pId);
  }

  // 1. DIRECT PACKS
  if (prodContents.pack && Array.isArray(prodContents.pack)) {
    prodContents.pack.forEach((pk: any) => {
      const count = (pk.count || 1) * multiplier;
      const res = resolveBoosterPackEv(pk, parentSet, boosterEvMap, vendor, priceMode, reprintMultiplier);
      const cardsPerPack = getCardsPerPack(pk.code, product.category, product.subtype);
      const packCardsTotal = count * cardsPerPack;

      const effectiveUnitEv = evBasis === 'min' ? res.unitEvMin :
                              evBasis === 'mid90' ? res.unitEvMid90 :
                              evBasis === 'max' ? res.unitEvMax :
                              res.unitEvAvg;
      const subtotalEv = Number((count * effectiveUnitEv).toFixed(2));

      totalCards += packCardsTotal;
      totalPacks += count;
      totalVariableEv += subtotalEv;
      totalEv += subtotalEv;
      totalMinEv += Number((count * res.unitEvMin).toFixed(2));
      totalMin5Ev += Number((count * res.unitEvMin5).toFixed(2));
      totalMid90Ev += Number((count * res.unitEvMid90).toFixed(2));
      totalMax5Ev += Number((count * res.unitEvMax5).toFixed(2));
      totalMaxEv += Number((count * res.unitEvMax).toFixed(2));

      const pEntry = {
        packName: `${res.boosterCode.toUpperCase()} Booster Pack`,
        code: res.boosterCode,
        set: res.setCode,
        count,
        cardsPerPack,
        totalCards: packCardsTotal,
        unitEv: effectiveUnitEv,
        unitMid90: res.unitEvMid90,
        unitMin: res.unitEvMin,
        unitMin5: res.unitEvMin5,
        unitMax5: res.unitEvMax5,
        unitMax: res.unitEvMax,
        subtotalEv,
      };

      packItems.push(pEntry);
      items.push({
        type: 'pack',
        name: pEntry.packName,
        count,
        cardsPerUnit: cardsPerPack,
        totalCards: packCardsTotal,
        unitEv: res.unitEvAvg,
        subtotalEv,
        set: res.setCode,
        code: res.boosterCode,
        raw: pk,
      });
    });
  }

  // 2. STANDALONE CARDS & PROMOS (Fixed deterministic inclusion)
  if (prodContents.card && Array.isArray(prodContents.card)) {
    prodContents.card.forEach((cd: any) => {
      const count = (cd.count || 1) * multiplier;
      const res = resolveSingleCardEv(cd, parentSet, product, singleCardPrices, vendor, priceMode, reprintMultiplier);
      const subtotalEv = Number((count * res.ev).toFixed(2));

      totalCards += count;
      totalFixedEv += subtotalEv;
      totalEv += subtotalEv;
      totalMinEv += subtotalEv;
      totalMin5Ev += subtotalEv;
      totalMid90Ev += subtotalEv;
      totalMax5Ev += subtotalEv;
      totalMaxEv += subtotalEv;

      cardItems.push({
        name: res.name,
        number: res.number,
        set: res.set,
        foil: res.foil,
        count,
        unitEv: res.ev,
        subtotalEv,
        prices: res.prices,
        isEstimated: res.isEstimated,
      });

      items.push({
        type: 'card',
        name: res.name,
        count,
        cardsPerUnit: 1,
        totalCards: count,
        unitEv: res.ev,
        subtotalEv,
        set: res.set,
        foil: res.foil,
        raw: cd,
      });
    });
  }

  // 3. PRECONSTRUCTED DECKS
  if (prodContents.deck && Array.isArray(prodContents.deck)) {
    prodContents.deck.forEach((dk: any) => {
      const count = multiplier;
      const matchedDeck = findMatchingPreconDeck(
        preconDecks,
        dk.name,
        dk.set || parentSet,
        product.id || product.uuid || dk.uuid
      );
      const matchedDeckCardsCount =
        matchedDeck?.totalCards ||
        matchedDeck?.cardCount ||
        (matchedDeck?.cards && matchedDeck.cards.length > 0
          ? matchedDeck.cards.reduce((sum: number, c: any) => sum + (c.count || 1), 0)
          : 0);

      const isCommander = Boolean(
        matchedDeck?.isCommander ||
        matchedDeck?.format === 'commander' ||
        Boolean(matchedDeck?.commander && matchedDeck.commander.name && matchedDeck.commander.name.toLowerCase().trim() !== 'face commander') ||
        (product.subtype || '').toLowerCase().includes('commander') ||
        (product.category || '').toLowerCase().includes('commander') ||
        (product.displayName || product.name || '').toLowerCase().includes('commander') ||
        (dk.name || '').toLowerCase().includes('commander')
      );

      const deckCardCount = matchedDeckCardsCount > 0
        ? matchedDeckCardsCount
        : (product.cardCount && prodContents.deck && prodContents.deck.length > 0
            ? Math.max(1, Math.floor(product.cardCount / prodContents.deck.length))
            : (isCommander ? 100 : (product.subtype === 'secret_lair' ? 5 : 60)));
      const deckCardsTotal = count * deckCardCount;

      const isCollectorDeck = Boolean(
        (product.displayName || product.name || '').toLowerCase().includes('collector') ||
        (dk.name || '').toLowerCase().includes('collector') ||
        (product.subtype || '').toLowerCase().includes('collector') ||
        (dk.subtype || '').toLowerCase().includes('collector') ||
        matchedDeck?.treatment?.toLowerCase().includes('foil') ||
        matchedDeck?.deckName?.toLowerCase().includes('collector')
      );

      const isFoil = Boolean(
        dk.foil ||
        dk.isFoil ||
        matchedDeck?.isFoil ||
        matchedDeck?.foil ||
        isCollectorDeck ||
        (dk.name || '').toLowerCase().includes('foil') ||
        (matchedDeck?.deckName || '').toLowerCase().includes('foil') ||
        ((product.displayName || product.name || '').toLowerCase().includes('foil') &&
         !(product.displayName || product.name || '').toLowerCase().includes('non-foil'))
      );

      const finishLabel = isCollectorDeck ? (matchedDeck?.treatment || 'Ripple Foil') : (isFoil ? 'Foil' : 'Nonfoil');

      let singlesEv = matchedDeck?.totalSinglesEv || matchedDeck?.singlesEv || matchedDeck?.estimatedEv || 0;
      if (priceMode === 'cheapest_reprint' && singlesEv > 0) {
        singlesEv = Number((singlesEv * reprintMultiplier).toFixed(2));
      }

      const rawCards = matchedDeck?.cards || [];
      const cards = rawCards.map((c: any) => {
        if (!c) {
          return {
            name: 'Unknown Card',
            count: 1,
            foil: false,
            isFoil: false,
            finish: 'Nonfoil',
            price: 0,
            totalPrice: 0,
          };
        }
        const cardFoil = Boolean(c.foil || c.isFoil || isFoil);
        const fromIdx =
          (c.uuid && cardPricesByUuid[c.uuid]) ||
          cardPricesByNameSet[`${(c.name || '').toLowerCase()}___${(c.set || dk.set || parentSet).toLowerCase()}`] ||
          cardPricesByNameSet[`${(c.name || '').toLowerCase()}_${(c.set || dk.set || parentSet).toLowerCase()}`] ||
          cardPricesByName[(c.name || '').toLowerCase()];

        const cardPrices = c.prices || fromIdx?.prices || {
          tcgplayer: c.price || fromIdx?.price || 0,
          cardmarket: c.cardmarket_price || (c.price ? c.price * 0.868 : 0),
          cardkingdom: c.cardkingdom_price || (c.price ? c.price * 1.15 : 0),
          manapool: c.manapool_price || (c.price ? c.price * 0.98 : 0),
        };

        let price = resolveCardPrice(
          {
            price: c.price || fromIdx?.price || 0,
            foilPrice: fromIdx?.foilPrice || c.foilPrice || (isCollectorDeck ? c.price : undefined),
            prices: cardPrices,
          },
          vendor,
          cardFoil
        );

        if (cardFoil && price <= 0) {
          if (fromIdx?.foilPrice) price = fromIdx.foilPrice;
          else if (c.foilPrice) price = c.foilPrice;
          else if (c.prices?.usd_foil) price = Number(c.prices.usd_foil);
          else if (!c.foil && c.price > 0) price = Number((c.price * 1.5).toFixed(2));
        }

        const cCount = c.count || 1;
        const adjustedPrice = Number((price * reprintMultiplier).toFixed(2));
        return {
          ...c,
          foil: cardFoil,
          isFoil: cardFoil,
          finish: cardFoil ? finishLabel : 'Nonfoil',
          price: adjustedPrice,
          totalPrice: Number((adjustedPrice * cCount).toFixed(2)),
        };
      });

      if (cards.length > 0) {
        const calculatedCardSum = Number(
          cards.reduce((sum: number, c: any) => sum + (c.totalPrice || c.price || 0), 0).toFixed(2)
        );
        if (calculatedCardSum > 0) singlesEv = calculatedCardSum;
      }

      // Fallback singlesEv if still 0
      if (singlesEv <= 0) {
        if (matchedDeck?.totalSinglesEv > 0) singlesEv = matchedDeck.totalSinglesEv;
        else if (matchedDeck?.singlesEv > 0) singlesEv = matchedDeck.singlesEv;
        else if (matchedDeck?.estimatedEv > 0) singlesEv = matchedDeck.estimatedEv;
        else if (product.estimatedEv > 0) {
          const hasSample = prodContents.sealed && prodContents.sealed.some((s: any) => (s.name || '').toLowerCase().includes('sample'));
          singlesEv = Math.max(0, Number((product.estimatedEv - (hasSample ? 9.73 : 0)).toFixed(2)));
        }
      }

      const subtotalSinglesEv = Number((count * singlesEv).toFixed(2));

      totalCards += deckCardsTotal;
      totalDecks += count;
      totalFixedEv += subtotalSinglesEv;
      totalEv += subtotalSinglesEv;
      totalMinEv += subtotalSinglesEv;
      totalMin5Ev += subtotalSinglesEv;
      totalMid90Ev += subtotalSinglesEv;
      totalMax5Ev += subtotalSinglesEv;
      totalMaxEv += subtotalSinglesEv;

      deckItems.push({
        name: dk.name,
        set: (dk.set || parentSet).toUpperCase(),
        count,
        cardCount: deckCardCount,
        totalCards: deckCardsTotal,
        isFoil: isFoil || isCollectorDeck,
        isCommander,
        finish: finishLabel,
        unitSinglesEv: singlesEv,
        subtotalSinglesEv,
        cards,
      });

      items.push({
        type: 'deck',
        name: dk.name,
        count,
        cardsPerUnit: deckCardCount,
        totalCards: deckCardsTotal,
        unitEv: singlesEv,
        subtotalEv: subtotalSinglesEv,
        set: (dk.set || parentSet).toUpperCase(),
        foil: isFoil || isCollectorDeck,
        raw: dk,
      });
    });
  }

  // 4. RECURSIVE SEALED SUBPRODUCTS (CRITICAL: drill down recursively!)
  if (prodContents.sealed && Array.isArray(prodContents.sealed)) {
    prodContents.sealed.forEach((sub: any) => {
      const count = (sub.count || 1) * multiplier;
      let childProd = lookupProduct(sub.uuid, sub.name);
      const childArb = sub.uuid
        ? arbitrageMap[sub.uuid]
        : Object.values(arbitrageMap).find((a: any) =>
            (a.productUuid && a.productUuid === sub.uuid) ||
            ((a.boxName || a.displayName || '').toLowerCase().trim() === (sub.name || '').toLowerCase().trim())
          );

      // If not directly in productMap, check if it matches a preconstructed deck / Secret Lair drop
      if (!childProd && preconDecks) {
        const matchedDeck = findMatchingPreconDeck(preconDecks, sub.name, sub.set || parentSet);
        if (matchedDeck) {
          const sSet = (sub.set || matchedDeck.set || parentSet).toLowerCase();
          const isFoil = Boolean(matchedDeck.isFoil || sub.name.toLowerCase().includes('foil'));
          childProd = {
            id: matchedDeck.deckName,
            uuid: matchedDeck.deckName,
            displayName: matchedDeck.deckName,
            setName: matchedDeck.setName || sSet.toUpperCase(),
            setCode: sSet,
            packagingType: 'starter_deck',
            contents: {
              deck: [
                {
                  name: matchedDeck.deckName,
                  set: sSet,
                  count: 1,
                  foil: isFoil,
                  cards: matchedDeck.cards,
                },
              ],
            },
          };
        }
      }

      totalSealedUnits += count;

      if (childProd) {
        // Recursive resolution!
        const childAudit = resolveRecursiveProductAudit(
          childProd,
          productMap,
          arbitrageMap,
          boosterEvMap,
          preconDecks,
          singleCardPrices,
          vendor,
          priceMode,
          count,
          new Set(visited),
          evBasis
        );

        totalCards += childAudit.totalCards;
        totalPacks += childAudit.totalPacks;
        totalDecks += childAudit.totalDecks;
        totalFixedEv += childAudit.totalFixedEv;
        totalVariableEv += childAudit.totalVariableEv;

        let unitEv = 0;
        let unitMin = 0;
        let unitMin5 = 0;
        let unitMid90 = 0;
        let unitMax5 = 0;
        let unitMax = 0;

        if (childAudit.totalEv > 0) {
          unitEv = Number((childAudit.totalEv / count).toFixed(2));
          unitMin = childAudit.totalMinEv > 0
            ? Number((childAudit.totalMinEv / count).toFixed(2))
            : Number((unitEv * 0.80).toFixed(2));
          unitMin5 = childAudit.totalMin5Ev > 0
            ? Number((childAudit.totalMin5Ev / count).toFixed(2))
            : Number((unitEv * 0.85).toFixed(2));
          unitMid90 = childAudit.totalMid90Ev > 0
            ? Number((childAudit.totalMid90Ev / count).toFixed(2))
            : Number((unitEv * 0.95).toFixed(2));
          unitMax5 = childAudit.totalMax5Ev > 0
            ? Number((childAudit.totalMax5Ev / count).toFixed(2))
            : Number((unitEv * 1.15).toFixed(2));
          unitMax = childAudit.totalMaxEv > 0
            ? Number((childAudit.totalMaxEv / count).toFixed(2))
            : Number((unitEv * 1.25).toFixed(2));
        } else if (childArb && childArb.totalEvAvg > 0) {
          unitEv = Number((childArb.totalEvAvg * reprintMultiplier).toFixed(2));
          unitMin = Number(((childArb.unitEvMin || childArb.totalEvAvg * 0.15) * reprintMultiplier).toFixed(2));
          unitMin5 = Number(((childArb.unitEvMin5 || childArb.totalEvAvg * 0.25) * reprintMultiplier).toFixed(2));
          unitMid90 = Number(((childArb.unitEvMid90 || childArb.totalEvAvg * 0.85) * reprintMultiplier).toFixed(2));
          unitMax5 = Number(((childArb.unitEvMax5 || childArb.totalEvAvg * 3.5) * reprintMultiplier).toFixed(2));
          unitMax = Number(((childArb.unitEvMax || childArb.totalEvAvg * 4.5) * reprintMultiplier).toFixed(2));
        } else if (childArb && childArb.marketPrice > 0) {
          unitEv = Number(childArb.marketPrice.toFixed(2));
          unitMin = Number((unitEv * 0.80).toFixed(2));
          unitMin5 = Number((unitEv * 0.85).toFixed(2));
          unitMid90 = Number((unitEv * 0.95).toFixed(2));
          unitMax5 = Number((unitEv * 1.15).toFixed(2));
          unitMax = Number((unitEv * 1.25).toFixed(2));
        } else if (childProd.marketPrice > 0) {
          unitEv = Number(childProd.marketPrice.toFixed(2));
          unitMin = Number((unitEv * 0.80).toFixed(2));
          unitMin5 = Number((unitEv * 0.85).toFixed(2));
          unitMid90 = Number((unitEv * 0.95).toFixed(2));
          unitMax5 = Number((unitEv * 1.15).toFixed(2));
          unitMax = Number((unitEv * 1.25).toFixed(2));
        } else if (childProd.estimatedEv > 0) {
          unitEv = Number(childProd.estimatedEv.toFixed(2));
          unitMin = Number((unitEv * 0.80).toFixed(2));
          unitMin5 = Number((unitEv * 0.85).toFixed(2));
          unitMid90 = Number((unitEv * 0.95).toFixed(2));
          unitMax5 = Number((unitEv * 1.15).toFixed(2));
          unitMax = Number((unitEv * 1.25).toFixed(2));
        } else if (childProd.price > 0) {
          unitEv = Number(childProd.price.toFixed(2));
          unitMin = Number((unitEv * 0.80).toFixed(2));
          unitMin5 = Number((unitEv * 0.85).toFixed(2));
          unitMid90 = Number((unitEv * 0.95).toFixed(2));
          unitMax5 = Number((unitEv * 1.15).toFixed(2));
          unitMax = Number((unitEv * 1.25).toFixed(2));
        } else if (sub.price > 0) {
          unitEv = Number(sub.price.toFixed(2));
          unitMin = Number((unitEv * 0.80).toFixed(2));
          unitMin5 = Number((unitEv * 0.85).toFixed(2));
          unitMid90 = Number((unitEv * 0.95).toFixed(2));
          unitMax5 = Number((unitEv * 1.15).toFixed(2));
          unitMax = Number((unitEv * 1.25).toFixed(2));
        }

        const subtotalEv = Number((count * unitEv).toFixed(2));
        totalEv += subtotalEv;
        totalMinEv += Number((count * unitMin).toFixed(2));
        totalMin5Ev += Number((count * unitMin5).toFixed(2));
        totalMid90Ev += Number((count * unitMid90).toFixed(2));
        totalMax5Ev += Number((count * unitMax5).toFixed(2));
        totalMaxEv += Number((count * unitMax).toFixed(2));

        sealedItems.push({
          name: sub.name,
          count,
          set: (sub.set || parentSet).toUpperCase(),
          uuid: sub.uuid,
          totalCards: childAudit.totalCards,
          unitEv,
          subtotalEv,
          childBreakdown: childAudit,
        });

        items.push({
          type: 'sealed',
          name: sub.name,
          count,
          cardsPerUnit: Math.round(childAudit.totalCards / Math.max(1, count)),
          totalCards: childAudit.totalCards,
          unitEv,
          subtotalEv,
          set: (sub.set || parentSet).toUpperCase(),
          raw: sub,
        });
      } else {
        // Unmapped sealed subitem (e.g. unknown UUID)
        const sName = (sub.name || '').toLowerCase();
        
        // CHECK IF IT'S A BOOSTER PACK
        const bCodeMatch = sName.match(/(play|collector|draft|set|theme|vip|box-topper|promo)/i);
        if ((sName.includes('booster') || sName.includes('pack')) && bCodeMatch && !sName.includes('box') && !sName.includes('case')) {
          const matchedCode = sub.code || bCodeMatch[1].toLowerCase();
          const res = resolveBoosterPackEv({ code: matchedCode }, sub.set || parentSet, boosterEvMap, vendor, priceMode, reprintMultiplier);
          const cardsPerPack = getCardsPerPack(res.boosterCode, product.category, product.subtype);
          const packCardsTotal = count * cardsPerPack;
          const subtotalEv = Number((count * res.unitEvAvg).toFixed(2));

          totalCards += packCardsTotal;
          totalPacks += count;
          totalVariableEv += subtotalEv;
          totalEv += subtotalEv;
          totalMinEv += Number((count * res.unitEvMin).toFixed(2));
          totalMin5Ev += Number((count * res.unitEvMin5).toFixed(2));
          totalMid90Ev += Number((count * res.unitEvMid90).toFixed(2));
          totalMax5Ev += Number((count * res.unitEvMax5).toFixed(2));
          totalMaxEv += Number((count * res.unitEvMax).toFixed(2));

          const pEntry = {
            packName: `${res.boosterCode.toUpperCase()} Booster Pack`,
            code: res.boosterCode,
            set: res.setCode,
            count,
            cardsPerPack,
            totalCards: packCardsTotal,
            unitEv: res.unitEvAvg,
            unitMid90: res.unitEvMid90,
            unitMin: res.unitEvMin,
            unitMin5: res.unitEvMin5,
            unitMax5: res.unitEvMax5,
            unitMax: res.unitEvMax,
            subtotalEv,
            quantiles: res.quantiles,
          };
          packItems.push(pEntry);
          items.push({
            type: 'pack',
            name: pEntry.packName,
            count,
            cardsPerUnit: cardsPerPack,
            totalCards: packCardsTotal,
            unitEv: res.unitEvAvg,
            subtotalEv,
            set: res.setCode,
            code: res.boosterCode,
            raw: sub,
          });
        } else {
          let estimatedCards = 15;
          if (sName.includes('sample')) estimatedCards = 2;
          else if (sName.includes('booster box')) estimatedCards = 36 * 15;
          else if (sName.includes('case')) estimatedCards = 6 * 36 * 15;
          else if (sName.includes('secret lair drop') || sName.includes('secret lair')) estimatedCards = 5;
          else if (sName.includes('commander')) estimatedCards = 100;
          else if (sName.includes('jumpstart')) estimatedCards = 20;
          else if (sName.includes('starter') || sName.includes('half-deck')) estimatedCards = 30;
          else if (sName.includes('deck')) estimatedCards = 60;
  
          const subCardsTotal = count * estimatedCards;
          totalCards += subCardsTotal;
  
          let unitEv = 0;
          if (childArb && childArb.totalEvAvg > 0) {
            unitEv = Number((childArb.totalEvAvg * reprintMultiplier).toFixed(2));
          } else if (childArb && childArb.marketPrice > 0) {
            unitEv = Number(childArb.marketPrice.toFixed(2));
          } else if (sub.price > 0) {
            unitEv = Number(sub.price.toFixed(2));
          } else if (sub.marketPrice > 0) {
            unitEv = Number(sub.marketPrice.toFixed(2));
          } else if (sub.estimatedEv > 0) {
            unitEv = Number(sub.estimatedEv.toFixed(2));
          }
  
          const subtotalEv = Number((count * unitEv).toFixed(2));
          totalFixedEv += subtotalEv;
          totalEv += subtotalEv;
          totalMinEv += Number((subtotalEv * 0.80).toFixed(2));
          totalMin5Ev += Number((subtotalEv * 0.85).toFixed(2));
          totalMid90Ev += Number((subtotalEv * 0.95).toFixed(2));
          totalMax5Ev += Number((subtotalEv * 1.15).toFixed(2));
          totalMaxEv += Number((subtotalEv * 1.25).toFixed(2));
  
          sealedItems.push({
            name: sub.name,
            count,
            set: (sub.set || parentSet).toUpperCase(),
            uuid: sub.uuid,
            totalCards: subCardsTotal,
            unitEv,
            subtotalEv,
          });
  
          items.push({
            type: 'sealed',
            name: sub.name,
            count,
            cardsPerUnit: estimatedCards,
            totalCards: subCardsTotal,
            unitEv,
            subtotalEv,
            set: (sub.set || parentSet).toUpperCase(),
            raw: sub,
          });
        }
      }
    });
  }

  // 5. VARIABLE SLOTS
  if (prodContents.variable && Array.isArray(prodContents.variable)) {
    prodContents.variable.forEach((vSlot: any, sIdx: number) => {
      const configs = vSlot.configs || [];
      const totalWeight = configs.reduce(
        (sum: number, c: any) => sum + (c.variable_config?.[0]?.chance || 1),
        0
      );

      const parsedConfigs = configs.map((cfg: any) => {
        const vc = cfg.variable_config?.[0] || { chance: 1, weight: totalWeight || 1 };
        const chance = vc.chance || 1;
        const weight = vc.weight || totalWeight || 1;
        const prob = weight > 0 ? chance / weight : 0;
        const probabilityPct = Number((prob * 100).toFixed(2));

        const cItems: Array<{
          type: 'card' | 'pack' | 'deck';
          name: string;
          count: number;
          foil?: boolean;
          set?: string;
          priceOrEv: number;
          uuid?: string;
        }> = [];

        let configEv = 0;

        if (cfg.card) {
          cfg.card.forEach((cd: any) => {
            const res = resolveSingleCardEv(cd, parentSet, product, singleCardPrices, vendor, priceMode, reprintMultiplier);
            const cCount = (cd.count || 1) * multiplier;
            configEv += cCount * res.ev;
            cItems.push({
              type: 'card',
              name: res.name,
              count: cCount,
              foil: res.foil,
              set: res.set,
              priceOrEv: res.ev,
              uuid: res.uuid,
            });
          });
        }

        if (cfg.pack) {
          cfg.pack.forEach((pk: any) => {
            const res = resolveBoosterPackEv(pk, parentSet, boosterEvMap, vendor, priceMode, reprintMultiplier);
            const pCount = (pk.count || 1) * multiplier;
            configEv += pCount * res.unitEvAvg;
            cItems.push({
              type: 'pack',
              name: `${res.boosterCode} Booster Pack`,
              count: pCount,
              set: res.setCode,
              priceOrEv: res.unitEvAvg,
            });
          });
        }

        if (cfg.deck) {
          cfg.deck.forEach((dk: any) => {
            const matched = findMatchingPreconDeck(preconDecks, dk.name, dk.set || parentSet, dk.uuid);
            const dEv = (matched?.totalSinglesEv || 0) * reprintMultiplier;
            configEv += dEv * multiplier;
            cItems.push({
              type: 'deck',
              name: dk.name,
              count: multiplier,
              set: (dk.set || parentSet).toUpperCase(),
              priceOrEv: dEv,
            });
          });
        }

        const weightedEv = Number((prob * configEv).toFixed(2));
        const desc = cItems.map((it) => `${it.count > 1 ? `${it.count}x ` : ''}${it.name}`).join(' + ');

        return {
          chance,
          weight,
          probabilityPct,
          description: desc || 'Variable Option',
          items: cItems,
          configEv: Number(configEv.toFixed(2)),
          weightedEv,
        };
      });

      const slotEv = Number(parsedConfigs.reduce((acc: number, c: any) => acc + c.weightedEv, 0).toFixed(2));
      const minConfigEv = parsedConfigs.length > 0
        ? Math.min(...parsedConfigs.map((c: any) => c.configEv))
        : 0;
      const maxConfigEv = parsedConfigs.length > 0
        ? Math.max(...parsedConfigs.map((c: any) => c.configEv))
        : 0;

      totalVariableEv += slotEv;
      totalEv += slotEv;
      totalMinEv += Number((minConfigEv * multiplier).toFixed(2));
      totalMin5Ev += Number((minConfigEv * multiplier).toFixed(2));
      totalMid90Ev += Number((slotEv * multiplier).toFixed(2));
      totalMax5Ev += Number((maxConfigEv * multiplier).toFixed(2));
      totalMaxEv += Number((maxConfigEv * multiplier).toFixed(2));

      variableItems.push({
        slotIndex: sIdx + 1,
        configs: parsedConfigs,
        slotEv,
      });

      items.push({
        type: 'variable',
        name: `Variable Bonus Slot #${sIdx + 1}`,
        count: multiplier,
        cardsPerUnit: 1,
        totalCards: multiplier,
        unitEv: slotEv,
        subtotalEv: slotEv,
      });
    });
  }

  // 6. ACCESSORIES & PHYSICAL INCLUSIONS
  if (prodContents.other && Array.isArray(prodContents.other)) {
    prodContents.other.forEach((ot: any) => {
      const name = ot.name || 'Accessory / Inclusion';
      const count = (ot.count || 1) * multiplier;
      const isDice = name.toLowerCase().includes('dice') || name.toLowerCase().includes('spindown');
      const isBox = name.toLowerCase().includes('deck box') || name.toLowerCase().includes('box');
      const isToken = name.toLowerCase().includes('token');
      const isCounter = name.toLowerCase().includes('counter');
      const isLand = name.toLowerCase().includes('land');

      let itemCards = 0;
      if (isLand) {
        const landMatch = name.match(/(\d+)\s+/);
        itemCards = landMatch ? parseInt(landMatch[1], 10) * multiplier : 30 * multiplier;
        totalCards += itemCards;
      }

      otherItems.push({
        name,
        count,
        category: isBox
          ? 'Cardboard Deck Box'
          : isDice
          ? 'Life Counter / Spindown'
          : isToken
          ? 'Tokens'
          : isCounter
          ? 'Counters'
          : isLand
          ? `Basic Lands (${itemCards} Cards)`
          : 'Physical Accessory',
        ev: 0,
        cards: itemCards,
      });

      items.push({
        type: 'other',
        name,
        count,
        cardsPerUnit: itemCards ? Math.round(itemCards / count) : 0,
        totalCards: itemCards,
        unitEv: 0,
        subtotalEv: 0,
        details: isLand ? `Basic lands inclusion (${itemCards} total cards)` : 'Physical non-card inclusion (no singles EV)',
        raw: ot,
      });
    });
  }

  if (totalEv === 0) {
    const pUid = product.id || product.uuid || '';
    const arb = pUid
      ? arbitrageMap[pUid]
      : Object.values(arbitrageMap).find((a: any) =>
          (a.productUuid && a.productUuid === pUid) ||
          ((a.boxName || a.displayName || '').toLowerCase().trim() === (product.displayName || product.name || '').toLowerCase().trim())
        );
    if (arb && arb.totalEvAvg > 0) {
      totalEv = Number((arb.totalEvAvg * reprintMultiplier * multiplier).toFixed(2));
      totalMinEv = Number(((arb.totalEvMin || arb.totalEvAvg * 0.15) * reprintMultiplier * multiplier).toFixed(2));
      totalMin5Ev = Number(((arb.totalEvMin5 || arb.totalEvAvg * 0.25) * reprintMultiplier * multiplier).toFixed(2));
      totalMid90Ev = Number(((arb.totalEvMid90 || arb.totalEvAvg * 0.85) * reprintMultiplier * multiplier).toFixed(2));
      totalMax5Ev = Number(((arb.totalEvMax5 || arb.totalEvAvg * 3.5) * reprintMultiplier * multiplier).toFixed(2));
      totalMaxEv = Number(((arb.totalEvMax || arb.totalEvAvg * 4.5) * reprintMultiplier * multiplier).toFixed(2));
      totalVariableEv = totalEv;
    } else if (product.estimatedEv > 0) {
      totalEv = Number((product.estimatedEv * multiplier).toFixed(2));
      totalFixedEv = totalEv;
      totalMinEv = totalEv;
      totalMin5Ev = totalEv;
      totalMid90Ev = totalEv;
      totalMax5Ev = totalEv;
      totalMaxEv = totalEv;
    } else if (product.marketPrice > 0) {
      totalEv = Number((product.marketPrice * multiplier).toFixed(2));
      totalFixedEv = totalEv;
      totalMinEv = totalEv;
      totalMin5Ev = totalEv;
      totalMid90Ev = totalEv;
      totalMax5Ev = totalEv;
      totalMaxEv = totalEv;
    }
  }

  // Gather all items for composite simulation (flattening nested childBreakdowns)
  const simulationItems: Array<{ count: number; quantiles?: number[]; evAverage?: number; fixed?: boolean }> = [];
  
  // Direct pack items
  for (const p of packItems) {
    simulationItems.push({ count: p.count, quantiles: p.quantiles, evAverage: p.unitEv });
  }
  
  // Precon decks and fixed items (no variance)
  for (const d of deckItems) {
    simulationItems.push({ count: d.count, evAverage: d.unitSinglesEv, fixed: true });
  }
  for (const c of cardItems) {
    simulationItems.push({ count: c.count, evAverage: c.unitEv, fixed: true });
  }

  // Recursively add nested sealed items' quantiles
  for (const s of sealedItems) {
    if (s.childBreakdown?.quantiles) {
      // If the child breakdown has already simulated composite quantiles, we can just treat it as a single unit with those quantiles
      simulationItems.push({ count: s.count, quantiles: s.childBreakdown.quantiles, evAverage: s.unitEv });
    } else {
      simulationItems.push({ count: s.count, evAverage: s.unitEv, fixed: true });
    }
  }

  const variableSlots = variableItems.map((slot) =>
    slot.configs.map((config) => ({
      probability: config.probabilityPct / 100,
      value: config.configEv,
    }))
  );
  
  let quantiles = simulateCompositeQuantiles(simulationItems, 5000, variableSlots);

  return {
    totalCards,
    totalPacks,
    totalDecks,
    totalSealedUnits,
    totalFixedEv: Number(totalFixedEv.toFixed(2)),
    totalVariableEv: Number(totalVariableEv.toFixed(2)),
    totalEv: Number(totalEv.toFixed(2)),
    totalMinEv: Number(totalMinEv.toFixed(2)),
    totalMin5Ev: Number(totalMin5Ev.toFixed(2)),
    totalMid90Ev: Number(totalMid90Ev.toFixed(2)),
    totalMax5Ev: Number(totalMax5Ev.toFixed(2)),
    totalMaxEv: Number(totalMaxEv.toFixed(2)),
    quantiles,
    items,
    packItems,
    cardItems,
    sealedItems,
    deckItems,
    variableItems,
    otherItems,
  };
}

export interface CanonicalProductMetrics {
  marketPrice: number;
  estimatedEv: number;
  fixedBaseEv: number;
  variableEv: number;
  minEv: number;
  min5Ev: number;
  mid90Ev: number;
  max5Ev: number;
  maxEv: number;
  effectiveEv: number;
  cardCount: number;
  packsCount: number;
  primaryBoosterName: string;
  auditResult: RecursiveProductBreakdownResult;
  netSpread: number;
  roiPct: number;
}

/**
 * Single source of truth across all views (Overview, EV Explorer, Related Products Hierarchy, Admin Inspector)
 * for sealed product pricing, containment, pack count, and EV.
 */
export function getCanonicalProductMetrics(
  product: any,
  productMap: Map<string, any> | Record<string, any> = new Map(),
  arbitrageMap: Record<string, any> = {},
  boosterEvMap: Record<string, BoosterEVRecord[]> = {},
  preconDecks: Record<string, any> = {},
  singleCardPrices: any = { byUuid: {}, byName: {}, byNameSet: {} },
  vendor: Vendor | string = 'all',
  priceMode: PriceMode = 'direct',
  evBasis: EvBasis | string = 'avg'
): CanonicalProductMetrics {
  const pId = product?.id || product?.uuid || product?.productUuid || '';
  const arb = arbitrageMap[pId];
  const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;
  const normVendor = normalizeVendor(vendor);

  // 1. Run canonical recursive audit
  const audit = resolveRecursiveProductAudit(
    product,
    productMap,
    arbitrageMap,
    boosterEvMap,
    preconDecks,
    singleCardPrices,
    normVendor,
    priceMode,
    1,
    new Set<string>(),
    evBasis
  );

  let estimatedEv = audit.totalEv;
  let fixedBaseEv = audit.totalFixedEv;
  let variableEv = audit.totalVariableEv;
  let minEv = audit.totalMinEv;
  let min5Ev = audit.totalMin5Ev;
  let mid90Ev = audit.totalMid90Ev;
  let max5Ev = audit.totalMax5Ev;
  let maxEv = audit.totalMaxEv;
  let packsCount = audit.totalPacks;
  let cardCount = audit.totalCards;

  // If audit returned 0 EV (e.g. leaf pack or product without structured contents)
  if (estimatedEv === 0) {
    if (arb && arb.totalEvAvg > 0) {
      estimatedEv = Number((arb.totalEvAvg * reprintMultiplier).toFixed(2));
      minEv = Number(((arb.totalEvMin || arb.totalEvAvg * 0.15) * reprintMultiplier).toFixed(2));
      min5Ev = Number(((arb.totalEvMin5 || arb.totalEvAvg * 0.25) * reprintMultiplier).toFixed(2));
      mid90Ev = Number(((arb.totalEvMid90 || arb.totalEvAvg * 0.85) * reprintMultiplier).toFixed(2));
      max5Ev = Number(((arb.totalEvMax5 || arb.totalEvAvg * 3.5) * reprintMultiplier).toFixed(2));
      maxEv = Number(((arb.totalEvMax || arb.totalEvAvg * 4.5) * reprintMultiplier).toFixed(2));
      variableEv = estimatedEv;
      if (packsCount === 0 && arb.packCount > 0) packsCount = arb.packCount;
      if (cardCount === 0 && arb.cardCount > 0) cardCount = arb.cardCount;
    } else {
      // Look up booster directly if pack
      const pSet = (product?.setCode || product?.set_code || '').toUpperCase();
      const bCode = product?.boosterName || product?.boosterType || 'play';
      const matched = findBoosterEv(boosterEvMap, pSet, bCode, priceMode, normVendor);
      if (matched && matched.evAverage > 0) {
        const pCnt = product?.packsCount || product?.packCount || 1;
        estimatedEv = Number((matched.evAverage * pCnt * reprintMultiplier).toFixed(2));
        minEv = Number((matched.evMin * pCnt * reprintMultiplier).toFixed(2));
        min5Ev = matched.evMin5 ? Number((matched.evMin5 * pCnt * reprintMultiplier).toFixed(2)) : Number((minEv * 1.5).toFixed(2));
        mid90Ev = Number((matched.evMid90 * pCnt * reprintMultiplier).toFixed(2));
        max5Ev = matched.evMax5 ? Number((matched.evMax5 * pCnt * reprintMultiplier).toFixed(2)) : Number((mid90Ev * 2.5).toFixed(2));
        maxEv = Number((matched.evMax * pCnt * reprintMultiplier).toFixed(2));
        variableEv = estimatedEv;
        if (packsCount === 0) packsCount = pCnt;
      }
    }
  }

  // Consistency checks for mixed products & fixed inclusions:
  // If product has fixed inclusions (e.g. precon deck), the floor can never fall below the fixed deck EV!
  if (fixedBaseEv > 0) {
    minEv = Math.max(minEv, fixedBaseEv);
    min5Ev = Math.max(min5Ev, fixedBaseEv);
    mid90Ev = Math.max(mid90Ev, fixedBaseEv);
    estimatedEv = Math.max(estimatedEv, fixedBaseEv);
    max5Ev = Math.max(max5Ev, fixedBaseEv);
    maxEv = Math.max(maxEv, fixedBaseEv);
  }

  // If product is purely fixed/preconstructed (0 packs and 0 variable lottery slots)
  if (audit.totalPacks === 0 && audit.variableItems.length === 0 && fixedBaseEv > 0) {
    minEv = fixedBaseEv;
    min5Ev = fixedBaseEv;
    mid90Ev = fixedBaseEv;
    estimatedEv = fixedBaseEv;
    max5Ev = fixedBaseEv;
    maxEv = fixedBaseEv;
  } else if (estimatedEv > 0) {
    // Normal bounds
    if (minEv <= 0) minEv = Number((estimatedEv * 0.80).toFixed(2));
    if (min5Ev <= 0 || min5Ev < minEv) min5Ev = Number(((minEv + estimatedEv) / 2).toFixed(2));
    if (mid90Ev <= 0 || mid90Ev < min5Ev) mid90Ev = Number((estimatedEv * 0.95).toFixed(2));
    if (max5Ev <= 0 || max5Ev < estimatedEv) max5Ev = Number((estimatedEv * 1.15).toFixed(2));
    if (maxEv <= 0 || maxEv < max5Ev) maxEv = Number((estimatedEv * 1.25).toFixed(2));
  }

  // Fallback cardCount
  if (cardCount === 0) {
    if (product?.cardCount) cardCount = Number(product.cardCount);
    else if (packsCount > 0) cardCount = packsCount * 15;
    else if (arb?.cardCount) cardCount = Number(arb.cardCount);
  }

  // Fallback packsCount
  if (packsCount === 0) {
    if (product?.packsCount) packsCount = Number(product.packsCount);
    else if (product?.packCount) packsCount = Number(product.packCount);
    else if (arb?.packCount) packsCount = Number(arb.packCount);
  }

  // Authentic market price
  let marketPrice = Number(product?.marketPrice || product?.tcgplayer_price || arb?.marketPrice || 0);
  if (marketPrice === 0 && product?.cardmarket_price) marketPrice = Number(product.cardmarket_price);

  // Primary booster name determination
  let primaryBoosterName = 'play';
  if (audit.packItems.length > 0) {
    // Find pack code with largest count (e.g. 36 draft packs vs 1 box topper pack -> draft)
    const sorted = [...audit.packItems].sort((a, b) => b.count - a.count);
    primaryBoosterName = sorted[0].code || 'play';
  } else if (product?.boosterName) {
    primaryBoosterName = product.boosterName;
  } else if (product?.boosterType) {
    primaryBoosterName = product.boosterType;
  } else if (arb?.boosterName) {
    primaryBoosterName = arb.boosterName;
  }

  // Effective EV based on evBasis
  let effectiveEv = estimatedEv;
  if (evBasis === 'min') effectiveEv = minEv > 0 ? minEv : estimatedEv;
  else if (evBasis === 'mid90') effectiveEv = mid90Ev > 0 ? mid90Ev : estimatedEv;
  else if (evBasis === 'max') effectiveEv = maxEv > 0 ? maxEv : estimatedEv;

  const netSpread = effectiveEv > 0 && marketPrice > 0 ? Number((effectiveEv - marketPrice).toFixed(2)) : 0;
  const roiPct = marketPrice > 0 ? Number(((netSpread / marketPrice) * 100).toFixed(1)) : 0;

  return {
    marketPrice,
    estimatedEv,
    fixedBaseEv,
    variableEv,
    minEv,
    min5Ev,
    mid90Ev,
    max5Ev,
    maxEv,
    effectiveEv,
    cardCount,
    packsCount: packsCount > 0 ? packsCount : 1,
    primaryBoosterName,
    auditResult: audit,
    netSpread,
    roiPct,
  };
}
