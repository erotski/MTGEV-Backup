import React, { useState, useEffect, useMemo } from 'react';
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
  Gift
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { BoxArbitrageRecord } from '../types';
import { ProductBreakdownModal } from './ProductBreakdownModal';
import { CatalogPackProduct } from '../ecommerceBoosterData';

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
    card?: Array<{ count?: number; name?: string; foil?: boolean; finishes?: string[] }>;
    deck?: Array<{ name: string; set?: string }>;
    other?: Array<{ name: string }>;
  } | null;
  marketPrice: number;
  purchaseUrl?: string;
  priceFetchedAt?: string;
}

export const ProductHierarchyInspector: React.FC = () => {
  const [sealedProducts, setSealedProducts] = useState<SealedProductItem[]>([]);
  const [arbitrageMap, setArbitrageMap] = useState<Record<string, BoxArbitrageRecord>>({});
  const [preconDecks, setPreconDecks] = useState<Record<string, any>>({});
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
  const [viewMode, setViewMode] = useState<'visual_tree' | 'raw_json'>('visual_tree');

  // Load authoritative data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [products, arbRecords, decks] = await Promise.all([
          dataService.getSealedProducts(),
          dataService.getArbitrageRecords(),
          dataService.getPreconDecks()
        ]);

        setSealedProducts(products || []);

        const arbMap: Record<string, BoxArbitrageRecord> = {};
        (arbRecords || []).forEach((r) => {
          if (r.productUuid) arbMap[r.productUuid] = r;
        });
        setArbitrageMap(arbMap);
        setPreconDecks(decks || {});

        // Pre-select first interesting composite item (e.g. Aquarius or Festival in a box if exists)
        const highlight = (products || []).find(
          (p: SealedProductItem) =>
            p.displayName.toLowerCase().includes('aquarius') ||
            p.displayName.toLowerCase().includes('festival in a box')
        ) || (products || [])[0];
        if (highlight) {
          setSelectedProduct(highlight);
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

  // Toggle node expansion in tree
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return sealedProducts.filter((p) => {
      // Set filter
      if (selectedSet !== 'all' && (p.setCode || '').toUpperCase() !== selectedSet) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }

      const pLower = (p.displayName || '').toLowerCase();
      const catLower = (p.category || '').toLowerCase();
      const subLower = (p.subtype || '').toLowerCase();
      const hasSealed = Boolean(p.contents?.sealed && p.contents.sealed.length > 0);
      const isSLD = (p.setCode || '').toLowerCase() === 'sld' || subLower.includes('secret_lair');
      const isCase = catLower.includes('case') || pLower.includes('case');

      const arb = arbitrageMap[p.id || p.uuid || ''];
      const hasDiscrepancy = Boolean(
        p.cardCount &&
        arb &&
        arb.cardCount &&
        Math.abs(p.cardCount - arb.cardCount) > 0 &&
        arb.packCount === 0
      );

      // Filter mode
      if (filterMode === 'composite' && !hasSealed) return false;
      if (filterMode === 'secret_lair' && !isSLD) return false;
      if (filterMode === 'cases' && !isCase) return false;
      if (filterMode === 'discrepancy' && !hasDiscrepancy) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = pLower.includes(q);
        const matchesSet = (p.setCode || '').toLowerCase().includes(q);
        const matchesId = (p.id || p.uuid || '').toLowerCase().includes(q);
        const matchesSubtype = subLower.includes(q);
        
        // Search in sub-items
        let matchesSubItem = false;
        if (p.contents?.sealed) {
          matchesSubItem = p.contents.sealed.some((s) => (s.name || '').toLowerCase().includes(q));
        }
        if (p.contents?.deck) {
          matchesSubItem = matchesSubItem || p.contents.deck.some((d) => (d.name || '').toLowerCase().includes(q));
        }

        if (!matchesName && !matchesSet && !matchesId && !matchesSubtype && !matchesSubItem) {
          return false;
        }
      }

      return true;
    });
  }, [sealedProducts, selectedSet, selectedCategory, filterMode, searchQuery, arbitrageMap]);

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
    const isExpanded = expandedNodes[nodeKey] !== false; // Default expanded

    const hasSealedChildren = Boolean(item.contents?.sealed && item.contents.sealed.length > 0);
    const hasPacks = Boolean(item.contents?.pack && item.contents.pack.length > 0);
    const hasCards = Boolean(item.contents?.card && item.contents.card.length > 0);
    const hasDecks = Boolean(item.contents?.deck && item.contents.deck.length > 0);
    const hasAnyContent = hasSealedChildren || hasPacks || hasCards || hasDecks;

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
                  className={`mt-0.5 p-1 rounded-lg transition ${
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
              <div
                className={`px-3 py-2 rounded-xl text-xs flex flex-col ${
                  depth === 0 ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-200'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400">Market Price</span>
                <span className="font-bold font-mono text-sm text-emerald-500">
                  ${(Number(item.marketPrice || 0) * multiplier).toFixed(2)}
                  {multiplier > 1 && (
                    <span className="text-[10px] text-slate-400 ml-1 font-normal">
                      (${(Number(item.marketPrice || 0)).toFixed(2)} ea)
                    </span>
                  )}
                </span>
              </div>

              {arb && (
                <div
                  className={`px-3 py-2 rounded-xl text-xs flex flex-col ${
                    depth === 0 ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-200'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400">Aggregated EV</span>
                  <span className="font-bold font-mono text-sm text-amber-400">
                    ${(Number(arb.boxEvAvg || 0) * multiplier).toFixed(2)}
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
                  {arb ? (
                    <>
                      {arb.packCount * multiplier} Packs • {arb.cardCount * multiplier} Cards
                    </>
                  ) : (
                    <>
                      {item.cardCount ? `${item.cardCount * multiplier} Declared Cards` : 'Direct Leaf Item'}
                    </>
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

            {/* 2. Direct Booster Packs */}
            {hasPacks && (
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Box className="w-4 h-4 text-amber-500" />
                  <span>Contained Booster Packs ({item.contents!.pack!.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {item.contents!.pack!.map((pk, idx) => (
                    <div
                      key={`${nodeKey}-pack-${idx}`}
                      className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{pk.code?.toUpperCase()} Booster Pack</span>
                        <div className="text-[10px] text-slate-500 font-mono">Set: {pk.set?.toUpperCase() || item.setCode?.toUpperCase()}</div>
                      </div>
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded font-mono font-black text-xs">
                        ×{(pk.count || 1) * multiplier}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Direct Cards / Promos */}
            {hasCards && (
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>Standalone Cards & Promos ({item.contents!.card!.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {item.contents!.card!.map((cd, idx) => (
                    <div
                      key={`${nodeKey}-card-${idx}`}
                      className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-slate-900">{cd.name || 'Promo Card'}</span>
                        <div className="text-[10px] text-slate-500">
                          {cd.foil || cd.finishes?.includes('foil') ? '✨ Foil Finish' : 'Standard Non-Foil'}
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-mono font-bold text-xs shrink-0">
                        ×{(cd.count || 1) * multiplier}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Preconstructed Decks */}
            {hasDecks && (
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-purple-500" />
                  <span>Preconstructed Decks ({item.contents!.deck!.length})</span>
                </div>
                <div className="space-y-2">
                  {item.contents!.deck!.map((dk, idx) => {
                    const matchedDeck = preconDecks[dk.name.toLowerCase()];
                    return (
                      <div
                        key={`${nodeKey}-deck-${idx}`}
                        className="bg-white p-3 rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{dk.name}</span>
                          <div className="text-[10px] text-slate-500">Set: {dk.set?.toUpperCase() || item.setCode?.toUpperCase()}</div>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-mono font-bold text-xs">
                            ×{1 * multiplier} Deck ({matchedDeck ? `${matchedDeck.cardCount || 100} cards` : 'Fixed cards'})
                          </span>
                          {matchedDeck?.totalSinglesEv && (
                            <div className="text-[10px] font-mono text-emerald-600 font-bold mt-1">
                              Singles EV: ${Number(matchedDeck.totalSinglesEv).toFixed(2)}
                            </div>
                          )}
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
                Recursive Valuation Engine
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Product Multiplication & Sub-Item Breakdown
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl">
              Inspect recursive sealed product compositions, child pack multipliers, standalone promo cards, preconstructed decks, and verify exact mathematical formulas behind all EV derivations.
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
          <div className="text-[11px] text-emerald-600 font-medium">Fixed 5-Card & Drop Multipliers</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">Booster Box Cases</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.casesCount}</div>
          <div className="text-[11px] text-amber-600 font-medium">6x & 15x Box Aggregations</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">Explicit MTGJSON Contents</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.withContentsCount}</div>
          <div className="text-[11px] text-slate-500 font-medium">Full Schema Verified</div>
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Set Code</label>
                <select
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
            </div>

            {/* Filter Mode Quick Badges */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'all', label: 'All Items' },
                { id: 'composite', label: 'Nested Composites' },
                { id: 'secret_lair', label: 'Secret Lairs' },
                { id: 'cases', label: 'Cases & Master Cases' },
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
              <span className="text-[11px] font-normal text-slate-500">Click to inspect breakdown</span>
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
                        </div>
                        <div className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                          {p.displayName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {arb ? `${arb.packCount} Packs • ${arb.cardCount} Cards` : (p.cardCount ? `${p.cardCount} Cards` : 'Leaf Item')}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs text-emerald-600">
                          ${Number(p.marketPrice || 0).toFixed(2)}
                        </div>
                        {arb && (
                          <div className="font-mono text-[10px] text-amber-600 font-bold">
                            EV: ${Number(arb.boxEvAvg || 0).toFixed(2)}
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
          {selectedProduct ? (
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
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                      {selectedProduct.displayName}
                    </h2>
                  </div>

                                    {/* View Mode Toggle */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setViewMode('visual_tree')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        viewMode === 'visual_tree' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Visual Tree
                    </button>
                    <button
                      onClick={() => setViewMode('raw_json')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        viewMode === 'raw_json' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Raw MTGJSON
                    </button>
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
                                              estimatedEv: matchedDeck?.totalSinglesEv || arb?.boxEvAvg || (p.marketPrice ? p.marketPrice * 1.15 : 0),
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

                {/* Mathematical Formula Summary Box */}
                {(() => {
                  const uid = selectedProduct.id || selectedProduct.uuid || '';
                  const arb = arbitrageMap[uid];
                  return (
                    <div className="bg-indigo-50/70 rounded-xl p-4 border border-indigo-100 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                        <Calculator className="w-4 h-4 text-indigo-600" />
                        <span>Aggregated Valuation & Multiplier Derivation</span>
                      </div>
                      <div className="text-xs text-indigo-950 font-mono space-y-1">
                        <div>
                          • Market Price: <span className="font-bold text-emerald-600">${Number(selectedProduct.marketPrice || 0).toFixed(2)}</span>
                        </div>
                        {arb ? (
                          <>
                            <div>
                              • Total Evaluated EV: <span className="font-bold text-amber-700">${Number(arb.boxEvAvg).toFixed(2)}</span> (Mid90: ${Number(arb.boxEvMid90).toFixed(2)})
                            </div>
                            <div>
                              • Aggregated Composition: <span className="font-bold">{arb.packCount} Booster Packs</span> + <span className="font-bold">{arb.cardCount} Total Cards</span>
                            </div>
                            <div>
                              • Net Arbitrage Spread: <span className="font-bold text-emerald-700">${Number(arb.arbitrageValue).toFixed(2)}</span> ({arb.roiPercent > 0 ? `+${arb.roiPercent}%` : `${arb.roiPercent}%`} ROI)
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-500">
                            No randomized booster simulation attached (fixed value or direct leaf product).
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
                        _arbitrageEvaluation: arbitrageMap[selectedProduct.id || selectedProduct.uuid || ''] || null,
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
      />
    </div>
  );
};
