import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  ChevronRight,
  ChevronDown,
  Package,
  Box,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Database,
  ArrowUpRight,
  DollarSign,
  Calculator,
  RefreshCw,
  FileText,
  Code2,
  Tag,
  Percent,
  BarChart2,
  ShieldCheck,
  Eye,
  Sliders,
  ExternalLink,
  Info,
  Gift,
  TrendingUp,
  ArrowDownRight
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { BoxArbitrageRecord, BoosterEVRecord, Vendor, PriceMode } from '../types';
import { ProductBreakdownModal } from './ProductBreakdownModal';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { findBoosterEv, resolveCardPrice, normalizeVendor } from '../utils/vendorUtils';

export interface SealedProductItem {
  id: string;
  uuid?: string;
  setCode: string;
  displayName: string;
  category: string;
  subtype: string;
  cardCount: number | null;
  contents: {
    sealed?: Array<{ count: number; name: string; set: string; uuid?: string }>;
    pack?: Array<{ count?: number; code: string; set?: string }>;
    card?: Array<{
      count?: number;
      name?: string;
      foil?: boolean;
      finishes?: string[];
      number?: string;
      set?: string;
      uuid?: string;
      price?: number;
      ev?: number;
      prices?: {
        tcgplayer?: number;
        cardkingdom?: number;
        cardmarket?: number;
        cardmarketEur?: number;
        all?: number;
      };
    }>;
    deck?: Array<{ name: string; set?: string; foil?: boolean; isFoil?: boolean }>;
    other?: Array<{ count?: number; name?: string; description?: string }>;
    variable?: Array<any>;
  } | null;
  marketPrice: number;
  purchaseUrl?: string;
  priceFetchedAt?: string;
}

// Normalized lookup for preconstructed decks by name and set code
function findPreconDeck(
  preconDecks: Record<string, any>,
  deckName: string,
  setCode?: string
): any {
  if (!deckName || !preconDecks) return undefined;
  const lowerName = deckName.toLowerCase().trim();
  const lowerSet = (setCode || '').toLowerCase().trim();

  // 1. Direct key matches
  if (preconDecks[deckName]) return preconDecks[deckName];
  if (preconDecks[lowerName]) return preconDecks[lowerName];

  // 2. Direct key with set: name___set
  if (lowerSet && preconDecks[`${lowerName}___${lowerSet}`]) {
    return preconDecks[`${lowerName}___${lowerSet}`];
  }

  // 3. Search dictionary by deckName and setCode
  const cleanTarget = lowerName.replace(/[^a-z0-9]/g, '');
  for (const [key, d] of Object.entries(preconDecks)) {
    const dName = (d.deckName || key).toLowerCase().replace(/[^a-z0-9]/g, '');
    const dSet = (d.setCode || '').toLowerCase();

    if (lowerSet && dSet === lowerSet && dName === cleanTarget) {
      return d;
    }
    if (dName === cleanTarget) {
      return d;
    }
  }

  return undefined;
}

export interface ProductHierarchyInspectorProps {
  vendor?: Vendor;
  onVendorChange?: (vendor: Vendor) => void;
  priceMode?: PriceMode;
  onPriceModeChange?: (mode: PriceMode) => void;
}

export const ProductHierarchyInspector: React.FC<ProductHierarchyInspectorProps> = ({
  vendor: externalVendor,
  onVendorChange: externalOnVendorChange,
  priceMode: externalPriceMode,
  onPriceModeChange: externalOnPriceModeChange,
}) => {
  const [internalVendor, setInternalVendor] = useState<Vendor>('all');
  const vendor = externalVendor || internalVendor;
  const onVendorChange = externalOnVendorChange || setInternalVendor;

  const [internalPriceMode, setInternalPriceMode] = useState<PriceMode>('direct');
  const priceMode = externalPriceMode || internalPriceMode;
  const onPriceModeChange = externalOnPriceModeChange || setInternalPriceMode;
  const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;

  const [sealedProducts, setSealedProducts] = useState<SealedProductItem[]>([]);
  const [arbitrageMap, setArbitrageMap] = useState<Record<string, BoxArbitrageRecord>>({});
  const [preconDecks, setPreconDecks] = useState<Record<string, any>>({});
  const [boosterEvMap, setBoosterEvMap] = useState<Record<string, BoosterEVRecord[]>>({});
  const [singleCardPrices, setSingleCardPrices] = useState<{
    byUuid: Record<string, any>;
    byNameSet: Record<string, any>;
    byName: Record<string, any>;
  }>({ byUuid: {}, byNameSet: {}, byName: {} });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal State for full card breakdown
  const [breakdownProduct, setBreakdownProduct] = useState<CatalogPackProduct | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSet, setSelectedSet] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'composite' | 'discrepancy' | 'secret_lair' | 'cases'>('all');
  const [selectedProduct, setSelectedProduct] = useState<SealedProductItem | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [expandedDecks, setExpandedDecks] = useState<Record<string, boolean>>({});
  const [deckCardSearch, setDeckCardSearch] = useState<Record<string, string>>({});
  const [deckCardSort, setDeckCardSort] = useState<Record<string, 'price_desc' | 'price_asc' | 'name'>>({});
  const [expandedAuditDeck, setExpandedAuditDeck] = useState<number | null>(null);
  const [auditDeckSearch, setAuditDeckSearch] = useState<string>('');
  const [auditDeckSort, setAuditDeckSort] = useState<'price_desc' | 'price_asc' | 'name'>('price_desc');
  const [viewMode, setViewMode] = useState<'visual_tree' | 'raw_json'>('visual_tree');

  // Load authoritative data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [products, arbRecords, decks, evs, cardPrices] = await Promise.all([
          dataService.getSealedProducts(),
          dataService.getArbitrageRecords(),
          dataService.getPreconDecks(),
          dataService.getBoosterEVs(),
          dataService.getSingleCardPrices(),
        ]);

        setSealedProducts(products || []);

        const arbMap: Record<string, BoxArbitrageRecord> = {};
        (arbRecords || []).forEach((r) => {
          if (r.productUuid) arbMap[r.productUuid] = r;
        });
        setArbitrageMap(arbMap);
        setPreconDecks(decks || {});
        setBoosterEvMap(evs || {});
        setSingleCardPrices(cardPrices || { byUuid: {}, byNameSet: {}, byName: {} });

        // Initial selection: composite product or first product
        const initialItem = (products || []).find(
          (p: SealedProductItem) => p.contents?.sealed || p.contents?.deck || p.contents?.pack
        ) || (products || [])[0];
        if (initialItem) {
          setSelectedProduct(initialItem);
        }
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load product data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Map for O(1) UUID lookup
  const productMap = useMemo(() => {
    const map: Record<string, SealedProductItem> = {};
    sealedProducts.forEach((p) => {
      const uid = p.id || p.uuid;
      if (uid) map[uid] = p;
    });
    return map;
  }, [sealedProducts]);

  // Unique sets & categories for filtering
  const availableSets = useMemo(() => {
    const sets = new Set<string>();
    sealedProducts.forEach((p) => {
      if (p.setCode) sets.add(p.setCode.toUpperCase());
    });
    return Array.from(sets).sort();
  }, [sealedProducts]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    sealedProducts.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [sealedProducts]);

  // Helper to toggle tree node expansions
  const toggleExpand = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: prev[nodeKey] === undefined ? false : !prev[nodeKey],
    }));
  };

  const toggleDeckExpand = (deckKey: string) => {
    setExpandedDecks((prev) => ({
      ...prev,
      [deckKey]: !prev[deckKey],
    }));
  };

  // Helper to resolve card prices and EV
  const resolveCard = (cd: any, parentSetCode: string, parentProduct?: SealedProductItem) => {
    const name = cd.name || 'Promo Card';
    const normName = name.toLowerCase().trim();
    const setCode = (cd.set || parentSetCode || '').toLowerCase();
    const uuid = cd.uuid || '';

    // Determine finish accurately
    let isFoil = false;
    if (cd.foil === true || cd.isFoil === true) {
      isFoil = true;
    } else if (cd.foil === false || cd.isFoil === false) {
      isFoil = false;
    } else if (Array.isArray(cd.finishes) && cd.finishes.length === 1 && cd.finishes[0] === 'foil') {
      isFoil = true;
    } else if (parentProduct) {
      const pName = (parentProduct.displayName || (parentProduct as any).name || '').toLowerCase();
      const pSub = (parentProduct.subtype || '').toLowerCase();
      if ((pName.includes('foil') || pSub.includes('foil')) && !pName.includes('non-foil') && !pName.includes('non foil')) {
        isFoil = true;
      }
    }

    // Lookup hierarchy: uuid -> name___set -> name_set -> name
    const fromIndex =
      (uuid && singleCardPrices.byUuid[uuid]) ||
      singleCardPrices.byNameSet[`${normName}___${setCode}`] ||
      singleCardPrices.byNameSet[`${normName}_${setCode}`] ||
      singleCardPrices.byName[normName];

    let unitPrice = 0;
    let unitEv = 0;
    let prices = {
      tcgplayer: 0,
      cardkingdom: 0,
      cardmarket: 0,
      cardmarketEur: 0,
      all: 0,
    };
    let isEstimated = false;

    if (fromIndex) {
      if (isFoil) {
        unitPrice =
          fromIndex.foilPrice ||
          fromIndex.prices?.usd_foil ||
          fromIndex.prices?.tcgplayer_foil ||
          (fromIndex.price ? Number((fromIndex.price * 1.5).toFixed(2)) : 0);
        unitEv = fromIndex.foilEv || unitPrice;
      } else {
        unitPrice = fromIndex.price || fromIndex.prices?.usd || fromIndex.prices?.tcgplayer || 0;
        unitEv = fromIndex.ev || fromIndex.price || 0;
      }
      prices = {
        tcgplayer: unitPrice,
        cardkingdom: Number((unitPrice * 1.12).toFixed(2)),
        cardmarket: Number((unitPrice * 0.92).toFixed(2)),
        cardmarketEur: Number((unitPrice * 0.85).toFixed(2)),
        all: unitPrice,
      };
    } else if (cd.prices && cd.prices.tcgplayer) {
      unitPrice = isFoil
        ? Number(cd.prices.tcgplayer_foil || cd.prices.usd_foil || (Number(cd.prices.tcgplayer) * 1.5).toFixed(2))
        : Number(cd.prices.tcgplayer);
      unitEv = Number((unitPrice * 1.04).toFixed(2));
      prices = cd.prices;
    } else if (cd.price) {
      unitPrice = isFoil
        ? Number(cd.foilPrice || (cd.foil ? cd.price : (cd.price * 1.5).toFixed(2)))
        : Number(cd.price);
      unitEv = Number((unitPrice * 1.04).toFixed(2));
      prices = {
        tcgplayer: unitPrice,
        cardkingdom: Number((unitPrice * 1.12).toFixed(2)),
        cardmarket: Number((unitPrice * 0.92).toFixed(2)),
        cardmarketEur: Number((unitPrice * 0.85).toFixed(2)),
        all: unitPrice,
      };
    } else {
      // Unpriced single card in dataset; never divide product market price by cardCount or invent dummy prices
      unitPrice = 0;
      unitEv = 0;
      isEstimated = false;
      prices = {
        tcgplayer: 0,
        cardkingdom: 0,
        cardmarket: 0,
        cardmarketEur: 0,
        all: 0,
      };
    }

    // Resolve EV according to chosen vendor without artificial fee deductions
    const resolvedVendorPrice = resolveCardPrice({ prices, ...fromIndex, ...cd }, vendor, isFoil);
    if (resolvedVendorPrice > 0) {
      unitEv = Number((resolvedVendorPrice * reprintMultiplier).toFixed(2));
    }

    return {
      name,
      number: cd.number || '',
      set: (cd.set || parentSetCode || '').toUpperCase(),
      uuid,
      foil: isFoil,
      isFoil,
      finish: isFoil ? 'Foil' : 'Nonfoil',
      finishes: cd.finishes || (isFoil ? ['foil'] : ['nonfoil']),
      price: unitPrice,
      ev: unitEv,
      prices,
      isEstimated,
    };
  };

  // Helper to resolve pack details and individual pack EV
  const resolvePack = (pk: any, parentSetCode: string) => {
    const pkSet = (pk.set || parentSetCode || '').toUpperCase();
    const pkCode = (pk.code || 'play').toLowerCase();

    // 1. Pack EV from boosterEvMap with vendor and priceMode resolution
    const normVendor = normalizeVendor(vendor);
    const setBoosters = boosterEvMap[pkSet] || [];
    let matchedBooster = findBoosterEv(boosterEvMap, pkSet, pkCode, priceMode, normVendor);

    if (!matchedBooster) {
      matchedBooster = setBoosters.find(
        (b) => b.boosterName.toLowerCase() === pkCode && (b.priceMode === priceMode || b.priceMode === 'direct')
      );
    }
    if (!matchedBooster) {
      matchedBooster = setBoosters.find(
        (b) => b.boosterName.toLowerCase() === pkCode
      );
    }

    // Common alias fallback (e.g. 'draft' vs 'default', 'collector-sample', 'fin-elementals')
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
          // Sample packs typically have 2 cards vs 15 cards (~15-20% value)
          matchedBooster = {
            ...fullCollector,
            evAverage: Number((fullCollector.evAverage * 0.2).toFixed(2)),
            evMid90: Number((fullCollector.evMid90 * 0.2).toFixed(2)),
            evMin: Number((fullCollector.evMin * 0.2).toFixed(2)),
            evMax: Number((fullCollector.evMax * 0.2).toFixed(2)),
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
  };

  // Helper to compute pure Contents EV for any sealed item (without using sub-item market prices)
  const computeProductContentsEv = useCallback(
    (prod: SealedProductItem, multiplier: number = 1): number => {
      const uid = prod.id || prod.uuid || '';
      const directArb = arbitrageMap[uid];
      if (directArb && directArb.totalEvAvg > 0) {
        return Number((directArb.totalEvAvg * reprintMultiplier * multiplier).toFixed(2));
      }
      if (!prod.contents) return 0;

      let total = 0;

      // 1. Contained Packs
      if (prod.contents.pack) {
        prod.contents.pack.forEach((pk) => {
          const count = (pk.count || 1) * multiplier;
          const res = resolvePack(pk, prod.setCode);
          total += count * res.unitEvAvg;
        });
      }

      // 2. Standalone Cards
      if (prod.contents.card) {
        prod.contents.card.forEach((cd) => {
          const count = (cd.count || 1) * multiplier;
          const res = resolveCard(cd, prod.setCode, prod);
          total += count * res.ev;
        });
      }

      // 3. Preconstructed Decks
      if (prod.contents.deck) {
        prod.contents.deck.forEach((dk) => {
          const count = multiplier;
          const matchedDeck = findPreconDeck(preconDecks, dk.name, dk.set || prod.setCode);
          let deckEv = matchedDeck?.totalSinglesEv || 0;
          if (matchedDeck?.cards && matchedDeck.cards.length > 0) {
            const isFoil = Boolean(
              (dk as any).foil ||
              (dk as any).isFoil ||
              matchedDeck?.isFoil ||
              matchedDeck?.foil ||
              (dk.name || '').toLowerCase().includes('foil') ||
              (matchedDeck?.deckName || '').toLowerCase().includes('foil') ||
              ((prod.displayName || (prod as any).name || '').toLowerCase().includes('foil') &&
               !(prod.displayName || (prod as any).name || '').toLowerCase().includes('non-foil'))
            );
            const cardSum = matchedDeck.cards.reduce((sum: number, c: any) => {
              const cardFoil = Boolean(c.foil || c.isFoil || isFoil);
              let price = c.price || 0;
              if (cardFoil) {
                const fromIdx =
                  (c.uuid && singleCardPrices.byUuid[c.uuid]) ||
                  singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}___${(c.set || dk.set || prod.setCode).toLowerCase()}`] ||
                  singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}_${(c.set || dk.set || prod.setCode).toLowerCase()}`] ||
                  singleCardPrices.byName[(c.name || '').toLowerCase()];
                if (fromIdx?.foilPrice) price = fromIdx.foilPrice;
                else if (c.foilPrice) price = c.foilPrice;
                else if (price > 0 && !c.foil) price = Number((price * 1.5).toFixed(2));
              }
              const cardPrice = Number((price * reprintMultiplier).toFixed(2));
              return sum + cardPrice * (c.count || 1);
            }, 0);
            if (cardSum > 0) {
              deckEv = cardSum;
            } else if (deckEv > 0 && priceMode === 'cheapest_reprint') {
              deckEv = Number((deckEv * reprintMultiplier).toFixed(2));
            }
          }
          total += count * deckEv;
        });
      }

      // 4. Variable Slots
      if (prod.contents.variable) {
        prod.contents.variable.forEach((vSlot: any) => {
          const configs = vSlot.configs || [];
          const totalWeight = configs.reduce(
            (sum: number, c: any) => sum + (c.variable_config?.[0]?.chance || 1),
            0
          );
          configs.forEach((cfg: any) => {
            const vc = cfg.variable_config?.[0] || { chance: 1, weight: totalWeight || 1 };
            const chance = vc.chance || 1;
            const weight = vc.weight || totalWeight || 1;
            const prob = weight > 0 ? chance / weight : 0;

            let cfgEv = 0;
            if (cfg.card) {
              cfg.card.forEach((cd: any) => {
                const res = resolveCard(cd, prod.setCode, prod);
                cfgEv += (cd.count || 1) * res.ev;
              });
            }
            if (cfg.pack) {
              cfg.pack.forEach((pk: any) => {
                const res = resolvePack(pk, prod.setCode);
                cfgEv += (pk.count || 1) * res.unitEvAvg;
              });
            }
            if (cfg.deck) {
              cfg.deck.forEach((dk: any) => {
                const matched = findPreconDeck(preconDecks, dk.name, dk.set || prod.setCode);
                cfgEv += (matched?.totalSinglesEv || 0) * reprintMultiplier;
              });
            }
            total += prob * cfgEv * multiplier;
          });
        });
      }

      // 5. Sealed Subproducts (recursive)
      if (prod.contents.sealed) {
        prod.contents.sealed.forEach((sub) => {
          const subCount = (sub.count || 1) * multiplier;
          const childProd = sub.uuid ? productMap[sub.uuid] : null;
          if (childProd) {
            total += computeProductContentsEv(childProd, subCount);
          }
        });
      }

      return Number(total.toFixed(2));
    },
    [arbitrageMap, preconDecks, productMap, singleCardPrices, boosterEvMap, vendor, priceMode, reprintMultiplier]
  );

  // Filter products
  const filteredProducts = useMemo(() => {
    return sealedProducts.filter((p) => {
      const name = (p.displayName || '').toLowerCase();
      const code = (p.setCode || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const sub = (p.subtype || '').toLowerCase();
      const uid = (p.id || p.uuid || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      // Search match
      if (q && !name.includes(q) && !code.includes(q) && !cat.includes(q) && !sub.includes(q) && !uid.includes(q)) {
        return false;
      }

      // Set filter
      if (selectedSet !== 'all' && code !== selectedSet.toLowerCase()) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && cat !== selectedCategory.toLowerCase()) {
        return false;
      }

      // Mode filter
      if (filterMode === 'composite') {
        return Boolean(p.contents?.sealed && p.contents.sealed.length > 0);
      }
      if (filterMode === 'secret_lair') {
        return code === 'sld' || sub.includes('secret_lair') || name.includes('secret lair');
      }
      if (filterMode === 'cases') {
        return cat.includes('case') || name.includes('case');
      }

      return true;
    });
  }, [sealedProducts, selectedSet, selectedCategory, filterMode, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = sealedProducts.length;
    let compositeCount = 0;
    let sldCount = 0;
    let casesCount = 0;
    let withContentsCount = 0;

    sealedProducts.forEach((p) => {
      if (p.contents && Object.keys(p.contents).length > 0) withContentsCount++;
      if (p.contents?.sealed && p.contents.sealed.length > 0) compositeCount++;
      if ((p.setCode || '').toLowerCase() === 'sld' || (p.subtype || '').includes('secret_lair')) sldCount++;
      if ((p.category || '').includes('case') || (p.displayName || '').toLowerCase().includes('case')) casesCount++;
    });

    return {
      total,
      withContentsCount,
      compositeCount,
      sldCount,
      casesCount,
    };
  }, [sealedProducts]);

  // Comprehensive Product Math Decomposition for Selected Product
  const productAudit = useMemo(() => {
    if (!selectedProduct) return null;

    const uid = selectedProduct.id || selectedProduct.uuid || '';
    const arb = arbitrageMap[uid];
    const parentSet = selectedProduct.setCode || '';

    // 1. Pack items breakdown (Subitems only have EV contribution)
    const packItems: Array<{
      packName: string;
      code: string;
      set: string;
      count: number;
      unitEv: number;
      unitMid90: number;
      subtotalEv: number;
    }> = [];

    if (selectedProduct.contents?.pack) {
      selectedProduct.contents.pack.forEach((pk) => {
        const count = pk.count || 1;
        const res = resolvePack(pk, parentSet);
        packItems.push({
          packName: `${res.boosterCode.toUpperCase()} Booster Pack`,
          code: res.boosterCode,
          set: res.setCode,
          count,
          unitEv: res.unitEvAvg,
          unitMid90: res.unitEvMid90,
          subtotalEv: Number((count * res.unitEvAvg).toFixed(2)),
        });
      });
    }

    // 2. Card items breakdown (Singles EV contribution)
    const cardItems: Array<{
      name: string;
      number: string;
      set: string;
      foil: boolean;
      count: number;
      unitEv: number;
      subtotalEv: number;
      prices: any;
      isEstimated: boolean;
    }> = [];

    if (selectedProduct.contents?.card) {
      selectedProduct.contents.card.forEach((cd) => {
        const count = cd.count || 1;
        const res = resolveCard(cd, parentSet, selectedProduct);
        cardItems.push({
          name: res.name,
          number: res.number,
          set: res.set,
          foil: res.foil,
          count,
          unitEv: res.ev,
          subtotalEv: Number((count * res.ev).toFixed(2)),
          prices: res.prices,
          isEstimated: res.isEstimated,
        });
      });
    }

    // 3. Sealed sub-products breakdown (EV contribution)
    const sealedItems: Array<{
      name: string;
      count: number;
      set: string;
      uuid?: string;
      unitEv: number;
      subtotalEv: number;
    }> = [];

    if (selectedProduct.contents?.sealed) {
      selectedProduct.contents.sealed.forEach((sub) => {
        const count = sub.count || 1;
        const childProd = sub.uuid ? productMap[sub.uuid] : null;
        const childArb = sub.uuid ? arbitrageMap[sub.uuid] : null;

        let unitEv = 0;
        if (childArb && childArb.totalEvAvg > 0) {
          unitEv = Number((childArb.totalEvAvg * reprintMultiplier).toFixed(2));
        } else if (childProd) {
          unitEv = computeProductContentsEv(childProd);
        }

        sealedItems.push({
          name: sub.name,
          count,
          set: (sub.set || '').toUpperCase(),
          uuid: sub.uuid,
          unitEv: unitEv,
          subtotalEv: Number((count * unitEv).toFixed(2)),
        });
      });
    }

    // 4. Deck items breakdown (Singles EV contribution)
    const deckItems: Array<{
      name: string;
      set: string;
      count: number;
      cardCount: number;
      isFoil: boolean;
      finish: 'Foil' | 'Nonfoil';
      unitSinglesEv: number;
      subtotalSinglesEv: number;
      cards?: any[];
    }> = [];

    if (selectedProduct.contents?.deck) {
      selectedProduct.contents.deck.forEach((dk) => {
        const matchedDeck = findPreconDeck(preconDecks, dk.name, dk.set || parentSet);
        const count = 1;
        const isCommander = Boolean(
          (selectedProduct.subtype || '').toLowerCase().includes('commander') ||
          (selectedProduct.category || '').toLowerCase().includes('commander') ||
          (selectedProduct.displayName || (selectedProduct as any).name || '').toLowerCase().includes('commander') ||
          (dk.name || '').toLowerCase().includes('commander')
        );
        const defaultCardCount = isCommander ? 100 : (selectedProduct.cardCount || 60);
        const cardCount = matchedDeck?.cardCount || (matchedDeck?.cards ? matchedDeck.cards.length : defaultCardCount);

        // Check if deck or parent product is Foil Edition
        const isFoil = Boolean(
          (dk as any).foil ||
          (dk as any).isFoil ||
          matchedDeck?.isFoil ||
          matchedDeck?.foil ||
          (dk.name || '').toLowerCase().includes('foil') ||
          (matchedDeck?.deckName || '').toLowerCase().includes('foil') ||
          ((selectedProduct.displayName || (selectedProduct as any).name || '').toLowerCase().includes('foil') &&
           !(selectedProduct.displayName || (selectedProduct as any).name || '').toLowerCase().includes('non-foil'))
        );

        const rawCards = matchedDeck?.cards || [];
        const cards = rawCards.map((c: any) => {
          const cardFoil = Boolean(c.foil || c.isFoil || isFoil);
          let price = c.price || 0;
          if (cardFoil) {
            const fromIdx =
              (c.uuid && singleCardPrices.byUuid[c.uuid]) ||
              singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}___${(c.set || dk.set || parentSet).toLowerCase()}`] ||
              singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}_${(c.set || dk.set || parentSet).toLowerCase()}`] ||
              singleCardPrices.byName[(c.name || '').toLowerCase()];

            if (fromIdx?.foilPrice) {
              price = fromIdx.foilPrice;
            } else if (c.foilPrice) {
              price = c.foilPrice;
            } else if (c.prices?.usd_foil) {
              price = Number(c.prices.usd_foil);
            } else if (!c.foil && price > 0) {
              price = Number((price * 1.5).toFixed(2));
            }
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

        let singlesEv = matchedDeck?.totalSinglesEv || 0;
        if (priceMode === 'cheapest_reprint' && singlesEv > 0) {
          singlesEv = Number((singlesEv * reprintMultiplier).toFixed(2));
        }
        if (cards.length > 0) {
          const calculatedCardSum = Number(
            cards.reduce((sum: number, c: any) => sum + (c.totalPrice || c.price || 0), 0).toFixed(2)
          );
          if (calculatedCardSum > 0) {
            singlesEv = calculatedCardSum;
          }
        }

        deckItems.push({
          name: dk.name,
          set: (dk.set || parentSet).toUpperCase(),
          count,
          cardCount,
          isFoil,
          finish: isFoil ? 'Foil' : 'Nonfoil',
          unitSinglesEv: singlesEv,
          subtotalSinglesEv: Number((count * singlesEv).toFixed(2)),
          cards,
        });
      });
    }

    // 5. Variable / Probabilistic Slots breakdown (Expected Value contribution)
    const variableItems: Array<{
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
    }> = [];

    if (selectedProduct.contents?.variable) {
      selectedProduct.contents.variable.forEach((vSlot: any, sIdx: number) => {
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

          const items: Array<{
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
              const res = resolveCard(cd, selectedProduct.setCode, selectedProduct);
              const count = cd.count || 1;
              configEv += count * res.ev;
              items.push({
                type: 'card',
                name: res.name,
                count,
                foil: res.foil,
                set: res.set,
                priceOrEv: res.ev,
                uuid: res.uuid,
              });
            });
          }

          if (cfg.pack) {
            cfg.pack.forEach((pk: any) => {
              const res = resolvePack(pk, selectedProduct.setCode);
              const count = pk.count || 1;
              configEv += count * res.unitEvAvg;
              items.push({
                type: 'pack',
                name: `${res.boosterCode} Booster Pack`,
                count,
                set: res.setCode,
                priceOrEv: res.unitEvAvg,
              });
            });
          }

          if (cfg.deck) {
            cfg.deck.forEach((dk: any) => {
              const matched = findPreconDeck(preconDecks, dk.name, dk.set || selectedProduct.setCode);
              const dEv = (matched?.totalSinglesEv || 0) * reprintMultiplier;
              configEv += dEv;
              items.push({
                type: 'deck',
                name: dk.name,
                count: 1,
                set: (dk.set || selectedProduct.setCode).toUpperCase(),
                priceOrEv: dEv,
              });
            });
          }

          const weightedEv = Number((prob * configEv).toFixed(2));
          const desc = items.map((it) => `${it.count > 1 ? `${it.count}x ` : ''}${it.name}`).join(' + ');

          return {
            chance,
            weight,
            probabilityPct,
            description: desc || 'Variable Option',
            items,
            configEv: Number(configEv.toFixed(2)),
            weightedEv,
          };
        });

        const slotEv = Number(parsedConfigs.reduce((acc: number, c: any) => acc + c.weightedEv, 0).toFixed(2));

        variableItems.push({
          slotIndex: sIdx + 1,
          configs: parsedConfigs,
          slotEv,
        });
      });
    }

    // 6. Accessories & Non-Card Inclusions (dice, deck boxes, spindowns, tokens, counters) - $0.00 EV
    const otherItems: Array<{
      name: string;
      count: number;
      category: string;
      ev: number;
    }> = [];

    if (selectedProduct.contents?.other) {
      selectedProduct.contents.other.forEach((ot: any) => {
        const name = ot.name || 'Accessory / Inclusion';
        const isDice = name.toLowerCase().includes('dice') || name.toLowerCase().includes('spindown');
        const isBox = name.toLowerCase().includes('deck box') || name.toLowerCase().includes('box');
        const isToken = name.toLowerCase().includes('token');
        const isCounter = name.toLowerCase().includes('counter');

        otherItems.push({
          name,
          count: ot.count || 1,
          category: isBox ? 'Cardboard Deck Box' : isDice ? 'Life Counter / Spindown' : isToken ? 'Tokens' : isCounter ? 'Counters' : 'Physical Accessory',
          ev: 0,
        });
      });
    }

    // Sums: Only EV applies to subitems; market price applies to the top product
    const totalPackEv = packItems.reduce((acc, p) => acc + p.subtotalEv, 0);
    const totalCardsEv = cardItems.reduce((acc, c) => acc + c.subtotalEv, 0);
    const totalSealedEv = sealedItems.reduce((acc, s) => acc + s.subtotalEv, 0);
    const totalDeckEv = deckItems.reduce((acc, d) => acc + d.subtotalSinglesEv, 0);
    const totalVariableEv = Number(variableItems.reduce((acc, v) => acc + v.slotEv, 0).toFixed(2));

    const calculatedTotalEv = Number((totalPackEv + totalCardsEv + totalSealedEv + totalDeckEv + totalVariableEv).toFixed(2));
    const statedMarketPrice = selectedProduct.marketPrice || 0;
    const hasCalculatedEv = (arb && arb.totalEvAvg > 0) || calculatedTotalEv > 0;
    const finalEv = arb && arb.totalEvAvg > 0 ? Number((arb.totalEvAvg * reprintMultiplier).toFixed(2)) : calculatedTotalEv;
    const netSpread = hasCalculatedEv ? Number((finalEv - statedMarketPrice).toFixed(2)) : 0;
    const roiPct = (hasCalculatedEv && statedMarketPrice > 0) ? Number(((netSpread / statedMarketPrice) * 100).toFixed(1)) : 0;

    return {
      packItems,
      cardItems,
      sealedItems,
      deckItems,
      variableItems,
      otherItems,
      totalPackEv,
      totalCardsEv,
      totalSealedEv,
      totalDeckEv,
      totalVariableEv,
      calculatedTotalEv,
      statedMarketPrice,
      hasCalculatedEv,
      finalEv,
      netSpread,
      roiPct,
    };
  }, [selectedProduct, arbitrageMap, productMap, preconDecks, boosterEvMap, singleCardPrices, computeProductContentsEv, vendor, priceMode, reprintMultiplier]);

  // Recursive Tree Node Renderer for Product Contents
  const renderProductTree = (
    item: SealedProductItem,
    multiplier: number = 1,
    depth: number = 0,
    parentKey: string = 'root'
  ) => {
    const currentUid = item.id || item.uuid || '';
    const arb = arbitrageMap[currentUid];
    const nodeKey = `${parentKey}-${currentUid}-${depth}`;
    const isExpanded = expandedNodes[nodeKey] !== false;

    const hasSealedChildren = Boolean(item.contents?.sealed && item.contents.sealed.length > 0);
    const hasPacks = Boolean(item.contents?.pack && item.contents.pack.length > 0);
    const hasCards = Boolean(item.contents?.card && item.contents.card.length > 0);
    const hasDecks = Boolean(item.contents?.deck && item.contents.deck.length > 0);
    const hasVariables = Boolean(item.contents?.variable && item.contents.variable.length > 0);
    const hasOther = Boolean(item.contents?.other && item.contents.other.length > 0);
    const hasAnyContent = hasSealedChildren || hasPacks || hasCards || hasDecks || hasVariables || hasOther;

    const nodeContentsEv = arb && arb.totalEvAvg > 0 ? arb.totalEvAvg * multiplier : computeProductContentsEv(item, multiplier);

    return (
      <div key={nodeKey} className="space-y-3">
        {/* Node Card */}
        <div
          className={`rounded-2xl border transition-all ${
            depth === 0
              ? 'bg-slate-900 border-slate-700 text-white p-5 shadow-lg'
              : 'bg-white border-slate-200 text-slate-900 p-4 shadow-sm'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {hasAnyContent ? (
                <button
                  onClick={() => toggleExpand(nodeKey)}
                  className={`mt-0.5 p-1 rounded-lg transition cursor-pointer ${
                    depth === 0 ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <div className="mt-1 w-4 h-4 flex items-center justify-center">
                  <div className={`w-1.5 h-1.5 rounded-full ${depth === 0 ? 'bg-amber-400' : 'bg-slate-400'}`} />
                </div>
              )}

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                      depth === 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.setCode?.toUpperCase()}
                  </span>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded capitalize ${
                      depth === 0 ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.category?.replace(/_/g, ' ') || 'product'}
                  </span>
                  {item.subtype && (
                    <span
                      className={`font-mono text-[11px] px-2 py-0.5 rounded capitalize ${
                        depth === 0 ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {item.subtype?.replace(/_/g, ' ')}
                    </span>
                  )}
                  {multiplier > 1 && (
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      ×{multiplier} Multiplier
                    </span>
                  )}
                </div>

                <div className="font-bold text-base sm:text-lg flex items-center gap-2">
                  <span>{item.displayName}</span>
                  {item.purchaseUrl && (
                    <a
                      href={item.purchaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-amber-400 transition"
                      title="View on TCGplayer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className={`text-xs font-mono ${depth === 0 ? 'text-slate-400' : 'text-slate-500'}`}>
                  UUID: <span className="select-all">{currentUid}</span>
                </div>
              </div>
            </div>

            {/* Metrics Breakdown Pill */}
            <div className="flex flex-wrap items-center gap-3">
              {depth === 0 && (
                <div className="px-3 py-2 rounded-xl text-xs flex flex-col bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Product Market Price</span>
                  <span className="font-bold font-mono text-sm text-emerald-400">
                    ${Number(item.marketPrice || 0).toFixed(2)}
                  </span>
                </div>
              )}

              {nodeContentsEv > 0 && (
                <div
                  className={`px-3 py-2 rounded-xl text-xs flex flex-col ${
                    depth === 0 ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-200'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    {depth === 0 ? 'Aggregated Contents EV' : 'Contents EV Contribution'}
                  </span>
                  <span className="font-bold font-mono text-sm text-amber-400">
                    ${nodeContentsEv.toFixed(2)}
                  </span>
                </div>
              )}

              <div
                className={`px-3 py-2 rounded-xl text-xs flex flex-col ${
                  depth === 0 ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-200'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400">Composition</span>
                <span className="font-bold font-mono text-xs">
                  {item.contents ? (
                    <>
                      {[
                        item.contents.deck?.length ? `${item.contents.deck.length * multiplier} Decks` : null,
                        item.contents.pack?.length ? `${item.contents.pack.reduce((a, p) => a + (p.count || 1), 0) * multiplier} Packs` : null,
                        item.contents.card?.length ? `${item.contents.card.reduce((a, c) => a + (c.count || 1), 0) * multiplier} Cards` : null,
                        item.contents.other?.length ? `${item.contents.other.length * multiplier} Accessories` : null,
                        item.contents.variable?.length ? `${item.contents.variable.length * multiplier} Variable Bonus Slots` : null,
                        item.contents.sealed?.length ? `${item.contents.sealed.reduce((a, s) => a + (s.count || 1), 0) * multiplier} Sealed Units` : null,
                      ].filter(Boolean).join(' • ') || (arb ? `${arb.packCount * multiplier} Packs` : 'Direct Item')}
                    </>
                  ) : arb ? (
                    <>
                      {arb.packCount * multiplier} Packs
                    </>
                  ) : (
                    'Direct Leaf Item'
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nested Sub-Item Hierarchy (Children) */}
        {hasAnyContent && isExpanded && (
          <div className="pl-4 sm:pl-6 border-l-2 border-slate-200 dark:border-slate-800 ml-3 sm:ml-4 space-y-3">
            {/* 1. Nested Sealed Products */}
            {hasSealedChildren &&
              item.contents!.sealed!.map((sub, idx) => {
                const childUid = sub.uuid;
                const childProd = childUid ? productMap[childUid] : null;
                const subCount = sub.count || 1;

                if (childProd) {
                  return renderProductTree(childProd, multiplier * subCount, depth + 1, `${nodeKey}-sealed-${idx}`);
                }

                // Leaf Sealed Item if UUID not in map
                return (
                  <div
                    key={`${nodeKey}-sealed-unmapped-${idx}`}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-indigo-500" />
                      <span className="font-bold">{sub.name}</span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-mono font-bold">
                        ×{subCount * multiplier}
                      </span>
                    </div>
                    <span className="text-slate-500 font-mono text-[11px]">Set: {sub.set?.toUpperCase()}</span>
                  </div>
                );
              })}

            {/* 2. Direct Booster Packs with Per-Pack EV */}
            {hasPacks && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-500" />
                    <span>Contained Booster Packs ({item.contents!.pack!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">
                    Booster pack EV contribution
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {item.contents!.pack!.map((pk, idx) => {
                    const count = (pk.count || 1) * multiplier;
                    const res = resolvePack(pk, item.setCode);
                    const subtotalEv = Number((count * res.unitEvAvg).toFixed(2));

                    return (
                      <div
                        key={`${nodeKey}-pack-${idx}`}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              {res.setCode}
                            </span>
                            <span className="font-bold text-slate-900 text-sm capitalize">
                              {res.boosterCode.replace(/-/g, ' ')} Booster Pack
                            </span>
                          </div>
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-mono font-black text-xs self-start sm:self-auto">
                            ×{count} {count === 1 ? 'Pack' : 'Packs'}
                            {multiplier > 1 && ` (${pk.count || 1} × ${multiplier})`}
                          </span>
                        </div>

                        {/* Pack Metrics Row: EV per pack and Total EV Contribution (No subitem market prices) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Pack EV (Single)</div>
                            <div className="font-mono font-bold text-amber-600 text-xs sm:text-sm">
                              ${res.unitEvAvg.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono">Mid90: ${res.unitEvMid90.toFixed(2)}</div>
                          </div>

                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">EV Range (Min – Max)</div>
                            <div className="font-mono font-bold text-slate-700 text-xs sm:text-sm">
                              ${res.unitEvMin.toFixed(2)} – ${res.unitEvMax.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400">Simulation envelope</div>
                          </div>

                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Total EV Contribution ({count}×)</div>
                            <div className="font-mono font-black text-indigo-600 text-xs sm:text-sm">
                              ${subtotalEv.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono">{count} × ${res.unitEvAvg.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Direct Cards & Promos with Full Prices and EV Breakdown */}
            {hasCards && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span>Standalone Cards & Promos ({item.contents!.card!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">
                    Singles market price & EV realization
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {item.contents!.card!.map((cd, idx) => {
                    const count = (cd.count || 1) * multiplier;
                    const res = resolveCard(cd, item.setCode, item);
                    const subtotalEv = Number((count * res.ev).toFixed(2));

                    return (
                      <div
                        key={`${nodeKey}-card-${idx}`}
                        className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{res.name}</span>
                            {res.number && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                #{res.number}
                              </span>
                            )}
                            {res.foil ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                                ✨ Foil
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                Non-Foil
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-slate-400">Set: {res.set}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                            <span>TCG: ${res.prices.tcgplayer?.toFixed(2) || res.price.toFixed(2)}</span>
                            <span>•</span>
                            <span>CK: ${res.prices.cardkingdom?.toFixed(2) || (res.price * 1.12).toFixed(2)}</span>
                            <span>•</span>
                            <span>CM: €{res.prices.cardmarketEur?.toFixed(2) || (res.price * 0.85).toFixed(2)}</span>
                            {res.isEstimated && (
                              <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                allocated share
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-right self-end sm:self-center shrink-0">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Singles EV</span>
                            <span className="font-mono font-bold text-amber-600 text-sm">
                              ${subtotalEv.toFixed(2)}
                              {count > 1 && (
                                <span className="text-[10px] text-slate-400 font-normal ml-1">
                                  (${res.ev.toFixed(2)} ea)
                                </span>
                              )}
                            </span>
                          </div>

                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-mono font-bold text-xs shrink-0">
                            ×{count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cards Summary Banner */}
                {(() => {
                  const totalCount = item.contents!.card!.reduce((acc, c) => acc + (c.count || 1) * multiplier, 0);
                  const totalEv = item.contents!.card!.reduce((acc, c) => {
                    const r = resolveCard(c, item.setCode, item);
                    return acc + (c.count || 1) * multiplier * r.ev;
                  }, 0);

                  return (
                    <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs font-mono flex flex-wrap items-center justify-between gap-2 text-emerald-950">
                      <span>Total Standalone Singles: <strong>{totalCount} Cards</strong></span>
                      <span>Total Singles EV Contribution: <strong>${totalEv.toFixed(2)}</strong></span>
                      <span>Avg Singles EV: <strong>${(totalEv / totalCount).toFixed(2)} / card</strong></span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 4. Preconstructed Decks with Card Inspection */}
            {hasDecks && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-500" />
                    <span>Preconstructed Decks ({item.contents!.deck!.length})</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {item.contents!.deck!.map((dk, idx) => {
                    const matchedDeck = findPreconDeck(preconDecks, dk.name, dk.set || item.setCode);
                    const deckKey = `${nodeKey}-deck-${idx}`;
                    const isDeckOpen = expandedDecks[deckKey];
                    const isDeckFoil = Boolean(
                      (dk as any).foil ||
                      (dk as any).isFoil ||
                      matchedDeck?.isFoil ||
                      matchedDeck?.foil ||
                      (dk.name || '').toLowerCase().includes('foil') ||
                      (matchedDeck?.deckName || '').toLowerCase().includes('foil') ||
                      ((item.displayName || (item as any).name || '').toLowerCase().includes('foil') &&
                       !(item.displayName || (item as any).name || '').toLowerCase().includes('non-foil'))
                    );
                    const rawCards: any[] = matchedDeck?.cards || [];
                    const cards = rawCards.map((c: any) => {
                      const cardFoil = Boolean(c.foil || c.isFoil || isDeckFoil);
                      let price = c.price || 0;
                      if (cardFoil) {
                        const fromIdx =
                          (c.uuid && singleCardPrices.byUuid[c.uuid]) ||
                          singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}___${(c.set || dk.set || item.setCode).toLowerCase()}`] ||
                          singleCardPrices.byNameSet[`${(c.name || '').toLowerCase()}_${(c.set || dk.set || item.setCode).toLowerCase()}`] ||
                          singleCardPrices.byName[(c.name || '').toLowerCase()];
                        if (fromIdx?.foilPrice) {
                          price = fromIdx.foilPrice;
                        } else if (c.foilPrice) {
                          price = c.foilPrice;
                        } else if (c.prices?.usd_foil) {
                          price = Number(c.prices.usd_foil);
                        } else if (!c.foil && price > 0) {
                          price = Number((price * 1.5).toFixed(2));
                        }
                      }
                      return {
                        ...c,
                        foil: cardFoil,
                        isFoil: cardFoil,
                        finish: cardFoil ? 'Foil' : 'Nonfoil',
                        price,
                        totalPrice: Number((price * (c.count || 1)).toFixed(2)),
                      };
                    });
                    const isCommander = Boolean(
                      (item.subtype || '').toLowerCase().includes('commander') ||
                      (item.category || '').toLowerCase().includes('commander') ||
                      (item.displayName || (item as any).name || '').toLowerCase().includes('commander') ||
                      (dk.name || '').toLowerCase().includes('commander')
                    );
                    const defaultCards = isCommander ? 100 : (item.cardCount || 60);
                    const deckCardCount = matchedDeck?.cardCount || (cards.length > 0 ? cards.reduce((a: number, c: any) => a + (c.count || 1), 0) : defaultCards);
                    const deckSinglesEv = cards.length > 0
                      ? Number(cards.reduce((sum: number, c: any) => sum + (c.totalPrice || c.price || 0), 0).toFixed(2))
                      : (matchedDeck?.totalSinglesEv || 0);

                    // Filter and sort cards for this deck
                    const searchTerm = (deckCardSearch[deckKey] || '').toLowerCase().trim();
                    const sortOrder = deckCardSort[deckKey] || 'price_desc';
                    const filteredCards = cards.filter((c: any) =>
                      !searchTerm || (c.name || '').toLowerCase().includes(searchTerm) || (c.type || '').toLowerCase().includes(searchTerm)
                    );
                    const sortedCards = [...filteredCards].sort((a: any, b: any) => {
                      if (sortOrder === 'price_desc') return (b.totalPrice || b.price || 0) - (a.totalPrice || a.price || 0);
                      if (sortOrder === 'price_asc') return (a.totalPrice || a.price || 0) - (b.totalPrice || b.price || 0);
                      return (a.name || '').localeCompare(b.name || '');
                    });

                    // Top 3 chase cards
                    const topChaseCards = [...cards].sort((a: any, b: any) => (b.price || 0) - (a.price || 0)).slice(0, 3);

                    return (
                      <div
                        key={deckKey}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{dk.name}</span>
                              {isDeckFoil ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                  ★ Foil Edition
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                  Nonfoil
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Set: {(dk.set || item.setCode).toUpperCase()} • {deckCardCount} Cards
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {deckSinglesEv > 0 ? (
                              <div className="text-right">
                                <div className="text-[10px] uppercase font-bold text-slate-400">Total Singles EV</div>
                                <div className="text-xs font-mono text-emerald-600 font-bold">
                                  ${deckSinglesEv.toFixed(2)}
                                </div>
                              </div>
                            ) : null}

                            {cards.length > 0 && (
                              <button
                                onClick={() => toggleDeckExpand(deckKey)}
                                className="px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              >
                                {isDeckOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span>{isDeckOpen ? 'Hide Cards' : `Inspect ${cards.length} Cards`}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Deck Cards Drawer */}
                        {isDeckOpen && cards.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-2.5">
                            {/* Key Chase Cards Pill Row */}
                            {topChaseCards.length > 0 && topChaseCards[0]?.price > 0 && (
                              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                                  Top Value Singles:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {topChaseCards.map((tc, tcIdx) => (
                                    <div
                                      key={tcIdx}
                                      className="text-[11px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1.5 shadow-2xs"
                                    >
                                      <span className="font-medium text-slate-800">{tc.name}</span>
                                      <span className="font-bold text-emerald-600">${Number(tc.price || 0).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Search & Sort Toolbar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="relative flex-1">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="text"
                                  placeholder="Search deck cards..."
                                  value={deckCardSearch[deckKey] || ''}
                                  onChange={(e) => setDeckCardSearch((prev) => ({ ...prev, [deckKey]: e.target.value }))}
                                  className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-purple-400"
                                />
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] text-slate-400 font-mono">Sort:</span>
                                <select
                                  value={sortOrder}
                                  onChange={(e) => setDeckCardSort((prev) => ({ ...prev, [deckKey]: e.target.value as any }))}
                                  className="bg-slate-50 border border-slate-200 rounded-lg text-xs py-1 px-2 focus:outline-hidden"
                                >
                                  <option value="price_desc">Highest Price First</option>
                                  <option value="price_asc">Lowest Price First</option>
                                  <option value="name">Alphabetical (A-Z)</option>
                                </select>
                              </div>
                            </div>

                            <div className="text-xs font-bold text-slate-600 flex items-center justify-between">
                              <span>Deck Card List ({sortedCards.length} of {cards.length})</span>
                              <span className="font-mono text-slate-500 text-[11px]">
                                Combined Value: ${deckSinglesEv.toFixed(2)}
                              </span>
                            </div>

                            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
                              {sortedCards.map((c, cIdx) => (
                                <div key={cIdx} className="p-2 flex items-center justify-between text-xs hover:bg-slate-100/70 transition">
                                  <div className="flex items-center gap-2 truncate pr-2 min-w-0">
                                    <span className="font-mono font-bold text-slate-500 shrink-0">{c.count || 1}×</span>
                                    <span className="font-medium text-slate-900 truncate" title={c.name}>{c.name}</span>
                                    {c.number && (
                                      <span className="text-[10px] text-slate-400 font-mono shrink-0">#{c.number}</span>
                                    )}
                                    {c.rarity && (
                                      <span className="text-[9px] uppercase font-bold text-slate-400 shrink-0">
                                        {c.rarity.charAt(0)}
                                      </span>
                                    )}
                                    {c.foil ? (
                                      <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold border border-amber-300 shrink-0">
                                        ★ Foil
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-bold text-emerald-600">
                                      ${Number(c.price || c.totalPrice || 0).toFixed(2)}
                                    </span>
                                    {(c.count || 1) > 1 && (
                                      <span className="text-[10px] font-mono text-slate-400 block">
                                        (${Number(c.price || 0).toFixed(2)} ea)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Variable / Probabilistic Slots with Odds Breakdown */}
            {hasVariables && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎲</span>
                    <span>Variable / Probabilistic Slots ({item.contents!.variable!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">
                    weighted pull odds & lottery chase EV
                  </span>
                </div>

                <div className="space-y-3">
                  {item.contents!.variable!.map((vSlot: any, slotIdx: number) => {
                    const configs = vSlot.configs || [];
                    const totalWeight = configs.reduce(
                      (sum: number, c: any) => sum + (c.variable_config?.[0]?.chance || 1),
                      0
                    );

                    let slotWeightedEv = 0;

                    return (
                      <div
                        key={`${nodeKey}-var-${slotIdx}`}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              Slot #{slotIdx + 1}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              Secret Lair Bonus / Lottery Slot ({configs.length} Possibilities)
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">
                            Mutually Exclusive Pulls
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {configs.map((cfg: any, cfgIdx: number) => {
                            const vc = cfg.variable_config?.[0] || { chance: 1, weight: totalWeight || 1 };
                            const chance = vc.chance || 1;
                            const weight = vc.weight || totalWeight || 1;
                            const prob = weight > 0 ? chance / weight : 0;
                            const probPct = (prob * 100).toFixed(2);
                            const isRareChase = prob < 0.05;

                            let cfgEv = 0;
                            const cardItems = (cfg.card || []).map((cd: any) => {
                              const res = resolveCard(cd, item.setCode, item);
                              const count = (cd.count || 1) * multiplier;
                              cfgEv += count * res.ev;
                              return { ...res, count };
                            });

                            const packItems = (cfg.pack || []).map((pk: any) => {
                              const res = resolvePack(pk, item.setCode);
                              const count = (pk.count || 1) * multiplier;
                              cfgEv += count * res.unitEvAvg;
                              return { ...res, count };
                            });

                            const deckItems = (cfg.deck || []).map((dk: any) => {
                              const matched = findPreconDeck(preconDecks, dk.name, dk.set || item.setCode);
                              const dEv = matched?.totalSinglesEv || 0;
                              cfgEv += dEv * multiplier;
                              return { name: dk.name, set: (dk.set || item.setCode).toUpperCase(), ev: dEv };
                            });

                            const weightedEv = Number((prob * cfgEv).toFixed(2));
                            slotWeightedEv += weightedEv;

                            return (
                              <div
                                key={`${nodeKey}-var-${slotIdx}-cfg-${cfgIdx}`}
                                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                  isRareChase
                                    ? 'bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/5 border-amber-300 shadow-2xs'
                                    : 'bg-slate-50/70 border-slate-200'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-mono text-xs font-black border ${
                                        isRareChase
                                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      }`}
                                    >
                                      {probPct}% ({chance}/{weight})
                                    </span>
                                    {isRareChase && (
                                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400 text-amber-950">
                                        ★ Rare Lottery Chase (1 in {Math.round(weight / chance)})
                                      </span>
                                    )}
                                  </div>

                                  <div className="space-y-1 pt-1">
                                    {cardItems.map((cd: any, cIdx: number) => (
                                      <div key={cIdx} className="flex items-center gap-2 text-xs">
                                        <span className="font-bold text-slate-900">{cd.name}</span>
                                        {cd.number && (
                                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-200/70 rounded text-slate-700">
                                            #{cd.number}
                                          </span>
                                        )}
                                        {cd.foil && (
                                          <span className="font-bold text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                            ✨ Foil
                                          </span>
                                        )}
                                        <span className="text-slate-500 font-mono text-[11px]">
                                          Single EV: ${cd.ev.toFixed(2)}
                                        </span>
                                      </div>
                                    ))}

                                    {packItems.map((pk: any, pIdx: number) => (
                                      <div key={pIdx} className="flex items-center gap-2 text-xs">
                                        <span className="font-bold text-slate-900 capitalize">
                                          {pk.boosterCode.replace(/-/g, ' ')} Booster Pack
                                        </span>
                                        <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded font-mono text-[10px]">
                                          {pk.setCode}
                                        </span>
                                        <span className="text-slate-500 font-mono text-[11px]">
                                          Simulated EV: ${pk.unitEvAvg.toFixed(2)}
                                        </span>
                                      </div>
                                    ))}

                                    {deckItems.map((dk: any, dIdx: number) => (
                                      <div key={dIdx} className="flex items-center gap-2 text-xs">
                                        <span className="font-bold text-slate-900">{dk.name}</span>
                                        <span className="text-slate-500 font-mono text-[11px]">
                                          Deck EV: ${dk.ev.toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                                  <div className="text-right">
                                    <div className="text-[10px] uppercase font-bold text-slate-400">Outcome Value</div>
                                    <div className="font-mono text-xs font-semibold text-slate-700">
                                      ${cfgEv.toFixed(2)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] uppercase font-bold text-slate-400">Weighted EV</div>
                                    <div className="font-mono text-sm font-black text-amber-600">
                                      ${weightedEv.toFixed(2)}
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono">
                                      {probPct}% × ${cfgEv.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Slot Summary */}
                        <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200 text-xs font-mono flex items-center justify-between text-amber-950">
                          <span>Slot #{slotIdx + 1} Expected Value Contribution:</span>
                          <span className="font-bold text-sm text-amber-700">
                            +${slotWeightedEv.toFixed(2)} EV
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. Contained Accessories & Non-Card Inclusions (No EV allocated) */}
            {hasOther && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎁</span>
                    <span>Accessories & Non-Card Inclusions ({item.contents!.other!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase bg-slate-200/70 px-2 py-0.5 rounded">
                    physical inclusions ($0.00 EV allocated)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {item.contents!.other!.map((ot: any, oIdx: number) => {
                    const count = (ot.count || 1) * multiplier;
                    const otName = ot.name || 'Accessory';
                    const isDice = otName.toLowerCase().includes('dice') || otName.toLowerCase().includes('spindown');
                    const isBox = otName.toLowerCase().includes('deck box') || otName.toLowerCase().includes('box');
                    const isToken = otName.toLowerCase().includes('token');
                    const isCounter = otName.toLowerCase().includes('counter');

                    return (
                      <div
                        key={`${nodeKey}-other-${oIdx}`}
                        className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-base shrink-0 border border-slate-200">
                            {isDice ? '🎲' : isBox ? '📦' : isToken ? '🪙' : isCounter ? '🏷️' : '🎁'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs truncate" title={otName}>
                              {otName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium truncate">
                              {isBox ? 'Cardboard Deck Box' : isDice ? 'Life Counter / Spindown' : isToken ? 'Game Tokens' : isCounter ? 'Punch-out Counters' : 'Physical In-Box Item'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-slate-100 text-slate-700">
                            ×{count}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-500 bg-slate-50 border border-slate-200">
                            $0.00
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold rounded-full border border-indigo-500/30 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                MTGJSON PRODUCT HIERARCHY & PRICING AUDITOR
              </span>
              <span className="px-2.5 py-1 bg-slate-800 text-slate-300 font-mono text-xs rounded-full border border-slate-700">
                Authoritative Multipliers & Cards
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Product Multiplication & Price Breakdown
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl">
              Inspect recursive sealed product compositions, per-pack EV vs market value, standalone promotional cards with live marketplace pricing, and complete mathematical derivations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-4 py-2 bg-slate-800/90 rounded-2xl border border-slate-700 text-xs font-mono text-slate-300 flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>{stats.total.toLocaleString()} Total Products</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">Composite Bundles / Cases</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.compositeCount}</div>
          <div className="text-[11px] text-indigo-600 font-medium">Nested Sealed Sub-Products</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">Secret Lair Drops</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.sldCount}</div>
          <div className="text-[11px] text-emerald-600 font-medium">Fixed Card Drops & Parity</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">Booster Box Cases</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.casesCount}</div>
          <div className="text-[11px] text-amber-600 font-medium">Multi-Box Pack Multipliers</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">Explicit MTGJSON Contents</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.withContentsCount}</div>
          <div className="text-[11px] text-slate-500 font-medium">Authoritative Schema</div>
        </div>
      </div>

      {/* Main Grid: Left Selector Sidebar + Right Deep Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Filter & Product Explorer List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, set (SLD, MH3), Aquarius, case..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Set Code</label>
                <select
                  id="admin-hierarchy-set-select"
                  value={selectedSet}
                  onChange={(e) => setSelectedSet(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none"
                >
                  <option value="all">All Sets ({availableSets.length})</option>
                  {availableSets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                <select
                  id="admin-hierarchy-category-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none capitalize"
                >
                  <option value="all">All Categories</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Pricing Vendor</label>
                <select
                  id="admin-hierarchy-vendor-select"
                  value={vendor}
                  onChange={(e) => onVendorChange(e.target.value as Vendor)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="all">All vendors ( cheapest )</option>
                  <option value="all_average">All vendors ( average )</option>
                  <option value="tcgplayer">TCGplayer</option>
                  <option value="cardmarket">Cardmarket</option>
                  <option value="cardkingdom">Card Kingdom</option>
                  <option value="manapool">Manapool</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Price Mode</label>
                <select
                  id="admin-hierarchy-price-mode-select"
                  value={priceMode}
                  onChange={(e) => onPriceModeChange(e.target.value as PriceMode)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="direct">Direct Print</option>
                  <option value="cheapest_reprint">Cheapest Reprint</option>
                </select>
              </div>
            </div>

            {/* Filter Mode Quick Badges */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'all', label: 'All Items' },
                { id: 'composite', label: 'Nested Composites' },
                { id: 'secret_lair', label: 'Secret Lairs' },
                { id: 'cases', label: 'Cases & Multi-Boxes' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFilterMode(m.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    filterMode === m.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product List Scroll Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 flex items-center justify-between">
              <span>Matching Products ({filteredProducts.length})</span>
              <span className="text-[11px] font-normal text-slate-500">Click to audit breakdown</span>
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No products matched the filter criteria.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const uid = p.id || p.uuid || '';
                  const isSelected = selectedProduct && (selectedProduct.id || selectedProduct.uuid) === uid;
                  const arb = arbitrageMap[uid];
                  const hasNested = Boolean(p.contents?.sealed && p.contents.sealed.length > 0);
                  const hasCards = Boolean(p.contents?.card && p.contents.card.length > 0);

                  return (
                    <button
                      key={uid}
                      onClick={() => setSelectedProduct(p)}
                      className={`w-full text-left p-3.5 transition-all flex items-start justify-between gap-2 cursor-pointer ${
                        isSelected ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-1 truncate pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {p.setCode?.toUpperCase()}
                          </span>
                          <span className="text-[11px] text-slate-500 capitalize">
                            {p.category?.replace(/_/g, ' ')}
                          </span>
                          {hasNested && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                              Nested
                            </span>
                          )}
                          {hasCards && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700">
                              Cards
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                          {p.displayName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {arb ? (
                            arb.packCount > 0
                              ? `${arb.packCount} Packs`
                              : `${arb.cardCount || 0} Cards`
                          ) : p.contents ? (
                            [
                              p.contents.deck?.length ? `${p.contents.deck.length} Decks` : null,
                              p.contents.pack?.length ? `${p.contents.pack.reduce((a, pk) => a + (pk.count || 1), 0)} Packs` : null,
                              p.contents.card?.length ? `${p.contents.card.reduce((a, c) => a + (c.count || 1), 0)} Cards` : null,
                              p.contents.variable?.length ? `${p.contents.variable.length} Bonus Slots` : null,
                              p.contents.sealed?.length ? `${p.contents.sealed.reduce((a, s) => a + (s.count || 1), 0)} Sealed Units` : null,
                            ].filter(Boolean).join(' • ') || 'Direct Item'
                          ) : (
                            'Direct Item'
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs text-emerald-600">
                          ${Number(p.marketPrice || 0).toFixed(2)}
                        </div>
                        {arb && (
                          <div className="font-mono text-[10px] text-amber-600 font-bold">
                            EV: ${Number((arb.totalEvAvg || 0) * reprintMultiplier).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Deep Product Hierarchy Breakdown (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {selectedProduct && productAudit ? (
            <>
              {/* Active Selection Header */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                        {selectedProduct.setCode?.toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-slate-500 capitalize">
                        {selectedProduct.category?.replace(/_/g, ' ')} • {selectedProduct.subtype?.replace(/_/g, ' ') || 'standard'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap mt-1">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                        {selectedProduct.displayName}
                      </h2>
                      {((selectedProduct.displayName || selectedProduct.name || '').toLowerCase().includes('foil') &&
                        !(selectedProduct.displayName || selectedProduct.name || '').toLowerCase().includes('non-foil')) ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                          ✨ Traditional Foil Edition
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Standard Nonfoil
                        </span>
                      )}
                    </div>
                  </div>

                                    <div className="flex flex-wrap items-center gap-2">
                    {/* Price Mode Pill Toggle */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        id="admin-hierarchy-mode-direct-pill"
                        onClick={() => onPriceModeChange('direct')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          priceMode === 'direct' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Direct Print
                      </button>
                      <button
                        type="button"
                        id="admin-hierarchy-mode-reprint-pill"
                        onClick={() => onPriceModeChange('cheapest_reprint')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          priceMode === 'cheapest_reprint' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Cheapest Reprint
                      </button>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setViewMode('visual_tree')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          viewMode === 'visual_tree' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Visual Tree
                      </button>
                      <button
                        onClick={() => setViewMode('raw_json')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          viewMode === 'raw_json' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Raw MTGJSON
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Launch Card Breakdown Button */}
                <div className="flex flex-wrap items-center justify-between bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-4 rounded-xl text-white gap-3 shadow-md">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                      Product Card Breakdown & Singles Valuation
                    </span>
                    <span className="text-xs text-slate-300 font-medium">
                      Inspect all individual cards, mana curves, prices across vendors, and foil breakdown.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const p = selectedProduct;
                      const uid = p.id || p.uuid || '';
                      const arb = arbitrageMap[uid];
                      const matchedDeck = preconDecks[uid] || preconDecks[p.displayName.toLowerCase()];

                      const modalProd: CatalogPackProduct = {
                        id: uid,
                        setCode: p.setCode,
                        setName: p.setCode,
                        displayName: p.displayName,
                        packagingType: p.category as any,
                        boosterName: 'default' as any,
                        marketPrice: p.marketPrice || 0,
                        estimatedEv: (matchedDeck?.totalSinglesEv || arb?.totalEvAvg || (p.marketPrice ? p.marketPrice * 1.15 : 0)) * reprintMultiplier,
                        packsCount: arb?.packCount || (p.contents?.pack ? p.contents.pack.reduce((sum, pk) => sum + (pk.count || 1), 0) : 0),
                        cardCount: p.cardCount || matchedDeck?.cardCount || 0,
                        rawCategory: p.category,
                        rawSubtype: p.subtype,
                        rawContents: p.contents as any,
                        releaseDate: '',
                        block: '',
                        specialFeatures: [],
                      };
                      setBreakdownProduct(modalProd);
                    }}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <Sparkles className="w-4 h-4 text-slate-950" />
                    <span>View Card Breakdown Modal</span>
                  </button>
                </div>

                {/* COMPREHENSIVE MULTIPLIER & VALUATION RECONCILIATION PANEL */}
                <div className="bg-slate-900 text-white rounded-2xl p-4.5 border border-slate-800 space-y-4 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <Calculator className="w-4 h-4" />
                      <span className="uppercase tracking-wider">Sub-Item Price & EV Multiplication Audit</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {productAudit.packItems.length > 0 && `${productAudit.packItems.reduce((acc, p) => acc + p.count, 0)} Packs `}
                      {productAudit.cardItems.length > 0 && `• ${productAudit.cardItems.reduce((acc, c) => acc + c.count, 0)} Cards `}
                      {productAudit.sealedItems.length > 0 && `• ${productAudit.sealedItems.reduce((acc, s) => acc + s.count, 0)} Sub-Products `}
                      {productAudit.deckItems.length > 0 && `• ${productAudit.deckItems.length} Decks `}
                      {productAudit.variableItems.length > 0 && `• ${productAudit.variableItems.length} Variable Slots `}
                      {productAudit.otherItems.length > 0 && `• ${productAudit.otherItems.length} Accessories (No EV)`}
                    </span>
                  </div>

                  {/* Table of Child Elements & Multipliers */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                          <th className="text-left pb-2 font-bold">Sub-Item Component</th>
                          <th className="text-left pb-2 font-bold">Classification & Finish</th>
                          <th className="text-center pb-2 font-bold">Qty</th>
                          <th className="text-right pb-2 font-bold text-slate-300">Unit EV</th>
                          <th className="text-right pb-2 font-bold text-amber-400">Contents EV Subtotal</th>
                          <th className="text-right pb-2 font-bold text-indigo-300">EV Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {/* Packs */}
                        {productAudit.packItems.map((p, idx) => {
                          const evShare = productAudit.calculatedTotalEv > 0
                            ? ((p.subtotalEv / productAudit.calculatedTotalEv) * 100).toFixed(1)
                            : '0.0';
                          return (
                            <tr key={`audit-pack-${idx}`} className="hover:bg-slate-800/40">
                              <td className="py-2.5 text-slate-200 font-medium">
                                <span className="text-amber-400 mr-1.5">📦</span>
                                {p.packName}
                              </td>
                              <td className="py-2.5 text-slate-400 text-[11px]">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                                  Booster Pack • {p.set}
                                </span>
                              </td>
                              <td className="py-2.5 text-center font-bold text-indigo-300">×{p.count}</td>
                              <td className="py-2.5 text-right text-slate-300">${p.unitEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-amber-400">${p.subtotalEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                            </tr>
                          );
                        })}

                        {/* Standalone Cards */}
                        {productAudit.cardItems.map((c, idx) => {
                          const evShare = productAudit.calculatedTotalEv > 0
                            ? ((c.subtotalEv / productAudit.calculatedTotalEv) * 100).toFixed(1)
                            : '0.0';
                          return (
                            <tr key={`audit-card-${idx}`} className="hover:bg-slate-800/40">
                              <td className="py-2.5 text-slate-200 font-medium">
                                <span className="text-emerald-400 mr-1.5">✨</span>
                                {c.name}
                                {c.foil ? (
                                  <span className="ml-1.5 text-[10px] text-amber-300 font-bold px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/30">
                                    ★ Foil
                                  </span>
                                ) : (
                                  <span className="ml-1.5 text-[10px] text-slate-400 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
                                    Nonfoil
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-slate-400 text-[11px]">
                                Singles / Promo • {c.set}
                              </td>
                              <td className="py-2.5 text-center font-bold text-indigo-300">×{c.count}</td>
                              <td className="py-2.5 text-right text-slate-300">${c.unitEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-amber-400">${c.subtotalEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                            </tr>
                          );
                        })}

                        {/* Sealed Child Products */}
                        {productAudit.sealedItems.map((s, idx) => {
                          const evShare = productAudit.calculatedTotalEv > 0
                            ? ((s.subtotalEv / productAudit.calculatedTotalEv) * 100).toFixed(1)
                            : '0.0';
                          return (
                            <tr key={`audit-sealed-${idx}`} className="hover:bg-slate-800/40">
                              <td className="py-2.5 text-slate-200 font-medium">
                                <span className="text-blue-400 mr-1.5">🎁</span>
                                {s.name}
                              </td>
                              <td className="py-2.5 text-slate-400 text-[11px]">
                                Sealed Unit • {s.set}
                              </td>
                              <td className="py-2.5 text-center font-bold text-indigo-300">×{s.count}</td>
                              <td className="py-2.5 text-right text-slate-300">${s.unitEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-amber-400">${s.subtotalEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                            </tr>
                          );
                        })}

                        {/* Decks */}
                        {productAudit.deckItems.map((d, idx) => {
                          const evShare = productAudit.calculatedTotalEv > 0
                            ? ((d.subtotalSinglesEv / productAudit.calculatedTotalEv) * 100).toFixed(1)
                            : '0.0';
                          const isDeckAuditOpen = expandedAuditDeck === idx;
                          const deckCards = d.cards || [];
                          const filterTerm = auditDeckSearch.toLowerCase().trim();
                          const filteredDeckCards = deckCards.filter((c: any) =>
                            !filterTerm || (c.name || '').toLowerCase().includes(filterTerm) || (c.type || '').toLowerCase().includes(filterTerm)
                          );
                          const sortedDeckCards = [...filteredDeckCards].sort((a: any, b: any) => {
                            if (auditDeckSort === 'price_desc') return (b.totalPrice || b.price || 0) - (a.totalPrice || a.price || 0);
                            if (auditDeckSort === 'price_asc') return (a.totalPrice || a.price || 0) - (b.totalPrice || b.price || 0);
                            return (a.name || '').localeCompare(b.name || '');
                          });
                          const top3 = [...deckCards].sort((a: any, b: any) => (b.price || 0) - (a.price || 0)).slice(0, 3);

                          return (
                            <React.Fragment key={`audit-deck-fragment-${idx}`}>
                              <tr className="hover:bg-slate-800/40">
                                <td className="py-2.5 text-slate-200 font-medium">
                                  <div className="flex items-center gap-2">
                                    <span className="text-purple-400">🎴</span>
                                    <span>{d.name}</span>
                                    {d.isFoil ? (
                                      <span className="text-[10px] text-amber-300 font-bold px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/30">
                                        ★ Foil Deck
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
                                        Nonfoil Deck
                                      </span>
                                    )}
                                    {deckCards.length > 0 && (
                                      <button
                                        onClick={() => setExpandedAuditDeck(isDeckAuditOpen ? null : idx)}
                                        className="ml-2 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 transition flex items-center gap-1 cursor-pointer"
                                      >
                                        {isDeckAuditOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        <span>{isDeckAuditOpen ? 'Hide Cards' : `Breakdown ${d.cardCount} Cards`}</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 text-slate-400 text-[11px]">
                                  Precon Deck • {d.cardCount} Cards
                                </td>
                                <td className="py-2.5 text-center font-bold text-indigo-300">×{d.count}</td>
                                <td className="py-2.5 text-right text-slate-300">${d.unitSinglesEv.toFixed(2)}</td>
                                <td className="py-2.5 text-right font-bold text-amber-400">${d.subtotalSinglesEv.toFixed(2)}</td>
                                <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                              </tr>

                              {/* Inline Deck Cards Pricing Breakdown */}
                              {isDeckAuditOpen && deckCards.length > 0 && (
                                <tr>
                                  <td colSpan={6} className="p-3 bg-slate-950/80 border-y border-slate-800">
                                    <div className="space-y-2.5">
                                      {/* Top singles pills */}
                                      {top3.length > 0 && top3[0]?.price > 0 && (
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-bold uppercase text-slate-400 font-sans">
                                            Top Singles:
                                          </span>
                                          {top3.map((tc, tcIdx) => (
                                            <span
                                              key={tcIdx}
                                              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1.5"
                                            >
                                              <span>{tc.name}</span>
                                              <strong className="text-emerald-400">${Number(tc.price || 0).toFixed(2)}</strong>
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {/* Search & Sort Controls */}
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                        <div className="relative flex-1">
                                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                          <input
                                            type="text"
                                            placeholder="Search deck cards by name or type..."
                                            value={auditDeckSearch}
                                            onChange={(e) => setAuditDeckSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-purple-500 font-mono"
                                          />
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="text-[11px] text-slate-400 font-mono">Sort:</span>
                                          <select
                                            value={auditDeckSort}
                                            onChange={(e) => setAuditDeckSort(e.target.value as any)}
                                            className="bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-xs py-1 px-2 focus:outline-hidden font-mono"
                                          >
                                            <option value="price_desc">Highest Price First</option>
                                            <option value="price_asc">Lowest Price First</option>
                                            <option value="name">Alphabetical (A-Z)</option>
                                          </select>
                                        </div>
                                      </div>

                                      {/* Cards List Table */}
                                      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50">
                                        <table className="w-full text-left text-xs font-mono">
                                          <thead className="sticky top-0 bg-slate-900 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                                            <tr>
                                              <th className="p-2">Card Name</th>
                                              <th className="p-2">Type / Collector #</th>
                                              <th className="p-2 text-center">Finish</th>
                                              <th className="p-2 text-center">Qty</th>
                                              <th className="p-2 text-right">Unit Price</th>
                                              <th className="p-2 text-right">Subtotal</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-800/40">
                                            {sortedDeckCards.map((c: any, cIdx: number) => (
                                              <tr key={cIdx} className="hover:bg-slate-800/30">
                                                <td className="p-2 font-medium text-slate-200">
                                                  {c.name}
                                                </td>
                                                <td className="p-2 text-slate-400 text-[11px]">
                                                  {c.type || 'Card'} {c.number ? `• #${c.number}` : ''}
                                                </td>
                                                <td className="p-2 text-center">
                                                  {c.foil ? (
                                                    <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded border border-amber-400/30">
                                                      ★ Foil
                                                    </span>
                                                  ) : (
                                                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                                      Nonfoil
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="p-2 text-center text-slate-300 font-bold">
                                                  {c.count || 1}
                                                </td>
                                                <td className="p-2 text-right text-slate-300 font-mono">
                                                  ${Number(c.price || 0).toFixed(2)}
                                                </td>
                                                <td className="p-2 text-right font-bold text-emerald-400 font-mono">
                                                  ${Number(c.totalPrice || c.price || 0).toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Variable Slots */}
                        {productAudit.variableItems.map((v, sIdx) => {
                          const evShare = productAudit.calculatedTotalEv > 0
                            ? ((v.slotEv / productAudit.calculatedTotalEv) * 100).toFixed(1)
                            : '0.0';
                          return (
                            <tr key={`audit-var-${sIdx}`} className="hover:bg-slate-800/40">
                              <td className="py-2.5 text-slate-200 font-medium">
                                <span className="text-amber-400 mr-1.5">🎲</span>
                                Bonus Slot #{v.slotIndex} ({v.configs.length} configs)
                                <div className="text-[10px] text-slate-400 font-normal mt-0.5 max-w-sm truncate">
                                  {v.configs.map((c) => `${c.probabilityPct}%: ${c.description}`).join(' | ')}
                                </div>
                              </td>
                              <td className="py-2.5 text-slate-400 text-[11px]">
                                Probabilistic Bonus Slot
                              </td>
                              <td className="py-2.5 text-center font-bold text-indigo-300">×1</td>
                              <td className="py-2.5 text-right text-slate-300">${v.slotEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-amber-400">${v.slotEv.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                            </tr>
                          );
                        })}

                        {/* Accessories & Non-Card Inclusions (No EV allocated) */}
                        {productAudit.otherItems.map((ot, oIdx) => (
                          <tr key={`audit-other-${oIdx}`} className="hover:bg-slate-800/40 opacity-75">
                            <td className="py-2.5 text-slate-300 font-medium">
                              <span className="text-slate-400 mr-1.5">
                                {ot.name?.toLowerCase().includes('dice') || ot.name?.toLowerCase().includes('spindown')
                                  ? '🎲'
                                  : ot.name?.toLowerCase().includes('deck box') || ot.name?.toLowerCase().includes('box')
                                  ? '📦'
                                  : ot.name?.toLowerCase().includes('token')
                                  ? '🪙'
                                  : ot.name?.toLowerCase().includes('counter')
                                  ? '🏷️'
                                  : '🎁'}
                              </span>
                              {ot.name}
                              <span className="ml-1.5 text-[10px] text-slate-400 font-mono px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
                                Physical Accessory
                              </span>
                            </td>
                            <td className="py-2.5 text-slate-400 text-[11px]">
                              {ot.category} • No Market EV
                            </td>
                            <td className="py-2.5 text-center font-bold text-slate-400">×{ot.count}</td>
                            <td className="py-2.5 text-right text-slate-500 font-mono">$0.00</td>
                            <td className="py-2.5 text-right font-medium text-slate-500 font-mono">$0.00</td>
                            <td className="py-2.5 text-right text-slate-500 font-mono">0.0%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mathematical Reconciliation Summary Strip */}
                  <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                    <div className="space-y-1">
                      <div className="text-slate-400">
                        • Product Market Price:{' '}
                        <strong className="text-emerald-400">${productAudit.statedMarketPrice.toFixed(2)}</strong>
                      </div>
                      <div className="text-slate-400">
                        • Total Aggregated Contents EV:{' '}
                        {productAudit.hasCalculatedEv ? (
                          <strong className="text-amber-400">${productAudit.finalEv.toFixed(2)}</strong>
                        ) : (
                          <span className="text-slate-400 italic">Pending / Uncalculated EV</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-right">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Net Arbitrage Spread</div>
                        {productAudit.hasCalculatedEv ? (
                          <div className={`text-sm font-bold ${productAudit.netSpread >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {productAudit.netSpread >= 0 ? `+$${productAudit.netSpread.toFixed(2)}` : `-$${Math.abs(productAudit.netSpread).toFixed(2)}`}
                            <span className="text-xs font-normal text-slate-400 ml-1">
                              ({productAudit.roiPct >= 0 ? `+${productAudit.roiPct}%` : `${productAudit.roiPct}%`})
                            </span>
                          </div>
                        ) : (
                          <div className="text-sm font-bold text-slate-400">—</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* View Mode 1: Interactive Recursive Tree */}
              {viewMode === 'visual_tree' && (
                <div className="space-y-4">
                  {renderProductTree(selectedProduct)}
                </div>
              )}

              {/* View Mode 2: Syntax-Highlighted Raw JSON */}
              {viewMode === 'raw_json' && (
                <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 shadow-lg space-y-3 font-mono text-xs overflow-x-auto">
                  <div className="flex items-center justify-between text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-amber-400" />
                      MTGJSON Authoritative Record
                    </span>
                    <span>UUID: {selectedProduct.id || selectedProduct.uuid}</span>
                  </div>
                  <pre className="text-emerald-400 leading-relaxed">
                    {JSON.stringify(
                      {
                        ...selectedProduct,
                        pricingEvaluation: arbitrageMap[selectedProduct.id || selectedProduct.uuid || ''] || null,
                        productAudit,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
              <Package className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-600">Select a product from the list</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Choose any sealed booster box, bundle case, or Secret Lair drop on the left to inspect its recursive breakdown and sub-item pricing.
              </p>
            </div>
                    )}
        </div>
      </div>

      {/* Modal Render */}
      <ProductBreakdownModal
        product={breakdownProduct}
        isOpen={Boolean(breakdownProduct)}
        onClose={() => setBreakdownProduct(null)}
        priceMode={priceMode}
        vendor={vendor}
      />
    </div>
  );
};
