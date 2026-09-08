import React, { useState, useEffect, useMemo } from 'react';
import { BoosterEVRecord, ChaseCard, PriceMode, SetOption, Vendor, ChildSetInfo, PreconstructedDeckDetail } from '../types';
import { dataService } from '../services/dataService';
import { normalizeVendor } from '../utils/vendorUtils';
import { resolveRecursiveProductAudit, getCanonicalProductMetrics } from '../utils/productUtils';
import { resolveToMainSetCode, getAllRelatedSetCodes, isCommanderSubSet, getChildCommanderSetCodes, getChildSets, getScryfallNode } from '../utils/setHierarchyUtils';
import { SetSymbolIcon } from './SetSymbolIcon';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  TrendingUp, 
  BarChart3, 
  Image as ImageIcon,
  Calendar,
  Layers,
  Globe,
  Hash,
  Coins,
  ExternalLink,
  Tag,
  Boxes,
  Compass,
  Search,
  ChevronDown,
  X
} from 'lucide-react';
import { PackDistributionCurve } from './PackDistributionCurve';
import { RelatedProductsHierarchy } from './RelatedProductsHierarchy';
import { ECOMMERCE_CATALOG_PACKS, CatalogPackProduct, ProductPackagingType } from '../ecommerceBoosterData';

interface BoosterDetailExplorerProps {
  selectedSetCode: string;
  onSelectSetCode: (code: string) => void;
  availableSets: SetOption[];
  boosterRecords: BoosterEVRecord[];
  chaseCards: ChaseCard[];
  priceMode: PriceMode;
  onPriceModeChange: (mode: PriceMode) => void;
  vendor: Vendor;
  onVendorChange: (vendor: Vendor) => void;
}

const getBoosterPackMarketPrice = (setCode: string, boosterName: string): number => {
  const isCollector = boosterName.toLowerCase().includes('collector');
  if (setCode === 'MH3') return isCollector ? 39.99 : 7.99;
  if (setCode === 'BLB') return isCollector ? 26.99 : 4.49;
  if (setCode === 'OTJ') return isCollector ? 24.99 : 4.25;
  if (setCode === 'MOM') return isCollector ? 28.50 : 4.85;
  if (setCode === 'WOE') return isCollector ? 22.99 : 4.50;
  if (setCode === 'LCI') return isCollector ? 25.00 : 4.50;
  if (setCode === 'FDN') return isCollector ? 29.99 : 4.49;
  if (setCode === 'FIN') return isCollector ? 42.99 : 6.99;
  return isCollector ? 28.00 : 4.99;
};

export const BoosterDetailExplorer: React.FC<BoosterDetailExplorerProps> = ({
  selectedSetCode,
  onSelectSetCode,
  availableSets,
  boosterRecords,
  chaseCards,
  priceMode,
  onPriceModeChange,
  vendor,
  onVendorChange,
}) => {
  const currentSet = availableSets.find((s) => s.code === selectedSetCode) || availableSets[0];
  
  // Calculate dynamically adjusted booster records based on priceMode & vendor
  const rawSetBoosters = boosterRecords.filter((b) => b.setCode.toUpperCase() === selectedSetCode.toUpperCase());
  const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;
  const normVendor = normalizeVendor(vendor);
  const vendorEvMultiplier =
    normVendor === 'cardmarket' ? 0.868 :
    normVendor === 'cardkingdom' ? 1.15 :
    normVendor === 'manapool' ? 0.98 :
    1.0;

  // Search & sorting state for MTG Sets dropdown
  const [setSearchQuery, setSetSearchQuery] = useState<string>('');
  const [isSetDropdownOpen, setIsSetDropdownOpen] = useState<boolean>(false);

  // Sets sorted by release date descending (newest first)
  const sortedSets = useMemo(() => {
    return [...availableSets].sort((a, b) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      if (dateA !== dateB) return dateB - dateA;
      return a.name.localeCompare(b.name);
    });
  }, [availableSets]);

  const filteredSets = useMemo(() => {
    if (!setSearchQuery.trim()) {
      // By default, only show primary/main sets (exclude child commander sets that belong under parent sets)
      return sortedSets.filter((s) => !s.isCommanderSubSet && !isCommanderSubSet(s.code));
    }
    const q = setSearchQuery.toLowerCase().trim();
    return sortedSets.filter((s) => {
      const matchesSelf =
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.block && s.block.toLowerCase().includes(q));

      // Also match if a child commander set code or name matches query
      const childCodes = getChildCommanderSetCodes(s.code);
      const matchesChild = childCodes.some((cc) => cc.toLowerCase().includes(q));
      return matchesSelf || matchesChild;
    });
  }, [sortedSets, setSearchQuery]);

  // Group by boosterName (e.g. 'play', 'collector', 'draft'), preferring rows matching the
  // active priceMode, then pick the row for the exact selected vendor (falling back to the
  // 'all' consensus row) - mirrors backend/ev_engine.py's get_pack_ev priority so both the
  // Booster EV explorer and the Product Overview/Admin pages agree on the same numbers.
  const exactModeBoosters = rawSetBoosters.filter((b) => b.priceMode === priceMode);
  const fallbackBoosters = rawSetBoosters.filter((b) => b.priceMode === 'direct');
  const sourceBoosters = exactModeBoosters.length > 0 ? exactModeBoosters : fallbackBoosters.length > 0 ? fallbackBoosters : rawSetBoosters;

  const boostersByName = new Map<string, BoosterEVRecord[]>();
  sourceBoosters.forEach((b) => {
    if (!boostersByName.has(b.boosterName)) boostersByName.set(b.boosterName, []);
    boostersByName.get(b.boosterName)!.push(b);
  });

  const currentBoosters = Array.from(boostersByName.values()).map((rows) => {
    const base = rows.find((r) => r.vendor === normVendor) || rows.find((r) => r.vendor === vendor) || rows.find((r) => r.vendor === 'all') || rows[0];
    const mult = base.priceMode === priceMode ? 1.0 : reprintMultiplier;
    return {
      ...base,
      evAverage: Number((base.evAverage * mult).toFixed(2)),
      evMid90: Number((base.evMid90 * mult).toFixed(2)),
      evMin: Number((base.evMin * mult).toFixed(2)),
      evMax: Number((base.evMax * mult).toFixed(2)),
      evMin5: Number((base.evMin5 * mult).toFixed(2)),
      evMax5: Number((base.evMax5 * mult).toFixed(2)),
      quantiles: base.quantiles ? base.quantiles.map((q) => Number((q * mult).toFixed(2))) : undefined,
      priceMode,
      vendor,
    };
  });

  // Catalog products for this set, with EV scaled by active priceMode and vendor (marketPrice untouched)
  const setCatalogProducts = useMemo(() => {
    const prods = ECOMMERCE_CATALOG_PACKS.filter(
      (p) => p.setCode.toUpperCase() === selectedSetCode.toUpperCase()
    );
    return prods.map((p) => ({
      ...p,
      marketPrice: Number((p.marketPrice || 0).toFixed(2)),
      estimatedEv: Number((p.estimatedEv * reprintMultiplier * vendorEvMultiplier).toFixed(2)),
    }));
  }, [selectedSetCode, reprintMultiplier, vendorEvMultiplier]);

  // Dynamic products loaded from database/pipeline (e.g. sealed products with contents)
  const [dbProducts, setDbProducts] = useState<CatalogPackProduct[]>([]);
  const [selectedProductOverride, setSelectedProductOverride] = useState<CatalogPackProduct | null>(null);

  // Authoritative datasets for full recursive child resolution
  const [allRawProducts, setAllRawProducts] = useState<any[]>([]);
  const [arbitrageRecords, setArbitrageRecords] = useState<Record<string, any>>({});
  const [preconDecks, setPreconDecks] = useState<Record<string, PreconstructedDeckDetail>>({});
  const [singleCardPrices, setSingleCardPrices] = useState<any>({ byUuid: {}, byName: {}, byNameSet: {} });

  // Track the actively selected product ID from the Related Products catalog
  const [selectedProductId, setSelectedProductId] = useState<string>(
    setCatalogProducts[0]?.id || ''
  );

  const [activeBoosterName, setActiveBoosterName] = useState<string>(
    setCatalogProducts[0]?.boosterName || currentBoosters[0]?.boosterName || 'play'
  );

  // Global lookup map of all sealed products by UUID/ID
  const productMap = useMemo(() => {
    const map = new Map<string, any>();
    allRawProducts.forEach((p) => {
      if (p.uuid) map.set(p.uuid, p);
      if (p.id) map.set(p.id, p);
    });
    return map;
  }, [allRawProducts]);

  // Booster EV map indexed by set code
  const boosterEvMap = useMemo(() => {
    const map: Record<string, BoosterEVRecord[]> = {};
    boosterRecords.forEach((b) => {
      const s = b.setCode.toUpperCase();
      if (!map[s]) map[s] = [];
      map[s].push(b);
    });
    return map;
  }, [boosterRecords]);

  // Load global authoritative data for decomposition
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      dataService.getSealedProducts(),
      dataService.getArbitrageRecords(),
      dataService.getPreconDecks(),
      dataService.getSingleCardPrices(),
    ]).then(([rawProds, rawArb, rawPrecon, rawSingle]) => {
      if (!isMounted) return;
      if (Array.isArray(rawProds)) setAllRawProducts(rawProds);
      if (Array.isArray(rawArb)) {
        const arbMap: Record<string, any> = {};
        rawArb.forEach((a: any) => {
          if (a.productUuid) arbMap[a.productUuid] = a;
          if (a.id) arbMap[a.id] = a;
        });
        setArbitrageRecords(arbMap);
      }
      if (rawPrecon) setPreconDecks(rawPrecon);
      if (rawSingle) setSingleCardPrices(rawSingle);
    }).catch(() => {});

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setSelectedProductOverride(null);
    dataService.getSealedProducts().then((raw) => {
      if (!isMounted || !Array.isArray(raw)) return;
      const matching = raw.filter(
        (sp) => (sp.setCode || sp.set_code || '').toUpperCase() === selectedSetCode.toUpperCase()
      );
      const mapped: CatalogPackProduct[] = matching.map((sp: any) => {
        const pName = sp.displayName || sp.name || 'Sealed Product';
        const sCode = (sp.setCode || sp.set_code || selectedSetCode).toUpperCase();
        const cat = (sp.category || '').toLowerCase();
        let packType: ProductPackagingType = 'other';
        if (cat === 'box_set') packType = 'box_set';
        else if (cat === 'booster_box') packType = 'box';
        else if (cat === 'booster_case') packType = 'case';
        else if (cat === 'bundle_case') packType = 'bundle_case';
        else if (cat === 'booster_pack') packType = 'pack';
        else if (cat === 'bundle') packType = 'bundle';
        else if (cat === 'deck' || cat === 'multiple_decks' || cat === 'deck_box') packType = 'starter_deck';
        else if (cat === 'kit') packType = 'kit';

        // Single canonical source of truth for containment, breakdown, and EV calculation
        const metrics = getCanonicalProductMetrics(
          sp,
          productMap,
          arbitrageRecords,
          boosterEvMap,
          preconDecks,
          singleCardPrices,
          vendor,
          priceMode
        );

        let basePrice = metrics.marketPrice;
        if (basePrice === 0) {
          basePrice = Number(sp.marketPrice || sp.tcgplayer_price || 0);
        }
        if (basePrice === 0 && (metrics.primaryBoosterName === 'box-topper' || pName.toLowerCase().includes('topper'))) {
          basePrice = 9.99;
        }

        return {
          id: sp.id || sp.uuid || `${sCode}-${pName}`,
          uuid: sp.uuid,
          displayName: pName,
          setCode: sCode,
          setName: currentSet?.name || sCode,
          releaseDate: sp.releaseDate || currentSet?.releaseDate || '',
          block: currentSet?.block || '',
          boosterName: metrics.primaryBoosterName,
          packagingType: packType,
          packsCount: metrics.packsCount,
          cardCount: metrics.cardCount,
          marketPrice: Number(basePrice.toFixed(2)),
          estimatedEv: metrics.estimatedEv,
          rawCategory: cat,
          specialFeatures: [],
          rawContents: sp.contents,
        };
      });
      setDbProducts(mapped);
      if (mapped.length > 0) {
        const preferred = mapped.find((p) => p.packagingType === 'pack') || mapped.find((p) => p.packagingType === 'box') || mapped[0];
        setSelectedProductOverride(preferred);
        setSelectedProductId(preferred.id);
        if (preferred.boosterName) {
          setActiveBoosterName(preferred.boosterName);
        }
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [selectedSetCode, reprintMultiplier, vendorEvMultiplier, productMap, arbitrageRecords, boosterEvMap, preconDecks, singleCardPrices, vendor, priceMode]);

  // Sync when set changes
  useEffect(() => {
    const prods = ECOMMERCE_CATALOG_PACKS.filter(
      (p) => p.setCode.toUpperCase() === selectedSetCode.toUpperCase()
    );
    if (prods.length > 0) {
      setSelectedProductId(prods[0].id);
      setActiveBoosterName(prods[0].boosterName || 'play');
    } else if (currentBoosters.length > 0) {
      setActiveBoosterName(currentBoosters[0].boosterName);
    }
  }, [selectedSetCode]);

  const activeBooster = useMemo(() => {
    return (
      currentBoosters.find((b) => b.boosterName === activeBoosterName) ||
      currentBoosters[0] ||
      boosterRecords[0]
    );
  }, [currentBoosters, activeBoosterName, boosterRecords]);

  const cleanProductName = (name: string) => {
    if (!name) return '';
    let cleaned = name;
    if (currentSet?.name) {
      const escaped = currentSet.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}\\s*[-:–—]?\\s*`, 'i');
      cleaned = cleaned.replace(regex, '');
    }
    if (selectedSetCode) {
      const escapedCode = selectedSetCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const codeRegex = new RegExp(`^${escapedCode}\\b\\s*[-:–—]?\\s*`, 'i');
      cleaned = cleaned.replace(codeRegex, '');
    }
    return cleaned.trim() || name;
  };

  // Find active product details
  const activeProduct: CatalogPackProduct | undefined = useMemo(() => {
    if (selectedProductOverride) {
      const overrideSet = selectedProductOverride.setCode.toUpperCase();
      const related = getAllRelatedSetCodes(selectedSetCode);
      if (related.includes(overrideSet)) {
        return selectedProductOverride;
      }
    }
    const dbMatch = dbProducts.find((p) => p.id === selectedProductId);
    if (dbMatch) return dbMatch;
    return setCatalogProducts.find((p) => p.id === selectedProductId) || dbProducts[0] || setCatalogProducts[0];
  }, [selectedProductOverride, selectedSetCode, dbProducts, selectedProductId, setCatalogProducts]);

  // Lookup raw product with full contents metadata
  const activeRawProduct = useMemo(() => {
    if (!activeProduct) return null;
    const uid = activeProduct.uuid || activeProduct.id;
    if (uid && productMap.has(uid)) return productMap.get(uid);
    const related = getAllRelatedSetCodes(selectedSetCode);
    return (
      allRawProducts.find(
        (p) =>
          related.includes((p.setCode || '').toUpperCase()) &&
          ((p.displayName || p.name || '').toLowerCase() === activeProduct.displayName.toLowerCase() ||
            (p.name || '').toLowerCase() === activeProduct.displayName.toLowerCase())
      ) || activeProduct
    );
  }, [activeProduct, productMap, allRawProducts, selectedSetCode]);

  // Compute recursive product audit (packs, singles, nested sealed, precon decks)
  const productAudit = useMemo(() => {
    if (!activeRawProduct) return null;
    return resolveRecursiveProductAudit(
      activeRawProduct,
      productMap,
      arbitrageRecords,
      boosterEvMap,
      preconDecks,
      singleCardPrices,
      vendor,
      priceMode,
      1
    );
  }, [activeRawProduct, productMap, arbitrageRecords, boosterEvMap, preconDecks, singleCardPrices, vendor, priceMode]);

  const isPreconProduct = useMemo(() => {
    if (!activeProduct) return false;
    const cat = (activeProduct.rawCategory || '').toLowerCase();
    const packaging = activeProduct.packagingType;
    return (
      packaging === 'starter_deck' ||
      cat === 'deck' ||
      cat === 'commander_deck' ||
      cat === 'multiple_decks' ||
      cat === 'deck_box' ||
      Boolean(productAudit && productAudit.totalDecks > 0 && productAudit.totalPacks === 0)
    );
  }, [activeProduct, productAudit]);

  const isBoxSetProduct = useMemo(() => {
    if (!activeProduct) return false;
    const cat = (activeProduct.rawCategory || '').toLowerCase();
    return activeProduct.packagingType === 'box_set' || cat === 'box_set';
  }, [activeProduct]);

  const packMarketPrice = Number(getBoosterPackMarketPrice(selectedSetCode, activeBooster?.boosterName || 'play').toFixed(2));

  // Product level scaled metrics from authoritative breakdown
  const productPacksCount =
    productAudit && productAudit.totalPacks > 0
      ? productAudit.totalPacks
      : activeProduct?.packsCount || 1;

  const productTotalCards =
    productAudit && productAudit.totalCards > 0
      ? productAudit.totalCards
      : activeProduct?.cardCount || (isPreconProduct ? 100 : undefined);

  const productMarketPrice = activeProduct?.marketPrice && activeProduct.marketPrice > 0 ? activeProduct.marketPrice : packMarketPrice;

  // Calculate dynamic product EV from pack EV and pack count (or authoritative audit)
  const bundleBonusVal = activeProduct?.packagingType === 'bundle' ? 3.50 : 0;
  const productEstimatedEv =
    productAudit && productAudit.totalEv > 0
      ? productAudit.totalEv
      : isPreconProduct && activeProduct
      ? Number(activeProduct.estimatedEv.toFixed(2))
      : Number(((activeBooster.evAverage * productPacksCount) + (bundleBonusVal * reprintMultiplier * vendorEvMultiplier)).toFixed(2));

  const productMid90Ev = isPreconProduct ? productEstimatedEv : Number((activeBooster.evMid90 * productPacksCount).toFixed(2));
  const productMin5 = isPreconProduct ? productEstimatedEv : Number((activeBooster.evMin5 * productPacksCount).toFixed(2));
  const productMax5 = isPreconProduct ? productEstimatedEv : Number((activeBooster.evMax5 * productPacksCount).toFixed(2));
  const productMin = isPreconProduct ? productEstimatedEv : Number((activeBooster.evMin * productPacksCount).toFixed(2));
  const productMax = isPreconProduct ? productEstimatedEv : Number((activeBooster.evMax * productPacksCount).toFixed(2));

  // EV score number (0 - 100): Probability of opening value >= sealed market price
  const productEvScore = useMemo(() => {
    if (productMarketPrice <= 0) return 100;
    if (isPreconProduct) {
      if (productEstimatedEv >= productMarketPrice) return 100;
      return Math.max(0, Math.min(99, Math.round((productEstimatedEv / productMarketPrice) * 100)));
    }
    if (productMarketPrice <= productMin5) return 100;
    if (productMarketPrice >= productMax5) return 0;
    if (productMarketPrice <= productMid90Ev) {
      const pct = 95 - ((productMarketPrice - productMin5) / (productMid90Ev - productMin5)) * 45;
      return Math.round(Math.max(50, Math.min(95, pct)));
    } else {
      const pct = 50 - ((productMarketPrice - productMid90Ev) / (productMax5 - productMid90Ev)) * 45;
      return Math.round(Math.max(5, Math.min(50, pct)));
    }
  }, [productMarketPrice, isPreconProduct, productEstimatedEv, productMin5, productMid90Ev, productMax5]);

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'mythic':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'rare':
        return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
      case 'uncommon':
        return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const formatReleaseDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const childSetsList: ChildSetInfo[] = useMemo(() => {
    const list: ChildSetInfo[] = currentSet?.childSets ? [...currentSet.childSets] : [];
    
    // Supplement directly with Scryfall child sets (including all linked subsets)
    const scryfallChildren = getChildSets(selectedSetCode);
    scryfallChildren.forEach((sc) => {
      if (!list.some((c) => c.code.toUpperCase() === sc.code.toUpperCase())) {
        const rawType = sc.setType || '';
        const formattedType =
          rawType === 'memorabilia'
            ? sc.name.toLowerCase().includes('scene box')
              ? 'Scene Box'
              : sc.name.toLowerCase().includes('art')
              ? 'Art Series'
              : 'Memorabilia'
            : rawType === 'masterpiece'
            ? 'Masterpiece'
            : rawType === 'commander'
            ? 'Commander Decks'
            : rawType === 'token'
            ? 'Tokens'
            : rawType === 'promo'
            ? 'Promos'
            : rawType
            ? rawType.charAt(0).toUpperCase() + rawType.slice(1)
            : 'Sub-set';

        list.push({
          code: sc.code,
          name: sc.name,
          type: formattedType,
          cardCount: sc.cardCount,
          iconCode: sc.code,
          iconSvgUri: sc.iconSvgUri,
          parentCode: selectedSetCode,
        });
      }
    });

    if (list.length === 0) {
      list.push(
        { code: currentSet?.tokenSetCode || `T${selectedSetCode}`, name: `${currentSet?.name || selectedSetCode} Tokens`, type: 'Tokens' },
        { code: `A${selectedSetCode}`, name: `${currentSet?.name || selectedSetCode} Art Series`, type: 'Art Series' }
      );
    }
    return list;
  }, [currentSet, selectedSetCode]);

  return (
    <div id="booster-explorer-container" className="space-y-6">
      {/* Set Selector Header Bar & Generic Set Information */}
      <div
        id="set-selector-bar"
        className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5"
      >
        {/* Top Row: Big Set Icon, Name, Key Badges, and Set Dropdown */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            {/* Enlarged Parent Set Symbol Icon */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-center p-2.5 shadow-2xs">
              <SetSymbolIcon setCode={currentSet?.code || selectedSetCode} size="xl" className="w-full h-full object-contain" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded-md bg-slate-900 text-white tracking-wider">
                  {currentSet?.code || selectedSetCode}
                </span>
                {currentSet?.type && (
                  <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                    {currentSet.type}
                  </span>
                )}
                {currentSet?.block && (
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                    {currentSet.block}
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>{currentSet?.name || selectedSetCode}</span>
                <a
                  href={`https://scryfall.com/sets/${(currentSet?.code || selectedSetCode).toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-indigo-600 transition"
                  title="View set hierarchy on Scryfall"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </h2>

              <p className="text-xs text-slate-500 mt-0.5">
                Monte Carlo EV simulation across MTGJSON print sheets with live vendor prices.
              </p>
            </div>
          </div>

          {/* Searchable MTG Set Selector with Release Date Sort and Set Icons */}
          <div className="w-full sm:w-80 shrink-0 relative" id="mtg-set-search-combobox">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Select & Search MTG Set</span>
              <span className="text-[9px] text-slate-400 font-normal">Sorted by release date</span>
            </label>
            
            <div className="relative">
              <button 
                type="button"
                id="set-picker-select-button"
                onClick={() => setIsSetDropdownOpen(!isSetDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer shadow-2xs transition text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 shrink-0 flex items-center justify-center bg-white rounded border border-slate-200 p-0.5">
                    <SetSymbolIcon setCode={currentSet?.code || selectedSetCode} size="sm" className="w-full h-full object-contain" />
                  </div>
                  <span className="truncate">{currentSet?.name || selectedSetCode}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 uppercase shrink-0">
                    {currentSet?.code || selectedSetCode}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isSetDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isSetDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-full sm:w-96 max-h-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Search Input */}
                  <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder="Search by set name or code (e.g. DFT, Bloom...)..."
                      value={setSearchQuery}
                      onChange={(e) => setSetSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs bg-transparent border-0 focus:outline-none text-slate-900 placeholder:text-slate-400"
                      autoFocus
                    />
                    {setSearchQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSetSearchQuery('');
                        }}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Scrollable Set Options List */}
                  <div className="overflow-y-auto divide-y divide-slate-100 max-h-72">
                    {filteredSets.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No sets matching &ldquo;{setSearchQuery}&rdquo;
                      </div>
                    ) : (
                      filteredSets.map((s) => {
                        const isSelected = s.code.toUpperCase() === selectedSetCode.toUpperCase();
                        const childCmds = getChildCommanderSetCodes(s.code);
                        const childCount = s.childSets ? s.childSets.length : getChildSets(s.code).length;
                        return (
                          <div
                            key={s.code}
                            onClick={() => {
                              onSelectSetCode(resolveToMainSetCode(s.code));
                              setIsSetDropdownOpen(false);
                              setSetSearchQuery('');
                            }}
                            className={`px-3 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer text-xs transition ${
                              isSelected
                                ? 'bg-indigo-50/90 text-indigo-950 font-bold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-6 h-6 shrink-0 flex items-center justify-center bg-white rounded border border-slate-200/80 p-0.5">
                                <SetSymbolIcon setCode={s.code} size="sm" className="w-full h-full object-contain" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate flex items-center gap-1.5">
                                  <span>{s.name}</span>
                                  <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    {s.code}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                  <span>{s.releaseDate || 'N/A'}</span>
                                  {s.type && <span className="capitalize">• {s.type}</span>}
                                  {childCount > 0 && !s.isCommanderSubSet && !s.parentCode && (
                                    <span className="text-indigo-600 font-medium">
                                      • {childCount} linked sub-sets
                                    </span>
                                  )}
                                  {(s.isCommanderSubSet || s.parentCode) && (
                                    <span className="text-purple-600 font-medium">
                                      • Sub-set ↳ {s.parentCode || resolveToMainSetCode(s.code)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-indigo-600 text-xs shrink-0 font-bold">✓</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Middle Row: Generic Set Information Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          {/* 1. Set Code */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Hash className="w-3 h-3 text-slate-500" />
              <span>Set Code</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <span className="font-mono">{currentSet?.code || selectedSetCode}</span>
            </div>
          </div>

          {/* 2. Release Date */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Release Date</span>
            </div>
            <div className="text-xs font-bold text-slate-800">
              {formatReleaseDate(currentSet?.releaseDate)}
            </div>
          </div>

          {/* 3. Set Type */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-500" />
              <span>Set Type</span>
            </div>
            <div className="text-xs font-bold text-slate-800 truncate" title={currentSet?.type || 'Expansion'}>
              {currentSet?.type || 'Expansion'}
            </div>
          </div>

          {/* 4. Total Set Size */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Boxes className="w-3 h-3 text-slate-500" />
              <span>Total Set Size</span>
            </div>
            <div className="text-xs font-bold text-slate-800 flex items-baseline gap-1">
              <span>{currentSet?.totalSetSize || 281} cards</span>
              {currentSet?.regularCardCount && (
                <span className="text-[10px] text-slate-400 font-normal font-mono">
                  ({currentSet.regularCardCount} base)
                </span>
              )}
            </div>
          </div>

          {/* 5. Block / Group */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-500" />
              <span>Block / Arc</span>
            </div>
            <div className="text-xs font-bold text-slate-800 truncate" title={currentSet?.block || 'Standard Legal'}>
              {currentSet?.block || 'Standard Legal'}
            </div>
          </div>

          {/* 6. Languages */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Globe className="w-3 h-3 text-slate-500" />
              <span>Languages</span>
            </div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <span>{currentSet?.languages?.length || 8} Languages</span>
              <span
                className="text-[10px] text-slate-400 font-normal cursor-help truncate"
                title={currentSet?.languages?.join(', ') || 'English, Japanese, German, French, Italian, Spanish, Portuguese, Chinese'}
              >
                (EN, JA, DE...)
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Row: Child Sets Hierarchy (Scryfall Structure) */}
        {childSetsList.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Child & Associated Sub-Sets
                </span>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200">
                  {childSetsList.length} linked sets
                </span>
              </div>
              <span className="text-[10px] text-slate-400 hidden sm:inline">
                Sub-sets, bonus sheets, tokens & commander products linked to {currentSet?.code || selectedSetCode}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {childSetsList.map((child) => (
                <a
                  key={child.code}
                  href={`https://scryfall.com/sets/${child.code.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-50/90 hover:bg-indigo-50/60 hover:border-indigo-200 border border-slate-200/90 rounded-xl p-2.5 flex items-center gap-2.5 transition group cursor-pointer"
                  title={`View ${child.name} (${child.code}) on Scryfall`}
                >
                  {/* Smaller Child Set Icon */}
                  <div className="w-6 h-6 shrink-0 bg-white group-hover:border-indigo-200 rounded-lg border border-slate-200 flex items-center justify-center p-1 shadow-2xs transition">
                    <SetSymbolIcon setCode={child.iconCode || child.code} iconSvgUri={child.iconSvgUri} size="xs" className="w-full h-full object-contain" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-bold text-slate-900 group-hover:text-indigo-600 transition flex items-center gap-1">
                        {child.code}
                        <ExternalLink className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition" />
                      </span>
                      {child.cardCount && (
                        <span className="text-[9px] font-mono font-medium text-slate-400">
                          {child.cardCount} cards
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-700 group-hover:text-slate-900 truncate transition" title={child.name}>
                      {child.name}
                    </div>
                    <div className="text-[9px] text-slate-400 font-medium capitalize">
                      {child.type}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 1. Related Products & Containment Hierarchy Selector (Primary Product Catalog for Set) */}
      {activeBooster && (
        <RelatedProductsHierarchy
          setCode={selectedSetCode}
          setName={currentSet?.name || activeBooster.setName || selectedSetCode}
          activeBooster={activeBooster}
          priceMode={priceMode}
          vendor={vendor}
          selectedProductId={selectedProductId}
          onPriceModeChange={onPriceModeChange}
          onVendorChange={onVendorChange}
          arbitrageMap={arbitrageRecords}
          productMap={productMap}
          preconDecks={preconDecks}
          boosterEvMap={boosterEvMap}
          singleCardPrices={singleCardPrices}
          reprintMultiplier={reprintMultiplier}
          onSelectProduct={(prodId, bName, product) => {
            setSelectedProductId(prodId);
            if (product) {
              setSelectedProductOverride(product);
            }
            if (bName) {
              setActiveBoosterName(bName);
            }
          }}
        />
      )}

      {/* 2. Active Selected Product Detailed Stats Grid */}
      {activeBooster && (
        <div className="space-y-6">
          {/* EV Score & Market Price Banner */}
          <div
            id="product-ev-score-banner"
            className="bg-slate-900 text-white rounded-2xl p-4 px-6 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center shrink-0">
                <span
                  className={`text-xl font-black font-mono leading-none ${
                    productEvScore >= 60 ? 'text-emerald-400' : productEvScore >= 35 ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  {productEvScore}
                </span>
                <span className="text-[8px] font-bold text-slate-500 font-mono mt-0.5">/100</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">EV Score</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      productEvScore >= 60
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : productEvScore >= 35
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {productEvScore >= 75 ? 'High Profit Probability' : productEvScore >= 50 ? 'Positive Risk/Reward' : productEvScore >= 25 ? 'Moderate Dud Risk' : 'Heavy Loss Expected'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Estimated <strong className="text-white font-mono">{productEvScore}%</strong> chance that this sealed product yields singles valued equal to or above its <strong className="text-white font-mono">${productMarketPrice.toFixed(2)}</strong> market price.
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Product Price</div>
              <div className="text-lg font-black font-mono text-emerald-400">${productMarketPrice.toFixed(2)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Bottom 5% Floor */}
            <div
              id="card-stat-floor"
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {isPreconProduct ? 'Dud Floor (0% Risk)' : 'Bottom 5% Floor'}
                </span>
                <AlertCircle className="w-4 h-4 text-rose-500" />
              </div>
              <div className={`text-3xl font-black font-mono tracking-tight ${isPreconProduct ? 'text-slate-900' : 'text-rose-600'}`}>
                ${productMin5.toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
                <span>{isPreconProduct ? 'No dud risk (fixed list)' : 'Worst 5% dud distribution'}</span>
                {isPreconProduct ? (
                  <span className="font-mono font-semibold text-slate-700">Guaranteed</span>
                ) : (
                  productPacksCount > 1 && (
                    <span className="font-mono font-semibold text-rose-700">
                      ${activeBooster.evMin5.toFixed(2)} / pack
                    </span>
                  )
                )}
              </p>
            </div>

            {/* Card 2: Mid 90% EV */}
            <div
              id="card-stat-mid90"
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {isPreconProduct ? 'Median Singles Value' : 'Mid 90% EV'}
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-3xl font-black text-emerald-600 font-mono tracking-tight">
                ${productMid90Ev.toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
                <span>{isPreconProduct ? 'Constant across all copies' : '5% trimmed mean'}</span>
                {isPreconProduct ? (
                  <span className="font-mono font-semibold text-emerald-700">0% Variance</span>
                ) : (
                  productPacksCount > 1 && (
                    <span className="font-mono font-semibold text-emerald-700">
                      ${activeBooster.evMid90.toFixed(2)} / pack
                    </span>
                  )
                )}
              </p>
            </div>

            {/* Card 3: Average Pack EV / Precon Total */}
            <div
              id="card-stat-ev"
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {isPreconProduct
                    ? 'Precon Singles Total'
                    : productPacksCount > 1
                    ? `${cleanProductName(activeProduct?.displayName || 'Product')} EV`
                    : 'Average Pack EV'}
                </span>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-3xl font-black text-slate-900 font-mono tracking-tight">
                ${productEstimatedEv.toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
                <span>
                  {isPreconProduct
                    ? activeProduct?.cardCount && activeProduct.cardCount > 0
                      ? `${activeProduct.cardCount} Fixed Cards`
                      : 'Fixed Decklist'
                    : isBoxSetProduct
                    ? activeProduct?.cardCount && activeProduct.cardCount > 0
                      ? `${activeProduct.cardCount} Curated Cards`
                      : 'Curated Box Set'
                    : productPacksCount > 1
                    ? `${productPacksCount} Packs Total`
                    : 'Single Pack Expectation'}
                </span>
                {isPreconProduct ? (
                  <span className="font-mono font-semibold text-emerald-700">
                    100% Fixed Collation
                  </span>
                ) : (
                  productPacksCount > 1 && (
                    <span className="font-mono font-semibold text-slate-700">
                      ${activeBooster.evAverage.toFixed(2)} / pack
                    </span>
                  )
                )}
              </p>
            </div>

            {/* Card 4: Top 5% Ceiling */}
            <div
              id="card-stat-ceiling"
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {isPreconProduct ? 'Singles Value Ceiling' : 'Top 5% Ceiling'}
                </span>
                <BarChart3 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className={`text-3xl font-black font-mono tracking-tight ${isPreconProduct ? 'text-slate-900' : 'text-indigo-600'}`}>
                ${productMax5.toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
                <span>{isPreconProduct ? 'Equal to fixed collation' : 'God packs & chase hits'}</span>
                {isPreconProduct ? (
                  <span className="font-mono font-semibold text-slate-700">Fixed List</span>
                ) : (
                  productPacksCount > 1 && (
                    <span className="font-mono font-semibold text-indigo-700">
                      ${activeBooster.evMax5.toFixed(2)} / pack
                    </span>
                  )
                )}
              </p>
            </div>
          </div>

          {/* Graphical Product Price Quantile Distribution Curve */}
          {activeBooster && (
            <PackDistributionCurve
              productTitle={activeProduct?.displayName || `${currentSet?.name || selectedSetCode} ${activeBooster.fullBoosterName || activeBooster.boosterName}`}
              activeBooster={activeBooster}
              allSetBoosters={rawSetBoosters}
              defaultPackSealedPrice={productMarketPrice}
              multiplier={productPacksCount}
              priceMode={priceMode}
              vendor={vendor}
              isPreconstructed={isPreconProduct}
              preconSinglesEv={productEstimatedEv}
              cardCount={productTotalCards}
            />
          )}

          {/* Detailed Statistical Distribution & Audit Telemetry */}
          {activeBooster && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Distribution Range Card */}
              <div
                id="ev-range-card"
                className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {isPreconProduct ? 'Deterministic Collation & Value Guarantee' : 'Variance & Value Distribution'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isPreconProduct
                        ? `Fixed cardlist${activeProduct?.cardCount ? ` (${activeProduct.cardCount} cards)` : ''} value breakdown for ${activeProduct?.displayName || 'Preconstructed Deck'}`
                        : `Visualizing value boundaries for ${activeProduct?.displayName || 'Active Product'}`}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 font-mono">
                    Mode: {priceMode === 'direct' ? 'Direct Set Price' : 'Cheapest Reprint'}
                  </span>
                </div>

                {isPreconProduct ? (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-700 px-1">
                      <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        <span className="font-medium text-emerald-600">Fixed Singles EV:</span>
                        <span className="font-black">${productEstimatedEv.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-medium text-slate-500">Lottery Variance:</span>
                        <span className="font-bold text-slate-900">$0.00 (0%)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-medium text-slate-500">Sealed Market:</span>
                        <span className="font-bold text-rose-600 font-mono">${productMarketPrice.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Preconstructed Solid Deterministic Bar */}
                    <div className="h-14 w-full bg-emerald-600 rounded-xl overflow-hidden flex items-center justify-between px-4 text-white border-2 border-emerald-700 shadow-inner select-none">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                        <div>
                          <div className="text-xs font-extrabold uppercase tracking-wide">100% Fixed Deck Collation</div>
                          <div className="text-[10px] text-emerald-100">Every copy yields identical contents</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-emerald-200">Total Singles Value</div>
                        <div className="font-mono font-black text-sm text-white">${productEstimatedEv.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Visual Distribution Bar with Clean Top/Bottom Labels and Diamond Sealed Cost Marker */
                  <div className="space-y-4 pt-2">
                    {/* Top Indicators: Absolute Min, Average, Absolute Max (clean, without arrow clutter) */}
                    <div className="flex items-center justify-between text-xs font-mono text-slate-700 px-1">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-medium text-slate-500">Absolute Min:</span>
                        <span className="font-bold text-slate-900">${productMin.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        <span className="font-medium text-emerald-600">Average EV:</span>
                        <span className="font-black">${productEstimatedEv.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-medium text-slate-500">Absolute Max:</span>
                        <span className="font-bold text-slate-900">${productMax.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Distribution Bar Container with Sealed Price positioned just above/on top with Diamond */}
                    <div className="relative pt-7 pb-1">
                      {/* Bright Red Sealed Product Marker with Diamond sitting right on top of the bar */}
                      {(() => {
                        let sealedPos = 50;
                        if (productMarketPrice <= productMin) sealedPos = 4;
                        else if (productMarketPrice >= productMax) sealedPos = 96;
                        else if (productMarketPrice < productMid90Ev) {
                          const ratio = (productMarketPrice - productMin) / Math.max(0.01, productMid90Ev - productMin);
                          sealedPos = Math.max(4, Math.min(48, 5 + ratio * 45));
                        } else {
                          const ratio = (productMarketPrice - productMid90Ev) / Math.max(0.01, productMax - productMid90Ev);
                          sealedPos = Math.max(52, Math.min(96, 50 + ratio * 45));
                        }

                        return (
                          <div
                            style={{ left: `${sealedPos}%` }}
                            className="absolute top-0 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
                          >
                            {/* Bright Red Badge */}
                            <div className="bg-red-600 text-white font-mono text-[10px] font-black px-2 py-0.5 rounded-full shadow-md whitespace-nowrap flex items-center gap-1 border-2 border-white ring-1 ring-red-600/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                              Sealed Cost: ${productMarketPrice.toFixed(2)}
                            </div>
                            {/* Diamond pointer touching the top edge of the price bar */}
                            <div className="w-2.5 h-2.5 rotate-45 bg-red-600 border border-white -mt-1 shadow-xs"></div>
                          </div>
                        );
                      })()}

                      {/* The 3-Segment Distribution Bar with embedded metrics */}
                      <div className="h-14 w-full bg-slate-100 rounded-xl overflow-hidden flex relative border-2 border-slate-300 shadow-inner select-none">
                        {/* Duds: Bottom 5% & Value */}
                        <div
                          style={{ width: '20%' }}
                          className="bg-rose-500 hover:bg-rose-600 transition h-full flex flex-col items-center justify-center text-center px-1 text-white border-r border-rose-600/40"
                          title={`Duds (Bottom 5%): $${productMin5.toFixed(2)}`}
                        >
                          <span className="text-[11px] font-extrabold uppercase tracking-tight leading-tight">Duds</span>
                          <span className="text-[9px] font-medium opacity-90 leading-tight">Bottom 5%</span>
                          <span className="font-mono font-bold text-xs leading-tight mt-0.5">${productMin5.toFixed(2)}</span>
                        </div>

                        {/* Mid 90% & Value underneath */}
                        <div
                          style={{ width: '60%' }}
                          className="bg-emerald-600 hover:bg-emerald-700 transition h-full flex flex-col items-center justify-center text-center px-2 text-white"
                          title={`Mid 90% (Trimmed Mean): $${productMid90Ev.toFixed(2)}`}
                        >
                          <span className="text-xs font-black tracking-wide leading-tight drop-shadow-xs">Mid 90%</span>
                          <span className="font-mono font-bold text-xs leading-tight mt-0.5 opacity-95">${productMid90Ev.toFixed(2)}</span>
                        </div>

                        {/* Hits: Top 5% & Value */}
                        <div
                          style={{ width: '20%' }}
                          className="bg-indigo-600 hover:bg-indigo-700 transition h-full flex flex-col items-center justify-center text-center px-1 text-white border-l border-indigo-700/40"
                          title={`Hits (Top 5%): $${productMax5.toFixed(2)}`}
                        >
                          <span className="text-[11px] font-extrabold uppercase tracking-tight leading-tight">Hits</span>
                          <span className="text-[9px] font-medium opacity-90 leading-tight">Top 5%</span>
                          <span className="font-mono font-bold text-xs leading-tight mt-0.5">${productMax5.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Quality & Audit Card */}
              <div
                id="audit-telemetry-card"
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-base font-bold text-slate-900">Data Quality & Audit</h3>
                </div>
                <p className="text-xs text-slate-500">
                  Strict pricing resolution check verifying cards in simulated packs.
                </p>

                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                    <span className="text-slate-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Valid Complete Packs
                    </span>
                    <span className="font-mono font-bold text-emerald-600">
                      {activeBooster.completeBoosterPct.toFixed(2)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                    <span className="text-slate-600">Exact Match (Vendor+Finish)</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {activeBooster.exactMatchPct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                    <span className="text-slate-600">Finish Fallback (Foil/Normal)</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {activeBooster.differentFinishPct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                    <span className="text-slate-600">Cross-Vendor Fallback</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {activeBooster.differentVendorPct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500">Discarded Incomplete Packs</span>
                    <span className="font-mono font-bold text-slate-900">{activeBooster.failedBoosters} / 5,000</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
