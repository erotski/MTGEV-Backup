import React, { useState } from 'react';
import {
  ECOMMERCE_CATALOG_PACKS,
  CatalogPackProduct,
  BoosterVariation,
  ProductPackagingType,
  ProductContainmentItem,
} from '../ecommerceBoosterData';
import { SetSymbolIcon } from './SetSymbolIcon';
import {
  DraftCartItem,
  PodSimulationResult,
  DuplicateLimitMode,
  AncillaryInclusions,
} from '../types';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Sliders,
  Play,
  Sparkles,
  Layers,
  CheckCircle2,
  RefreshCw,
  Search,
  Package,
  ArrowRight,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Copy,
  Check,
  Info,
  X,
  ChevronRight,
  Sparkle,
  Settings2,
  Box as BoxIcon,
  Layers3,
  Archive,
  Gift,
  HelpCircle,
} from 'lucide-react';

export const CubeBuilderStudio: React.FC = () => {
  // E-Commerce Catalog State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBoosterType, setSelectedBoosterType] = useState<string>('all');
  const [selectedPackaging, setSelectedPackaging] = useState<string>('all');
  const [selectedBlock, setSelectedBlock] = useState<string>('all');

  // Draft Pod Shopping Cart State
  const [cart, setCart] = useState<DraftCartItem[]>([
    {
      cartItemId: 'item-mh3-box',
      productId: 'box-mh3-play',
      quantity: 1, // 1 box = 36 packs
      selectedBoosterIndex: 'weighted_auto',
      sheetPicksOverride: {},
      disabledSheets: [],
    },
    {
      cartItemId: 'item-blb-bundle',
      productId: 'bundle-blb',
      quantity: 1, // 1 bundle = 9 packs
      selectedBoosterIndex: 'weighted_auto',
      sheetPicksOverride: {},
      disabledSheets: [],
    },
  ]);

  // Active Sheet Configurator Modal for deep inspection of setboostercontentweights & related products
  const [inspectingProduct, setInspectingProduct] = useState<CatalogPackProduct | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<DraftCartItem | null>(null);
  const [tempBoosterIndex, setTempBoosterIndex] = useState<number | 'weighted_auto'>('weighted_auto');
  const [tempPicksOverride, setTempPicksOverride] = useState<Record<string, number>>({});
  const [tempDisabledSheets, setTempDisabledSheets] = useState<string[]>([]);
  const [activeModalTab, setActiveModalTab] = useState<'hierarchy' | 'sheets'>('hierarchy');

  // Expanded Related Products Drawer on individual catalog cards
  const [expandedCardHierarchy, setExpandedCardHierarchy] = useState<Record<string, boolean>>({});

  // Duplicate Limit & Inclusions Rules
  const [duplicateLimit, setDuplicateLimit] = useState<DuplicateLimitMode>('unlimited');
  const [globalInclusions, setGlobalInclusions] = useState<AncillaryInclusions>({
    includeBasicLands: true,
    includeArtCards: true,
    includeTokens: true,
    includeTheList: true,
    includeSpecialGuests: true,
    includeSerialized: true,
  });

  // Draft Simulation Output
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<PodSimulationResult | null>(null);
  const [copiedRecipe, setCopiedRecipe] = useState<boolean>(false);

  // Helper to format packaging type badges
  const getPackagingBadge = (type: ProductPackagingType) => {
    switch (type) {
      case 'case':
        return { label: 'Sealed Case (6 Boxes)', icon: Archive, bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'box':
        return { label: 'Booster Box', icon: BoxIcon, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'bundle':
        return { label: 'Bundle / Fat Pack', icon: Gift, bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'starter_deck':
        return { label: 'Tournament Starter (75 Cards)', icon: Layers3, bg: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'prerelease':
        return { label: 'Prerelease Kit (6 Packs)', icon: Sparkles, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default:
        return { label: 'Single Pack', icon: Package, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Filter Catalog
  const filteredCatalog = ECOMMERCE_CATALOG_PACKS.filter((p) => {
    if (selectedBoosterType !== 'all' && p.boosterName !== selectedBoosterType) return false;
    if (selectedPackaging !== 'all' && p.packagingType !== selectedPackaging) return false;
    if (selectedBlock !== 'all' && p.block !== selectedBlock) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.displayName.toLowerCase().includes(q) || p.setName.toLowerCase().includes(q);
      const matchCode = p.setCode.toLowerCase().includes(q);
      const matchFeatures = p.specialFeatures.some((f) => f.toLowerCase().includes(q));
      const matchPackaging = p.packagingType.toLowerCase().includes(q);
      return matchName || matchCode || matchFeatures || matchPackaging;
    }
    return true;
  });

  // Unique Blocks for filter dropdown
  const allBlocks = Array.from(new Set(ECOMMERCE_CATALOG_PACKS.map((p) => p.block)));

  // Cart Calculations (Accounting for packsCount per product)
  const totalPacksInCart = cart.reduce((sum, item) => {
    const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
    const packsPerUnit = product?.packsCount ?? 1;
    return sum + item.quantity * packsPerUnit;
  }, 0);

  const getEffectiveCardsPerPack = (item: DraftCartItem): number => {
    const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
    if (!product) return 0;
    const variation =
      typeof item.selectedBoosterIndex === 'number'
        ? product.variations[item.selectedBoosterIndex] || product.variations[0]
        : product.variations[0];

    return variation.sheets.reduce((sum, sheet) => {
      if (item.disabledSheets.includes(sheet.sheetCode)) return sum;
      const picks = item.sheetPicksOverride[sheet.sheetCode] ?? sheet.sheetPicks;
      return sum + picks;
    }, 0);
  };

  const totalCardsInCart = cart.reduce((sum, item) => {
    const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
    const packsPerUnit = product?.packsCount ?? 1;
    return sum + item.quantity * packsPerUnit * getEffectiveCardsPerPack(item);
  }, 0);

  const totalCartMarketCost = cart.reduce((sum, item) => {
    const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
    return sum + item.quantity * (product?.marketPrice ?? 0);
  }, 0);

  const totalCartEstimatedEv = cart.reduce((sum, item) => {
    const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
    return sum + item.quantity * (product?.estimatedEv ?? 0);
  }, 0);

  // Cart Actions
  const handleAddToCart = (product: CatalogPackProduct, quantity: number = 1) => {
    const existing = cart.find((i) => i.productId === product.id && i.selectedBoosterIndex === 'weighted_auto');
    if (existing) {
      setCart(
        cart.map((i) =>
          i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity + quantity } : i
        )
      );
    } else {
      const newItem: DraftCartItem = {
        cartItemId: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: product.id,
        quantity,
        selectedBoosterIndex: 'weighted_auto',
        sheetPicksOverride: {},
        disabledSheets: [],
      };
      setCart([...cart, newItem]);
    }
  };

  const handleAddRelatedProductToCart = (productId: string, quantity: number = 1) => {
    const targetProduct = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === productId);
    if (targetProduct) {
      handleAddToCart(targetProduct, quantity);
    }
  };

  const handleUpdateCartQuantity = (cartItemId: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.cartItemId === cartItemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as DraftCartItem[]
    );
  };

  const handleRemoveFromCart = (cartItemId: string) => {
    setCart(cart.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
    setSimResult(null);
  };

  // Quick Preset Pre-Fills
  const handlePreset8PlayerDraft = (productId: string = 'box-mh3-play') => {
    const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === productId) || ECOMMERCE_CATALOG_PACKS[0];
    setCart([
      {
        cartItemId: `cart-8p-${Date.now()}`,
        productId: product.id,
        quantity: 1, // 1 box contains 36 packs (more than enough for 24-pack pod)
        selectedBoosterIndex: 'weighted_auto',
        sheetPicksOverride: {},
        disabledSheets: [],
      },
    ]);
  };

  const handlePresetChaosDraft = () => {
    const chaosItems: DraftCartItem[] = ECOMMERCE_CATALOG_PACKS.filter((p) => p.packagingType === 'pack')
      .slice(0, 8)
      .map((p, idx) => ({
        cartItemId: `cart-chaos-${idx}-${Date.now()}`,
        productId: p.id,
        quantity: 3, // 8 sets * 3 packs = 24 packs
        selectedBoosterIndex: 'weighted_auto',
        sheetPicksOverride: {},
        disabledSheets: [],
      }));
    setCart(chaosItems);
  };

  // Open Sheet & BoosterIndex Configurator Modal
  const handleOpenConfigurator = (
    product: CatalogPackProduct,
    existingCartItem?: DraftCartItem,
    initialTab: 'hierarchy' | 'sheets' = 'hierarchy'
  ) => {
    setInspectingProduct(product);
    setActiveModalTab(initialTab);
    if (existingCartItem) {
      setEditingCartItem(existingCartItem);
      setTempBoosterIndex(existingCartItem.selectedBoosterIndex);
      setTempPicksOverride({ ...existingCartItem.sheetPicksOverride });
      setTempDisabledSheets([...existingCartItem.disabledSheets]);
    } else {
      setEditingCartItem(null);
      setTempBoosterIndex('weighted_auto');
      setTempPicksOverride({});
      setTempDisabledSheets([]);
    }
  };

  // Switch inspecting product in modal (e.g. from Pack to Box or vice-versa)
  const handleSwitchInspectedProduct = (productId: string) => {
    const target = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === productId);
    if (target) {
      setInspectingProduct(target);
      setEditingCartItem(null);
      setTempBoosterIndex('weighted_auto');
      setTempPicksOverride({});
      setTempDisabledSheets([]);
    }
  };

  const handleSaveConfigurator = (addQuantity: number = 1) => {
    if (!inspectingProduct) return;

    if (editingCartItem) {
      // Update existing item
      setCart(
        cart.map((item) =>
          item.cartItemId === editingCartItem.cartItemId
            ? {
                ...item,
                selectedBoosterIndex: tempBoosterIndex,
                sheetPicksOverride: tempPicksOverride,
                disabledSheets: tempDisabledSheets,
              }
            : item
        )
      );
    } else {
      // Add as new configured item
      const newItem: DraftCartItem = {
        cartItemId: `cart-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: inspectingProduct.id,
        quantity: addQuantity,
        selectedBoosterIndex: tempBoosterIndex,
        sheetPicksOverride: tempPicksOverride,
        disabledSheets: tempDisabledSheets,
      };
      setCart([...cart, newItem]);
    }
    setInspectingProduct(null);
    setEditingCartItem(null);
  };

  // Run Draft Pod Simulation based on setboostercontentweights
  const runPodSimulation = () => {
    if (cart.length === 0) return;
    setIsSimulating(true);

    setTimeout(() => {
      let totalPacks = 0;
      let totalCards = 0;
      let totalEv = 0;
      let raresCount = 0;
      let mythicsCount = 0;
      let foilsCount = 0;
      let specialSheetCount = 0;

      const breakdown: PodSimulationResult['packBreakdown'] = [];

      cart.forEach((item) => {
        const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
        if (!product) return;

        const effectivePacks = item.quantity * product.packsCount;
        totalPacks += effectivePacks;
        let itemCardCountPerPack = 0;
        const sheetsSummaryMap = new Map<string, { sheetName: string; count: number; category: string }>();

        for (let p = 0; p < effectivePacks; p++) {
          // Determine which boosterIndex to pick for this pack
          let activeVariation: BoosterVariation = product.variations[0];
          let boosterIndexLabel = 'Index 0 (Standard)';

          if (item.selectedBoosterIndex === 'weighted_auto') {
            const totalWeight = product.variations.reduce((w, v) => w + v.boosterWeight, 0);
            let rand = Math.random() * totalWeight;
            for (const v of product.variations) {
              if (rand < v.boosterWeight) {
                activeVariation = v;
                boosterIndexLabel = `Weighted Roll: ${v.name} (Idx ${v.boosterIndex})`;
                break;
              }
              rand -= v.boosterWeight;
            }
          } else {
            const chosen = product.variations.find((v) => v.boosterIndex === item.selectedBoosterIndex);
            if (chosen) {
              activeVariation = chosen;
              boosterIndexLabel = `Manual: ${chosen.name} (Idx ${chosen.boosterIndex})`;
            }
          }

          // Open sheets in this variation
          let packEv = 0;
          activeVariation.sheets.forEach((sheet) => {
            if (item.disabledSheets.includes(sheet.sheetCode)) return;

            const picks = item.sheetPicksOverride[sheet.sheetCode] ?? sheet.sheetPicks;
            itemCardCountPerPack += picks;
            totalCards += picks;

            const existingSummary = sheetsSummaryMap.get(sheet.sheetCode);
            if (existingSummary) {
              existingSummary.count += picks;
            } else {
              sheetsSummaryMap.set(sheet.sheetCode, {
                sheetName: sheet.sheetName,
                count: picks,
                category: sheet.category,
              });
            }

            // Estimate odds & EV
            if (sheet.category === 'rare_mythic') {
              const rareOdds = sheet.rareOdds ?? 0.857;
              const mythicsOpened = picks * (1 - rareOdds);
              const raresOpened = picks * rareOdds;
              raresCount += Math.round(raresOpened);
              mythicsCount += Math.round(mythicsOpened);
              packEv += picks * 4.6;
            } else if (sheet.category === 'special_bonus') {
              specialSheetCount += picks;
              packEv += picks * 6.5;
            } else if (sheet.category === 'foil') {
              foilsCount += picks;
              packEv += picks * 1.8;
            } else if (sheet.category === 'uncommon') {
              packEv += picks * 0.45;
            } else if (sheet.category === 'common') {
              packEv += picks * 0.12;
            } else if (sheet.category === 'land') {
              packEv += picks * 0.35;
            }
          });

          totalEv += packEv;
        }

        breakdown.push({
          packTitle: `${item.quantity}x ${product.displayName} (${effectivePacks} Total Packs)`,
          quantity: effectivePacks,
          cardsPerPack: Math.round(itemCardCountPerPack / effectivePacks),
          boosterIndexUsed:
            item.selectedBoosterIndex === 'weighted_auto'
              ? 'MTGJSON Weighted Auto-Collation'
              : `Locked BoosterIndex ${item.selectedBoosterIndex}`,
          sheetsOpened: Array.from(sheetsSummaryMap.values()),
        });
      });

      const totalCost = totalCartMarketCost;
      const evRoi = totalCost > 0 ? ((totalEv - totalCost) / totalCost) * 100 : 0;

      setSimResult({
        totalPacks,
        totalCards,
        totalCostUsd: totalCost,
        totalEvUsd: totalEv,
        evRoiPct: Number(evRoi.toFixed(1)),
        raresAndMythicsCount: raresCount + mythicsCount,
        mythicCount: mythicsCount,
        foilCount: foilsCount,
        specialSheetCount: specialSheetCount,
        packBreakdown: breakdown,
      });

      setIsSimulating(false);
    }, 450);
  };

  const handleCopyJson = () => {
    const payload = {
      format: 'MTGJSON_SetBoosterContentWeights_DraftPool',
      generatedAt: new Date().toISOString(),
      duplicateLimit,
      globalInclusions,
      cart: cart.map((c) => {
        const prod = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === c.productId);
        return {
          productId: c.productId,
          productName: prod?.displayName,
          packagingType: prod?.packagingType,
          quantityUnits: c.quantity,
          totalBoosterPacks: c.quantity * (prod?.packsCount ?? 1),
          boosterIndex: c.selectedBoosterIndex,
          sheetPicksOverride: c.sheetPicksOverride,
          disabledSheets: c.disabledSheets,
        };
      }),
      totals: {
        totalPacks: totalPacksInCart,
        totalCards: totalCardsInCart,
        marketCost: totalCartMarketCost,
        estimatedEv: totalCartEstimatedEv,
      },
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedRecipe(true);
    setTimeout(() => setCopiedRecipe(false), 2000);
  };

  return (
    <div id="ecommerce-booster-studio" className="space-y-8 pb-12">
      {/* Top Banner / Store Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> MTG Product & Pack Marketplace
            </span>
            <span className="text-xs text-slate-400">| Products Within Products & Collation Hierarchy</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Booster Pack & Containment Marketplace
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Explore related products across containment tiers: Single Packs, Bundles (9x), Booster Boxes (36x), and Sealed Cases (216x / 6 Boxes).
            Inspect MTGJSON <code className="text-amber-300 bg-slate-800 px-1 py-0.5 rounded">setboostercontentweights</code> sheets and add products directly to your Draft Pod.
          </p>
        </div>

        {/* Quick Cart Action & Draft Pod Presets */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <button
            onClick={() => handlePreset8PlayerDraft('box-mh3-play')}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition border border-slate-700 cursor-pointer"
          >
            Add MH3 Box (36 Packs)
          </button>
          <button
            onClick={handlePresetChaosDraft}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition border border-slate-700 cursor-pointer"
          >
            Fill Chaos Draft (24x)
          </button>
          <button
            onClick={handleCopyJson}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            {copiedRecipe ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copiedRecipe ? 'Copied' : 'Export JSON'}
          </button>
        </div>
      </div>

      {/* Main Grid: Marketplace on Left, Pod Cart & Collation on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: E-COMMERCE BOOSTER CATALOG (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Search & Filter Bar */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search sets, boxes, bundles, cases, SPG, fetchlands (e.g. MH3, Bundle, Box, BLB)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Packaging Type Filter */}
              <select
                value={selectedPackaging}
                onChange={(e) => setSelectedPackaging(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All Packagings</option>
                <option value="pack">Single Packs (1x)</option>
                <option value="box">Booster Boxes (36x / 12x)</option>
                <option value="bundle">Bundles & Fat Packs (9x / 8x)</option>
                <option value="case">Sealed Cases (6 Boxes / 216x)</option>
                <option value="starter_deck">Tournament Starters (75x)</option>
              </select>

              {/* Booster Type Filter */}
              <select
                value={selectedBoosterType}
                onChange={(e) => setSelectedBoosterType(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All Booster Types</option>
                <option value="play">Play Boosters</option>
                <option value="draft">Draft Boosters</option>
                <option value="collector">Collector Boosters</option>
                <option value="starter">Tournament Starters</option>
              </select>

              {/* Block Filter */}
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All Eras & Blocks</option>
                {allBlocks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Catalog Products List */}
          <div className="space-y-4">
            {filteredCatalog.map((product) => {
              const packagingInfo = getPackagingBadge(product.packagingType);
              const PackagingIcon = packagingInfo.icon;
              const isHierarchyOpen = !!expandedCardHierarchy[product.id];

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition space-y-4"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 bg-slate-900 text-white rounded-md text-[11px] font-mono font-black flex items-center gap-1.5 shadow-sm">
                          <SetSymbolIcon setCode={product.setCode} size="xs" />
                          <span>{product.setCode}</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 ${packagingInfo.bg}`}>
                          <PackagingIcon className="w-3 h-3" />
                          {packagingInfo.label}
                        </span>
                        {product.badge && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[11px] font-bold">
                            {product.badge}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 font-mono">
                          {product.packsCount > 1
                            ? `${product.packsCount} Packs (${product.cardCount} Cards Total)`
                            : `${product.cardCount} cards/pack`}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900">{product.displayName}</h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Released: {product.releaseDate} | {product.block}
                      </div>
                    </div>

                    <div className="text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto">
                      <div className="text-base font-black text-slate-900 font-mono">
                        ${product.marketPrice.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-mono font-semibold">
                        Est. EV: ${product.estimatedEv.toFixed(2)}
                      </div>
                      {product.packsCount > 1 && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          (${(product.marketPrice / product.packsCount).toFixed(2)}/pack)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Special Features & Sheets Highlight */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {product.specialFeatures.map((feat, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-medium px-2.5 py-1 bg-slate-50 text-slate-700 rounded-lg border border-slate-200/80 flex items-center gap-1"
                      >
                        <Sparkle className="w-3 h-3 text-amber-500" /> {feat}
                      </span>
                    ))}
                  </div>

                  {/* Related Products Preview Strip (Products within Products) */}
                  {(product.contains && product.contains.length > 0) || (product.containedIn && product.containedIn.length > 0) ? (
                    <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-500" />
                          Related Products Hierarchy:
                        </span>
                        <button
                          onClick={() =>
                            setExpandedCardHierarchy({
                              ...expandedCardHierarchy,
                              [product.id]: !isHierarchyOpen,
                            })
                          }
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        >
                          {isHierarchyOpen ? 'Hide Hierarchy' : 'View Contained / Bulk Products'}
                        </button>
                      </div>

                      {/* Quick Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {product.contains && product.contains.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-700">Contains:</span>
                            {product.contains.map((sub, sIdx) => (
                              <span
                                key={sIdx}
                                className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono font-medium text-slate-800"
                              >
                                {sub.quantity}x {sub.name.split('(')[0]}
                              </span>
                            ))}
                          </div>
                        )}

                        {product.containedIn && product.containedIn.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-700">Part of:</span>
                            {product.containedIn.map((parent, pIdx) => (
                              <button
                                key={pIdx}
                                onClick={() => handleSwitchInspectedProduct(parent.productId)}
                                className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded font-semibold transition cursor-pointer flex items-center gap-1"
                              >
                                {parent.packagingType === 'box'
                                  ? `Box (${parent.quantity}x)`
                                  : parent.packagingType === 'bundle'
                                  ? `Bundle (${parent.quantity}x)`
                                  : `Case (${parent.quantity}x)`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Expanded Related Products Breakdown */}
                      {isHierarchyOpen && (
                        <div className="pt-2 border-t border-slate-200/80 space-y-2 animate-in fade-in duration-150">
                          {product.contains && product.contains.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-bold text-slate-700">Items Inside this {product.packagingType.toUpperCase()}:</div>
                              {product.contains.map((c, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-[11px]"
                                >
                                  <div>
                                    <span className="font-bold text-slate-900">{c.quantity}x {c.name}</span>
                                    <div className="text-slate-500 text-[10px]">{c.unitDescription}</div>
                                  </div>
                                  <button
                                    onClick={() => handleOpenConfigurator(product, undefined, 'hierarchy')}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-[10px] cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {product.containedIn && product.containedIn.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-bold text-slate-700">Available in Bulk Container Products:</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {product.containedIn.map((p, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="bg-white p-2 rounded-lg border border-slate-200 text-[11px] flex flex-col justify-between gap-1.5"
                                  >
                                    <div>
                                      <div className="font-bold text-slate-900">{p.name}</div>
                                      <div className="text-slate-500 text-[10px]">{p.unitDescription}</div>
                                      {p.savingsPct && (
                                        <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                          Save {p.savingsPct}% vs Singles
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                      <span className="font-mono font-bold text-slate-900">${p.marketPrice.toFixed(2)}</span>
                                      <button
                                        onClick={() => handleAddRelatedProductToCart(p.productId, 1)}
                                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] cursor-pointer"
                                      >
                                        + Add {p.packagingType.toUpperCase()}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Add to Cart & Customize Buttons */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => handleOpenConfigurator(product, undefined, 'hierarchy')}
                      className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-indigo-200"
                    >
                      <Layers className="w-4 h-4 text-indigo-600" /> Inspect Related Products & Sheets
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAddToCart(product, 1)}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {product.packagingType === 'box'
                          ? 'Add 1 Box (36x)'
                          : product.packagingType === 'bundle'
                          ? 'Add 1 Bundle (9x)'
                          : product.packagingType === 'case'
                          ? 'Add 1 Case (216x)'
                          : 'Add 1 Pack'}
                      </button>

                      {product.packagingType === 'pack' && (
                        <button
                          onClick={() => handleAddToCart(product, 3)}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          +3 (1 Player)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: DRAFT POD CART & SIMULATION RUNNER (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cart Header Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">Draft Pod Shopping Cart</h3>
              </div>
              <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-full text-xs font-black font-mono">
                {totalPacksInCart} Total Packs | {totalCardsInCart} Cards
              </span>
            </div>

            {/* Sizing Indicator Alert */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-700 font-semibold">
                <span>Pod Configuration Status:</span>
                <span className="font-mono text-slate-900 font-bold">
                  {totalPacksInCart >= 24
                    ? `Ready for ${Math.floor(totalPacksInCart / 3)}-Player Draft`
                    : `${totalPacksInCart}/24 Packs (Need ${24 - totalPacksInCart} more for 8-man draft)`}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className={`h-full transition-all ${
                    totalPacksInCart >= 24 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, (totalPacksInCart / 24) * 100)}%` }}
                />
              </div>
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                Your draft pod cart is empty. Add single packs, bundles, or booster boxes from the marketplace on the left.
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {cart.map((item) => {
                  const product = ECOMMERCE_CATALOG_PACKS.find((p) => p.id === item.productId);
                  if (!product) return null;
                  const cardsPerPack = getEffectiveCardsPerPack(item);
                  const effectivePacks = item.quantity * product.packsCount;
                  const packagingInfo = getPackagingBadge(product.packagingType);
                  const isCustomized =
                    item.selectedBoosterIndex !== 'weighted_auto' ||
                    Object.keys(item.sheetPicksOverride).length > 0 ||
                    item.disabledSheets.length > 0;

                  return (
                    <div
                      key={item.cartItemId}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 hover:border-slate-300 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 bg-slate-800 text-white rounded text-[10px] font-mono font-bold flex items-center gap-1">
                              <SetSymbolIcon setCode={product.setCode} size="xs" />
                              {product.setCode}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${packagingInfo.bg}`}>
                              {packagingInfo.label}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{product.displayName}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {effectivePacks} packs total ({cardsPerPack} cards/pack) · ${product.marketPrice.toFixed(2)} unit
                          </div>
                          {isCustomized && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded border border-indigo-200">
                              Custom Sheets / Index Configured
                            </span>
                          )}
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
                          <button
                            onClick={() => handleUpdateCartQuantity(item.cartItemId, -1)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs px-1 text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateCartQuantity(item.cartItemId, 1)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                        <button
                          onClick={() => handleOpenConfigurator(product, item, 'hierarchy')}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Settings2 className="w-3.5 h-3.5" /> Inspect / Edit Collation
                        </button>
                        <button
                          onClick={() => handleRemoveFromCart(item.cartItemId)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pod Rules & Duplication Mode */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Pod Card Duplication Rule:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'unlimited' as DuplicateLimitMode, label: 'Natural Collation' },
                    { id: 'singleton' as DuplicateLimitMode, label: 'Highlander (1 Max)' },
                    { id: 'max_2' as DuplicateLimitMode, label: 'Max 2 Copies' },
                    { id: 'max_4' as DuplicateLimitMode, label: 'Constructed (4 Max)' },
                  ].map((rule) => (
                    <button
                      key={rule.id}
                      onClick={() => setDuplicateLimit(rule.id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer text-left ${
                        duplicateLimit === rule.id
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {rule.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart Financials Summary */}
              <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Cart Market Value:</span>
                  <span className="font-mono text-white font-bold">${totalCartMarketCost.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Expected Pod EV:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    ${totalCartEstimatedEv.toFixed(2)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-bold text-sm">
                  <span>Total Packs collocated:</span>
                  <span className="font-mono text-amber-400">{totalPacksInCart} Packs</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleClearCart}
                  disabled={cart.length === 0}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Clear
                </button>

                <button
                  onClick={runPodSimulation}
                  disabled={cart.length === 0 || isSimulating}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSimulating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Simulating Draft Pod...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" /> Open & Simulate Draft Pod
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SIMULATION REPORT CARD */}
          {simResult && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold text-slate-900">Simulated Pod Output</h3>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {simResult.evRoiPct >= 0 ? `+${simResult.evRoiPct}% EV ROI` : `${simResult.evRoiPct}% ROI`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <div className="text-slate-500">Rares & Mythics</div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    {simResult.raresAndMythicsCount} Cards
                  </div>
                  <div className="text-[10px] text-amber-600 font-medium">
                    ({simResult.mythicCount} Mythics)
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <div className="text-slate-500">Foils & Bonus Sheets</div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    {simResult.foilCount + simResult.specialSheetCount} Cards
                  </div>
                  <div className="text-[10px] text-indigo-600 font-medium">
                    ({simResult.specialSheetCount} Special Guests/MUL)
                  </div>
                </div>
              </div>

              {/* Per Pack Breakdown */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700">Collation Roll Breakdown:</div>
                <div className="space-y-2 text-xs">
                  {simResult.packBreakdown.map((pack, idx) => (
                    <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                      <div className="font-bold text-slate-900 flex items-center justify-between">
                        <span>{pack.packTitle}</span>
                        <span className="text-[10px] font-mono text-slate-500">{pack.cardsPerPack} cards/pk</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {pack.boosterIndexUsed}
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {pack.sheetsOpened.map((sh, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-700"
                          >
                            {sh.count}x {sh.sheetName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: PRODUCT DETAILS, RELATED PRODUCTS & SETBOOSTERCONTENTWEIGHTS       */}
      {/* ========================================================================= */}
      {inspectingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-mono font-bold text-[10px] rounded">
                    {inspectingProduct.setCode}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 font-bold text-[10px] rounded border border-slate-700">
                    {inspectingProduct.packagingType.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Product Details & Containment
                  </span>
                </div>
                <h3 className="text-lg font-black">{inspectingProduct.displayName}</h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Market: <span className="text-amber-300 font-bold">${inspectingProduct.marketPrice.toFixed(2)}</span> | Est. EV: <span className="text-emerald-400 font-bold">${inspectingProduct.estimatedEv.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => setInspectingProduct(null)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
              <button
                onClick={() => setActiveModalTab('hierarchy')}
                className={`pb-3 px-3 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                  activeModalTab === 'hierarchy'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Related Products & Containment
              </button>
              <button
                onClick={() => setActiveModalTab('sheets')}
                className={`pb-3 px-3 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                  activeModalTab === 'sheets'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                setboostercontentweights Sheets & Picks
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* TAB 1: RELATED PRODUCTS & CONTAINMENT HIERARCHY */}
              {activeModalTab === 'hierarchy' && (
                <div className="space-y-6">
                  {/* Visual Containment Diagram Banner */}
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                        Containment Hierarchy Breakdown
                      </span>
                      <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-200 text-[10px] font-mono rounded">
                        {inspectingProduct.packsCount} Packs Collocated
                      </span>
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto py-2">
                      <div className="flex-1 bg-white/10 p-3 rounded-xl border border-white/15 min-w-[130px]">
                        <div className="text-[10px] text-slate-300">Format Tier</div>
                        <div className="font-bold text-sm text-white capitalize">{inspectingProduct.packagingType.replace('_', ' ')}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div className="flex-1 bg-white/10 p-3 rounded-xl border border-white/15 min-w-[130px]">
                        <div className="text-[10px] text-slate-300">Packs Inside</div>
                        <div className="font-bold text-sm text-amber-300 font-mono">{inspectingProduct.packsCount}x Boosters</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div className="flex-1 bg-white/10 p-3 rounded-xl border border-white/15 min-w-[130px]">
                        <div className="text-[10px] text-slate-300">Total Cards</div>
                        <div className="font-bold text-sm text-emerald-300 font-mono">{inspectingProduct.cardCount} Cards</div>
                      </div>
                    </div>
                  </div>

                  {/* 1. What This Product Contains (Inside the Box/Bundle/Case) */}
                  {inspectingProduct.contains && inspectingProduct.contains.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-indigo-600" />
                          Products Contained Inside this {inspectingProduct.packagingType.toUpperCase()}:
                        </h4>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {inspectingProduct.contains.length} Sub-products
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {inspectingProduct.contains.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-300 transition"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm font-mono shrink-0">
                                {item.quantity}x
                              </div>
                              <div>
                                <div className="font-bold text-xs text-slate-900">{item.name}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">{item.unitDescription}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-mono text-slate-600">
                                    Unit Price: ${item.marketPrice.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] font-mono text-emerald-600 font-semibold">
                                    Total Value: ${(item.quantity * item.marketPrice).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleSwitchInspectedProduct(item.productId)}
                              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              Inspect Sub-Product <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bonus Accessories Included */}
                  {inspectingProduct.bonusAccessories && inspectingProduct.bonusAccessories.length > 0 && (
                    <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-purple-600" />
                        Bonus Collector Items & Accessories Included:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {inspectingProduct.bonusAccessories.map((acc, aIdx) => (
                          <div key={aIdx} className="flex items-center gap-2 text-purple-800 bg-white p-2 rounded-lg border border-purple-200/70">
                            <Sparkle className="w-3 h-3 text-purple-500 shrink-0" />
                            <span className="font-medium text-[11px]">{acc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Parent Containers (Products that CONTAIN this product) */}
                  {inspectingProduct.containedIn && inspectingProduct.containedIn.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <BoxIcon className="w-4 h-4 text-amber-500" />
                          Parent Packaging Containers (Buy in Bulk & Save):
                        </h4>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {inspectingProduct.containedIn.length} Container Options
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {inspectingProduct.containedIn.map((parent, pIdx) => (
                          <div
                            key={pIdx}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-800 font-mono text-[10px] font-bold rounded capitalize">
                                  {parent.packagingType.replace('_', ' ')}
                                </span>
                                {parent.savingsPct && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                                    Save {parent.savingsPct}%
                                  </span>
                                )}
                              </div>
                              <h5 className="font-bold text-xs text-slate-900 mt-2">{parent.name}</h5>
                              <p className="text-[11px] text-slate-500 mt-0.5">{parent.unitDescription}</p>

                              {parent.bonusAccessories && (
                                <div className="mt-2 space-y-0.5">
                                  {parent.bonusAccessories.slice(0, 2).map((b, bIdx) => (
                                    <div key={bIdx} className="text-[10px] text-purple-700 flex items-center gap-1">
                                      <Sparkle className="w-2.5 h-2.5" /> {b}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                              <div>
                                <div className="font-mono font-black text-sm text-slate-900">
                                  ${parent.marketPrice.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-emerald-600 font-mono">
                                  Est. EV: ${parent.estimatedEv.toFixed(2)}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleSwitchInspectedProduct(parent.productId)}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                                >
                                  Inspect
                                </button>
                                <button
                                  onClick={() => {
                                    handleAddRelatedProductToCart(parent.productId, 1);
                                    setInspectingProduct(null);
                                  }}
                                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  + Add
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SETBOOSTERCONTENTWEIGHTS SHEETS & PICKS */}
              {activeModalTab === 'sheets' && (
                <div className="space-y-6">
                  {/* Booster Index Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-amber-500" /> Booster Index (Pack Variation & Weight):
                      </label>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {inspectingProduct.variations.length} Index variations found
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Weighted Auto Option */}
                      <button
                        onClick={() => setTempBoosterIndex('weighted_auto')}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          tempBoosterIndex === 'weighted_auto'
                            ? 'bg-amber-50 border-amber-500 text-amber-950 ring-1 ring-amber-500/30'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-bold text-xs">MTGJSON Weighted Natural Roll</div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Simulates true booster box ratios ({inspectingProduct.variations.map((v) => `${v.boosterWeight}%`).join(' / ')})
                        </div>
                      </button>

                      {/* Individual Booster Index Variations */}
                      {inspectingProduct.variations.map((v) => {
                        const isSelected = tempBoosterIndex === v.boosterIndex;
                        return (
                          <button
                            key={v.boosterIndex}
                            onClick={() => setTempBoosterIndex(v.boosterIndex)}
                            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500/30'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-xs flex items-center justify-between">
                              <span>Index {v.boosterIndex}: {v.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded">
                                wt: {v.boosterWeight}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{v.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Sheets Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-800">
                        Sheets & Picks for this Booster Configuration:
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Adjust sheet card picks (+ / -) or toggle sheet on/off
                      </div>
                    </div>

                    {/* Sheets List */}
                    {(() => {
                      const activeVar =
                        typeof tempBoosterIndex === 'number'
                          ? inspectingProduct.variations[tempBoosterIndex] || inspectingProduct.variations[0]
                          : inspectingProduct.variations[0];

                      return (
                        <div className="space-y-2">
                          {activeVar.sheets.map((sheet) => {
                            const isDisabled = tempDisabledSheets.includes(sheet.sheetCode);
                            const currentPicks = tempPicksOverride[sheet.sheetCode] ?? sheet.sheetPicks;

                            const handlePicksChange = (delta: number) => {
                              const next = Math.max(0, currentPicks + delta);
                              setTempPicksOverride({ ...tempPicksOverride, [sheet.sheetCode]: next });
                            };

                            const handleToggleDisabled = () => {
                              if (isDisabled) {
                                setTempDisabledSheets(tempDisabledSheets.filter((c) => c !== sheet.sheetCode));
                              } else {
                                setTempDisabledSheets([...tempDisabledSheets, sheet.sheetCode]);
                              }
                            };

                            return (
                              <div
                                key={sheet.sheetCode}
                                className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition ${
                                  isDisabled
                                    ? 'bg-slate-100 border-slate-200 opacity-50'
                                    : sheet.category === 'special_bonus'
                                    ? 'bg-purple-50/70 border-purple-200'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={!isDisabled}
                                    onChange={handleToggleDisabled}
                                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                  />

                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-900">{sheet.sheetName}</span>
                                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                                        {sheet.sheetCode}
                                      </span>
                                      {sheet.category === 'special_bonus' && (
                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                          Special Bonus Sheet
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">{sheet.description}</div>
                                  </div>
                                </div>

                                {/* Picks Adjuster */}
                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  <span className="text-xs font-bold text-slate-500">Picks:</span>
                                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                                    <button
                                      onClick={() => handlePicksChange(-1)}
                                      disabled={isDisabled || currentPicks <= 0}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition disabled:opacity-30 cursor-pointer"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="font-mono font-bold text-xs px-2 text-slate-900">
                                      {currentPicks}
                                    </span>
                                    <button
                                      onClick={() => handlePicksChange(1)}
                                      disabled={isDisabled}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition disabled:opacity-30 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setInspectingProduct(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleAddToCart(inspectingProduct, 1);
                    setInspectingProduct(null);
                  }}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add This Product to Cart
                </button>
                <button
                  onClick={() => handleSaveConfigurator(1)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
