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
  DollarSign
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
  const [sortBy, setSortBy] = useState<'roi' | 'profit' | 'boxPrice' | 'boxEv'>('roi');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [highlightTab, setHighlightTab] = useState<'best' | 'worst'>('best');

  // Dynamically compute adjusted pricing and EV based on selected PriceMode & Vendor
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
      const adjustedPackEv = r.packEvAvg * reprintMultiplier * vendorSettings.evMult;
      const adjustedPackMid90 = r.packEvMid90 * reprintMultiplier * vendorSettings.evMult;
      const adjustedBoxPrice = r.boxMarketPrice * vendorSettings.priceMult;
      const adjustedBoxEv = adjustedPackEv * r.packCount;
      const adjustedBoxMid90 = adjustedPackMid90 * r.packCount;
      const profitUsd = adjustedBoxEv - adjustedBoxPrice;
      const roiPct = (profitUsd / adjustedBoxPrice) * 100;

      return {
        ...r,
        boxMarketPrice: adjustedBoxPrice,
        packEvAvg: adjustedPackEv,
        packEvMid90: adjustedPackMid90,
        boxEvAvg: adjustedBoxEv,
        boxEvMid90: adjustedBoxMid90,
        profitUsd,
        roiPct,
      };
    });
  }, [records, priceMode, vendor]);

  const filteredRecords = useMemo(() => {
    return adjustedRecords
      .filter((r) => {
        const matchesSearch =
          r.boxName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.setCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.setName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCat = selectedCategory === 'all' || r.category === selectedCategory;
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
        } else if (sortBy === 'boxEv') {
          valA = a.boxEvAvg;
          valB = b.boxEvAvg;
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

  const toggleSort = (field: 'roi' | 'profit' | 'boxPrice' | 'boxEv') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'booster_box':
        return <Box className="w-4 h-4 text-amber-500" />;
      case 'booster_pack':
        return <Package className="w-4 h-4 text-emerald-500" />;
      case 'booster_case':
        return <Archive className="w-4 h-4 text-indigo-500" />;
      case 'bundle':
        return <Gift className="w-4 h-4 text-rose-500" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const mapCategoryToPackagingType = (cat: string): ProductPackagingType => {
    switch (cat) {
      case 'booster_box':
        return 'box';
      case 'booster_pack':
        return 'pack';
      case 'booster_case':
        return 'case';
      case 'bundle':
        return 'bundle';
      default:
        return 'box';
    }
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

      {/* 3. ORDERED FORMAT FILTER PILLS */}
      <div id="category-pills" className="flex flex-wrap items-center gap-2">
        <button
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
          onClick={() => setSelectedCategory('bundle')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            selectedCategory === 'bundle'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Gift className="w-3.5 h-3.5 text-rose-500" /> Bundles & Gift Sets
        </button>
      </div>

      {/* 4. SEARCH & PRICING ENGINE CONTROLS BAR */}
      <div
        id="arbitrage-controls-bar"
        className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4"
      >
        <div className="relative flex-1">
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

        <div className="flex flex-wrap items-center gap-3">
          {/* Price Mode Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              id="mode-direct-btn"
              onClick={() => onPriceModeChange('direct')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                priceMode === 'direct' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Direct Set Price
            </button>
            <button
              id="mode-reprints-btn"
              onClick={() => onPriceModeChange('cheapest_reprint')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                priceMode === 'cheapest_reprint'
                  ? 'bg-white text-slate-900 shadow-sm'
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
            className="text-xs font-bold bg-slate-100 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
          >
            <option value="all">All Vendors (Consensus)</option>
            <option value="tcgplayer">TCGplayer Live Market (12.5% Fee)</option>
            <option value="cardmarket">Cardmarket (EUR / 5% Fee)</option>
            <option value="cardkingdom">Card Kingdom (Retail Spread)</option>
          </select>
        </div>
      </div>

      {/* 5. PRODUCTS OVERVIEW TABLE */}
      <div
        id="arbitrage-table-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Products Overview</h3>
            <p className="text-xs text-slate-500">
              Showing {filteredRecords.length} sealed items • Mode: <span className="font-semibold text-slate-800">{priceMode === 'direct' ? 'Direct Set Price' : 'Cheapest Reprint'}</span> • Vendor: <span className="font-semibold text-slate-800">{vendor.toUpperCase()}</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3.5 px-4">Sealed Product</th>
                <th className="py-3.5 px-3">Set</th>
                <th className="py-3.5 px-3 text-center">Packs</th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('boxPrice')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Live Market Price
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('boxEv')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Format EV
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-3 text-right">Mid 90% EV</th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('profit')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Profit / Loss
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('roi')}
                >
                  <div className="flex items-center justify-end gap-1">
                    ROI %
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRecords.map((box, i) => {
                const isPositive = box.profitUsd > 0;
                return (
                  <tr
                    key={box.productUuid || i}
                    id={`arbitrage-row-${box.setCode}-${box.boosterName}`}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="py-3.5 px-4 font-medium text-slate-900 flex items-center gap-2">
                      {getCategoryIcon(box.category)}
                      <span>{box.boxName}</span>
                    </td>
                    <td className="py-3.5 px-3 font-mono font-semibold text-xs text-slate-600">
                      <span className="px-2 py-1 bg-slate-100 rounded-md flex items-center gap-1.5 w-fit border border-slate-200/80">
                        <SetSymbolIcon setCode={box.setCode} size="xs" />
                        <span>{box.setCode}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-slate-600">{box.packCount}</td>
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900">
                      ${box.boxMarketPrice.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900">
                      ${box.boxEvAvg.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                      ${box.boxEvMid90.toFixed(2)}
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
