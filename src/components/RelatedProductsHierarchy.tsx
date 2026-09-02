import React, { useState, useEffect, useMemo } from 'react';
import { BoosterEVRecord, PriceMode, Vendor } from '../types';
import {
  ECOMMERCE_CATALOG_PACKS,
  CatalogPackProduct,
  ProductPackagingType,
  ProductContainmentItem,
  BoosterVariation,
} from '../ecommerceBoosterData';
import { SetSymbolIcon } from './SetSymbolIcon';
import { ProductPackagingImage } from './ProductPackagingImage';
import { PackagingStockAssetGuide } from './PackagingStockAssetGuide';
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
} from 'lucide-react';

interface RelatedProductsHierarchyProps {
  setCode: string;
  setName: string;
  activeBooster: BoosterEVRecord;
  priceMode: PriceMode;
  vendor: Vendor;
  selectedProductId?: string;
  onSelectProduct?: (productId: string, boosterName: string, product?: CatalogPackProduct) => void;
  onPriceModeChange?: (mode: PriceMode) => void;
  onVendorChange?: (vendor: Vendor) => void;
}

export const RelatedProductsHierarchy: React.FC<RelatedProductsHierarchyProps> = ({
  setCode,
  setName,
  activeBooster,
  priceMode,
  vendor,
  selectedProductId: propSelectedProductId,
  onSelectProduct,
  onPriceModeChange,
  onVendorChange,
}) => {
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

  // Find related products for the selected set from the catalog
  const existingSetProducts = ECOMMERCE_CATALOG_PACKS.filter(
    (p) => p.setCode.toUpperCase() === setCode.toUpperCase()
  );

  // Helper to synthesize a product if none exists in catalog for this set
  const getSyntheticProducts = (): CatalogPackProduct[] => {
    const packEv = activeBooster.evAverage;
    const packPrice = Number((packEv * 0.92).toFixed(2)) || 4.99;
    const boxPrice = Number((packPrice * 36 * 0.87).toFixed(2)); // ~13% bulk box discount
    const bundlePrice = Number((packPrice * 9 * 0.90).toFixed(2)); // ~10% bundle discount
    const casePrice = Number((boxPrice * 6 * 0.96).toFixed(2)); // wholesale case discount

    return [
      {
        id: `pack-${setCode.toLowerCase()}-${activeBooster.boosterName}`,
        setCode: setCode,
        setName: setName,
        releaseDate: activeBooster.updatedAt?.split('T')[0] || '2024-01-01',
        block: `${setName} Era`,
        packagingType: 'pack',
        boosterName: (activeBooster.boosterName as any) || 'play',
        displayName: `${setName} ${activeBooster.fullBoosterName || 'Booster Pack'}`,
        marketPrice: packPrice,
        estimatedEv: packEv,
        cardCount: 14,
        packsCount: 1,
        badge: 'Base Unit',
        specialFeatures: ['Standard Pack Collation', '1 Rare/Mythic', 'Foil Wildcard Chance', 'Basic Land'],
        containedIn: [
          {
            productId: `bundle-${setCode.toLowerCase()}`,
            name: `${setName} Bundle (9 Packs + Promo + Die)`,
            packagingType: 'bundle',
            quantity: 9,
            unitDescription: `Contains 9x ${setName} Boosters + 30 Basic Lands + Spindown`,
            marketPrice: bundlePrice,
            estimatedEv: packEv * 9 + 3.5,
            savingsPct: 10.0,
            bonusAccessories: ['1x Traditional Foil Alt-Art Promo', '30x Basic Lands (15 Foil)', '1x Spindown Die', '1x Storage Box'],
          },
          {
            productId: `box-${setCode.toLowerCase()}`,
            name: `${setName} Booster Box (36 Packs)`,
            packagingType: 'box',
            quantity: 36,
            unitDescription: `Contains 36x Factory Sealed Boosters (504 cards)`,
            marketPrice: boxPrice,
            estimatedEv: packEv * 36,
            savingsPct: 13.0,
          },
          {
            productId: `case-${setCode.toLowerCase()}`,
            name: `${setName} Sealed Master Case (6 Boxes / 216 Packs)`,
            packagingType: 'case',
            quantity: 216,
            unitDescription: `Contains 6x Sealed Booster Boxes (216 Boosters total)`,
            marketPrice: casePrice,
            estimatedEv: packEv * 216,
            savingsPct: 16.5,
          },
        ],
        variations: [
          {
            boosterIndex: 0,
            boosterWeight: 100,
            name: 'Standard Collation',
            description: 'Standard pack distribution: 6 Commons, 3 Uncommons, 1 Rare/Mythic, 1 Wildcard, 1 Foil, 1 Land, 1 Token.',
            sheets: [
              { sheetName: `${setCode} Common Sheet`, sheetCode: 'c', sheetPicks: 6, description: 'Main set commons', category: 'common' },
              { sheetName: `${setCode} Uncommon Sheet`, sheetCode: 'u', sheetPicks: 3, description: 'Main set uncommons', category: 'uncommon' },
              { sheetName: `${setCode} Rare/Mythic Sheet`, sheetCode: 'r_m', sheetPicks: 1, description: 'Main set rares and mythics', category: 'rare_mythic', rareOdds: 0.857 },
              { sheetName: 'Wildcard / Special Slot', sheetCode: 'wildcard', sheetPicks: 1, description: 'Wildcard slot of any rarity', category: 'wildcard', rareOdds: 0.20 },
              { sheetName: 'Traditional Foil Wildcard', sheetCode: 'foil', sheetPicks: 1, description: 'Foil card slot', category: 'foil', foilChance: 1.0, rareOdds: 0.15 },
              { sheetName: 'Basic Land Sheet', sheetCode: 'l', sheetPicks: 1, description: 'Full art or basic land', category: 'land' },
              { sheetName: 'Token / Art Card', sheetCode: 'token', sheetPicks: 1, description: 'Ad token or art card', category: 'ancillary' },
            ],
          },
        ],
      },
      {
        id: `bundle-${setCode.toLowerCase()}`,
        setCode: setCode,
        setName: setName,
        releaseDate: activeBooster.updatedAt?.split('T')[0] || '2024-01-01',
        block: `${setName} Era`,
        packagingType: 'bundle',
        boosterName: (activeBooster.boosterName as any) || 'play',
        displayName: `${setName} Bundle / Fat Pack (9 Packs)`,
        marketPrice: bundlePrice,
        estimatedEv: packEv * 9 + 3.5,
        cardCount: 156,
        packsCount: 9,
        badge: 'Includes Promo & Lands',
        specialFeatures: ['9x Booster Packs', '30 Basic Lands (15 Foil)', 'Foil Alt-Art Promo', 'Spindown Life Counter'],
        contains: [
          {
            productId: `pack-${setCode.toLowerCase()}-${activeBooster.boosterName}`,
            name: `${setName} Booster Pack`,
            packagingType: 'pack',
            quantity: 9,
            unitDescription: `9x Individual 14-card Booster Packs`,
            marketPrice: packPrice,
            estimatedEv: packEv,
          },
        ],
        bonusAccessories: ['1x Traditional Foil Alt-Art Promo', '30x Basic Lands (15 Foil, 15 Non-Foil)', '1x Spindown Die', '1x Storage Box'],
        variations: [
          {
            boosterIndex: 0,
            boosterWeight: 100,
            name: 'Standard Collation',
            description: 'Standard pack collation across 9 bundle packs.',
            sheets: [
              { sheetName: `${setCode} Common Sheet`, sheetCode: 'c', sheetPicks: 6, description: 'Main set commons', category: 'common' },
              { sheetName: `${setCode} Uncommon Sheet`, sheetCode: 'u', sheetPicks: 3, description: 'Main set uncommons', category: 'uncommon' },
              { sheetName: `${setCode} Rare/Mythic Sheet`, sheetCode: 'r_m', sheetPicks: 1, description: 'Main set rares/mythics', category: 'rare_mythic', rareOdds: 0.857 },
              { sheetName: 'Wildcard / Special Slot', sheetCode: 'wildcard', sheetPicks: 1, description: 'Wildcard slot', category: 'wildcard', rareOdds: 0.20 },
              { sheetName: 'Traditional Foil Wildcard', sheetCode: 'foil', sheetPicks: 1, description: 'Foil slot', category: 'foil', foilChance: 1.0, rareOdds: 0.15 },
              { sheetName: 'Basic Land Sheet', sheetCode: 'l', sheetPicks: 1, description: 'Basic land', category: 'land' },
              { sheetName: 'Token / Art Card', sheetCode: 'token', sheetPicks: 1, description: 'Token/Art', category: 'ancillary' },
            ],
          },
        ],
      },
      {
        id: `box-${setCode.toLowerCase()}`,
        setCode: setCode,
        setName: setName,
        releaseDate: activeBooster.updatedAt?.split('T')[0] || '2024-01-01',
        block: `${setName} Era`,
        packagingType: 'box',
        boosterName: (activeBooster.boosterName as any) || 'play',
        displayName: `${setName} Booster Box (36 Packs)`,
        marketPrice: boxPrice,
        estimatedEv: packEv * 36,
        cardCount: 504,
        packsCount: 36,
        badge: '13% Box Discount',
        specialFeatures: ['36x Factory Sealed Packs', '504 MTG Cards Total', 'Draft Pod Ready (12 Extra Packs)'],
        contains: [
          {
            productId: `pack-${setCode.toLowerCase()}-${activeBooster.boosterName}`,
            name: `${setName} Booster Pack`,
            packagingType: 'pack',
            quantity: 36,
            unitDescription: `36x Individual 14-card Booster Packs`,
            marketPrice: packPrice,
            estimatedEv: packEv,
          },
        ],
        containedIn: [
          {
            productId: `case-${setCode.toLowerCase()}`,
            name: `${setName} Sealed Master Case (6 Boxes)`,
            packagingType: 'case',
            quantity: 6,
            unitDescription: `Contains 6 Factory Sealed Booster Boxes`,
            marketPrice: casePrice,
            estimatedEv: packEv * 216,
            savingsPct: 4.0,
          },
        ],
        variations: [
          {
            boosterIndex: 0,
            boosterWeight: 100,
            name: 'Standard Box Collation',
            description: 'Full 36-pack display box collation.',
            sheets: [
              { sheetName: `${setCode} Common Sheet`, sheetCode: 'c', sheetPicks: 6, description: 'Main set commons', category: 'common' },
              { sheetName: `${setCode} Uncommon Sheet`, sheetCode: 'u', sheetPicks: 3, description: 'Main set uncommons', category: 'uncommon' },
              { sheetName: `${setCode} Rare/Mythic Sheet`, sheetCode: 'r_m', sheetPicks: 1, description: 'Main set rares/mythics', category: 'rare_mythic', rareOdds: 0.857 },
              { sheetName: 'Wildcard / Special Slot', sheetCode: 'wildcard', sheetPicks: 1, description: 'Wildcard slot', category: 'wildcard', rareOdds: 0.20 },
              { sheetName: 'Traditional Foil Wildcard', sheetCode: 'foil', sheetPicks: 1, description: 'Foil slot', category: 'foil', foilChance: 1.0, rareOdds: 0.15 },
              { sheetName: 'Basic Land Sheet', sheetCode: 'l', sheetPicks: 1, description: 'Basic land', category: 'land' },
              { sheetName: 'Token / Art Card', sheetCode: 'token', sheetPicks: 1, description: 'Token/Art', category: 'ancillary' },
            ],
          },
        ],
      },
      {
        id: `case-${setCode.toLowerCase()}`,
        setCode: setCode,
        setName: setName,
        releaseDate: activeBooster.updatedAt?.split('T')[0] || '2024-01-01',
        block: `${setName} Era`,
        packagingType: 'case',
        boosterName: (activeBooster.boosterName as any) || 'play',
        displayName: `${setName} Sealed Booster Case (6 Boxes)`,
        marketPrice: casePrice,
        estimatedEv: packEv * 216,
        cardCount: 3024,
        packsCount: 216,
        badge: 'Wholesale Master Case',
        specialFeatures: ['6x Factory Sealed Display Boxes', '216 Booster Packs', '3,024 MTG Cards Total', 'Print Run Collation'],
        contains: [
          {
            productId: `box-${setCode.toLowerCase()}`,
            name: `${setName} Booster Box`,
            packagingType: 'box',
            quantity: 6,
            unitDescription: `6x Sealed Display Boxes (36 packs each)`,
            marketPrice: boxPrice,
            estimatedEv: packEv * 36,
          },
          {
            productId: `pack-${setCode.toLowerCase()}-${activeBooster.boosterName}`,
            name: `${setName} Booster Pack`,
            packagingType: 'pack',
            quantity: 216,
            unitDescription: `216x Total Booster Packs across the 6 boxes`,
            marketPrice: packPrice,
            estimatedEv: packEv,
          },
        ],
        variations: [
          {
            boosterIndex: 0,
            boosterWeight: 100,
            name: 'Master Case Collation',
            description: 'Collation across 6 display boxes (216 packs).',
            sheets: [
              { sheetName: `${setCode} Common Sheet`, sheetCode: 'c', sheetPicks: 6, description: 'Main set commons', category: 'common' },
              { sheetName: `${setCode} Uncommon Sheet`, sheetCode: 'u', sheetPicks: 3, description: 'Main set uncommons', category: 'uncommon' },
              { sheetName: `${setCode} Rare/Mythic Sheet`, sheetCode: 'r_m', sheetPicks: 1, description: 'Main set rares/mythics', category: 'rare_mythic', rareOdds: 0.857 },
              { sheetName: 'Wildcard / Special Slot', sheetCode: 'wildcard', sheetPicks: 1, description: 'Wildcard slot', category: 'wildcard', rareOdds: 0.20 },
              { sheetName: 'Traditional Foil Wildcard', sheetCode: 'foil', sheetPicks: 1, description: 'Foil slot', category: 'foil', foilChance: 1.0, rareOdds: 0.15 },
              { sheetName: 'Basic Land Sheet', sheetCode: 'l', sheetPicks: 1, description: 'Basic land', category: 'land' },
              { sheetName: 'Token / Art Card', sheetCode: 'token', sheetPicks: 1, description: 'Token/Art', category: 'ancillary' },
            ],
          },
        ],
      },
    ];
  };

  // Price & EV multipliers based on priceMode & vendor
  const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;
  const vendorEvMultiplier = vendor === 'cardmarket' ? 0.94 : vendor === 'cardkingdom' ? 1.05 : 1.0;
  const vendorPriceMultiplier = vendor === 'cardmarket' ? 0.91 : vendor === 'cardkingdom' ? 1.10 : 1.0;

  const rawProducts = existingSetProducts.length > 0 ? existingSetProducts : getSyntheticProducts();

  // Dynamically scale products for active PriceMode (Direct vs Cheapest Reprint) & Vendor
  const setProducts = useMemo(() => {
    return rawProducts.map((p) => {
      const scaledEv = Number((p.estimatedEv * reprintMultiplier * vendorEvMultiplier).toFixed(2));
      const scaledPrice = Number((p.marketPrice * vendorPriceMultiplier).toFixed(2));

      const scaledContains = p.contains?.map((item) => ({
        ...item,
        marketPrice: Number((item.marketPrice * vendorPriceMultiplier).toFixed(2)),
        estimatedEv: Number((item.estimatedEv * reprintMultiplier * vendorEvMultiplier).toFixed(2)),
      }));

      const scaledContainedIn = p.containedIn?.map((item) => ({
        ...item,
        marketPrice: Number((item.marketPrice * vendorPriceMultiplier).toFixed(2)),
        estimatedEv: Number((item.estimatedEv * reprintMultiplier * vendorEvMultiplier).toFixed(2)),
      }));

      return {
        ...p,
        marketPrice: scaledPrice,
        estimatedEv: scaledEv,
        contains: scaledContains,
        containedIn: scaledContainedIn,
      };
    });
  }, [rawProducts, reprintMultiplier, vendorEvMultiplier, vendorPriceMultiplier]);

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
      const found = setProducts.find((p) => p.id === prodId);
      onSelectProduct(prodId, boosterName || found?.boosterName || 'play', found);
    }
  };

  const activeProduct = setProducts.find((p) => p.id === selectedProductId) || setProducts[0];

  // Custom Multiplier Calculator State
  const [calculatorPacks, setCalculatorPacks] = useState<number>(36);

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
    const name = (prod.displayName || '').toLowerCase();
    const isCollector = name.includes('collector') || prod.boosterName === 'collector';
    const isGift = name.includes('gift');
    const isBlister = name.includes('blister') || name.includes('3-pack');

    switch (prod.packagingType) {
      case 'case':
        if (isCollector) {
          return { label: 'Collector Case (6x)', icon: Crown, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
        }
        return { label: 'Sealed Case (6 Boxes)', icon: Archive, bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'bundle_case':
        if (isGift) {
          return { label: 'Gift Bundle Case (6x)', icon: Sparkles, bg: 'bg-amber-50 text-amber-900 border-amber-300' };
        }
        return { label: 'Bundle Case (6x)', icon: Archive, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
      case 'box':
        if (isCollector) {
          return { label: 'Collector Box (12x)', icon: Crown, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
        }
        return { label: 'Booster Box (36x)', icon: BoxIcon, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'bundle':
        if (isGift) {
          return { label: 'Gift Bundle (10x)', icon: Sparkles, bg: 'bg-amber-50 text-amber-800 border-amber-300' };
        }
        return { label: 'Bundle Box (9x)', icon: Gift, bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'starter_deck': {
        const isSingle = !prod.displayName.toLowerCase().includes('set of') && !prod.displayName.toLowerCase().includes('4 decks') && !prod.displayName.toLowerCase().includes('(4x)');
        if (isCollector) {
          return isSingle
            ? { label: "Collector's Precon (100x)", icon: Crown, bg: 'bg-amber-50 text-amber-900 border-amber-300' }
            : { label: "Collector's Set (4 Decks)", icon: Crown, bg: 'bg-amber-50 text-amber-900 border-amber-300' };
        }
        return isSingle
          ? { label: 'Commander Deck (100x)', icon: Layers3, bg: 'bg-amber-50 text-amber-800 border-amber-200' }
          : { label: 'Commander Set (4 Decks)', icon: Layers3, bg: 'bg-amber-50 text-amber-800 border-amber-200' };
      }
      case 'sample_pack':
        return { label: 'Sample Pack (2 Cards)', icon: Sparkles, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
      case 'limited_aid_tool':
      case 'prerelease':
        return { label: 'Prerelease Kit (6x)', icon: Sparkles, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default:
        if (isBlister) {
          return { label: '3-Pack Blister (3x)', icon: Package, bg: 'bg-blue-50 text-blue-700 border-blue-200' };
        }
        if (isCollector) {
          return { label: 'Collector Pack (1x)', icon: Crown, bg: 'bg-purple-50 text-purple-800 border-purple-300' };
        }
        return { label: 'Single Pack (1x)', icon: Package, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Category filtering & View Mode (Flat Grid and List)
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Subtype-based product lines / groups (Pack -> Box -> Case progression)
  const productSubtypeGroups = useMemo(() => {
    const playGroup = setProducts.filter(
      (p) =>
        p.boosterName === 'play' ||
        p.boosterName === 'draft' ||
        p.boosterName === 'default' ||
        ((p.displayName.toLowerCase().includes('play') || p.displayName.toLowerCase().includes('draft')) &&
          !p.displayName.toLowerCase().includes('bundle') &&
          !p.displayName.toLowerCase().includes('prerelease') &&
          !p.displayName.toLowerCase().includes('commander'))
    );

    const collectorGroup = setProducts.filter(
      (p) =>
        (p.boosterName === 'collector' || p.displayName.toLowerCase().includes('collector')) &&
        !p.displayName.toLowerCase().includes('gift') &&
        !p.displayName.toLowerCase().includes('commander')
    );

    const bundlesAndKits = setProducts.filter(
      (p) =>
        p.packagingType === 'bundle' ||
        p.packagingType === 'prerelease' ||
        p.displayName.toLowerCase().includes('bundle') ||
        p.displayName.toLowerCase().includes('prerelease') ||
        p.displayName.toLowerCase().includes('gift')
    );

    const commanderGroup = setProducts.filter(
      (p) => p.packagingType === 'starter_deck' || p.displayName.toLowerCase().includes('commander')
    );

    // Any remaining
    const otherProducts = setProducts.filter(
      (p) =>
        !playGroup.includes(p) &&
        !collectorGroup.includes(p) &&
        !bundlesAndKits.includes(p) &&
        !commanderGroup.includes(p)
    );

    const groups: {
      id: string;
      title: string;
      subtitle: string;
      badge: string;
      icon: any;
      products: CatalogPackProduct[];
    }[] = [];

    if (playGroup.length > 0) {
      groups.push({
        id: 'play-line',
        title: 'Play Booster Progression (Pack → Blister → Box → Case)',
        subtitle: 'Main draft & play booster tier scaling from single packs to master distribution cases',
        badge: 'Core Draft & Play',
        icon: Package,
        products: playGroup,
      });
    }

    if (collectorGroup.length > 0) {
      groups.push({
        id: 'collector-line',
        title: 'Collector Booster Progression (Pack → Box → Case)',
        subtitle: 'Premium high-foil & serial treatment tier scaling up to master cases',
        badge: 'Premium Collector',
        icon: Crown,
        products: collectorGroup,
      });
    }

    if (bundlesAndKits.length > 0) {
      groups.push({
        id: 'bundles-kits',
        title: 'Bundles, Gift Boxes & Prerelease Kits',
        subtitle: 'Curated box sets with bonus accessories, foils, spindown dice & storage boxes',
        badge: 'Bundles & Kits',
        icon: Gift,
        products: bundlesAndKits,
      });
    }

    if (commanderGroup.length > 0) {
      groups.push({
        id: 'commander-decks',
        title: 'Commander Preconstructed Decks & Collector Sets',
        subtitle: 'Complete 100-card ready-to-play precons (Regular & 100% Ripple Foil Collector)',
        badge: 'Preconstructed Decks',
        icon: Layers3,
        products: commanderGroup,
      });
    }

    if (otherProducts.length > 0) {
      groups.push({
        id: 'other-line',
        title: 'Additional Products',
        subtitle: 'Other related sets & specialty packaging',
        badge: 'Specialty',
        icon: BoxIcon,
        products: otherProducts,
      });
    }

    return groups;
  }, [setProducts]);

  const productCategories = useMemo(() => {
    return [
      { id: 'all', label: 'All Products', count: setProducts.length },
      {
        id: 'play',
        label: 'Play Line',
        count: setProducts.filter(
          (p) =>
            !p.displayName.toLowerCase().includes('collector') &&
            !p.displayName.toLowerCase().includes('commander') &&
            p.packagingType !== 'bundle' &&
            p.packagingType !== 'prerelease'
        ).length,
      },
      {
        id: 'collector',
        label: 'Collector Line',
        count: setProducts.filter(
          (p) =>
            (p.displayName.toLowerCase().includes('collector') || p.boosterName === 'collector') &&
            !p.displayName.toLowerCase().includes('commander')
        ).length,
      },
      {
        id: 'bundles',
        label: 'Bundles & Kits',
        count: setProducts.filter(
          (p) =>
            p.packagingType === 'bundle' ||
            p.packagingType === 'prerelease' ||
            p.displayName.toLowerCase().includes('bundle') ||
            p.displayName.toLowerCase().includes('prerelease')
        ).length,
      },
      {
        id: 'commander',
        label: 'Commander',
        count: setProducts.filter(
          (p) => p.packagingType === 'starter_deck' || p.displayName.toLowerCase().includes('commander')
        ).length,
      },
    ].filter((cat) => cat.id === 'all' || cat.count > 0);
  }, [setProducts]);

  const displayedProducts = useMemo(() => {
    if (activeCategory === 'all') return setProducts;
    if (activeCategory === 'play') {
      return setProducts.filter(
        (p) =>
          !p.displayName.toLowerCase().includes('collector') &&
          !p.displayName.toLowerCase().includes('commander') &&
          p.packagingType !== 'bundle' &&
          p.packagingType !== 'prerelease'
      );
    }
    if (activeCategory === 'collector') {
      return setProducts.filter(
        (p) =>
          (p.displayName.toLowerCase().includes('collector') || p.boosterName === 'collector') &&
          !p.displayName.toLowerCase().includes('commander')
      );
    }
    if (activeCategory === 'bundles') {
      return setProducts.filter(
        (p) =>
          p.packagingType === 'bundle' ||
          p.packagingType === 'prerelease' ||
          p.displayName.toLowerCase().includes('bundle') ||
          p.displayName.toLowerCase().includes('prerelease')
      );
    }
    if (activeCategory === 'commander') {
      return setProducts.filter(
        (p) => p.packagingType === 'starter_deck' || p.displayName.toLowerCase().includes('commander')
      );
    }
    return setProducts;
  }, [setProducts, activeCategory]);

  // Calculator calculations
  const calcTotalCards = calculatorPacks * 14;
  const calcTotalEv = calculatorPacks * activeBooster.evAverage;
  const calcTotalCost = calculatorPacks * (activeProduct?.marketPrice ? activeProduct.marketPrice / (activeProduct.packsCount || 1) : 4.5);
  const calcRares = Math.round(calculatorPacks * 1.15); // ~1.15 rares/mythics per modern pack with wildcard
  const calcMythics = Math.round(calculatorPacks * (1 - 0.857));
  const calcFoils = Math.round(calculatorPacks * 1.0);
  const calcRoiPct = calcTotalCost > 0 ? Number((((calcTotalEv - calcTotalCost) / calcTotalCost) * 100).toFixed(1)) : 0;

  const [isAssetGuideOpen, setIsAssetGuideOpen] = useState(false);

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

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="flex flex-col items-start sm:items-end gap-2">
            {onPriceModeChange && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                  Price Resolution:
                </span>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    id="hierarchy-direct-mode-btn"
                    onClick={() => onPriceModeChange('direct')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      priceMode === 'direct' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Direct Set
                  </button>
                  <button
                    id="hierarchy-reprint-mode-btn"
                    onClick={() => onPriceModeChange('cheapest_reprint')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      priceMode === 'cheapest_reprint'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cheapest Reprint
                  </button>
                </div>
              </div>
            )}

            {onVendorChange && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                  Pricing Vendor:
                </span>
                <select
                  id="hierarchy-vendor-select"
                  value={vendor}
                  onChange={(e) => onVendorChange(e.target.value as Vendor)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer w-full sm:w-auto shadow-2xs"
                >
                  <option value="all">Blended Average (All)</option>
                  <option value="tcgplayer">TCGplayer Direct</option>
                  <option value="cardmarket">Cardmarket (EUR conv)</option>
                  <option value="cardkingdom">Card Kingdom</option>
                </select>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsAssetGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition cursor-pointer self-start sm:self-auto"
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
            <span>Stock Assets & Logos</span>
          </button>
        </div>
      </div>

      {/* Stock Imagery Asset Directory Modal */}
      <PackagingStockAssetGuide
        isOpen={isAssetGuideOpen}
        onClose={() => setIsAssetGuideOpen(false)}
        currentSetCode={setCode}
      />

      {/* 1. Packaging Tiers Interactive Section with Dedicated Left Picture Panel */}
      <div className="space-y-4">
        {/* Top Control Bar: Title & View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            1. Select Packaging Tier to Inspect Containment ({displayedProducts.length} of {setProducts.length} Products)
          </div>

          {/* View Mode Toggle: Flat Grid vs List */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold self-start sm:self-auto">
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

        {/* Category Filter Toolbar - Sits directly beneath Title and View Mode toggle */}
        {productCategories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
              <Filter className="w-3 h-3" /> Category:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {productCategories.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
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

        <div className="flex flex-col md:flex-row items-start gap-4">
          {/* Dedicated Sticky Left Div for Product Picture (hidden in List view) */}
          {viewMode !== 'list' && (
            <div className="w-full md:w-60 shrink-0 bg-slate-50/90 rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center md:sticky md:top-4 self-start">
              {activeProduct && (
                <div className="w-full space-y-3">
                  <ProductPackagingImage
                    setCode={setCode}
                    setName={setName}
                    packagingType={activeProduct.packagingType}
                    displayName={cleanProductName(activeProduct.displayName)}
                    size="md"
                    allowZoom={true}
                  />
                  <div className="pt-2 border-t border-slate-200/80 text-left space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Selected Product
                    </div>
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      {cleanProductName(activeProduct.displayName)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-slate-600">
                      <span>Market: <strong className="text-slate-900">${activeProduct.marketPrice.toFixed(2)}</strong></span>
                      <span>EV: <strong className="text-emerald-600">${activeProduct.estimatedEv.toFixed(2)}</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Right Side: Flat Grid vs List */}
          <div className="flex-1 min-w-0 space-y-4">
            {viewMode === 'grid' ? (
              // FLAT GRID VIEW
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {displayedProducts.map((prod) => {
                  const isSelected = activeProduct?.id === prod.id;
                  const badge = getPackagingBadge(prod);
                  const BadgeIcon = badge.icon;
                  const evRoi = prod.marketPrice > 0 ? Number((((prod.estimatedEv - prod.marketPrice) / prod.marketPrice) * 100).toFixed(1)) : 0;

                  return (
                    <button
                      key={prod.id}
                      id={`btn-product-tier-${prod.id}`}
                      onClick={() => handleSelectProduct(prod.id, prod.boosterName)}
                      className={`p-3 rounded-xl border text-left transition relative flex flex-col justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                          : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                      }`}
                    >
                      {/* Top: Badges & Packs Count */}
                      <div className="w-full space-y-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 shrink-0 ${badge.bg}`}>
                            <BadgeIcon className="w-2.5 h-2.5" />
                            {badge.label}
                          </span>
                          {prod.packsCount > 1 && (
                            <span className="text-[9px] font-mono font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                              {prod.packsCount} Packs
                            </span>
                          )}
                        </div>

                        <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight min-h-[2rem]" title={cleanProductName(prod.displayName)}>
                          {cleanProductName(prod.displayName)}
                        </div>

                        <div className="text-[10px] text-slate-500 font-medium">
                          {prod.cardCount} Cards Total
                        </div>
                      </div>

                      {/* Bottom: Price & EV Information */}
                      <div className="w-full pt-2 border-t border-slate-200/80 font-mono flex items-end justify-between">
                        <div>
                          <div className="text-xs font-black text-slate-900">
                            ${prod.marketPrice.toFixed(2)}
                          </div>
                          {prod.packsCount > 1 && (
                            <div className="text-[9px] text-slate-400">
                              (${(prod.marketPrice / prod.packsCount).toFixed(2)}/pk)
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-emerald-600">
                            EV ${prod.estimatedEv.toFixed(2)}
                          </div>
                          <div className={`text-[9px] font-bold ${evRoi >= 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {evRoi >= 0 ? `+${evRoi}%` : `${evRoi}%`} ROI
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
                      <th className="p-3">Pack Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {displayedProducts.map((p) => {
                      const isCurrent = p.id === activeProduct?.id;
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
                            {p.packsCount > 1 ? `${p.packsCount}x Packs` : '1x Pack'}
                          </td>
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{p.cardCount} cards</td>
                          <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            ${p.marketPrice.toFixed(2)}
                          </td>
                          <td className="p-3 font-mono font-bold text-emerald-600 whitespace-nowrap">
                            ${p.estimatedEv.toFixed(2)}
                          </td>
                          <td className="p-3 font-mono font-bold whitespace-nowrap">
                            <span className={margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {margin >= 0 ? `+$${margin.toFixed(2)}` : `-$${Math.abs(margin).toFixed(2)}`}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] ${
                                roi >= 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {roi >= 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                            ${(p.marketPrice / (p.packsCount || 1)).toFixed(2)}/pack
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Deep "Products Within Products" Containment Inspector */}
      {activeProduct && (
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-5">
          {/* Containment Hierarchy Sub-Panels: Items Inside vs Available in Bulk Parent Containers */}
          {(() => {
            const hasContains = Boolean(
              (activeProduct.contains && activeProduct.contains.length > 0) ||
              (activeProduct.bonusAccessories && activeProduct.bonusAccessories.length > 0)
            );
            const hasContainedIn = Boolean(activeProduct.containedIn && activeProduct.containedIn.length > 0);

            if (!hasContains && !hasContainedIn) {
              return null;
            }

            const gridClass = hasContains && hasContainedIn 
              ? "grid grid-cols-1 lg:grid-cols-2 gap-5" 
              : "grid grid-cols-1 gap-5";

            return (
              <div className={gridClass}>
                {/* PANEL A: Items Inside this Container (Contains) */}
                {hasContains && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-500" />
                        Sub-Products Contained Inside This {activeProduct.packagingType.toUpperCase()}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Nested Hierarchy</span>
                    </div>

                    {activeProduct.contains && activeProduct.contains.length > 0 && (
                      <div className="space-y-2">
                        {activeProduct.contains.map((sub, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-slate-900 text-white rounded text-[10px] font-mono">
                                  {sub.quantity}x
                                </span>
                                {cleanProductName(sub.name)}
                              </div>
                              <div className="text-slate-500 text-[11px]">{sub.unitDescription}</div>
                            </div>
                            <div className="text-right font-mono">
                              <div className="font-bold text-slate-900">${(sub.marketPrice * sub.quantity).toFixed(2)}</div>
                              <div className="text-[10px] text-slate-400">(${sub.marketPrice.toFixed(2)}/unit)</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bonus Accessories (Promo Cards, Lands, Spindown Dice) */}
                    {activeProduct.bonusAccessories && activeProduct.bonusAccessories.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Included Non-Pack Accessories & Promos:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeProduct.bonusAccessories.map((acc, aIdx) => (
                            <span
                              key={aIdx}
                              className="px-2 py-1 bg-amber-50 text-amber-800 rounded-md text-[11px] font-medium border border-amber-200/80 flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3 text-amber-600" /> {acc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PANEL B: Parent Bulk Containers (Contained In) */}
                {hasContainedIn && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Archive className="w-4 h-4 text-indigo-600" />
                        Available in Bulk Container Packaging (Contained In)
                      </div>
                      <span className="text-[10px] text-emerald-600 font-semibold">Bulk Savings</span>
                    </div>

                    <div className="space-y-2">
                      {activeProduct.containedIn!.map((parent, pIdx) => (
                        <div
                          key={pIdx}
                          className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs flex items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {parent.packagingType === 'case' ? (
                                <Archive className="w-3.5 h-3.5 text-rose-600" />
                              ) : (
                                <BoxIcon className="w-3.5 h-3.5 text-indigo-600" />
                              )}
                              {cleanProductName(parent.name)}
                            </div>
                            <div className="text-slate-500 text-[11px]">{parent.unitDescription}</div>
                            {parent.savingsPct && (
                              <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                Save {parent.savingsPct}% vs buying single items
                              </span>
                            )}
                          </div>

                          <div className="text-right font-mono flex flex-col items-end gap-1">
                            <div className="font-black text-slate-900">${parent.marketPrice.toFixed(2)}</div>
                            <button
                              onClick={() => handleSelectProduct(parent.productId)}
                              className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded text-[10px] border border-indigo-200 transition cursor-pointer"
                            >
                              Inspect Tier →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* MTGJSON Collation Sheet Breakdown for this Tier */}
          {activeProduct.variations && activeProduct.variations[0]?.sheets && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <span>Booster Slot & Sheet Collation Weights</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    MTGJSON <code className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono font-bold text-[11px]">setboostercontentweights</code> breakdown for {cleanProductName(activeProduct.displayName)}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                    {activeProduct.variations[0].sheets.length} Sheet Slots
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                    {activeProduct.packsCount} {activeProduct.packsCount === 1 ? 'Pack' : 'Packs'} in {activeProduct.packagingType.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Clean, readable slot list table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-mono uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Slot Name & MTGJSON Code</th>
                      <th className="py-2.5 px-3">Rarity / Category</th>
                      <th className="py-2.5 px-3 text-right">Cards / Pack</th>
                      <th className="py-2.5 px-3 text-right">Total in {activeProduct.packagingType.toUpperCase()}</th>
                      <th className="py-2.5 px-3">Collation Odds & Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {activeProduct.variations[0].sheets.map((sheet, sIdx) => {
                      const sheetPicksPerContainer = sheet.sheetPicks * activeProduct.packsCount;
                      const cat = getCategoryStyle(sheet.category);

                      return (
                        <tr
                          key={sIdx}
                          className="hover:bg-indigo-50/40 transition-colors"
                        >
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                            {sIdx + 1}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">
                                {sheet.sheetName}
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-bold text-[10px] border border-slate-200">
                                {sheet.sheetCode}
                              </span>
                            </div>
                            {sheet.description && (
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {sheet.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center ${cat.bg}`}>
                              {cat.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 text-xs">
                              {sheet.sheetPicks} {sheet.sheetPicks === 1 ? 'card' : 'cards'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <span className="font-black text-slate-900 text-xs">
                              {sheetPicksPerContainer} {sheetPicksPerContainer === 1 ? 'card' : 'cards'}
                            </span>
                            {activeProduct.packsCount > 1 && (
                              <div className="text-[10px] text-slate-400">
                                ({sheet.sheetPicks} × {activeProduct.packsCount} pks)
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-[11px]">
                            {sheet.rareOdds ? (
                              <span className="text-amber-700 font-medium font-mono">
                                ~{Math.round(sheet.rareOdds * 100)}% Rare, {Math.round((1 - sheet.rareOdds) * 100)}% Mythic
                              </span>
                            ) : sheet.foilChance ? (
                              <span className="text-yellow-700 font-medium flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-yellow-500" />
                                100% Traditional Foil Guaranteed
                              </span>
                            ) : (
                              <span className="text-slate-500">Fixed collation pick</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300 text-xs">
                    <tr>
                      <td colSpan={3} className="py-2.5 px-3 text-slate-900 font-mono uppercase text-[11px]">
                        Total Cards Collation Summary
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-700 text-xs">
                        {activeProduct.variations[0].sheets.reduce((acc, s) => acc + s.sheetPicks, 0)} cards / pack
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-900 text-xs">
                        {activeProduct.variations[0].sheets.reduce((acc, s) => acc + s.sheetPicks * activeProduct.packsCount, 0)} cards total
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500 font-normal">
                        Across {activeProduct.packsCount} packs in this tier
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Live Custom Quantity Collation Multiplier Calculator */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-400" />
            <h4 className="text-base font-bold text-white">3. Custom Collation Multiplier Calculator</h4>
          </div>
          <span className="text-xs text-slate-400">
            Calculate expected EV, card counts, and rare density for any quantity of packs
          </span>
        </div>

        {/* Quantity Range Slider & Input */}
        <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Packs to Open:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalculatorPacks(9)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                1 Bundle (9x)
              </button>
              <button
                onClick={() => setCalculatorPacks(36)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                1 Box (36x)
              </button>
              <button
                onClick={() => setCalculatorPacks(108)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                3 Boxes (108x)
              </button>
              <button
                onClick={() => setCalculatorPacks(216)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                1 Case (216x)
              </button>
              <input
                type="number"
                min={1}
                max={1000}
                value={calculatorPacks}
                onChange={(e) => setCalculatorPacks(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-1 bg-slate-950 border border-slate-600 text-white text-xs font-mono font-bold rounded focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
              />
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={216}
            value={calculatorPacks}
            onChange={(e) => setCalculatorPacks(parseInt(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer"
          />
        </div>

        {/* Calculator Output KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
            <div className="text-slate-400">Total MTG Cards</div>
            <div className="text-xl font-black text-white font-mono mt-0.5">{calcTotalCards}</div>
            <div className="text-[10px] text-slate-400">{calculatorPacks} Boosters</div>
          </div>

          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
            <div className="text-slate-400">Expected Rares/Mythics</div>
            <div className="text-xl font-black text-amber-400 font-mono mt-0.5">~{calcRares} Cards</div>
            <div className="text-[10px] text-amber-300">({calcMythics} Mythics avg)</div>
          </div>

          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
            <div className="text-slate-400">Expected Foil Wildcards</div>
            <div className="text-xl font-black text-indigo-400 font-mono mt-0.5">~{calcFoils} Foils</div>
            <div className="text-[10px] text-indigo-300">100% Traditional Foil</div>
          </div>

          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
            <div className="text-slate-400">Simulated Total EV</div>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
              ${calcTotalEv.toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-300">
              Avg ${(calcTotalEv / calculatorPacks).toFixed(2)}/pack
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
