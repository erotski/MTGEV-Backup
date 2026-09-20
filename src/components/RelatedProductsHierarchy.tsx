import React, { useState, useEffect, useMemo } from 'react';
import { BoosterEVRecord, ProductMetricsRecord, PriceMode, Vendor, EvBasis } from '../types';
import { dataService } from '../services/dataService';
import { resolveCardPrice } from '../utils/vendorUtils';
import { calculateEvScore, getEvScoreColorClass } from '../utils/evScore';
import { getAllRelatedSetCodes, getScryfallNode } from '../utils/setHierarchyUtils';
import {
  CatalogPackProduct,
  ProductPackagingType,
  ProductContainmentItem,
  BoosterVariation,
} from '../ecommerceBoosterData';
import { SetSymbolIcon } from './SetSymbolIcon';
import { ProductPackagingImage } from './ProductPackagingImage';
import { PackagingStockAssetGuide } from './PackagingStockAssetGuide';
import { ProductChaseCardsViewer } from './ProductChaseCardsViewer';
import { ProductBreakdownTable } from './ProductBreakdownTable';
import {
  Layers,
  Package,
  Box as BoxIcon,
  Archive,
  Gift,
  Sparkles,
  Layers3,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Shield,
  Wrench,
  CheckCircle2,
  Percent,
  Sliders,
  DollarSign,
  Info,
  ChevronRight,
  Sparkle,
  Calculator,
  Image as ImageIcon,
  Crown,
  Filter,
  List,
  HelpCircle,
  Search,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface RelatedProductsHierarchyProps {
  setCode: string;
  setName: string;
  activeBooster: BoosterEVRecord;
  priceMode: PriceMode;
  vendor: Vendor;
  evBasis?: EvBasis;
  selectedProductId?: string;
  arbitrageMap?: Record<string, any>;
  productMap?: Map<string, any> | Record<string, any>;
  preconDecks?: Record<string, any>;
  boosterEvMap?: Record<string, BoosterEVRecord[]>;
  singleCardPrices?: any;
  productMetrics?: ProductMetricsRecord[];
  onSelectProduct?: (productId: string, boosterName: string, product?: CatalogPackProduct) => void;
  onPriceModeChange?: (mode: PriceMode) => void;
  onVendorChange?: (vendor: Vendor) => void;
  onEvBasisChange?: (basis: EvBasis) => void;
}

export const RelatedProductsHierarchy: React.FC<RelatedProductsHierarchyProps> = ({
  setCode,
  setName,
  activeBooster,
  priceMode,
  vendor,
  evBasis = 'avg',
  selectedProductId: propSelectedProductId,
  arbitrageMap,
  productMap,
  preconDecks,
  boosterEvMap,
  singleCardPrices,
  productMetrics = [],
  onSelectProduct,
  onPriceModeChange,
  onVendorChange,
  onEvBasisChange,
}) => {
  const lower = (value: unknown) => String(value ?? '').toLowerCase();

  const cleanProductName = (name: string) => {
    if (!name) return '';
    let cleaned = name;
    if (setName) {
      const escaped = setName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}\\s*[-:–—]?\\s*`, 'i');
      cleaned = cleaned.replace(regex, '');
    }
    if (setCode) {
      const escapedCode = setCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const codeRegex = new RegExp(`^${escapedCode}\\b\\s*[-:–—]?\\s*`, 'i');
      cleaned = cleaned.replace(codeRegex, '');
    }
    return cleaned.trim() || name;
  };

  // Dynamic products loaded from database/pipeline (e.g. sealed products with contents)
  const [dbSealedProducts, setDbSealedProducts] = useState<CatalogPackProduct[]>([]);
  const [internalProductMap, setInternalProductMap] = useState<Map<string, any>>(new Map());
  const [isLoadingDbProducts, setIsLoadingDbProducts] = useState(true);
  const [dbProductsError, setDbProductsError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadDbProducts() {
      setIsLoadingDbProducts(true);
      setDbProductsError(null);
      try {
        const [raw, boosterMap, rawArb, rawPrecon, rawSingle] = await Promise.all([
          dataService.getSealedProducts(),
          dataService.getBoosterEVs(),
          dataService.getArbitrageRecords(),
          dataService.getPreconDecks(),
          dataService.getSingleCardPrices(),
        ]);
        if (isMounted && Array.isArray(raw)) {
          const rawProductMap = new Map<string, any>();
          for (const item of raw) {
            if (item.id || item.uuid) {
              rawProductMap.set(item.id || item.uuid, item);
            }
          }
          setInternalProductMap(rawProductMap);

          const arbitrageMap: Record<string, any> = {};
          if (Array.isArray(rawArb)) {
            rawArb.forEach((a: any) => {
              if (a.productUuid) arbitrageMap[a.productUuid] = a;
              if (a.id) arbitrageMap[a.id] = a;
            });
          }

          const setBoosterRecords: BoosterEVRecord[] = 
            boosterMap[setCode.toUpperCase()] ||
            boosterMap[lower(setCode)] ||
            boosterMap[setCode] ||
            [];

          const resolveRecursivePacks = (product: any, visited = new Set<string>()): number => {
            const pId = product.id || product.uuid;
            if (pId && visited.has(pId)) return 0;
            if (pId) visited.add(pId);

            // 1. Sealed items (primary authority for boxes, cases, prerelease packs, bundles)
            if (product.contents?.sealed && Array.isArray(product.contents.sealed)) {
              let total = 0;
              for (const s of product.contents.sealed) {
                const sCount = s.count || 1;
                const child = s.uuid ? rawProductMap.get(s.uuid) : null;
                if (child) {
                  total += sCount * resolveRecursivePacks(child, new Set(visited));
                } else {
                  if (typeof console !== 'undefined') {
                    console.warn(`[RelatedProductsHierarchy] Sealed sub-item "${s.name}" has no resolvable uuid.`);
                  }
                }
              }
              if (total > 0) return total;
            }

            // 2. Direct pack definitions
            if (product.contents?.pack && Array.isArray(product.contents.pack)) {
              const packTotal = product.contents.pack.reduce((sum: number, p: any) => sum + (p.count || 0), 0);
              if (packTotal > 0) return packTotal;
            }

            return 0;
          };

          const relatedCodes = getAllRelatedSetCodes(setCode);
          const matching = raw.filter((sp) => {
            const code = (sp.setCode || sp.set_code || '').toUpperCase();
            return relatedCodes.includes(code);
          });
          if (matching.length === 0) {
            setDbProductsError(`No MTGJSON sealed products were found for set ${setCode.toUpperCase()}.`);
            setDbSealedProducts([]);
          } else {
            const mapped: CatalogPackProduct[] = matching.map((sp: any) => {
              const pName = String(sp.displayName || sp.name || 'Sealed Product');
              const pNameLower = lower(pName);
              const sCode = String(sp.setCode || sp.set_code || setCode || '').toUpperCase();
              const category = lower(sp.category);
              const subtype = lower(sp.subtype);
              const contentsNote = String(sp.contents?.note || '');

              // Strictly database-driven packaging type assignment
              let packType: ProductPackagingType = 'other';
              if (category === 'box_set') {
                packType = 'box_set';
              } else if (category === 'booster_box') {
                packType = 'box';
              } else if (category === 'booster_case') {
                packType = 'case';
              } else if (category === 'bundle_case') {
                packType = 'bundle_case';
              } else if (category === 'booster_pack') {
                packType = 'pack';
              } else if (category === 'bundle') {
                packType = 'bundle';
              } else if (category === 'deck' || category === 'multiple_decks' || category === 'deck_box') {
                packType = 'starter_deck';
              } else if (category === 'limited_aid_case') {
                packType = pNameLower.includes('case') ? 'case' : 'kit';
              } else if (category === 'limited_aid_tool') {
                packType = 'limited_aid_tool';
              } else if (category === 'kit' || subtype === 'prerelease_kit' || pNameLower.includes('prerelease')) {
                packType = 'kit';
              } else {
                packType = 'other';
              }

              const productId = sp.uuid || sp.id;
              const selectedVendor = vendor === 'all' ? 'all_cheapest' : vendor;
              const metric = productMetrics.find((item) =>
                item.productUuid === productId && item.vendor === selectedVendor && item.priceMode === priceMode
              );
              const pCount = metric?.packCount ?? 0;
              const determinedCardCount = metric?.cardCount ?? Number(sp.cardCount || 0);
              const ownPackCode = Array.isArray(sp.contents?.pack) ? sp.contents.pack[0]?.code : undefined;
              const determinedBoosterName = lower(sp.boosterName || ownPackCode).trim();
              const vendorStats = sp.metricsByVendor?.[selectedVendor];
              const mPrice = metric?.marketPrice ?? Number(sp.marketPrice || sp.cardmarket_price || sp.tcgplayer_price || 0);
              const ev = metric?.effectiveEvByBasis?.[evBasis] ?? metric?.effectiveEv ?? 0;

              let badgeText = 'Factory Sealed';
              if (category === 'box_set') {
                badgeText = subtype === 'secret_lair_bundle' ? 'Secret Lair Bundle' : (subtype === 'secret_lair' ? 'Secret Lair Drop' : 'Box Set');
              } else if (category === 'deck') {
                badgeText = subtype === 'commander' ? 'Commander Deck' : 'Preconstructed Deck';
              } else if (category === 'booster_box') {
                badgeText = subtype === 'collector' ? 'Collector Box' : 'Booster Box';
              } else if (category === 'booster_case') {
                badgeText = subtype === 'collector' ? 'Collector Case' : 'Master Case';
              } else if (category === 'bundle') {
                badgeText = subtype === 'gift' ? 'Gift Bundle' : 'Bundle';
              } else if (contentsNote.includes('1 of them is foil')) {
                badgeText = '8 Cards (1 Foil)';
              } else if (sp.contents?.variable) {
                badgeText = 'Variable Collation';
              } else if (sp.contents?.deck) {
                badgeText = 'Fixed Deck';
              }

              const productQuantiles = sp.quantilesByVendor?.[selectedVendor];

              return {
                id: sp.uuid || sp.id || `db-${sCode}-${lower(pName).replace(/\s+/g, '-')}`,
                rawCategory: category,
                rawSubtype: subtype,
                setCode: sCode,
                setName: sp.setName || setName,
                releaseDate: sp.releaseDate || '2024-01-01',
                block: `${setName} Products`,
                packagingType: packType,
                boosterName: determinedBoosterName as any,
                displayName: pName,
                marketPrice: mPrice,
                estimatedEv: ev,
                estimatedEvMin: metric?.totalEvMin ?? 0,
                estimatedEvMid90: metric?.totalEvMid90 ?? 0,
                estimatedEvMax: metric?.totalEvMax ?? 0,
                quantiles: productQuantiles,
                quantilesByVendor: sp.quantilesByVendor,
                totalEvAvg: vendorStats?.mean,
                totalEvMid90: vendorStats?.median,
                totalEvMin5: vendorStats?.p05,
                totalEvMax5: vendorStats?.p95,
                totalEvMin: vendorStats?.min,
                totalEvMax: vendorStats?.max,
                evScore: typeof metric?.evScore === 'number' ? metric.evScore : undefined,
                archetype: sp.archetype,
                cardCount: determinedCardCount,
                packsCount: pCount,
                badge: badgeText,
                specialFeatures: sp.contents?.note?.includes('1 of them is foil')
                  ? ['8 Cards Total', '1 Guaranteed Foil (1-of-8)', '7 Non-Foil Cards']
                  : sp.contents?.variable
                  ? ['MTGJSON contents Variable Slots', 'Probabilistic Pool', 'Authentic Database Collation']
                  : sp.contents?.deck
                  ? ['Preconstructed Deck', 'Guaranteed Card List']
                  : category === 'box_set'
                  ? ['Curated Box Set', 'Factory Sealed Collection']
                  : ['Authentic MTGJSON Sealed Product'],
                rawContents: sp.contents,
                contents: sp.contents,
                category: sp.category || category,
                subtype: sp.subtype || subtype,
              };
            });
            setDbSealedProducts(mapped);
          }
        }
        if (isMounted) setIsLoadingDbProducts(false);
      } catch (e) {
        console.warn('Could not load db sealed products:', e);
        if (isMounted) {
          setDbSealedProducts([]);
          setDbProductsError('MTGJSON sealed product data could not be loaded.');
          setIsLoadingDbProducts(false);
        }
      }
    }
    loadDbProducts();
    return () => {
      isMounted = false;
    };
  }, [setCode, setName, priceMode, vendor, activeBooster, evBasis]);

  // Price & EV scaling based on priceMode & vendor
  const rawProducts = dbSealedProducts;

  // Preserve backend-generated product values; market price and EV are not interchangeable.
  const setProducts = useMemo(() => {
    return rawProducts.map((p) => {
      const scaledPrice = Number((p.marketPrice || 0).toFixed(2));

      const scaledContains = p.contains?.map((item) => ({
        ...item,
        marketPrice: Number((item.marketPrice || 0).toFixed(2)),
        estimatedEv: Number((item.estimatedEv || 0).toFixed(2)),
      }));

      const scaledContainedIn = p.containedIn?.map((item) => ({
        ...item,
        marketPrice: Number((item.marketPrice || 0).toFixed(2)),
        estimatedEv: Number((item.estimatedEv || 0).toFixed(2)),
      }));

      return {
        ...p,
        marketPrice: scaledPrice,
        estimatedEv: Number((p.estimatedEv || 0).toFixed(2)),
        contains: scaledContains,
        containedIn: scaledContainedIn,
        contents: p.contents || p.rawContents,
        rawContents: p.rawContents || p.contents,
        category: p.category || (p as any).rawCategory,
        subtype: p.subtype || (p as any).rawSubtype,
      };
    });
  }, [rawProducts]);

  // Active selected product for deep containment inspection
  const [selectedProductId, setSelectedProductId] = useState<string>(
    propSelectedProductId || setProducts.find((p) => p.packagingType === 'box')?.id || setProducts[0]?.id || ''
  );

  useEffect(() => {
    if (propSelectedProductId && propSelectedProductId !== selectedProductId) {
      setSelectedProductId(propSelectedProductId);
    }
  }, [propSelectedProductId]);

  const handleSelectProduct = (prodId: string, boosterName?: string) => {
    setSelectedProductId(prodId);
    if (onSelectProduct) {
      const found = setProducts.find(
        (p) =>
          p.id === prodId ||
          p.uuid === prodId ||
          (p.uuid && lower(p.uuid) === lower(prodId)) ||
          (p.id && lower(p.id) === lower(prodId))
      );
      onSelectProduct(prodId, boosterName || found?.boosterName || '', found);
    }
  };

  const activeProduct = useMemo(() => {
    const target = selectedProductId || propSelectedProductId;
    if (target) {
      const match = setProducts.find(
        (p) =>
          p.id === target ||
          p.uuid === target ||
          (p.uuid && lower(p.uuid) === lower(target)) ||
          (p.id && lower(p.id) === lower(target))
      );
      if (match) return match;
    }
    return setProducts.find((p) => p.packagingType === 'box') || setProducts[0];
  }, [setProducts, selectedProductId, propSelectedProductId]);

  const effectiveProductMap = useMemo(() => {
    if (productMap && (productMap instanceof Map ? productMap.size > 0 : Object.keys(productMap).length > 0)) {
      return productMap;
    }
    return internalProductMap;
  }, [productMap, internalProductMap]);

  // Helper for packaging badges
  const getCategoryStyle = (category?: string) => {
    switch (category) {
      case 'common':
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300',
          label: 'Common',
        };
      case 'uncommon':
        return {
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          label: 'Uncommon',
        };
      case 'rare_mythic':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-300',
          label: 'Rare / Mythic',
        };
      case 'wildcard':
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          label: 'Wildcard',
        };
      case 'foil':
        return {
          bg: 'bg-yellow-50 text-yellow-800 border-yellow-300',
          label: 'Foil Slot',
        };
      case 'land':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          label: 'Land',
        };
      case 'ancillary':
      default:
        return {
          bg: 'bg-slate-100 text-slate-600 border-slate-200',
          label: 'Token / Extra',
        };
    }
  };

  const getPackagingBadge = (prod: CatalogPackProduct) => {
    const name = lower(prod.displayName);
    const isCollector = name.includes('collector') || prod.boosterName === 'collector' || prod.rawSubtype === 'collector';
    const isGift = name.includes('gift') || prod.rawSubtype === 'gift';
    const isBlister = name.includes('blister') || name.includes('3-pack');

    switch (prod.packagingType) {
      case 'case':
        if (isCollector) {
          return { label: 'Collector Case', icon: Crown, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
        }
        return { label: 'Sealed Case', icon: Archive, bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'bundle_case':
        if (isGift) {
          return { label: 'Gift Bundle Case', icon: Sparkles, bg: 'bg-amber-50 text-amber-900 border-amber-300' };
        }
        return { label: 'Bundle Case', icon: Archive, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
      case 'box':
        if (isCollector) {
          return { label: 'Collector Box', icon: Crown, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
        }
        return { label: 'Booster Box', icon: BoxIcon, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'bundle':
        if (isGift) {
          return { label: 'Gift Bundle', icon: Sparkles, bg: 'bg-amber-50 text-amber-800 border-amber-300' };
        }
        return { label: 'Bundle Box', icon: Gift, bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'box_set': {
        const isSecretBundle = prod.rawSubtype === 'secret_lair_bundle' || name.includes('bundle');
        if (isSecretBundle) {
          return { label: 'Secret Lair Bundle', icon: Sparkles, bg: 'bg-amber-50 text-amber-900 border-amber-300' };
        }
        return { label: 'Secret Lair Drop', icon: Sparkles, bg: 'bg-indigo-50 text-indigo-900 border-indigo-300' };
      }
      case 'starter_deck': {
        const isCommander = prod.rawSubtype === 'commander' || name.includes('commander');
        const isSingle = !name.includes('set of') && !name.includes('4 decks') && !name.includes('(4x)');
        if (isCommander) {
          return isSingle
            ? { label: 'Commander Deck', icon: Layers3, bg: 'bg-amber-50 text-amber-800 border-amber-200' }
            : { label: 'Commander Set', icon: Layers3, bg: 'bg-amber-50 text-amber-800 border-amber-200' };
        }
        return isSingle
          ? { label: 'Precon Deck', icon: Layers3, bg: 'bg-violet-50 text-violet-800 border-violet-200' }
          : { label: 'Deck Collection', icon: Layers3, bg: 'bg-violet-50 text-violet-800 border-violet-200' };
      }
      case 'sample_pack':
        return { label: 'Sample Pack', icon: Sparkles, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
      case 'limited_aid_tool':
      case 'prerelease':
        return { label: 'Prerelease Kit', icon: Shield, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'kit':
        return { label: 'Specialty Kit', icon: Wrench, bg: 'bg-teal-50 text-teal-800 border-teal-200' };
      default:
        if (isBlister) {
          return { label: '3-Pack Blister', icon: Package, bg: 'bg-blue-50 text-blue-700 border-blue-200' };
        }
        if (isCollector) {
          return { label: 'Collector Pack', icon: Crown, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
        }
        return { label: 'Single Pack', icon: Package, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Category filtering & View Mode (Flat Grid and List)
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [gridCardStyle, setGridCardStyle] = useState<'split' | 'top_media' | 'compact'>('top_media');

  // Strictly database-driven category groupings (No fragile title-string matching!)
  const productSubtypeGroups = useMemo(() => {
    const categoryConfigs: Record<
      string,
      { title: string; subtitle: string; badge: string; icon: any }
    > = {
      booster_box: {
        title: 'Booster Boxes',
        subtitle: 'Factory-sealed booster display boxes',
        badge: 'Booster Boxes',
        icon: BoxIcon,
      },
      booster_pack: {
        title: 'Booster Packs',
        subtitle: 'Individual sealed booster packs & blister packs',
        badge: 'Booster Packs',
        icon: Package,
      },
      booster_case: {
        title: 'Booster Cases',
        subtitle: 'Wholesale master cases of sealed booster boxes',
        badge: 'Master Cases',
        icon: Archive,
      },
      bundle: {
        title: 'Bundles & Fat Packs',
        subtitle: 'Curated boxes containing booster packs, foil promos, and storage boxes',
        badge: 'Bundles',
        icon: Gift,
      },
      bundle_case: {
        title: 'Bundle Cases',
        subtitle: 'Wholesale master cases of sealed bundles',
        badge: 'Bundle Cases',
        icon: Archive,
      },
      box_set: {
        title: 'Box Sets & Secret Lairs',
        subtitle: 'Curated box sets, Secret Lair drops, and superdrop collections',
        badge: 'Box Sets',
        icon: Sparkles,
      },
      deck: {
        title: 'Preconstructed Decks',
        subtitle: 'Ready-to-play preconstructed decks (Commander, Challenger, Planeswalker)',
        badge: 'Precons',
        icon: Layers3,
      },
      multiple_decks: {
        title: 'Multi-Deck Sets',
        subtitle: 'Multi-player sets containing two or more complete decks',
        badge: 'Multi-Deck Sets',
        icon: Layers,
      },
      limited_aid_tool: {
        title: 'Prerelease & Limited Kits',
        subtitle: 'Prerelease packs, seed packs, and tournament kits',
        badge: 'Prerelease',
        icon: Shield,
      },
      kit: {
        title: 'Toolkits & Stations',
        subtitle: "Deck Builder's Toolkits, Land Stations, and Guild Kits",
        badge: 'Toolkits',
        icon: Wrench,
      },
      other: {
        title: 'Other Products',
        subtitle: 'Specialty and ancillary sealed products',
        badge: 'Other Products',
        icon: BoxIcon,
      },
    };

    const normalizeCat = (p: CatalogPackProduct): string => {
      const raw = lower(p.rawCategory);
      if (raw && categoryConfigs[raw]) return raw;
      if (p.packagingType === 'box') return 'booster_box';
      if (p.packagingType === 'pack') return 'booster_pack';
      if (p.packagingType === 'case') return 'booster_case';
      if (p.packagingType === 'bundle') return 'bundle';
      if (p.packagingType === 'bundle_case') return 'bundle_case';
      if (p.packagingType === 'box_set') return 'box_set';
      if (p.packagingType === 'starter_deck') return 'deck';
      if (p.packagingType === 'limited_aid_tool' || p.packagingType === 'prerelease') return 'limited_aid_tool';
      if (p.packagingType === 'kit') return 'kit';
      return 'other';
    };

    const groupedMap = new Map<string, CatalogPackProduct[]>();
    for (const p of setProducts) {
      const cat = normalizeCat(p);
      if (!groupedMap.has(cat)) {
        groupedMap.set(cat, []);
      }
      groupedMap.get(cat)!.push(p);
    }

    const groups: {
      id: string;
      title: string;
      subtitle: string;
      badge: string;
      icon: any;
      products: CatalogPackProduct[];
    }[] = [];

    const orderedKeys = [
      'booster_box',
      'booster_pack',
      'booster_case',
      'bundle',
      'bundle_case',
      'box_set',
      'deck',
      'multiple_decks',
      'limited_aid_tool',
      'kit',
      'other',
    ];

    for (const key of orderedKeys) {
      const prods = groupedMap.get(key);
      if (prods && prods.length > 0) {
        const conf = categoryConfigs[key] || categoryConfigs.other;
        groups.push({
          id: key,
          title: `${conf.title} (${prods.length})`,
          subtitle: conf.subtitle,
          badge: conf.badge,
          icon: conf.icon,
          products: prods,
        });
      }
    }

    for (const [key, prods] of groupedMap.entries()) {
      if (!orderedKeys.includes(key) && prods.length > 0) {
        groups.push({
          id: key,
          title: `${key.replace(/_/g, ' ')} (${prods.length})`,
          subtitle: 'Sealed product collection',
          badge: key,
          icon: BoxIcon,
          products: prods,
        });
      }
    }

    return groups;
  }, [setProducts]);

  const productCategories = useMemo(() => {
    const cats = [{ id: 'all', label: 'All Products', count: setProducts.length }];
    for (const group of productSubtypeGroups) {
      cats.push({
        id: group.id,
        label: group.title,
        count: group.products.length,
      });
    }
    return cats;
  }, [setProducts, productSubtypeGroups]);

  const displayedProducts = useMemo(() => {
    if (activeCategory === 'all') return setProducts;
    const matchingGroup = productSubtypeGroups.find((g) => g.id === activeCategory);
    if (matchingGroup) return matchingGroup.products;
    return setProducts;
  }, [setProducts, activeCategory, productSubtypeGroups]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isListCollapsed, setIsListCollapsed] = useState<boolean>(true);
  const [associatedSetFilter, setAssociatedSetFilter] = useState<string>('all');
  const COLLAPSED_LIMIT = 6;

  // Distinct associated set codes (root + all linked sub-sets) actually present among this
  // set's products, so the filter only offers choices that will return results.
  const associatedSetOptions = useMemo(() => {
    const codesInProducts = new Set(setProducts.map((p) => String(p.setCode || '').toUpperCase()).filter(Boolean));
    return getAllRelatedSetCodes(setCode)
      .filter((code) => codesInProducts.has(code))
      .map((code) => ({
        code,
        name: getScryfallNode(code)?.name || code,
        count: setProducts.filter((p) => String(p.setCode || '').toUpperCase() === code).length,
      }))
      .sort((a, b) => (a.code === setCode.toUpperCase() ? -1 : b.code === setCode.toUpperCase() ? 1 : a.name.localeCompare(b.name)));
  }, [setProducts, setCode]);

  // When a specific product is targeted via prop (e.g. from Arbitrage "Inspect Set"):
  // Select it and switch category to 'all' so it is actively visible. The list stays
  // collapsed (visibleProducts pins the active product below the fold) so navigating
  // into a set with hundreds of products doesn't force the entire list open.
  useEffect(() => {
    if (propSelectedProductId && setProducts.length > 0) {
      const match = setProducts.find(
        (p) =>
          p.id === propSelectedProductId ||
          p.uuid === propSelectedProductId ||
          (p.uuid && lower(p.uuid) === lower(propSelectedProductId)) ||
          (p.id && lower(p.id) === lower(propSelectedProductId))
      );
      if (match) {
        setSelectedProductId(match.id);
        setActiveCategory('all');
      }
    }
  }, [propSelectedProductId, setProducts]);

  // Filter products by search query and associated (sub-)set
  const filteredProducts = useMemo(() => {
    let prods = displayedProducts;
    if (associatedSetFilter !== 'all') {
      prods = prods.filter((p) => String(p.setCode || '').toUpperCase() === associatedSetFilter);
    }
    if (searchQuery.trim()) {
      const q = lower(searchQuery).trim();
      prods = prods.filter((p) =>
        lower(p.displayName).includes(q) ||
        lower(p.packagingType).includes(q) ||
        lower(p.boosterName).includes(q)
      );
    }
    return prods;
  }, [displayedProducts, searchQuery, associatedSetFilter]);

  // Smooth scroll into view when a product is targeted from props
  useEffect(() => {
    if (propSelectedProductId && activeProduct) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`btn-product-tier-${activeProduct.id}`) ||
                   document.getElementById(`btn-product-tier-list-${activeProduct.id}`) ||
                   document.getElementById('related-products-hierarchy-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [propSelectedProductId, activeProduct?.id]);

  // Determine actual items to render on the page
  const visibleProducts = useMemo(() => {
    if (!isListCollapsed) return filteredProducts;
    const base = filteredProducts.slice(0, COLLAPSED_LIMIT);
    // If an active product exists in filteredProducts but not in the first COLLAPSED_LIMIT, ensure it's included so the active card is never omitted
    if (activeProduct) {
      const isInBase = base.some(
        (p) =>
          p.id === activeProduct.id ||
          (activeProduct.uuid && p.uuid === activeProduct.uuid) ||
          (activeProduct.id && p.uuid === activeProduct.id)
      );
      if (!isInBase) {
        const fullMatch = filteredProducts.find(
          (p) =>
            p.id === activeProduct.id ||
            (activeProduct.uuid && p.uuid === activeProduct.uuid) ||
            (activeProduct.id && p.uuid === activeProduct.id)
        );
        if (fullMatch) {
          return [...base, fullMatch];
        }
      }
    }
    return base;
  }, [filteredProducts, isListCollapsed, activeProduct]);

  if (isLoadingDbProducts) {
    return (
      <div id="related-products-hierarchy-section" className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="text-sm font-bold text-slate-700">Loading MTGJSON sealed products...</div>
      </div>
    );
  }

  if (dbProductsError) {
    return (
      <div id="related-products-hierarchy-section" className="bg-white rounded-2xl p-6 border border-rose-200 shadow-sm">
        <div className="text-sm font-bold text-rose-800">MTGJSON product data unavailable</div>
        <div className="text-xs text-rose-700 mt-1">{dbProductsError}</div>
      </div>
    );
  }

  return (
    <div id="related-products-hierarchy-section" className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" /> Products Within Products & Hierarchy
            </span>
            <span className="text-xs text-slate-400">| Packaging Tiers, Containment & EV Rollup</span>
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <SetSymbolIcon setCode={setCode} size="md" />
            <span>{setName} Related Products & Containment Hierarchy</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Explore how individual booster packs roll up into Bundles, Booster Boxes, Decks, and Sealed Master Cases.
            Inspect nested contents, accessories, and packaging arbitrage discounts.
          </p>
        </div>
      </div>

      {/* 1. Packaging Tiers Interactive Section with Dedicated Left Picture Panel */}
      <div className="space-y-4">
        {/* Top Control Bar: Title & View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            1. Select Packaging Tier to Inspect Containment ({filteredProducts.length} of {setProducts.length} Products)
          </div>

          {/* View Mode & Card Style Selector */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {viewMode === 'grid' && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                <span className="text-[10px] text-slate-400 uppercase font-mono px-2 hidden lg:inline">Style:</span>
                <button
                  onClick={() => setGridCardStyle('split')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer ${
                    gridCardStyle === 'split' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Option 1: Side-by-Side Split layout"
                >
                  Option 1: Split
                </button>
                <button
                  onClick={() => setGridCardStyle('top_media')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer ${
                    gridCardStyle === 'top_media' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Option 2: Top Image Stage layout"
                >
                  Option 2: Top Media
                </button>
                <button
                  onClick={() => setGridCardStyle('compact')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer ${
                    gridCardStyle === 'compact' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Option 3: Compact Showcase layout"
                >
                  Option 3: Compact
                </button>
              </div>
            )}

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
              <button
                id="hierarchy-view-grid-btn"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'grid'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Flat grid view"
              >
                <BoxIcon className="w-3.5 h-3.5" />
                <span>Flat Grid</span>
              </button>
              <button
                id="hierarchy-view-list-btn"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'list'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Table list view with financial metrics"
              >
                <List className="w-3.5 h-3.5" />
                <span>List View</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Toolbar & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {productCategories.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto shrink-0 flex-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
                <Filter className="w-3 h-3" /> Category:
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                {productCategories.map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setActiveCategory(cat.id);
                        setIsListCollapsed(true);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                          isActive ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Associated Set Filter: narrow products down to only those tied to one specific
              sub-set (e.g. J25 Jumpstart within Foundations). Highlighted yellow when active. */}
          {associatedSetOptions.length > 1 && (
            <div className="relative w-full md:w-56 shrink-0">
              <select
                value={associatedSetFilter}
                onChange={(e) => {
                  setAssociatedSetFilter(e.target.value);
                  setIsListCollapsed(true);
                }}
                title="Filter products to only those containing cards from a specific associated set"
                className={`w-full appearance-none pl-8 pr-8 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  associatedSetFilter !== 'all'
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <option value="all">All Associated Sets</option>
                {associatedSetOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name} ({opt.code}) · {opt.count}
                  </option>
                ))}
              </select>
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
                <Filter className={`h-3.5 w-3.5 ${associatedSetFilter !== 'all' ? 'text-amber-600' : 'text-slate-400'}`} />
              </span>
              <ChevronDown className="absolute inset-y-0 right-2 my-auto h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Quick Search Box to keep list tidy */}
          <div className="relative w-full md:w-72 shrink-0">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search products by name (e.g. Bundle, Box)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsListCollapsed(true);
              }}
              className="block w-full pl-9 pr-8 py-1.5 text-xs text-slate-950 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-start gap-4">
          {/* Right Side: Flat Grid vs List */}
          <div className="flex-1 min-w-0 space-y-4">
            {viewMode === 'grid' ? (
              // FLAT GRID VIEW
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                {visibleProducts.map((prod) => {
                  const isSelected =
                    (activeProduct?.id && prod.id && activeProduct.id === prod.id) ||
                    (activeProduct?.uuid && prod.uuid && activeProduct.uuid === prod.uuid) ||
                    (activeProduct?.id && prod.uuid && activeProduct.id === prod.uuid) ||
                    (activeProduct?.uuid && prod.id && activeProduct.uuid === prod.id) ||
                    Boolean(selectedProductId && (prod.id === selectedProductId || prod.uuid === selectedProductId));
                  const badge = getPackagingBadge(prod);
                  const BadgeIcon = badge.icon;
                  const isDeterministic = prod.packsCount === 0 || (prod as any).archetype === 'pure_precon';
                  const evScore = (prod as any).evScore ?? calculateEvScore(
                    prod.marketPrice,
                    prod.estimatedEv,
                    prod.estimatedEvMin,
                    prod.estimatedEvMid90,
                    prod.estimatedEvMax,
                    isDeterministic,
                    (prod as any).quantiles,
                    prod.packsCount
                  );
                  const profit = prod.marketPrice > 0 ? prod.estimatedEv - prod.marketPrice : 0;
                  const evRoi = prod.marketPrice > 0 ? Number((((prod.estimatedEv - prod.marketPrice) / prod.marketPrice) * 100).toFixed(1)) : 0;
                  const formattedName = cleanProductName(prod.displayName);

                  if (gridCardStyle === 'top_media') {
                    // OPTION 2: TOP MEDIA STAGE (30% bigger image + floating product type badge on top + numeric EV Score (0-100) above Market price, EV Price, Expected Profit & ROI% below)
                    return (
                      <button
                        key={prod.id}
                        id={`btn-product-tier-${prod.id}`}
                        onClick={() => handleSelectProduct(prod.id, prod.boosterName)}
                        className={`rounded-2xl border text-left transition relative flex flex-col justify-between overflow-hidden cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/90 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                      >
                        {/* Top Media Stage */}
                        <div className="w-full bg-slate-50/90 p-3 border-b border-slate-100 flex items-center justify-between gap-3 relative shrink-0 min-h-[175px]">
                          {/* Left: ~30% Bigger Picture (w-36 h-36) with Floating Badge overlaid directly on top */}
                          <div className="relative w-36 h-36 shrink-0 flex items-center justify-start">
                            <ProductPackagingImage
                              productId={prod.id}
                              setCode={setCode}
                              setName={setName}
                              packagingType={prod.packagingType}
                              displayName={formattedName}
                              cardCount={prod.cardCount}
                              size="full"
                              className="w-full h-full object-contain drop-shadow-xs"
                            />
                            {/* Floating Product Type Badge directly on top of picture */}
                            <span className={`absolute top-0 left-0 px-1.5 py-0.5 rounded-md text-[9px] font-bold border flex items-center gap-1 shadow-xs backdrop-blur-md z-10 ${badge.bg}`}>
                              <BadgeIcon className="w-2.5 h-2.5" />
                              <span>{badge.label}</span>
                            </span>
                          </div>

                          {/* Right: Cards count + EV Score (0-100) + Market Price + EV Price + Expected Profit + ROI% */}
                          <div className="flex flex-col items-end justify-between self-stretch text-right font-mono py-0.5 shrink-0 min-w-[90px]">
                            <span className="text-[9px] font-bold text-slate-500 bg-white/90 backdrop-blur-xs px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs mb-auto">
                              {prod.cardCount ? `${prod.cardCount} Cards` : `${prod.packsCount} Packs`}
                            </span>

                            <div className="space-y-1 mt-auto">
                              {evScore != null && (
                                <div>
                                  <div className="text-[8px] text-slate-500 uppercase font-sans tracking-wide font-bold">EV Score</div>
                                  <div className={`text-xs font-black ${getEvScoreColorClass(evScore)}`}>
                                    {evScore}
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className="text-[8px] text-slate-400 uppercase font-sans tracking-wide">Market Price</div>
                                <div className="text-xs font-black text-slate-900">
                                  {prod.marketPrice > 0 ? `$${prod.marketPrice.toFixed(2)}` : 'Unlisted'}
                                </div>
                              </div>
                              <div>
                                <div className="text-[8px] text-emerald-600 uppercase font-sans tracking-wide">EV Price</div>
                                <div className="text-xs font-black text-emerald-600">
                                  ${prod.estimatedEv.toFixed(2)}
                                </div>
                              </div>
                              {prod.marketPrice > 0 && (
                                <>
                                  <div>
                                    <div className="text-[8px] text-slate-400 uppercase font-sans tracking-wide">Expected Profit</div>
                                    <div className={`text-xs font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[8px] text-slate-500 uppercase font-sans tracking-wide font-bold">ROI %</div>
                                    <div className="text-xs font-black text-slate-950">
                                      {evRoi >= 0 ? `+${evRoi}%` : `${evRoi}%`}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom Info Body */}
                        <div className="p-3 flex-1 flex items-center bg-white min-h-[48px]">
                          <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight" title={formattedName}>
                            {formattedName}
                          </div>
                        </div>
                      </button>
                    );
                  }

                  if (gridCardStyle === 'compact') {
                    // OPTION 3: COMPACT SHOWCASE
                    return (
                      <button
                        key={prod.id}
                        id={`btn-product-tier-${prod.id}`}
                        onClick={() => handleSelectProduct(prod.id, prod.boosterName)}
                        className={`p-3 rounded-2xl border text-left transition relative flex flex-col justify-between gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/90 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                      >
                        {/* Header: Badge & Cards */}
                        <div className="flex items-center justify-between gap-1">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 ${badge.bg}`}>
                            <BadgeIcon className="w-2.5 h-2.5" />
                            <span>{badge.label}</span>
                          </span>
                          <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {prod.cardCount ? `${prod.cardCount} Cards` : `${prod.packsCount} Packs`}
                          </span>
                        </div>

                        {/* Middle: Picture + Title */}
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-20 shrink-0 bg-slate-50 rounded-xl p-1 border border-slate-200 flex items-center justify-center">
                            <ProductPackagingImage
                              productId={prod.id}
                              setCode={setCode}
                              setName={setName}
                              packagingType={prod.packagingType}
                              displayName={formattedName}
                              cardCount={prod.cardCount}
                              size="xs"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight" title={formattedName}>
                              {formattedName}
                            </div>
                            <div className="text-[10px] font-mono flex items-center gap-2">
                              <span className="text-slate-900 font-bold">${prod.marketPrice > 0 ? prod.marketPrice.toFixed(2) : 'N/A'}</span>
                              <span className="text-emerald-600 font-bold">EV ${prod.estimatedEv.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }

                  // OPTION 1 (DEFAULT): SIDE-BY-SIDE SPLIT CARD (Product picture max 40-50% width, uniform fixed frame)
                  return (
                    <button
                      key={prod.id}
                      id={`btn-product-tier-${prod.id}`}
                      onClick={() => handleSelectProduct(prod.id, prod.boosterName)}
                      className={`p-3 rounded-2xl border text-left transition relative flex items-center gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/90 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                      }`}
                    >
                      {/* Left: Product Picture (Max 40% box width, uniform fixed size) */}
                      <div className="w-20 h-24 shrink-0 bg-slate-50/90 rounded-xl p-1 border border-slate-200 flex items-center justify-center overflow-hidden">
                        <ProductPackagingImage
                          productId={prod.id}
                          setCode={setCode}
                          setName={setName}
                          packagingType={prod.packagingType}
                          displayName={formattedName}
                          cardCount={prod.cardCount}
                          size="sm"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Right: Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch space-y-1">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 shrink-0 ${badge.bg}`}>
                              <BadgeIcon className="w-2.5 h-2.5" />
                              <span>{badge.label}</span>
                            </span>
                            <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 shrink-0">
                              {prod.cardCount ? `${prod.cardCount} Cds` : `${prod.packsCount} Pks`}
                            </span>
                          </div>

                          <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight" title={formattedName}>
                            {formattedName}
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-slate-100 font-mono flex items-end justify-between">
                          <div>
                            <div className="text-[8px] text-slate-400 uppercase font-sans">Market</div>
                            <div className="text-xs font-black text-slate-900">
                              {prod.marketPrice > 0 ? `$${prod.marketPrice.toFixed(2)}` : 'N/A'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[8px] text-emerald-600 uppercase font-sans">EV</div>
                            <div className="text-xs font-black text-emerald-600">
                              ${prod.estimatedEv.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              // LIST / TABLE VIEW (Financial & Containment Overview)
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Packaging Tier</th>
                      <th className="p-3">Packs</th>
                      <th className="p-3">Cards</th>
                      <th className="p-3">Market Price</th>
                      <th className="p-3">Simulated EV</th>
                      <th className="p-3">Margin ($)</th>
                      <th className="p-3">EV ROI (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {visibleProducts.map((p) => {
                      const isCurrent =
                        (activeProduct?.id && p.id && activeProduct.id === p.id) ||
                        (activeProduct?.uuid && p.uuid && activeProduct.uuid === p.uuid) ||
                        (activeProduct?.id && p.uuid && activeProduct.id === p.uuid) ||
                        (activeProduct?.uuid && p.id && activeProduct.uuid === p.id) ||
                        Boolean(selectedProductId && (p.id === selectedProductId || p.uuid === selectedProductId));
                      const badge = getPackagingBadge(p);
                      const BadgeIcon = badge.icon;
                      const margin = p.estimatedEv - p.marketPrice;
                      const roi = p.marketPrice > 0 ? (margin / p.marketPrice) * 100 : 0;

                      return (
                        <tr
                          key={p.id}
                          id={`btn-product-tier-list-${p.id}`}
                          onClick={() => handleSelectProduct(p.id, p.boosterName)}
                          className={`hover:bg-indigo-50/50 transition cursor-pointer ${
                            isCurrent
                              ? 'bg-indigo-50/90 font-medium text-slate-900 ring-1 ring-inset ring-indigo-400'
                              : 'text-slate-800'
                          }`}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`p-1 rounded shrink-0 ${badge.bg}`}>
                                <BadgeIcon className="w-3.5 h-3.5" />
                              </span>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900" title={cleanProductName(p.displayName)}>
                                  {cleanProductName(p.displayName)}
                                </span>
                                {p.badge && (
                                  <span className="ml-2 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-semibold">
                                    {p.badge}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                            {p.packsCount > 1 
                              ? `${p.packsCount}x Packs` 
                              : p.packsCount === 1 
                              ? '1x Pack' 
                              : p.cardCount === 1 
                              ? '1 Single Card' 
                              : p.cardCount && p.cardCount > 1 
                              ? `${p.cardCount} Cards` 
                              : '0 Packs'}
                          </td>
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                            {p.cardCount ? `${p.cardCount} cards` : '—'}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {p.marketPrice > 0 ? `$${p.marketPrice.toFixed(2)}` : <span className="text-slate-400 font-normal text-[11px]">Unlisted</span>}
                          </td>
                          <td className="p-3 font-mono font-bold text-emerald-600 whitespace-nowrap">
                            ${p.estimatedEv.toFixed(2)}
                          </td>
                          <td className="p-3 font-mono font-bold whitespace-nowrap">
                            {p.marketPrice > 0 ? (
                              <span className={margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {margin >= 0 ? `+$${margin.toFixed(2)}` : `-$${Math.abs(margin).toFixed(2)}`}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal text-[11px]">—</span>
                            )}
                          </td>
                          <td className="p-3 font-mono font-bold whitespace-nowrap">
                            {p.marketPrice > 0 ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  roi >= 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {roi >= 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal text-[11px]">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Show More / Show Less Button to keep the list clean when there are too many items */}
            {filteredProducts.length > COLLAPSED_LIMIT && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setIsListCollapsed(!isListCollapsed)}
                  className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl shadow-xs transition cursor-pointer"
                >
                  {isListCollapsed ? (
                    <>
                      <span>Show {filteredProducts.length - COLLAPSED_LIMIT} More Products</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Show Less</span>
                      <ChevronUp className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Slot Information with Option Collation (0, 1, 2...) OR Preconstructed Deck Contents */}
      {activeProduct && (
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-5">
          {(() => {
            const isDeck =
              activeProduct.packagingType === 'starter_deck' ||
              lower(activeProduct.displayName).includes('commander deck') ||
              activeProduct.rawCategory === 'deck';

            return (
              <div className="space-y-6">
                {/* Product & Prize breakdown (Collapsible, default expanded, positioned above Authentic MTGJSON Booster Collation) */}
                <ProductBreakdownTable
                  product={activeProduct}
                  vendor={vendor}
                  priceMode={priceMode}
                  evBasis={evBasis}
                  arbitrageMap={arbitrageMap}
                  productMap={effectiveProductMap}
                  preconDecks={preconDecks}
                  boosterEvMap={boosterEvMap}
                  singleCardPrices={singleCardPrices}
                  title="Product & Prize breakdown"
                  collapsible={true}
                  defaultCollapsed={false}
                />

                {/* Chase Cards Within This Product */}
                <ProductChaseCardsViewer
                  product={activeProduct}
                  setCode={activeProduct.setCode}
                  priceMode={priceMode}
                  vendor={vendor}
                  singleCardPrices={singleCardPrices}
                  allProducts={rawProducts || setProducts}
                  preconDecks={preconDecks}
                  onSelectRelatedProduct={(prodId) => handleSelectProduct(prodId)}
                />
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
