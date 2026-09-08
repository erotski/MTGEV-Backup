/**
 * Utility functions for recursive product breakdown, card counts, pack counts,
 * and EV resolution across MTGJSON sealed products.
 */
import { BoosterEVRecord, PriceMode, Vendor } from '../types';
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
  totalEv: number;
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
    unitMax: number;
    subtotalEv: number;
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
  vendor: Vendor | string = 'all',
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
  let unitEvMax = matchedBooster ? matchedBooster.evMax : 0;

  if (matchedBooster && matchedBooster.priceMode !== 'cheapest_reprint' && priceMode === 'cheapest_reprint') {
    unitEvAvg = Number((unitEvAvg * reprintMultiplier).toFixed(2));
    unitEvMid90 = Number((unitEvMid90 * reprintMultiplier).toFixed(2));
    unitEvMin = Number((unitEvMin * reprintMultiplier).toFixed(2));
    unitEvMax = Number((unitEvMax * reprintMultiplier).toFixed(2));
  }

  return {
    setCode: pkSet,
    boosterCode: pkCode,
    unitEvAvg,
    unitEvMid90,
    unitEvMin,
    unitEvMax,
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
  const rawName = cd.name || 'Card';
  const rawNumber = cd.number || '';
  const cardSet = (cd.set || parentSetCode || '').toUpperCase();
  const isFoil = Boolean(
    cd.foil ||
    (cd.finishes && cd.finishes.includes('foil')) ||
    (parentProduct?.displayName && parentProduct.displayName.toLowerCase().includes('foil') && !parentProduct.displayName.toLowerCase().includes('non-foil'))
  );

  const priceIdx =
    (cd.uuid && singleCardPrices.byUuid[cd.uuid]) ||
    singleCardPrices.byNameSet[`${rawName.toLowerCase()}___${cardSet.toLowerCase()}`] ||
    singleCardPrices.byNameSet[`${rawName.toLowerCase()}_${cardSet.toLowerCase()}`] ||
    singleCardPrices.byName[rawName.toLowerCase()];

  let rawPrice = 0;
  let isEstimated = false;

  if (priceIdx) {
    rawPrice = isFoil && priceIdx.foilPrice ? priceIdx.foilPrice : priceIdx.price;
  } else if (cd.prices?.tcgplayer) {
    rawPrice = Number(cd.prices.tcgplayer);
  } else if (cd.prices?.cardmarket) {
    rawPrice = Number(cd.prices.cardmarket);
  } else if (cd.price) {
    rawPrice = Number(cd.price);
  } else if (cd.ev) {
    rawPrice = Number(cd.ev);
  } else {
    // Estimating reasonable value if zero
    rawPrice = isFoil ? 4.50 : 2.00;
    isEstimated = true;
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
    } else if (vendor === 'all') {
      // all_cheapest
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

/**
 * Finds a matching precon deck from preconDecks dictionary.
 */
export function findMatchingPreconDeck(preconDecks: Record<string, any>, targetName?: string, targetSet?: string) {
  if (!targetName) return undefined;
  const cleanTarget = targetName.toLowerCase().trim();
  const lowerSet = targetSet ? targetSet.toLowerCase().trim() : '';

  const directKey = `${cleanTarget}___${lowerSet}`;
  if (preconDecks[directKey]) return preconDecks[directKey];

  for (const d of Object.values(preconDecks)) {
    const dName = (d.deckName || d.name || '').toLowerCase().trim();
    const dSet = (d.set || d.setCode || '').toLowerCase().trim();
    if (lowerSet && dSet === lowerSet && dName === cleanTarget) return d;
    if (dName === cleanTarget) return d;
  }
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
  visited = new Set<string>()
): RecursiveProductBreakdownResult {
  const pId = product?.id || product?.uuid || '';
  const parentSet = (product?.setCode || product?.set_code || '').toUpperCase();
  const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;
  const cardPricesByUuid = singleCardPrices?.byUuid || {};
  const cardPricesByNameSet = singleCardPrices?.byNameSet || {};
  const cardPricesByName = singleCardPrices?.byName || {};
  const lookupProduct = (key: string) => {
    if (!key) return null;
    if (productMap instanceof Map) return productMap.get(key) || null;
    return productMap[key] || null;
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
  let totalEv = 0;

  if (!product || !product.contents) {
    // If leaf item with no explicit contents
    const directCards = product?.cardCount || 0;
    return {
      totalCards: directCards * multiplier,
      totalPacks: 0,
      totalDecks: 0,
      totalSealedUnits: 0,
      totalEv: 0,
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
        totalEv: 0,
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
  if (product.contents.pack && Array.isArray(product.contents.pack)) {
    product.contents.pack.forEach((pk: any) => {
      const count = (pk.count || 1) * multiplier;
      const res = resolveBoosterPackEv(pk, parentSet, boosterEvMap, vendor, priceMode, reprintMultiplier);
      const cardsPerPack = getCardsPerPack(pk.code, product.category, product.subtype);
      const packCardsTotal = count * cardsPerPack;
      const subtotalEv = Number((count * res.unitEvAvg).toFixed(2));

      totalCards += packCardsTotal;
      totalPacks += count;
      totalEv += subtotalEv;

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

  // 2. STANDALONE CARDS & PROMOS
  if (product.contents.card && Array.isArray(product.contents.card)) {
    product.contents.card.forEach((cd: any) => {
      const count = (cd.count || 1) * multiplier;
      const res = resolveSingleCardEv(cd, parentSet, product, singleCardPrices, vendor, priceMode, reprintMultiplier);
      const subtotalEv = Number((count * res.ev).toFixed(2));

      totalCards += count;
      totalEv += subtotalEv;

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
  if (product.contents.deck && Array.isArray(product.contents.deck)) {
    product.contents.deck.forEach((dk: any) => {
      const count = multiplier;
      const matchedDeck = findMatchingPreconDeck(preconDecks, dk.name, dk.set || parentSet);
      const isCommander = Boolean(
        (product.subtype || '').toLowerCase().includes('commander') ||
        (product.category || '').toLowerCase().includes('commander') ||
        (product.displayName || product.name || '').toLowerCase().includes('commander') ||
        (dk.name || '').toLowerCase().includes('commander')
      );
      const defaultCardCount = isCommander ? 100 : (product.cardCount || 60);
      const deckCardCount = matchedDeck?.cardCount || (matchedDeck?.cards ? matchedDeck.cards.length : defaultCardCount);
      const deckCardsTotal = count * deckCardCount;

      const isFoil = Boolean(
        dk.foil ||
        dk.isFoil ||
        matchedDeck?.isFoil ||
        matchedDeck?.foil ||
        (dk.name || '').toLowerCase().includes('foil') ||
        (matchedDeck?.deckName || '').toLowerCase().includes('foil') ||
        ((product.displayName || product.name || '').toLowerCase().includes('foil') &&
         !(product.displayName || product.name || '').toLowerCase().includes('non-foil'))
      );

      let singlesEv = matchedDeck?.totalSinglesEv || 0;
      if (priceMode === 'cheapest_reprint' && singlesEv > 0) {
        singlesEv = Number((singlesEv * reprintMultiplier).toFixed(2));
      }

      const rawCards = matchedDeck?.cards || [];
      const cards = rawCards.map((c: any) => {
        const cardFoil = Boolean(c.foil || c.isFoil || isFoil);
        const fromIdx =
          (c.uuid && singleCardPrices.byUuid[c.uuid]) ||
          singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}___${(c.set || dk.set || parentSet).toLowerCase()}`] ||
          singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}_${(c.set || dk.set || parentSet).toLowerCase()}`] ||
          singleCardPrices.byName[(c.name || '').toLowerCase()];

        const cardPrices = c.prices || fromIdx?.prices || {
          tcgplayer: c.price || fromIdx?.price || 0,
          cardmarket: c.cardmarket_price || (c.price ? c.price * 0.868 : 0),
          cardkingdom: c.cardkingdom_price || (c.price ? c.price * 1.15 : 0),
          manapool: c.manapool_price || (c.price ? c.price * 0.98 : 0),
        };

        let price = resolveCardPrice(
          {
            price: c.price || fromIdx?.price || 0,
            foilPrice: fromIdx?.foilPrice || c.foilPrice,
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
          finish: cardFoil ? 'Foil' : 'Nonfoil',
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
      totalEv += subtotalSinglesEv;

      deckItems.push({
        name: dk.name,
        set: (dk.set || parentSet).toUpperCase(),
        count,
        cardCount: deckCardCount,
        totalCards: deckCardsTotal,
        isFoil,
        finish: isFoil ? 'Foil' : 'Nonfoil',
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
        foil: isFoil,
        raw: dk,
      });
    });
  }

  // 4. RECURSIVE SEALED SUBPRODUCTS (CRITICAL: drill down recursively!)
  if (product.contents.sealed && Array.isArray(product.contents.sealed)) {
    product.contents.sealed.forEach((sub: any) => {
      const count = (sub.count || 1) * multiplier;
      const childProd = sub.uuid ? lookupProduct(sub.uuid) : null;
      const childArb = sub.uuid ? arbitrageMap[sub.uuid] : null;

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
          new Set(visited)
        );

        totalCards += childAudit.totalCards;
        totalPacks += childAudit.totalPacks;
        totalDecks += childAudit.totalDecks;

        let unitEv = 0;
        if (childArb && childArb.totalEvAvg > 0) {
          unitEv = Number((childArb.totalEvAvg * reprintMultiplier).toFixed(2));
        } else if (childAudit.totalEv > 0) {
          unitEv = Number((childAudit.totalEv / count).toFixed(2));
        }

        const subtotalEv = Number((count * unitEv).toFixed(2));
        totalEv += subtotalEv;

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
        let estimatedCards = 15;
        if (sName.includes('sample')) estimatedCards = 2;
        else if (sName.includes('booster box')) estimatedCards = 36 * 15;
        else if (sName.includes('case')) estimatedCards = 6 * 36 * 15;
        else if (sName.includes('deck')) estimatedCards = 100;

        const subCardsTotal = count * estimatedCards;
        totalCards += subCardsTotal;

        let unitEv = 0;
        if (childArb && childArb.totalEvAvg > 0) {
          unitEv = Number((childArb.totalEvAvg * reprintMultiplier).toFixed(2));
        }
        const subtotalEv = Number((count * unitEv).toFixed(2));
        totalEv += subtotalEv;

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
    });
  }

  // 5. VARIABLE SLOTS
  if (product.contents.variable && Array.isArray(product.contents.variable)) {
    product.contents.variable.forEach((vSlot: any, sIdx: number) => {
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
            const matched = findMatchingPreconDeck(preconDecks, dk.name, dk.set || parentSet);
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
      totalEv += slotEv;

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
  if (product.contents.other && Array.isArray(product.contents.other)) {
    product.contents.other.forEach((ot: any) => {
      const name = ot.name || 'Accessory / Inclusion';
      const count = (ot.count || 1) * multiplier;
      const isDice = name.toLowerCase().includes('dice') || name.toLowerCase().includes('spindown');
      const isBox = name.toLowerCase().includes('deck box') || name.toLowerCase().includes('box');
      const isToken = name.toLowerCase().includes('token');
      const isCounter = name.toLowerCase().includes('counter');

      otherItems.push({
        name,
        count,
        category: isBox ? 'Cardboard Deck Box' : isDice ? 'Life Counter / Spindown' : isToken ? 'Tokens' : isCounter ? 'Counters' : 'Physical Accessory',
        ev: 0,
      });

      items.push({
        type: 'other',
        name,
        count,
        cardsPerUnit: 0,
        totalCards: 0,
        unitEv: 0,
        subtotalEv: 0,
        details: 'Physical non-card inclusion (no singles EV)',
        raw: ot,
      });
    });
  }

  return {
    totalCards,
    totalPacks,
    totalDecks,
    totalSealedUnits,
    totalEv: Number(totalEv.toFixed(2)),
    items,
    packItems,
    cardItems,
    sealedItems,
    deckItems,
    variableItems,
    otherItems,
  };
}
