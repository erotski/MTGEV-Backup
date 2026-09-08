import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BoosterEVRecord, PriceMode, Vendor, PreconstructedDeckDetail } from '../types';
import { PRECON_DECK_DETAILS } from '../services/chaseCardsService';
import {
  RecursiveProductBreakdownResult,
  resolveRecursiveProductAudit,
  getCardsPerPack,
  getCanonicalProductMetrics,
} from '../utils/productUtils';
import { findBoosterEv, resolveCardPrice, normalizeVendor } from '../utils/vendorUtils';
import { ProductBreakdownModal } from './ProductBreakdownModal';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import {
  Calculator,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Box,
  Package,
  Layers,
  Code2,
  Search,
} from 'lucide-react';

export interface ProductBreakdownTableProps {
  product: any;
  arbitrageMap?: Record<string, any>;
  productMap?: Map<string, any> | Record<string, any>;
  preconDecks?: Record<string, PreconstructedDeckDetail>;
  boosterEvMap?: Record<string, BoosterEVRecord[]>;
  singleCardPrices?: any;
  vendor?: Vendor;
  priceMode?: PriceMode;
  reprintMultiplier?: number;
  auditResult?: RecursiveProductBreakdownResult | null;
  className?: string;
  theme?: 'dark' | 'light';
  hideModalLaunchButton?: boolean;
  title?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const ProductBreakdownTable: React.FC<ProductBreakdownTableProps> = ({
  product,
  arbitrageMap = {},
  productMap = new Map(),
  preconDecks = {},
  boosterEvMap = {},
  singleCardPrices = { byUuid: {}, byName: {}, byNameSet: {} },
  vendor = 'all',
  priceMode = 'direct',
  reprintMultiplier = 1.0,
  auditResult: passedAuditResult,
  className = '',
  theme = 'dark',
  hideModalLaunchButton = false,
  title = 'Product & Prize breakdown',
  collapsible = true,
  defaultCollapsed = true,
}) => {
  if (!product) return null;

  const [viewMode, setViewMode] = useState<'table' | 'visual_tree' | 'raw_json'>('table');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [inspectedProduct, setInspectedProduct] = useState<CatalogPackProduct | null>(null);
  const [inspectedDeckDetail, setInspectedDeckDetail] = useState<PreconstructedDeckDetail | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(defaultCollapsed);

  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [product?.id || product?.uuid, defaultCollapsed]);

  const toggleExpand = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: prev[nodeKey] === undefined ? false : !prev[nodeKey],
    }));
  };

  const getProductFromMap = useCallback(
    (id?: string) => {
      if (!id) return null;
      if (productMap instanceof Map) return productMap.get(id) || null;
      return (productMap as any)[id] || null;
    },
    [productMap]
  );

  // Helper to resolve pack details and individual pack EV
  const resolvePack = useCallback(
    (pk: any, parentSetCode: string) => {
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
    },
    [boosterEvMap, vendor, priceMode, reprintMultiplier]
  );

  // Helper to resolve card prices and EV
  const resolveCard = useCallback(
    (cd: any, parentSetCode: string, parentProduct?: any) => {
      if (!cd) {
        return {
          name: 'Promo Card',
          number: '',
          set: (parentSetCode || '').toUpperCase(),
          uuid: '',
          foil: false,
          isFoil: false,
          finish: 'Nonfoil',
          price: 0,
          ev: 0,
          prices: {
            tcgplayer: 0,
            cardkingdom: 0,
            cardmarket: 0,
            cardmarketEur: 0,
            all: 0,
          },
          isEstimated: false,
        };
      }

      const name = cd.name || 'Promo Card';
      const normName = name.toLowerCase().trim();
      const setCode = (cd.set || parentSetCode || '').toLowerCase();
      const uuid = cd.uuid || '';

      let isFoil = false;
      if (cd.foil === true || cd.isFoil === true) {
        isFoil = true;
      } else if (cd.foil === false || cd.isFoil === false) {
        isFoil = false;
      } else if (Array.isArray(cd.finishes) && cd.finishes.length === 1 && cd.finishes[0] === 'foil') {
        isFoil = true;
      } else if (parentProduct) {
        const pName = (parentProduct.displayName || parentProduct.name || '').toLowerCase();
        const pSub = (parentProduct.subtype || '').toLowerCase();
        if ((pName.includes('foil') || pSub.includes('foil')) && !pName.includes('non-foil') && !pName.includes('non foil')) {
          isFoil = true;
        }
      }

      const fromIndex =
        (uuid && singleCardPrices?.byUuid?.[uuid]) ||
        singleCardPrices?.byNameSet?.[`${normName}___${setCode}`] ||
        singleCardPrices?.byNameSet?.[`${normName}_${setCode}`] ||
        singleCardPrices?.byName?.[normName];

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
      }

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
        price: unitPrice,
        ev: unitEv,
        prices,
        isEstimated,
      };
    },
    [singleCardPrices, vendor, reprintMultiplier]
  );

  // Compute product contents EV
  const computeProductContentsEv = useCallback(
    (prod: any, mult: number = 1): number => {
      const canonical = getCanonicalProductMetrics(
        prod,
        productMap instanceof Map ? productMap : new Map(Object.entries(productMap)),
        arbitrageMap,
        boosterEvMap,
        preconDecks,
        singleCardPrices,
        vendor || 'all',
        (priceMode || 'direct') as PriceMode
      );
      if (canonical.estimatedEv > 0) {
        return Number((canonical.estimatedEv * mult).toFixed(2));
      }
      const pUid = prod.id || prod.uuid || '';
      const directArb = arbitrageMap[pUid];
      if (directArb && directArb.totalEvAvg > 0) {
        return Number((directArb.totalEvAvg * reprintMultiplier * mult).toFixed(2));
      }
      return 0;
    },
    [productMap, arbitrageMap, boosterEvMap, preconDecks, singleCardPrices, vendor, priceMode, reprintMultiplier]
  );

  // Resolve audit if not passed directly
  const audit: RecursiveProductBreakdownResult = useMemo(() => {
    return (
      passedAuditResult ||
      resolveRecursiveProductAudit(
        product,
        productMap instanceof Map ? productMap : new Map(Object.entries(productMap)),
        arbitrageMap,
        boosterEvMap,
        preconDecks,
        singleCardPrices,
        vendor || 'all',
        (priceMode || 'direct') as PriceMode,
        1
      )
    );
  }, [passedAuditResult, product, productMap, arbitrageMap, boosterEvMap, preconDecks, singleCardPrices, vendor, priceMode]);

  const uid = product.id || product.uuid || product.productUuid || '';
  const arb = arbitrageMap[uid];
  const marketPrice = product.marketPrice || (arb ? arb.marketPrice : 0);
  const totalEv = audit.totalEv > 0 ? audit.totalEv : (arb ? arb.totalEvAvg * reprintMultiplier : 0);
  const netSpread = totalEv > 0 && marketPrice > 0 ? Number((totalEv - marketPrice).toFixed(2)) : 0;
  const roiPct = marketPrice > 0 ? Number(((netSpread / marketPrice) * 100).toFixed(1)) : 0;
  const arbRatio = marketPrice > 0 && totalEv > 0 ? totalEv / marketPrice : 0;

  const isDark = theme === 'dark';

  // Calculate table totals
  const totalPackQty = audit.packItems.reduce((acc, p) => acc + p.count, 0);
  const totalCardQty = audit.cardItems.reduce((acc, c) => acc + c.count, 0);
  const totalSealedQty = audit.sealedItems.reduce((acc, s) => acc + s.count, 0);
  const totalDeckQty = audit.deckItems.reduce((acc, d) => acc + d.count, 0);
  const totalVariableQty = audit.variableItems.length;
  const totalOtherQty = audit.otherItems.reduce((acc, o) => acc + o.count, 0);
  const totalQty = totalPackQty + totalCardQty + totalSealedQty + totalDeckQty + totalVariableQty + totalOtherQty;

  const totalPackCards = audit.packItems.reduce((acc, p) => acc + (p.totalCards || (p.count * (p.cardsPerPack || 15))), 0);
  const totalCardCards = audit.cardItems.reduce((acc, c) => acc + c.count, 0);
  const totalSealedCards = audit.sealedItems.reduce((acc, s) => acc + (s.totalCards || (s.count * 15)), 0);
  const totalDeckCards = audit.deckItems.reduce((acc, d) => acc + (d.totalCards || (d.count * (d.cardCount || 100))), 0);
  const totalVariableCards = audit.variableItems.reduce((acc, v) => acc + (v.configs[0]?.items?.reduce((s, it) => s + (it.count || 1), 0) || 1), 0);
  const calculatedTotalCards = audit.totalCards > 0 
    ? audit.totalCards 
    : (totalPackCards + totalCardCards + totalSealedCards + totalDeckCards + totalVariableCards);

  const subtotalEvSum = Number((
    audit.packItems.reduce((acc, p) => acc + p.subtotalEv, 0) +
    audit.cardItems.reduce((acc, c) => acc + c.subtotalEv, 0) +
    audit.sealedItems.reduce((acc, s) => acc + s.subtotalEv, 0) +
    audit.deckItems.reduce((acc, d) => acc + d.subtotalSinglesEv, 0) +
    audit.variableItems.reduce((acc, v) => acc + v.slotEv, 0)
  ).toFixed(2));
  const displayedTotalEv = totalEv > 0 ? totalEv : subtotalEvSum;

  // Prepare product for modal
  const modalProduct: CatalogPackProduct = useMemo(() => {
    const p = product;
    const pId = p.id || p.uuid || p.productUuid || '';
    const matchedDeck = preconDecks[pId] || preconDecks[(p.displayName || p.name || '').toLowerCase()];
    return {
      id: pId,
      setCode: p.setCode || '',
      setName: p.setName || p.setCode || '',
      displayName: p.displayName || p.name || '',
      packagingType: (p.category || p.packagingType || 'booster_box') as any,
      boosterName: 'default' as any,
      marketPrice: marketPrice,
      estimatedEv: displayedTotalEv,
      packsCount: audit.totalPacks,
      cardCount: calculatedTotalCards || matchedDeck?.cardCount || 0,
      rawCategory: p.category || p.rawCategory,
      rawSubtype: p.subtype || p.rawSubtype,
      rawContents: (p.contents || p.rawContents) as any,
      releaseDate: p.releaseDate || '',
      block: p.block || '',
      specialFeatures: p.specialFeatures || [],
    };
  }, [product, marketPrice, displayedTotalEv, audit.totalPacks, calculatedTotalCards, preconDecks]);

  // Per-component inspection triggers (Magnifying Glass handlers)
  const handleInspectPack = useCallback(
    (p: { packName?: string; code?: string; set?: string; count?: number; unitEv?: number; cardsPerPack?: number }) => {
      const packCode = (p.code || 'play').toLowerCase();
      const packSet = (p.set || product?.setCode || 'hob').toLowerCase();
      const displayName = p.packName || `${packSet.toUpperCase()} ${packCode.replace(/-/g, ' ')} Booster Pack`;

      let matchedCatalogProd: any = null;
      if (productMap) {
        if (productMap instanceof Map) {
          for (const item of productMap.values()) {
            if (
              (item.setCode || '').toLowerCase() === packSet &&
              ((item.subtype || '').toLowerCase() === packCode ||
                (item.displayName || '').toLowerCase().includes(packCode))
            ) {
              matchedCatalogProd = item;
              break;
            }
          }
        } else {
          for (const item of Object.values(productMap)) {
            if (
              ((item as any).setCode || '').toLowerCase() === packSet &&
              (((item as any).subtype || '').toLowerCase() === packCode ||
                ((item as any).displayName || '').toLowerCase().includes(packCode))
            ) {
              matchedCatalogProd = item;
              break;
            }
          }
        }
      }

      const inspected: CatalogPackProduct = {
        id: matchedCatalogProd?.id || `pack-${packSet}-${packCode}`,
        setCode: packSet,
        setName: matchedCatalogProd?.setName || packSet.toUpperCase(),
        displayName: matchedCatalogProd?.displayName || displayName,
        packagingType: 'booster_pack' as any,
        boosterName: packCode as any,
        marketPrice: matchedCatalogProd?.marketPrice || p.unitEv || 0,
        estimatedEv: p.unitEv || matchedCatalogProd?.estimatedEv || 0,
        packsCount: 1,
        cardCount: p.cardsPerPack || getCardsPerPack(packCode, 'booster_pack', packCode) || 15,
        rawCategory: 'booster_pack',
        rawSubtype: packCode,
        rawContents: {
          pack: [{ code: packCode, set: packSet, count: 1 }],
        },
        releaseDate: matchedCatalogProd?.releaseDate || product?.releaseDate || '',
        block: matchedCatalogProd?.block || product?.block || '',
        specialFeatures: ['Authentic Booster Collation', `${p.cardsPerPack || 15} Cards per Pack`],
      };

      setInspectedProduct(inspected);
      setShowBreakdownModal(true);
    },
    [product, productMap]
  );

  const handleInspectCard = useCallback(
    (c: { name: string; set?: string; number?: string; foil?: boolean; unitEv?: number }) => {
      const cardSet = (c.set || product?.setCode || '').toLowerCase();
      const inspected: CatalogPackProduct = {
        id: `card-${cardSet}-${c.number || c.name}`,
        setCode: cardSet,
        setName: cardSet.toUpperCase(),
        displayName: c.name,
        packagingType: 'single_card' as any,
        boosterName: 'single_card' as any,
        marketPrice: c.unitEv || 0,
        estimatedEv: c.unitEv || 0,
        packsCount: 0,
        cardCount: 1,
        rawCategory: 'card',
        rawContents: {
          card: [c],
        },
        releaseDate: product?.releaseDate || '',
        block: product?.block || '',
        specialFeatures: [c.foil ? 'Foil Promo Card' : 'Single Card'],
      };

      setInspectedProduct(inspected);
      setShowBreakdownModal(true);
    },
    [product]
  );

  const handleInspectDeck = useCallback(
    (d: { name: string; set?: string; cardCount?: number; unitSinglesEv?: number; isFoil?: boolean }) => {
      const deckSet = (d.set || product?.setCode || '').toLowerCase();
      const cleanTargetName = (d.name || '').toLowerCase().trim();
      const matchedDeck: PreconstructedDeckDetail | undefined =
        preconDecks[d.name] ||
        preconDecks[cleanTargetName] ||
        PRECON_DECK_DETAILS[d.name] ||
        PRECON_DECK_DETAILS[cleanTargetName] ||
        (product?.id ? preconDecks[product.id] || PRECON_DECK_DETAILS[product.id] : undefined) ||
        (product?.displayName ? preconDecks[product.displayName.toLowerCase()] || PRECON_DECK_DETAILS[product.displayName.toLowerCase()] : undefined) ||
        (Object.values(preconDecks) as PreconstructedDeckDetail[]).find(
          (deck) =>
            deck.deckName &&
            (deck.deckName.toLowerCase() === cleanTargetName ||
              cleanTargetName.includes(deck.deckName.toLowerCase()) ||
              deck.deckName.toLowerCase().includes(cleanTargetName))
        ) ||
        Object.values(PRECON_DECK_DETAILS).find(
          (deck) =>
            deck.deckName &&
            (deck.deckName.toLowerCase() === cleanTargetName ||
              cleanTargetName.includes(deck.deckName.toLowerCase()) ||
              deck.deckName.toLowerCase().includes(cleanTargetName))
        );

      const inspected: CatalogPackProduct = {
        id: matchedDeck?.deckName || d.name,
        setCode: deckSet,
        setName: deckSet.toUpperCase(),
        displayName: matchedDeck?.deckName || d.name,
        packagingType: 'commander_deck' as any,
        boosterName: 'default' as any,
        marketPrice: d.unitSinglesEv || matchedDeck?.totalSinglesEv || (product && (product.rawCategory === 'commander_deck' || product.packagingType === 'commander_deck' as any) ? product.marketPrice : 0) || 0,
        estimatedEv: d.unitSinglesEv || matchedDeck?.totalSinglesEv || (product && (product.rawCategory === 'commander_deck' || product.packagingType === 'commander_deck' as any) ? product.estimatedEv : 0) || 0,
        packsCount: 0,
        cardCount: d.cardCount || matchedDeck?.cardCount || 100,
        rawCategory: 'commander_deck',
        rawContents: {
          deck: [{ name: matchedDeck?.deckName || d.name, set: deckSet }],
        },
        releaseDate: product?.releaseDate || '',
        block: product?.block || '',
        specialFeatures: [d.isFoil ? 'Foil Commander Deck' : 'Preconstructed Deck'],
      };
      (inspected as any).deckDetail = matchedDeck;

      setInspectedProduct(inspected);
      setInspectedDeckDetail(matchedDeck || null);
      setShowBreakdownModal(true);
    },
    [product, preconDecks]
  );

  const handleInspectSealed = useCallback(
    (s: { name: string; set?: string; uuid?: string; unitEv?: number; count?: number }) => {
      const childProd = s.uuid ? getProductFromMap(s.uuid) : null;
      if (childProd) {
        const childContents = childProd.contents || childProd.rawContents;
        const childPackCode = childContents?.pack?.[0]?.code || childProd.subtype || 'play';
        const inspected: CatalogPackProduct = {
          id: childProd.id || childProd.uuid || s.uuid || '',
          setCode: childProd.setCode || s.set || product?.setCode || '',
          setName: childProd.setName || childProd.setCode || s.set || '',
          displayName: childProd.displayName || childProd.name || s.name,
          packagingType: (childProd.category || childProd.packagingType || 'booster_pack') as any,
          boosterName: (childProd.subtype || childPackCode) as any,
          marketPrice: childProd.marketPrice || s.unitEv || 0,
          estimatedEv: childProd.estimatedEv || s.unitEv || 0,
          packsCount: childProd.packsCount || (childContents?.pack?.length ? 1 : 0),
          cardCount: childProd.cardCount || 15,
          rawCategory: childProd.category || childProd.rawCategory,
          rawSubtype: childProd.subtype || childProd.rawSubtype || childPackCode,
          rawContents: childContents,
          releaseDate: childProd.releaseDate || product?.releaseDate || '',
          block: childProd.block || product?.block || '',
          specialFeatures: childProd.specialFeatures || [],
        };
        setInspectedProduct(inspected);
      } else {
        const sSet = (s.set || product?.setCode || '').toLowerCase();
        const isPack = s.name.toLowerCase().includes('pack') || s.name.toLowerCase().includes('booster');
        const packCode = s.name.toLowerCase().includes('collector') ? 'collector' : 'play';
        const inspected: CatalogPackProduct = {
          id: s.uuid || `sealed-${s.name}`,
          setCode: sSet,
          setName: sSet.toUpperCase(),
          displayName: s.name,
          packagingType: isPack ? ('booster_pack' as any) : ('booster_box' as any),
          boosterName: (isPack ? packCode : 'default') as any,
          marketPrice: s.unitEv || 0,
          estimatedEv: s.unitEv || 0,
          packsCount: isPack ? 1 : s.count || 1,
          cardCount: 15,
          rawCategory: isPack ? 'booster_pack' : 'sealed',
          rawSubtype: packCode,
          rawContents: { sealed: [s], pack: isPack ? [{ code: packCode, set: sSet }] : undefined },
          releaseDate: product?.releaseDate || '',
          block: product?.block || '',
          specialFeatures: [],
        };
        setInspectedProduct(inspected);
      }
      setShowBreakdownModal(true);
    },
    [product, getProductFromMap]
  );

  // Recursive tree renderer matching the Admin Portal Visual Tree
  const renderProductTree = (
    item: any,
    multiplier: number = 1,
    depth: number = 0,
    parentKey: string = 'root'
  ) => {
    if (!item) return null;
    const currentUid = item.id || item.uuid || item.productUuid || '';
    const nodeArb = arbitrageMap[currentUid];
    const nodeKey = `${parentKey}-${currentUid}-${depth}`;
    const isExpanded = expandedNodes[nodeKey] !== false;

    const itemContents = item.contents || item.rawContents;

    const hasSealedChildren = Boolean(itemContents?.sealed && itemContents.sealed.length > 0);
    const hasPacks = Boolean(itemContents?.pack && itemContents.pack.length > 0);
    const hasCards = Boolean(itemContents?.card && itemContents.card.length > 0);
    const hasDecks = Boolean(itemContents?.deck && itemContents.deck.length > 0);
    const hasVariables = Boolean(itemContents?.variable && itemContents.variable.length > 0);
    const hasOther = Boolean(itemContents?.other && itemContents.other.length > 0);
    const hasAnyContent = hasSealedChildren || hasPacks || hasCards || hasDecks || hasVariables || hasOther;

    const nodeContentsEv = nodeArb && nodeArb.totalEvAvg > 0 ? nodeArb.totalEvAvg * multiplier : computeProductContentsEv(item, multiplier);

    return (
      <div key={nodeKey} className="space-y-3">
        {/* Node Card */}
        <div
          className={`rounded-2xl border transition-all ${
            depth === 0
              ? 'bg-slate-900 border-slate-700 text-white p-5 shadow-lg'
              : 'bg-slate-800/90 border-slate-700 text-slate-100 p-4 shadow-sm'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {hasAnyContent ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(nodeKey)}
                  className={`mt-0.5 p-1 rounded-lg transition cursor-pointer ${
                    depth === 0 ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-700 text-slate-300'
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
                      depth === 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {(item.setCode || '').toUpperCase()}
                  </span>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded capitalize ${
                      depth === 0 ? 'bg-slate-800 text-slate-300' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {(item.category || item.packagingType || 'product').replace(/_/g, ' ')}
                  </span>
                  {item.subtype && (
                    <span
                      className={`font-mono text-[11px] px-2 py-0.5 rounded capitalize ${
                        depth === 0 ? 'bg-slate-800 text-slate-400' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {item.subtype.replace(/_/g, ' ')}
                    </span>
                  )}
                  {multiplier > 1 && (
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      ×{multiplier} Multiplier
                    </span>
                  )}
                </div>

                <div className="font-bold text-base sm:text-lg flex flex-wrap items-center gap-2">
                  <span>{item.displayName || item.name}</span>
                  {depth > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInspectSealed({
                          name: item.displayName || item.name,
                          set: item.setCode,
                          uuid: currentUid,
                          unitEv: nodeContentsEv / (multiplier || 1),
                          count: multiplier,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-amber-400/20 text-slate-200 hover:text-amber-300 border border-slate-600 hover:border-amber-400/40 transition text-xs font-semibold cursor-pointer shadow-xs"
                      title={`Inspect ${item.displayName || item.name} contents & collation`}
                    >
                      <Search className="w-3.5 h-3.5 text-amber-400" />
                      <span>Inspect</span>
                    </button>
                  )}
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

                <div className="text-xs font-mono text-slate-400">
                  UUID: <span className="select-all">{currentUid || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Metrics Breakdown Pill */}
            <div className="flex flex-wrap items-center gap-3">
              {depth === 0 && (
                <div className="px-3 py-2 rounded-xl text-xs flex flex-col bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Product Market Price</span>
                  <span className="font-bold font-mono text-sm text-emerald-400">
                    ${Number(marketPrice || 0).toFixed(2)}
                  </span>
                </div>
              )}

              {nodeContentsEv > 0 && (
                <div className="px-3 py-2 rounded-xl text-xs flex flex-col bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    {depth === 0 ? 'Aggregated Contents EV' : 'Contents EV Contribution'}
                  </span>
                  <span className="font-bold font-mono text-sm text-amber-400">
                    ${nodeContentsEv.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="px-3 py-2 rounded-xl text-xs flex flex-col bg-slate-800/80 border border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400">Composition</span>
                <span className="font-bold font-mono text-xs text-slate-200">
                  {itemContents ? (
                    <>
                      {[
                        itemContents.deck?.length ? `${itemContents.deck.length * multiplier} Decks` : null,
                        itemContents.pack?.length ? `${itemContents.pack.reduce((a: number, p: any) => a + (p.count || 1), 0) * multiplier} Packs` : null,
                        itemContents.card?.length ? `${itemContents.card.reduce((a: number, c: any) => a + (c.count || 1), 0) * multiplier} Cards` : null,
                        itemContents.other?.length ? `${itemContents.other.length * multiplier} Accessories` : null,
                        itemContents.variable?.length ? `${itemContents.variable.length * multiplier} Variable Bonus Slots` : null,
                        itemContents.sealed?.length ? `${itemContents.sealed.reduce((a: number, s: any) => a + (s.count || 1), 0) * multiplier} Sealed Units` : null,
                      ].filter(Boolean).join(' • ') || (nodeArb ? `${nodeArb.packCount * multiplier} Packs` : 'Direct Item')}
                    </>
                  ) : nodeArb ? (
                    <>{nodeArb.packCount * multiplier} Packs</>
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
          <div className="pl-4 sm:pl-6 border-l-2 border-slate-800 ml-3 sm:ml-4 space-y-3">
            {/* 1. Nested Sealed Products */}
            {hasSealedChildren &&
              itemContents!.sealed!.map((sub: any, idx: number) => {
                const childUid = sub.uuid;
                const childProd = childUid ? getProductFromMap(childUid) : null;
                const subCount = sub.count || 1;

                if (childProd) {
                  return renderProductTree(childProd, multiplier * subCount, depth + 1, `${nodeKey}-sealed-${idx}`);
                }

                return (
                  <div
                    key={`${nodeKey}-sealed-unmapped-${idx}`}
                    className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700 text-slate-200 text-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-indigo-400" />
                      <span className="font-bold">{sub.name}</span>
                      <span className="px-2 py-0.5 bg-indigo-900/60 text-indigo-300 rounded font-mono font-bold">
                        ×{subCount * multiplier}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 font-mono text-[11px]">Set: {(sub.set || '').toUpperCase()}</span>
                      <button
                        type="button"
                        onClick={() => handleInspectSealed(sub)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-blue-400/20 text-slate-200 hover:text-blue-300 border border-slate-600 hover:border-blue-400/40 transition text-xs font-semibold cursor-pointer shadow-xs"
                        title={`Inspect ${sub.name}`}
                      >
                        <Search className="w-3.5 h-3.5 text-blue-400" />
                        <span>Inspect</span>
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* 2. Direct Booster Packs with Per-Pack EV */}
            {hasPacks && (
              <div className="bg-slate-850 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-400" />
                    <span>Contained Booster Packs ({itemContents!.pack!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">
                    Booster pack EV contribution
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {itemContents!.pack!.map((pk: any, idx: number) => {
                    const count = (pk.count || 1) * multiplier;
                    const res = resolvePack(pk, item.setCode || '');
                    const subtotalEv = Number((count * res.unitEvAvg).toFixed(2));

                    return (
                      <div
                        key={`${nodeKey}-pack-${idx}`}
                        className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700 shadow-2xs space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {res.setCode}
                            </span>
                            <span className="font-bold text-slate-200 text-sm capitalize">
                              {res.boosterCode.replace(/-/g, ' ')} Booster Pack
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleInspectPack({
                                  packName: `${res.setCode.toUpperCase()} ${res.boosterCode.replace(/-/g, ' ')} Booster Pack`,
                                  code: res.boosterCode,
                                  set: res.setCode,
                                  count,
                                  unitEv: res.unitEvAvg,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-amber-400/20 text-slate-200 hover:text-amber-300 border border-slate-600 hover:border-amber-400/40 transition text-xs font-semibold cursor-pointer shadow-xs"
                              title="Inspect booster slots, odds, & card collation"
                            >
                              <Search className="w-3.5 h-3.5 text-amber-400" />
                              <span>Inspect</span>
                            </button>
                            <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg font-mono font-black text-xs self-start sm:self-auto">
                              ×{count} {count === 1 ? 'Pack' : 'Packs'}
                              {multiplier > 1 && ` (${pk.count || 1} × ${multiplier})`}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-750">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Pack EV (Single)</div>
                            <div className="font-mono font-bold text-amber-400 text-xs sm:text-sm">
                              ${res.unitEvAvg.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono">Mid90: ${res.unitEvMid90.toFixed(2)}</div>
                          </div>

                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-750">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">EV Range (Min – Max)</div>
                            <div className="font-mono font-bold text-slate-300 text-xs sm:text-sm">
                              ${res.unitEvMin.toFixed(2)} – ${res.unitEvMax.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400">Simulation envelope</div>
                          </div>

                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-750">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Total EV Contribution ({count}×)</div>
                            <div className="font-mono font-black text-indigo-400 text-xs sm:text-sm">
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
              <div className="bg-slate-850 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>Standalone Cards & Promos ({itemContents!.card!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">
                    Singles market price & EV realization
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {itemContents!.card!.map((cd: any, idx: number) => {
                    const count = (cd.count || 1) * multiplier;
                    const res = resolveCard(cd, item.setCode || '', item);
                    const subtotalEv = Number((count * res.ev).toFixed(2));

                    return (
                      <div
                        key={`${nodeKey}-card-${idx}`}
                        className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200 text-sm">{res.name}</span>
                            {res.number && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                                #{res.number}
                              </span>
                            )}
                            {res.foil ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                                ★ Foil
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                                Non-Foil
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-slate-400">Set: {res.set}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
                            <span>TCG: ${res?.prices?.tcgplayer?.toFixed(2) || res?.price?.toFixed(2) || '0.00'}</span>
                            <span>•</span>
                            <span>CK: ${res?.prices?.cardkingdom?.toFixed(2) || ((res?.price || 0) * 1.12).toFixed(2)}</span>
                            <span>•</span>
                            <span>CM: €{res?.prices?.cardmarketEur?.toFixed(2) || ((res?.price || 0) * 0.85).toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-right self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleInspectCard({
                                name: res.name,
                                set: res.set,
                                number: res.number,
                                foil: res.foil,
                                unitEv: res.ev,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-emerald-400/20 text-slate-200 hover:text-emerald-300 border border-slate-600 hover:border-emerald-400/40 transition text-xs font-semibold cursor-pointer shadow-xs"
                            title="Inspect card pricing & breakdown"
                          >
                            <Search className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Inspect</span>
                          </button>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Singles EV</span>
                            <span className="font-mono font-bold text-amber-400 text-sm">
                              ${subtotalEv.toFixed(2)}
                              {count > 1 && (
                                <span className="text-[10px] text-slate-400 font-normal ml-1">
                                  (${res.ev.toFixed(2)} ea)
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold px-2 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg">
                            ×{count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Preconstructed Decks */}
            {hasDecks && (
              <div className="bg-slate-850 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span>Preconstructed Decks ({itemContents!.deck!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">Complete deck contents</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {itemContents!.deck!.map((dk: any, idx: number) => {
                    const matchedDeck = preconDecks[dk.name] || preconDecks[(dk.name || '').toLowerCase()];
                    const deckEv = (matchedDeck?.totalSinglesEv || 0) * reprintMultiplier;

                    return (
                      <div
                        key={`${nodeKey}-deck-${idx}`}
                        className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                            <span>🎴 {dk.name}</span>
                            {dk.isFoil && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
                                ★ Foil Deck
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {matchedDeck ? `${matchedDeck.cardCount} Cards` : '100 Cards'} • Set: {(dk.set || item.setCode || '').toUpperCase()}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleInspectDeck({
                                name: dk.name,
                                set: dk.set || item.setCode,
                                cardCount: matchedDeck?.cardCount,
                                unitSinglesEv: deckEv,
                                isFoil: dk.isFoil,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-purple-400/20 text-slate-200 hover:text-purple-300 border border-slate-600 hover:border-purple-400/40 transition text-xs font-semibold cursor-pointer shadow-xs"
                            title="Inspect decklist & card breakdown"
                          >
                            <Search className="w-3.5 h-3.5 text-purple-400" />
                            <span>Inspect Deck</span>
                          </button>
                          {deckEv > 0 && (
                            <div className="text-right shrink-0">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Singles EV</span>
                              <span className="font-mono font-bold text-amber-400 text-sm">${deckEv.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Variable Bonus Slots */}
            {hasVariables && (
              <div className="bg-slate-850 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-sm">🎲</span>
                    <span>Variable Bonus Slots ({itemContents!.variable!.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 lowercase">Probabilistic drop tables</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {itemContents!.variable!.map((v: any, idx: number) => (
                    <div
                      key={`${nodeKey}-var-${idx}`}
                      className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 text-xs space-y-1.5"
                    >
                      <div className="font-bold text-slate-200">Bonus Slot #{idx + 1}</div>
                      <div className="text-[11px] text-slate-400">
                        {v.configs ? `${v.configs.length} collation configurations` : 'Variable contents configuration'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Physical Accessories */}
            {hasOther && (
              <div className="bg-slate-850 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <span>🎁</span>
                  <span>Physical Accessories & Packaging Items ({itemContents!.other!.length})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {itemContents!.other!.map((ot: any, idx: number) => (
                    <div
                      key={`${nodeKey}-other-${idx}`}
                      className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-300 flex items-center justify-between"
                    >
                      <span className="truncate pr-2">{ot.name}</span>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                        ×{ot.count || 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      id="product-prize-breakdown"
      className={`rounded-2xl border transition-all ${
        isDark ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-950 text-white border-slate-800'
      } ${isCollapsed ? 'p-4' : 'p-4.5 space-y-4'} shadow-md ${className}`}
    >
      {/* Header Bar */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          !isCollapsed ? 'border-b border-slate-800 pb-3' : ''
        } ${collapsible ? 'cursor-pointer select-none group' : ''}`}
        onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <Calculator className="w-4 h-4 shrink-0" />
            <span className="uppercase tracking-wider font-extrabold text-amber-400 sm:text-xs text-[11px]">
              {title}
            </span>
            {collapsible && (
              <span className="text-[10px] font-normal text-slate-400 group-hover:text-slate-200 transition">
                {isCollapsed ? '(click to expand)' : '(click to collapse)'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-400">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700">
              {calculatedTotalCards} Total Cards
            </span>
            {audit.totalPacks > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                {audit.totalPacks} Packs
              </span>
            )}
            {audit.totalDecks > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">
                {audit.totalDecks} Decks
              </span>
            )}
            {audit.sealedItems.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
                {audit.sealedItems.reduce((acc, s) => acc + s.count, 0)} Sub-Products
              </span>
            )}
            {audit.otherItems.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {audit.otherItems.length} Accessories
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
          {/* View Mode Toggle Pill Buttons (shown when expanded) */}
          {!isCollapsed && (
            <div
              className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs font-semibold"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-slate-700 text-amber-300 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Table Audit
              </button>
              <button
                type="button"
                onClick={() => setViewMode('visual_tree')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'visual_tree' ? 'bg-slate-700 text-amber-300 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Visual Tree
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw_json')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'raw_json' ? 'bg-slate-700 text-amber-300 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Raw MTGJSON
              </button>
            </div>
          )}

          {/* Collapse & Expand Arrow Button */}
          {collapsible && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(!isCollapsed);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition text-xs font-bold border border-slate-700 cursor-pointer shadow-xs shrink-0"
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand Product & Prize breakdown' : 'Collapse Product & Prize breakdown'}
            >
              <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-amber-400 transition-transform" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-400 transition-transform" />
              )}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* VIEW MODE 1: TABLE AUDIT */}
          {viewMode === 'table' && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                      <th className="text-left pb-2 font-bold">Sub-Item Component</th>
                      <th className="text-left pb-2 font-bold">Classification & Resolution</th>
                      <th className="text-center pb-2 font-bold">Qty</th>
                      <th className="text-right pb-2 font-bold text-amber-300">Cards SubTotal</th>
                      <th className="text-right pb-2 font-bold text-slate-300">Unit Cards</th>
                      <th className="text-right pb-2 font-bold text-slate-300">Unit EV</th>
                      <th className="text-right pb-2 font-bold text-amber-400">Contents EV Subtotal</th>
                      <th className="text-right pb-2 font-bold text-indigo-300">EV Share</th>
                      <th className="text-center pb-2 font-bold text-amber-400">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {/* Packs */}
                    {audit.packItems.map((p, idx) => {
                      const evShare = totalEv > 0 ? ((p.subtotalEv / totalEv) * 100).toFixed(1) : '0.0';
                      const packCards = p.totalCards || (p.count * (p.cardsPerPack || 15));
                      const unitCards = p.cardsPerPack || 15;
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
                          <td className="py-2.5 text-right font-semibold text-slate-200">{packCards}</td>
                          <td className="py-2.5 text-right font-medium text-slate-300">{unitCards}</td>
                          <td className="py-2.5 text-right text-slate-300">${p.unitEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">${p.subtotalEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                          <td className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                handleInspectPack({
                                  packName: p.packName,
                                  code: p.code,
                                  set: p.set,
                                  count: p.count,
                                  unitEv: p.unitEv,
                                  cardsPerPack: p.cardsPerPack,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-400/20 text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-400/40 text-[11px] font-semibold transition cursor-pointer shadow-xs"
                              title={`Inspect ${p.packName} collation & odds`}
                            >
                              <Search className="w-3.5 h-3.5 text-amber-400" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Standalone Cards */}
                    {audit.cardItems.map((c, idx) => {
                      const evShare = totalEv > 0 ? ((c.subtotalEv / totalEv) * 100).toFixed(1) : '0.0';
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
                            Singles / Promo • {c.set} {c.number ? `#${c.number}` : ''}
                          </td>
                          <td className="py-2.5 text-center font-bold text-indigo-300">×{c.count}</td>
                          <td className="py-2.5 text-right font-semibold text-slate-200">{c.count}</td>
                          <td className="py-2.5 text-right font-medium text-slate-300">1</td>
                          <td className="py-2.5 text-right text-slate-300">${c.unitEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">${c.subtotalEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                          <td className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleInspectCard(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-400/20 text-slate-300 hover:text-emerald-300 border border-slate-700 hover:border-emerald-400/40 text-[11px] font-semibold transition cursor-pointer shadow-xs"
                              title={`Inspect ${c.name} pricing & breakdown`}
                            >
                              <Search className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Sealed Child Products */}
                    {audit.sealedItems.map((s, idx) => {
                      const evShare = totalEv > 0 ? ((s.subtotalEv / totalEv) * 100).toFixed(1) : '0.0';
                      const sealedCards = s.totalCards || (s.count * 15);
                      const unitCards = Math.round(sealedCards / (s.count || 1));
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
                          <td className="py-2.5 text-right font-semibold text-slate-200">{sealedCards}</td>
                          <td className="py-2.5 text-right font-medium text-slate-300">{unitCards}</td>
                          <td className="py-2.5 text-right text-slate-300">${s.unitEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">${s.subtotalEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                          <td className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleInspectSealed(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-400/20 text-slate-300 hover:text-blue-300 border border-slate-700 hover:border-blue-400/40 text-[11px] font-semibold transition cursor-pointer shadow-xs"
                              title={`Inspect ${s.name}`}
                            >
                              <Search className="w-3.5 h-3.5 text-blue-400" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Decks */}
                    {audit.deckItems.map((d, idx) => {
                      const evShare = totalEv > 0 ? ((d.subtotalSinglesEv / totalEv) * 100).toFixed(1) : '0.0';
                      const deckTotalCards = d.totalCards || (d.count * (d.cardCount || 100));
                      const unitCards = d.cardCount || 100;

                      return (
                        <tr key={`audit-deck-${idx}`} className="hover:bg-slate-800/40">
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
                            </div>
                          </td>
                          <td className="py-2.5 text-slate-400 text-[11px]">
                            Precon Deck
                          </td>
                          <td className="py-2.5 text-center font-bold text-indigo-300">×{d.count}</td>
                          <td className="py-2.5 text-right font-semibold text-slate-200">{deckTotalCards}</td>
                          <td className="py-2.5 text-right font-medium text-slate-300">{unitCards}</td>
                          <td className="py-2.5 text-right text-slate-300">${d.unitSinglesEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">${d.subtotalSinglesEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                          <td className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleInspectDeck(d)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-purple-400/20 text-slate-300 hover:text-purple-300 border border-slate-700 hover:border-purple-400/40 text-[11px] font-semibold transition cursor-pointer shadow-xs"
                              title={`Inspect ${d.name} decklist`}
                            >
                              <Search className="w-3.5 h-3.5 text-purple-400" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Variable Slots */}
                    {audit.variableItems.map((v, idx) => {
                      const variableCards = v.configs[0]?.items?.reduce((s, it) => s + (it.count || 1), 0) || 1;
                      return (
                        <tr key={`audit-var-${idx}`} className="hover:bg-slate-800/40">
                          <td className="py-2.5 text-slate-200 font-medium">
                            <span className="text-amber-400 mr-1.5">🎲</span>
                            Bonus Slot #{v.slotIndex || idx + 1} ({v.configs.length} configs)
                          </td>
                          <td className="py-2.5 text-slate-400 text-[11px]">
                            Probabilistic Bonus Slot
                          </td>
                          <td className="py-2.5 text-center font-bold text-indigo-300">×1</td>
                          <td className="py-2.5 text-right font-semibold text-slate-200">{variableCards}</td>
                          <td className="py-2.5 text-right font-medium text-slate-300">{variableCards}</td>
                          <td className="py-2.5 text-right text-slate-300">${v.slotEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-amber-400">${v.slotEv.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-bold text-indigo-300">
                            {totalEv > 0 ? ((v.slotEv / totalEv) * 100).toFixed(1) : '0.0'}%
                          </td>
                          <td className="py-2.5 text-center text-slate-500 text-[11px] font-mono">—</td>
                        </tr>
                      );
                    })}

                    {/* Accessories / Other Items (EV: $0.00) */}
                    {audit.otherItems.map((o, idx) => (
                      <tr key={`audit-other-${idx}`} className="hover:bg-slate-800/40 opacity-75">
                        <td className="py-2.5 text-slate-300">
                          <span className="text-slate-500 mr-1.5">🏷️</span>
                          {o.name}
                        </td>
                        <td className="py-2.5 text-slate-400 text-[11px]">{o.category} (Physical Item)</td>
                        <td className="py-2.5 text-center font-bold text-slate-400">×{o.count}</td>
                        <td className="py-2.5 text-right text-slate-500 font-mono">0</td>
                        <td className="py-2.5 text-right text-slate-500 font-mono">0</td>
                        <td className="py-2.5 text-right text-slate-500">$0.00</td>
                        <td className="py-2.5 text-right text-slate-500 font-mono">$0.00</td>
                        <td className="py-2.5 text-right text-slate-500 font-mono">0.0%</td>
                        <td className="py-2.5 text-center text-slate-500 text-[11px] font-mono">—</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-700 bg-slate-800/40">
                    <tr className="text-slate-100 font-bold">
                      <td className="py-3 text-slate-100 uppercase tracking-wider text-[11px] font-bold">
                        Total / Aggregated
                      </td>
                      <td className="py-3 text-slate-400 text-[11px] font-normal">
                        {audit.packItems.length + audit.cardItems.length + audit.sealedItems.length + audit.deckItems.length + audit.variableItems.length} components
                      </td>
                      <td className="py-3 text-center text-indigo-300 font-mono font-bold">
                        ×{totalQty}
                      </td>
                      <td className="py-3 text-right font-mono font-black text-amber-300 text-sm">
                        {calculatedTotalCards} cards
                      </td>
                      <td className="py-3 text-right text-slate-500 font-mono font-normal">—</td>
                      <td className="py-3 text-right text-slate-500 font-mono font-normal">—</td>
                      <td className="py-3 text-right font-mono font-black text-amber-400 text-sm">
                        ${displayedTotalEv.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-indigo-300">
                        100.0%
                      </td>
                      <td className="py-3 text-center text-slate-500 font-mono font-normal">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

          {/* Reconciliation Summary Footer */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="space-y-1">
              <div className="text-slate-400">
                • Product Market Price:{' '}
                <strong className="text-emerald-400">${marketPrice.toFixed(2)}</strong>
              </div>
              <div className="text-slate-400">
                • Aggregated Contents EV:{' '}
                {totalEv > 0 ? (
                  <strong className="text-amber-400">${totalEv.toFixed(2)}</strong>
                ) : (
                  <span className="text-slate-400 italic">Pending EV</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Net Arbitrage Spread</div>
                {totalEv > 0 ? (
                  <div className={`text-sm font-bold ${netSpread >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {netSpread >= 0 ? `+$${netSpread.toFixed(2)}` : `-$${Math.abs(netSpread).toFixed(2)}`}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      ({roiPct >= 0 ? `+${roiPct}%` : `${roiPct}%`})
                    </span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-slate-400">—</div>
                )}
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Packaging Arbitrage Ratio</div>
                {totalEv > 0 && marketPrice > 0 ? (
                  <div className={`text-sm font-bold ${arbRatio >= 1.0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {arbRatio.toFixed(2)}x
                  </div>
                ) : (
                  <div className="text-sm font-bold text-slate-400">—</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* VIEW MODE 2: VISUAL TREE */}
      {viewMode === 'visual_tree' && (
        <div className="space-y-4 pt-1">
          {renderProductTree(product, 1, 0, 'root')}
        </div>
      )}

      {/* VIEW MODE 3: RAW MTGJSON */}
      {viewMode === 'raw_json' && (
        <div className="bg-slate-950 text-slate-150 rounded-2xl p-4.5 border border-slate-800 shadow-inner space-y-3 font-mono text-xs overflow-x-auto">
          <div className="flex items-center justify-between text-slate-400 text-[11px] pb-2 border-b border-slate-800">
            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Code2 className="w-3.5 h-3.5" />
              MTGJSON Product Contents & Valuation Audit
            </span>
            <span>UUID: {uid || 'N/A'}</span>
          </div>
          <pre className="text-emerald-400 leading-relaxed text-[11px]">
            {JSON.stringify(
              {
                product,
                calculatedAudit: audit,
                marketPrice,
                contentsEv: totalEv,
                netSpread,
                roiPct,
                packagingArbitrageRatio: arbRatio > 0 ? Number(arbRatio.toFixed(3)) : null,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
        </>
      )}

      {/* Embedded Product Breakdown Modal */}
      {showBreakdownModal && (
        <ProductBreakdownModal
          product={inspectedProduct || modalProduct}
          isOpen={showBreakdownModal}
          onClose={() => {
            setShowBreakdownModal(false);
            setInspectedProduct(null);
            setInspectedDeckDetail(null);
          }}
          priceMode={priceMode}
          vendor={vendor}
          preconDecks={preconDecks}
          deckDetail={inspectedDeckDetail || (inspectedProduct as any)?.deckDetail}
        />
      )}
    </div>
  );
};
