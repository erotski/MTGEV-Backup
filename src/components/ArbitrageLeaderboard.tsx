import React, { useState, useMemo } from 'react';
import { BoxArbitrageRecord, PriceMode, ProductCategory, Vendor } from '../types';
import { SetSymbolIcon } from './SetSymbolIcon';
import { ProductPackagingImage } from './ProductPackagingImage';
import { ProductPackagingType } from '../ecommerceBoosterData';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Search,
  Layers,
  Award,
  ChevronRight,
  Package,
  Box,
  Archive,
  Gift,
  Sparkles,
  AlertTriangle,
  Flame,
  CheckCircle2,
  DollarSign,
  Shield,
  HelpCircle
} from 'lucide-react';

interface ArbitrageLeaderboardProps {
  records: BoxArbitrageRecord[];
  onSelectSet: (setCode: string) => void;
  priceMode: PriceMode;
  onPriceModeChange: (mode: PriceMode) => void;
  vendor: Vendor;
  onVendorChange: (vendor: Vendor) => void;
}

export const ArbitrageLeaderboard: React.FC<ArbitrageLeaderboardProps> = ({
  records,
  onSelectSet,
  priceMode,
  onPriceModeChange,
  vendor,
  onVendorChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all');
  const [evBasis, setEvBasis] = useState<'min' | 'mid90' | 'avg' | 'max'>('avg');
  const [sortBy, setSortBy] = useState<'roi' | 'profit' | 'boxPrice' | 'boxEv' | 'boxMid90' | 'boxMin' | 'boxMax' | 'packs' | 'cards'>('roi');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [highlightTab, setHighlightTab] = useState<'best' | 'worst'>('best');

  const getCardCount = (box: BoxArbitrageRecord): number => {
    if (typeof box.cardCount === 'number' && box.cardCount > 0) return box.cardCount;
    if (box.contents?.card && Array.isArray(box.contents.card) && box.contents.card.length > 0) {
      return box.contents.card.reduce((sum: number, c: any) => sum + (c.count || 1), 0);
    }
    if (box.contents?.deck && Array.isArray(box.contents.deck) && box.contents.deck.length > 0) {
      const cat = (box.category || '').toLowerCase();
      const isCommander = cat === 'commander_deck' || box.boxName.toLowerCase().includes('commander');
      return box.contents.deck.length * (isCommander ? 100 : 60);
    }
    const cat = (box.category || '').toLowerCase();
    if (cat === 'commander_deck' || box.boxName.toLowerCase().includes('commander')) return 100;
    if (box.packCount > 0) {
      return box.packCount * 15;
    }
    return 0;
  };

  // Dynamically compute adjusted pricing and EV based on selected PriceMode, Vendor & EV Basis
  const adjustedRecords = useMemo(() => {
    // Pricing multipliers based on priceMode & vendor
    const reprintMultiplier = priceMode === 'cheapest_reprint' ? 0.82 : 1.0;

    const vendorSettings = {
      all: { priceMult: 1.0, evMult: 1.0 },
      tcgplayer: { priceMult: 1.0, evMult: 0.98 },
      cardmarket: { priceMult: 0.91, evMult: 0.94 }, // European market conversion & lower fee
      cardkingdom: { priceMult: 1.10, evMult: 1.05 }, // Higher retail singles premium
    }[vendor] || { priceMult: 1.0, evMult: 1.0 };

    return records.map((r) => {
      const rawMin = typeof r.packEvMin === 'number' && r.packEvMin > 0 ? r.packEvMin : (r.packEvAvg > 0 ? r.packEvAvg * 0.15 : 0);
      const rawMax = typeof r.packEvMax === 'number' && r.packEvMax > 0 ? r.packEvMax : (r.packEvAvg > 0 ? r.packEvAvg * 4.5 : 0);

      const adjustedPackMin = rawMin * reprintMultiplier * vendorSettings.evMult;
      const adjustedPackEv = r.packEvAvg * reprintMultiplier * vendorSettings.evMult;
      const adjustedPackMid90 = r.packEvMid90 * reprintMultiplier * vendorSettings.evMult;
      const adjustedPackMax = rawMax * reprintMultiplier * vendorSettings.evMult;
      const adjustedBoxPrice = r.boxMarketPrice * vendorSettings.priceMult;

      let baseCardEv = r.boxEvAvg;
      if (r.packCount === 0 && r.contents?.card && Array.isArray(r.contents.card)) {
        const vendorCardSum = r.contents.card.reduce((sum: number, cd: any) => {
          const p = cd.prices?.[vendor] ?? (vendor === 'all' ? (cd.prices?.all ?? cd.prices?.tcgplayer) : (cd.prices?.[vendor] ?? cd.prices?.tcgplayer));
          return sum + (typeof p === 'number' && p > 0 ? p : 0);
        }, 0);
        if (vendorCardSum > 0) {
          baseCardEv = vendorCardSum;
        }
      }

      const adjustedBoxMin = r.packCount > 0 ? adjustedPackMin * r.packCount : baseCardEv * reprintMultiplier;
      const adjustedBoxEv = r.packCount > 0 ? adjustedPackEv * r.packCount : baseCardEv * reprintMultiplier;
      const adjustedBoxMid90 = r.packCount > 0 ? adjustedPackMid90 * r.packCount : baseCardEv * reprintMultiplier;
      const adjustedBoxMax = r.packCount > 0 ? adjustedPackMax * r.packCount : baseCardEv * reprintMultiplier;
      
      // Calculate Profit/Loss and ROI based on selected EV Calculation Basis (Min, Mid90, Avg, Max)
      const effectiveEv =
        evBasis === 'min'
          ? adjustedBoxMin
          : evBasis === 'mid90'
          ? adjustedBoxMid90
          : evBasis === 'max'
          ? adjustedBoxMax
          : adjustedBoxEv;

      const profitUsd = effectiveEv - adjustedBoxPrice;
      const roiPct = adjustedBoxPrice > 0 ? (profitUsd / adjustedBoxPrice) * 100 : 0;

      return {
        ...r,
        boxMarketPrice: adjustedBoxPrice,
        packEvMin: adjustedPackMin,
        packEvAvg: adjustedPackEv,
        packEvMid90: adjustedPackMid90,
        packEvMax: adjustedPackMax,
        boxEvMin: adjustedBoxMin,
        boxEvAvg: adjustedBoxEv,
        boxEvMid90: adjustedBoxMid90,
        boxEvMax: adjustedBoxMax,
        profitUsd,
        roiPct,
      };
    });
  }, [records, priceMode, vendor, evBasis]);

  const isCategoryMatch = (record: BoxArbitrageRecord, category: ProductCategory): boolean => {
    if (category === 'all') return true;
    const cat = (record.category || '').toLowerCase();

    if (category === 'deck' || category === 'commander_deck') {
      return cat === 'commander_deck' || cat === 'deck' || cat === 'starter_deck' || cat === 'multiple_decks';
    }
    if (category === 'box_set') {
      return cat === 'box_set';
    }
    if (category === 'other') {
      return !['booster_box', 'booster_pack', 'booster_case', 'bundle', 'deck', 'commander_deck', 'box_set'].includes(cat);
    }
    return cat === category;
  };

  const filteredRecords = useMemo(() => {
    return adjustedRecords
      .filter((r) => {
        const matchesSearch =
          r.boxName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.setCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.setName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCat = isCategoryMatch(r, selectedCategory);
        return matchesSearch && matchesCat;
      })
      .sort((a, b) => {
        let valA = 0;
        let valB = 0;
        if (sortBy === 'roi') {
          valA = a.roiPct;
          valB = b.roiPct;
        } else if (sortBy === 'profit') {
          valA = a.profitUsd;
          valB = b.profitUsd;
        } else if (sortBy === 'boxPrice') {
          valA = a.boxMarketPrice;
          valB = b.boxMarketPrice;
        } else if (sortBy === 'boxMin') {
          valA = a.boxEvMin ?? 0;
          valB = b.boxEvMin ?? 0;
        } else if (sortBy === 'boxEv') {
          valA = a.boxEvAvg;
          valB = b.boxEvAvg;
        } else if (sortBy === 'boxMid90') {
          valA = a.boxEvMid90;
          valB = b.boxEvMid90;
        } else if (sortBy === 'boxMax') {
          valA = a.boxEvMax ?? 0;
          valB = b.boxEvMax ?? 0;
        } else if (sortBy === 'packs') {
          valA = a.packCount;
          valB = b.packCount;
        } else if (sortBy === 'cards') {
          valA = getCardCount(a);
          valB = getCardCount(b);
        }
        return sortOrder === 'desc' ? valB - valA : valA - valB;
      });
  }, [adjustedRecords, searchTerm, selectedCategory, sortBy, sortOrder]);

  // Derive Top 3 Best ROI and Top 3 Worst ROI from all products
  const sortedByRoi = useMemo(() => {
    return [...adjustedRecords].sort((a, b) => b.roiPct - a.roiPct);
  }, [adjustedRecords]);

  const top3BestRoi = sortedByRoi.slice(0, 3);
  const top3WorstRoi = [...sortedByRoi].reverse().slice(0, 3);
  const pickOfTheDay = top3BestRoi[0] || adjustedRecords[0];

  const toggleSort = (field: 'roi' | 'profit' | 'boxPrice' | 'boxEv' | 'boxMid90' | 'boxMin' | 'boxMax' | 'packs' | 'cards') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getCategoryIcon = (cat: string, name?: string) => {
    const c = (cat || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (c === 'commander_deck' || c === 'deck' || c === 'starter_deck' || c === 'multiple_decks') {
      return <Shield className="w-4 h-4 text-violet-500" />;
    }
    if (c === 'kit' || n.includes('prerelease')) {
      return <Shield className="w-4 h-4 text-emerald-500" />;
    }
    if (c === 'box_set') {
      return <Sparkles className="w-4 h-4 text-amber-500" />;
    }
    if (c === 'booster_box') {
      return <Box className="w-4 h-4 text-amber-500" />;
    }
    if (c === 'booster_pack') {
      return <Package className="w-4 h-4 text-emerald-500" />;
    }
    if (c === 'booster_case' || c === 'bundle_case' || (c === 'limited_aid_case' && n.includes('case'))) {
      return <Archive className="w-4 h-4 text-indigo-500" />;
    }
    if (c === 'bundle' || c === 'limited_aid_tool') {
      return <Gift className="w-4 h-4 text-rose-500" />;
    }
    return <HelpCircle className="w-4 h-4 text-slate-400" />;
  };

  const mapCategoryToPackagingType = (cat: string, name?: string): ProductPackagingType => {
    const c = (cat || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (c === 'box_set') {
      return 'box_set';
    }
    if (c === 'kit' || n.includes('prerelease')) {
      return 'kit';
    }
    if (c === 'commander_deck' || c === 'deck' || c === 'starter_deck' || c === 'multiple_decks' || c === 'deck_box') {
      return 'starter_deck';
    }
    if (c === 'booster_pack') {
      return 'pack';
    }
    if (c === 'booster_case' || c === 'bundle_case' || (c === 'limited_aid_case' && n.includes('case'))) {
      return 'case';
    }
    if (c === 'bundle' || c === 'limited_aid_tool') {
      return 'bundle';
    }
    if (c === 'booster_box') {
      return 'box';
    }
    return 'other';
  };

  return (
    <div id="arbitrage-leaderboard-container" className="space-y-8">
      {/* 1. PICK OF THE DAY SPOTLIGHT HERO */}
      {pickOfTheDay && (
        <div
          id="pick-of-the-day-banner"
          className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative overflow-hidden"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Left: Product Artwork Visual & Tag */}
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full lg:w-auto">
              <div className="shrink-0 p-2 bg-slate-950/80 rounded-2xl border border-slate-800 shadow-inner flex items-center justify-center">
                <ProductPackagingImage
                  setCode={pickOfTheDay.setCode}
                  setName={pickOfTheDay.setName}
                  packagingType={mapCategoryToPackagingType(pickOfTheDay.category)}
                  displayName={pickOfTheDay.boxName}
                  cardCount={pickOfTheDay.cardCount}
                  size="md"
                  allowZoom={true}
                />
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-sm">
                    <Flame className="w-3.5 h-3.5 fill-current" />
                    PICK OF THE DAY
                  </span>
                  <span className="text-xs text-amber-300 font-mono flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-full border border-amber-500/30">
                    <SetSymbolIcon setCode={pickOfTheDay.setCode} size="xs" />
                    {pickOfTheDay.setCode} • {pickOfTheDay.setName}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {pickOfTheDay.boxName}
                </h2>

                <p className="text-xs sm:text-sm text-slate-300">
                  Market Price: <span className="font-bold text-white">${pickOfTheDay.boxMarketPrice.toFixed(2)}</span>{' '}
                  • Expected Value ({pickOfTheDay.packCount} Packs):{' '}
                  <span className="font-extrabold text-emerald-400">${pickOfTheDay.boxEvAvg.toFixed(2)}</span>
                </p>
              </div>
            </div>

            {/* Right: Profit & Action */}
            <div className="flex items-center justify-between sm:justify-end gap-6 w-full lg:w-auto border-t lg:border-t-0 border-slate-800 pt-4 lg:pt-0">
              <div className="text-left sm:text-right">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Estimated Profit</div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                  +${pickOfTheDay.profitUsd.toFixed(2)}
                </div>
                <div className="inline-flex items-center gap-1 text-xs font-black text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30 mt-0.5">
                  <TrendingUp className="w-3 h-3" />
                  +{pickOfTheDay.roiPct.toFixed(1)}% Net ROI
                </div>
              </div>

              <button
                id="view-pick-set-btn"
                onClick={() => onSelectSet(pickOfTheDay.setCode)}
                className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-xs sm:text-sm transition shadow-lg flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                Inspect Set <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. TOP 3 BEST ROI & TOP 3 WORST ROI SHOWCASE ROW */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Market Performance Highlights
            </h3>
            <p className="text-xs text-slate-500">Live ROI ranking based on current pricing engine mode</p>
          </div>

          <div className="flex items-center bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setHighlightTab('best')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                highlightTab === 'best'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Top 3 Best ROI
            </button>
            <button
              onClick={() => setHighlightTab('worst')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                highlightTab === 'worst'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" /> Top 3 Lowest Return
            </button>
          </div>
        </div>

        {/* Highlight Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(highlightTab === 'best' ? top3BestRoi : top3WorstRoi).map((item, index) => {
            const isPositive = item.profitUsd > 0;
            return (
              <div
                key={item.productUuid}
                className={`rounded-2xl p-4 border transition hover:shadow-md flex flex-col justify-between ${
                  isPositive
                    ? 'bg-white border-emerald-200/80 hover:border-emerald-400'
                    : 'bg-white border-rose-200/80 hover:border-rose-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 p-1 bg-slate-900 rounded-xl flex items-center justify-center">
                    <ProductPackagingImage
                      setCode={item.setCode}
                      setName={item.setName}
                      packagingType={mapCategoryToPackagingType(item.category)}
                      displayName={item.boxName}
                      cardCount={item.cardCount}
                      size="sm"
                      allowZoom={true}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 flex items-center gap-1">
                        <SetSymbolIcon setCode={item.setCode} size="xs" />
                        {item.setCode}
                      </span>
                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded-full ${
                          isPositive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isPositive ? `+${item.roiPct.toFixed(1)}% ROI` : `${item.roiPct.toFixed(1)}% ROI`}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 truncate" title={item.boxName}>
                      {item.boxName}
                    </h4>

                    <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Market:</span>
                        <span className="font-semibold text-slate-800">${item.boxMarketPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expected EV:</span>
                        <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-slate-700'}`}>
                          ${item.boxEvAvg.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isPositive ? 'Net Gain:' : 'Net Premium:'}{' '}
                    <strong className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                      {isPositive ? `+$${item.profitUsd.toFixed(2)}` : `-$${Math.abs(item.profitUsd).toFixed(2)}`}
                    </strong>
                  </span>
                  <button
                    onClick={() => onSelectSet(item.setCode)}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 cursor-pointer"
                  >
                    Details <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. SEARCH BAR */}
      <div
        id="arbitrage-controls-bar"
        className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm"
      >
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="arbitrage-search-input"
            type="text"
            placeholder="Search sealed products by name or set code (e.g. MOM, MH3, BLB, OTJ)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition"
          />
        </div>
      </div>

      {/* 4. ORDERED FORMAT FILTER PILLS (Underneath Search Bar) */}
      <div id="category-pills" className="flex flex-wrap items-center gap-2">
        <button
          id="category-pill-all"
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> All Sealed Formats
        </button>

        <button
          id="category-pill-pack"
          onClick={() => setSelectedCategory('booster_pack')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'booster_pack'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-emerald-500" /> Single Booster Packs
        </button>

        <button
          id="category-pill-box"
          onClick={() => setSelectedCategory('booster_box')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'booster_box'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Box className="w-3.5 h-3.5 text-amber-500" /> Booster Boxes (24-36 Packs)
        </button>

        <button
          id="category-pill-case"
          onClick={() => setSelectedCategory('booster_case')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'booster_case'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-indigo-500" /> Booster Cases (6+ Boxes)
        </button>

        <button
          id="category-pill-bundle"
          onClick={() => setSelectedCategory('bundle')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'bundle'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Gift className="w-3.5 h-3.5 text-rose-500" /> Bundles & Gift Sets
        </button>

        <button
          id="category-pill-commander"
          onClick={() => setSelectedCategory('deck')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'deck' || selectedCategory === 'commander_deck'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-violet-500" /> Preconstructed Decks
        </button>

        <button
          id="category-pill-boxset"
          onClick={() => setSelectedCategory('box_set')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'box_set'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Box Sets & Secret Lairs
        </button>

        <button
          id="category-pill-other"
          onClick={() => setSelectedCategory('other')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'other'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" /> Other
        </button>
      </div>

      {/* 5. PRODUCTS OVERVIEW TABLE */}
      <div
        id="arbitrage-table-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900">Products Overview</h3>
            <p className="text-xs text-slate-500">
              Showing {filteredRecords.length} sealed items
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* EV Calculation Basis Selector */}
            <div className="flex items-center bg-white p-1 rounded-xl text-xs font-bold border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 hidden sm:inline">Calc Basis:</span>
              <button
                id="ev-basis-min-btn"
                onClick={() => setEvBasis('min')}
                title="Calculate Profit/Loss and ROI based on Minimum EV Floor (Worst-case simulated collation return)"
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  evBasis === 'min'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Min EV (Floor)</span>
                {evBasis === 'min' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>
              <button
                id="ev-basis-mid90-btn"
                onClick={() => setEvBasis('mid90')}
                title="Calculate Profit/Loss and ROI based on Mid 90% EV (Trimmed 5-95th percentile, excluding extreme 5% outliers)"
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  evBasis === 'mid90'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Mid 90% EV</span>
                {evBasis === 'mid90' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>
              <button
                id="ev-basis-avg-btn"
                onClick={() => setEvBasis('avg')}
                title="Calculate Profit/Loss and ROI based on Average EV (Mathematical Mean of all simulated packs)"
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  evBasis === 'avg'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Average EV (Mean)</span>
                {evBasis === 'avg' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>
              <button
                id="ev-basis-max-btn"
                onClick={() => setEvBasis('max')}
                title="Calculate Profit/Loss and ROI based on Maximum EV Ceiling (Best-case simulated jackpot ceiling)"
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  evBasis === 'max'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Max EV (Ceiling)</span>
                {evBasis === 'max' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>
            </div>

            {/* Price Mode Selector */}
            <div className="flex items-center bg-white p-1 rounded-xl text-xs font-bold border border-slate-200 shadow-xs">
              <button
                id="mode-direct-btn"
                onClick={() => onPriceModeChange('direct')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  priceMode === 'direct' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Direct Set Price
              </button>
              <button
                id="mode-reprints-btn"
                onClick={() => onPriceModeChange('cheapest_reprint')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  priceMode === 'cheapest_reprint'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cheapest Reprint (-18%)
              </button>
            </div>

            {/* Vendor Selector */}
            <select
              id="vendor-select-dropdown"
              value={vendor}
              onChange={(e) => onVendorChange(e.target.value as Vendor)}
              className="text-xs font-bold bg-white border border-slate-200 text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs cursor-pointer"
            >
              <option value="all">All Vendors (Consensus)</option>
              <option value="tcgplayer">TCGplayer Live Market (12.5% Fee)</option>
              <option value="cardmarket">Cardmarket (EUR / 5% Fee)</option>
              <option value="cardkingdom">Card Kingdom (Retail Spread)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3.5 px-4">Sealed Product</th>
                <th className="py-3.5 px-3">Set</th>
                <th
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('packs')}
                  title="Number of booster packs in this sealed product (0 for preconstructed products without packs). Click to sort."
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Packs</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('cards')}
                  title="Total number of cards included in this sealed product. Click to sort."
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Cards</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('boxPrice')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Live Market Price
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className={`py-3.5 px-3 text-right cursor-pointer transition ${
                    evBasis === 'min' ? 'text-slate-900 bg-slate-100/80 font-bold' : 'hover:text-slate-900'
                  }`}
                  onClick={() => toggleSort('boxMin')}
                  title="Minimum EV Floor (worst-case collation simulation return). Click to sort."
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Min EV (Floor)</span>
                    {evBasis === 'min' && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300/70">
                        Calc Basis
                      </span>
                    )}
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className={`py-3.5 px-3 text-right cursor-pointer transition ${
                    evBasis === 'mid90' ? 'text-slate-900 bg-slate-100/80 font-bold' : 'hover:text-slate-900'
                  }`}
                  onClick={() => toggleSort('boxMid90')}
                  title="Realistic trimmed average excluding top 5% jackpot hits and bottom 5% duds. Click to sort."
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Mid 90% EV</span>
                    {evBasis === 'mid90' && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300/70">
                        Calc Basis
                      </span>
                    )}
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className={`py-3.5 px-3 text-right cursor-pointer transition ${
                    evBasis === 'avg' ? 'text-slate-900 bg-slate-100/80 font-bold' : 'hover:text-slate-900'
                  }`}
                  onClick={() => toggleSort('boxEv')}
                  title="Average Expected Value across all simulated pack collation options. Click to sort."
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Average EV (Mean)</span>
                    {evBasis === 'avg' && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300/70">
                        Calc Basis
                      </span>
                    )}
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className={`py-3.5 px-3 text-right cursor-pointer transition ${
                    evBasis === 'max' ? 'text-slate-900 bg-slate-100/80 font-bold' : 'hover:text-slate-900'
                  }`}
                  onClick={() => toggleSort('boxMax')}
                  title="Maximum EV Ceiling (best-case jackpot ceiling simulation return). Click to sort."
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Max EV (Ceiling)</span>
                    {evBasis === 'max' && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300/70">
                        Calc Basis
                      </span>
                    )}
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('profit')}
                  title={`Net Profit/Loss calculated as (${
                    evBasis === 'min'
                      ? 'Min EV'
                      : evBasis === 'mid90'
                      ? 'Mid 90% EV'
                      : evBasis === 'max'
                      ? 'Max EV'
                      : 'Average EV'
                  } - Live Market Price)`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Profit / Loss</span>
                    <span className="text-[9px] font-mono font-semibold text-slate-400">
                      ({evBasis === 'min' ? 'Min' : evBasis === 'mid90' ? 'Mid90' : evBasis === 'max' ? 'Max' : 'Avg'})
                    </span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('roi')}
                >
                  <div className="flex items-center justify-end gap-1">
                    ROI %
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 px-4 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Package className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-bold text-slate-800">No sealed products found</div>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Products will populate automatically once the GitHub Actions pipeline runs and exports current market data.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((box, i) => {
                const isPositive = box.profitUsd > 0;
                return (
                  <tr
                    key={box.productUuid || i}
                    id={`arbitrage-row-${box.setCode}-${box.boosterName}`}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="py-3.5 px-4 font-medium text-slate-900 flex items-center gap-2">
                      {getCategoryIcon(box.category, box.boxName)}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span>{box.boxName}</span>
                          {box.contents && (
                            <span
                              className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                              title="Configured with verified MTGJSON contents"
                            >
                              {box.contents.note?.includes('1 of them is foil')
                                ? '8 Cards (1 Foil)'
                                : box.contents.card && box.contents.card.length === 1
                                ? '1 Single Card'
                                : box.contents.card && box.contents.card.length > 1
                                ? `${box.contents.card.length} Cards`
                                : box.contents.variable
                                ? 'Variable Collation'
                                : box.contents.deck
                                ? 'Precon Deck'
                                : 'Contents'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono font-semibold text-xs text-slate-600">
                      <span className="px-2 py-1 bg-slate-100 rounded-md flex items-center gap-1.5 w-fit border border-slate-200/80">
                        <SetSymbolIcon setCode={box.setCode} size="xs" />
                        <span>{box.setCode}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-slate-700">
                      {box.packCount > 0 ? (
                        <span className="font-semibold text-slate-900">{box.packCount}</span>
                      ) : (
                        <span className="text-slate-400 font-medium">0</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-slate-700">
                      {getCardCount(box) > 0 ? (
                        <span className="font-medium text-slate-800">{getCardCount(box).toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900">
                      ${box.boxMarketPrice.toFixed(2)}
                    </td>
                    <td className={`py-3.5 px-3 text-right font-mono ${evBasis === 'min' ? 'font-bold text-slate-950 bg-slate-50/70' : 'text-slate-600'}`}>
                      ${(box.boxEvMin ?? 0).toFixed(2)}
                    </td>
                    <td className={`py-3.5 px-3 text-right font-mono ${evBasis === 'mid90' ? 'font-bold text-slate-950 bg-slate-50/70' : 'text-slate-600'}`}>
                      ${box.boxEvMid90.toFixed(2)}
                    </td>
                    <td className={`py-3.5 px-3 text-right font-mono ${evBasis === 'avg' ? 'font-bold text-slate-950 bg-slate-50/70' : 'text-slate-800'}`}>
                      ${box.boxEvAvg.toFixed(2)}
                    </td>
                    <td className={`py-3.5 px-3 text-right font-mono ${evBasis === 'max' ? 'font-bold text-slate-950 bg-slate-50/70' : 'text-slate-600'}`}>
                      ${(box.boxEvMax ?? 0).toFixed(2)}
                    </td>
                    <td
                      className={`py-3.5 px-3 text-right font-mono font-bold ${
                        isPositive ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isPositive ? `+$${box.profitUsd.toFixed(2)}` : `-$${Math.abs(box.profitUsd).toFixed(2)}`}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                          isPositive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isPositive ? `+${box.roiPct.toFixed(1)}%` : `${box.roiPct.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        id={`btn-explore-set-${box.setCode}`}
                        onClick={() => onSelectSet(box.setCode)}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 rounded-lg transition cursor-pointer"
                      >
                        Explore Set
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
