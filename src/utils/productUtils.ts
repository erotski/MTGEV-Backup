/**
 * Utility functions for recursive product breakdown, card counts, pack counts,
 * and EV resolution across MTGJSON sealed products.
 */
import { BoosterEVRecord, PriceMode, Vendor, EvBasis } from '../types';
import { findBoosterEv, normalizeVendor, resolveCardPrice } from './vendorUtils';

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

  void c;
  void sub;
  void cat;
  return 0;
}

/**
 * Resolves a single pack's EV and details.
 */
export function resolveBoosterPackEv(
  pk: { code?: string; set?: string; count?: number },
  parentSetCode: string,
  boosterEvMap: Record<string, BoosterEVRecord[]>,
  vendor: Vendor | string = 'all_cheapest',
  priceMode: PriceMode | string = 'direct'
) {
  const pkSet = (pk.set || parentSetCode || '').toUpperCase();
  const pkCode = (pk.code || '').toLowerCase();

  const normVendor = normalizeVendor(vendor);
  const matchedBooster = findBoosterEv(boosterEvMap, pkSet, pkCode, priceMode, normVendor);

  let unitEvAvg = matchedBooster ? matchedBooster.evAverage : 0;
  let unitEvMid90 = matchedBooster ? matchedBooster.evMid90 : unitEvAvg;
  let unitEvMin = matchedBooster ? matchedBooster.evMin : 0;
  let unitEvMin5 = matchedBooster?.evMin5 || 0;
  let unitEvMax5 = matchedBooster?.evMax5 || 0;
  let unitEvMax = matchedBooster ? matchedBooster.evMax : 0;
  
  let quantiles: number[] | undefined = matchedBooster?.quantiles;

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
  vendor: Vendor | string = 'all_cheapest',
  priceMode: PriceMode | string = 'direct'
) {
  if (!cd) {
    return {
      name: 'Unknown Card',
      number: '',
      set: (parentSetCode || '').toUpperCase(),
      foil: false,
      price: 0,
      ev: 0,
      prices: { tcgplayer: 0, cardkingdom: 0, cardmarket: 0, all_cheapest: 0, all_average: 0 },
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

  const priceIdx =
    (cd.uuid && singleCardPrices?.byUuid?.[cd.uuid]) ||
    singleCardPrices?.byNameSet?.[`${String(rawName || '').toLowerCase()}___${cardSet.toLowerCase()}`] ||
    singleCardPrices?.byNameSet?.[`${String(rawName || '').toLowerCase()}_${cardSet.toLowerCase()}`] ||
    singleCardPrices?.byName?.[String(rawName || '').toLowerCase()];
  const prices = priceIdx?.prices || cd.prices || {};
  const vendorPrice = resolveCardPrice({ prices }, vendor, isFoil);

  return {
    name: rawName,
    number: rawNumber,
    set: cardSet,
    foil: isFoil,
    price: Number(vendorPrice.toFixed(2)),
    ev: Number(vendorPrice.toFixed(2)),
    prices,
    isEstimated: false,
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

  // A sealed product whose own category is a single booster pack describes ITSELF via
  // contents.pack (MTGJSON links a booster-pack product to its own booster configuration
  // for simulation purposes) — this is identity metadata, not a contained child product.
  // Without this guard, recursing into such a leaf (e.g. as a `sealed` sub-item of a parent
  // composite) fabricated a spurious duplicate "PLAY Booster Pack" sub-item underneath a
  // product that is already that exact booster pack.
  const isLeafBoosterPackProduct =
    (product?.category || '').toLowerCase() === 'booster_pack' &&
    Array.isArray(prodContents.pack) &&
    prodContents.pack.length === 1 &&
    !prodContents.card &&
    !prodContents.deck &&
    !prodContents.sealed &&
    !prodContents.variable;

  if (isLeafBoosterPackProduct) {
    const pk = prodContents.pack[0];
    const count = multiplier;
    const res = resolveBoosterPackEv(pk, parentSet, boosterEvMap, vendor, priceMode);
    const cardsPerPack = getCardsPerPack(pk.code, product.category, product.subtype);
    const effectiveUnitEv =
      evBasis === 'min' ? res.unitEvMin :
      evBasis === 'mid90' ? res.unitEvMid90 :
      evBasis === 'max' ? res.unitEvMax :
      res.unitEvAvg;
    const leafEv = Number((count * effectiveUnitEv).toFixed(2));
    const packItem = {
      packName: `${res.boosterCode.toUpperCase()} Booster Pack`,
      code: res.boosterCode,
      set: res.setCode,
      count,
      cardsPerPack,
      totalCards: count * cardsPerPack,
      unitEv: effectiveUnitEv,
      unitMid90: res.unitEvMid90,
      unitMin: res.unitEvMin,
      unitMin5: res.unitEvMin5,
      unitMax5: res.unitEvMax5,
      unitMax: res.unitEvMax,
      subtotalEv: leafEv,
      quantiles: res.quantiles,
    };
    return {
      totalCards: count * cardsPerPack,
      totalPacks: count,
      totalDecks: 0,
      totalSealedUnits: 0,
      totalFixedEv: 0,
      totalVariableEv: leafEv,
      totalEv: leafEv,
      totalMinEv: Number((count * res.unitEvMin).toFixed(2)),
      totalMin5Ev: Number((count * res.unitEvMin5).toFixed(2)),
      totalMid90Ev: Number((count * res.unitEvMid90).toFixed(2)),
      totalMax5Ev: Number((count * res.unitEvMax5).toFixed(2)),
      totalMaxEv: Number((count * res.unitEvMax).toFixed(2)),
      quantiles: res.quantiles,
      items: [{
        type: 'pack',
        name: packItem.packName,
        count,
        cardsPerUnit: cardsPerPack,
        totalCards: packItem.totalCards,
        unitEv: effectiveUnitEv,
        subtotalEv: leafEv,
        set: res.setCode,
        code: res.boosterCode,
        raw: pk,
      }],
      packItems: [packItem],
      cardItems: [],
      sealedItems: [],
      deckItems: [],
      variableItems: [],
      otherItems: [],
    };
  }

  // 1. DIRECT PACKS
  if (prodContents.pack && Array.isArray(prodContents.pack)) {
    prodContents.pack.forEach((pk: any) => {
      const count = (pk.count || 1) * multiplier;
      const res = resolveBoosterPackEv(pk, parentSet, boosterEvMap, vendor, priceMode);
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
      // NOTE: min/mid90/max are NOT accumulated here. Unlike the mean, order
      // statistics don't scale linearly with pack count (opening N packs and
      // getting the single worst/best pack N times in a row is not the real
      // N-pack floor/ceiling) — see PROJECT_REVIEW.md DEV-28. The backend's
      // real Monte Carlo convolution (product_metrics.json/arbitrage) is the
      // only valid source for those; see the end-of-function backfill below.

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
      const res = resolveSingleCardEv(cd, parentSet, product, singleCardPrices, vendor, priceMode);
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

      const fixedConfigurationRecord = findBoosterEv(
        boosterEvMap,
        parentSet,
        'beginner',
        priceMode,
        vendor
      );
      const normalizedDeckName = String(dk.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fixedConfiguration = fixedConfigurationRecord?.configurationOutcomes?.find((outcome) =>
        String(outcome.label || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedDeckName
      );
      const fixedConfigurationCardCount = Number(fixedConfiguration?.statusCounts?.exact || 0);

      const deckCardCount = matchedDeckCardsCount > 0
        ? matchedDeckCardsCount
        : fixedConfigurationCardCount;
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
      if (fixedConfiguration && singlesEv <= 0) {
        singlesEv = Number(fixedConfiguration.ev || 0);
      }
      if (priceMode === 'cheapest_reprint' && singlesEv > 0) {
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
          cardmarket: c.cardmarket_price || 0,
          cardkingdom: c.cardkingdom_price || 0,
          manapool: c.manapool_price || 0,
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
        }

        const cCount = c.count || 1;
        const adjustedPrice = Number(price.toFixed(2));
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
          const isFoil = Boolean(matchedDeck.isFoil || (sub.name || '').toLowerCase().includes('foil'));
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

        if (childArb && childArb.totalEvAvg > 0) {
          // Backend arbitrage/composite record for this exact child product wins
          // over a frontend re-derivation of the same value (see PROJECT_REVIEW.md
          // DEV-11/DEV-28/DEV-29) — the recursive audit remains for structural
          // display and as a fallback when no backend record exists.
          unitEv = Number(Number(childArb.totalEvAvg).toFixed(2));
          unitMin = Number(Number(childArb.unitEvMin || 0).toFixed(2));
          unitMin5 = Number(Number(childArb.unitEvMin5 || 0).toFixed(2));
          unitMid90 = Number(Number(childArb.unitEvMid90 || 0).toFixed(2));
          unitMax5 = Number(Number(childArb.unitEvMax5 || 0).toFixed(2));
          unitMax = Number(Number(childArb.unitEvMax || 0).toFixed(2));
        } else if (childAudit.totalEv > 0) {
          unitEv = Number((childAudit.totalEv / count).toFixed(2));
          unitMin = childAudit.totalMinEv > 0
            ? Number((childAudit.totalMinEv / count).toFixed(2))
            : 0;
          unitMin5 = childAudit.totalMin5Ev > 0
            ? Number((childAudit.totalMin5Ev / count).toFixed(2))
            : 0;
          unitMid90 = childAudit.totalMid90Ev > 0
            ? Number((childAudit.totalMid90Ev / count).toFixed(2))
            : 0;
          unitMax5 = childAudit.totalMax5Ev > 0
            ? Number((childAudit.totalMax5Ev / count).toFixed(2))
            : 0;
          unitMax = childAudit.totalMaxEv > 0
            ? Number((childAudit.totalMaxEv / count).toFixed(2))
            : 0;
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
        if (typeof console !== 'undefined') {
          console.warn(`[productUtils] Unmapped sealed sub-item "${sub.name}" (uuid=${sub.uuid || 'none'}).`);
        }
        sealedItems.push({
          name: sub.name,
          count,
          set: (sub.set || parentSet).toUpperCase(),
          uuid: sub.uuid,
          totalCards: 0,
          unitEv: 0,
          subtotalEv: 0,
        });
        items.push({
          type: 'sealed',
          name: sub.name,
          count,
          cardsPerUnit: 0,
          totalCards: 0,
          unitEv: 0,
          subtotalEv: 0,
          set: (sub.set || parentSet).toUpperCase(),
          raw: sub,
        });
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
            const res = resolveSingleCardEv(cd, parentSet, product, singleCardPrices, vendor, priceMode);
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
            const res = resolveBoosterPackEv(pk, parentSet, boosterEvMap, vendor, priceMode);
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
            const dEv = matched?.totalSinglesEv || 0;
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
      // Same reasoning as the direct-packs section: a variable slot's min/max
      // configuration EV does not linearly scale with multiplier copies of
      // that slot, so it is intentionally left out of the min/mid90/max totals.

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
      totalEv = Number((arb.totalEvAvg * multiplier).toFixed(2));
      totalMinEv = Number((arb.totalEvMin * multiplier).toFixed(2));
      totalMin5Ev = Number((arb.totalEvMin5 * multiplier).toFixed(2));
      totalMid90Ev = Number((arb.totalEvMid90 * multiplier).toFixed(2));
      totalMax5Ev = Number((arb.totalEvMax5 * multiplier).toFixed(2));
      totalMaxEv = Number((arb.totalEvMax * multiplier).toFixed(2));
      totalVariableEv = totalEv;
    }
  }

  // Composite quantiles must come from the backend-generated product snapshot.
  const quantiles: number[] | undefined = undefined;

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


