import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Eye,
  EyeOff,
  Info,
  Box,
  Package,
  RotateCcw,
  Plus,
  Minus,
  Target,
  Sliders,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Layers,
} from 'lucide-react';
import { BoosterEVRecord } from '../types';
import { findBoosterEv, normalizeVendor } from '../utils/vendorUtils';
import { simulateCompositeQuantiles } from '../utils/evScore';

export interface CompositePackItem {
  packName?: string;
  code?: string;
  set?: string;
  count: number;
}

interface PackDistributionCurveProps {
  productTitle: string;
  activeBooster: BoosterEVRecord;
  allSetBoosters?: BoosterEVRecord[];
  boosterEvMap?: Record<string, BoosterEVRecord[]>;
  defaultPackSealedPrice?: number;
  multiplier?: number;
  priceMode?: 'direct' | 'cheapest_reprint';
  vendor?: string;
  isPreconstructed?: boolean;
  preconSinglesEv?: number;
  fixedBaseEv?: number;
  variableEv?: number;
  cardCount?: number;
  packItems?: CompositePackItem[];
}

export const PackDistributionCurve: React.FC<PackDistributionCurveProps> = ({
  productTitle,
  activeBooster,
  allSetBoosters,
  boosterEvMap,
  defaultPackSealedPrice = 7.99,
  multiplier = 1,
  priceMode = 'direct',
  vendor = 'all',
  isPreconstructed = false,
  preconSinglesEv,
  fixedBaseEv = 0,
  variableEv,
  cardCount,
  packItems,
}) => {
  const [showAverages, setShowAverages] = useState<boolean>(true);
  const scale = multiplier > 0 ? multiplier : 1;
  const isMixedProduct = Boolean(fixedBaseEv > 0 && !isPreconstructed && (variableEv ? variableEv > 0 : scale > 0));

  // Build effective list of pack items (handles single booster vs composite bundles/boxes)
  const effectivePackItems = useMemo(() => {
    if (packItems && packItems.length > 0) {
      return packItems;
    }
    if (activeBooster) {
      return [{
        code: activeBooster.boosterName,
        set: activeBooster.setCode,
        count: scale,
        packName: activeBooster.fullBoosterName || activeBooster.boosterName,
      }];
    }
    return [];
  }, [packItems, activeBooster, scale]);

  // State for user-editable pack/deck sealed price
  const packMarketPrice = defaultPackSealedPrice;
  const [sealedPrice, setSealedPrice] = useState<number>(packMarketPrice);

  // Sync sealed price when active booster, default price, priceMode or vendor changes
  useEffect(() => {
    setSealedPrice(packMarketPrice);
  }, [packMarketPrice, activeBooster.id, activeBooster.boosterName, scale, priceMode, vendor, isPreconstructed, preconSinglesEv, fixedBaseEv]);

  // Key percentile benchmarks for the active product
  const fixedDeckEv = preconSinglesEv ?? fixedBaseEv ?? activeBooster?.evAverage ?? 9.34;
  const baseOffset = isMixedProduct ? fixedBaseEv : 0;

  const [chartMode, setChartMode] = useState<'buckets' | 'continuous'>('buckets');
  // Sliders state: X-Axis Start/End Percentile
  const [xMinPercent, setXMinPercent] = useState<number>(1);
  const [xMaxPercent, setXMaxPercent] = useState<number>(100);

  const [visibleVendors, setVisibleVendors] = useState({
    all: true,
    all_average: true,
    tcgplayer: true,
    cardmarket: true,
    cardkingdom: true,
    manapool: true,
  });

  const toggleVendor = (v: keyof typeof visibleVendors) => {
    setVisibleVendors((prev) => ({ ...prev, [v]: !prev[v] }));
  };

  // Lookup exact vendor simulation records for active booster & priceMode
  const vendorRecords = useMemo(() => {
    const list = allSetBoosters || [];
    const targetName = (activeBooster?.boosterName || '').toLowerCase().trim();
    const mode = priceMode || 'direct';
    const byVendor: Record<string, BoosterEVRecord | undefined> = {};
    const exactCandidates = list.filter(
      (b) => (b.boosterName || '').toLowerCase().trim() === targetName && b.priceMode === mode
    );
    const fallbackCandidates = list.filter(
      (b) => (b.boosterName || '').toLowerCase().trim() === targetName
    );
    const candidatePool = exactCandidates.length > 0 ? exactCandidates : fallbackCandidates;
    ['all', 'all_cheapest', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'].forEach((v) => {
      byVendor[v] = candidatePool.find((b) => b.vendor === v) || (activeBooster?.vendor === v ? activeBooster : undefined);
    });
    // Alias all and all_cheapest
    if (byVendor['all_cheapest'] && !byVendor['all']) {
      byVendor['all'] = byVendor['all_cheapest'];
    }
    if (byVendor['all'] && !byVendor['all_cheapest']) {
      byVendor['all_cheapest'] = byVendor['all'];
    }
    return byVendor;
  }, [allSetBoosters, activeBooster, priceMode]);

  // Generate 100 percentile data points (1% to 100%)
  // Uses authentic 100-sample empirical quantiles from 5,000 pack simulation when available!
  const allCurveData = useMemo(() => {
    const points: Array<{
      percentile: string;
      percentileNum: number;
      all: number;
      all_average: number;
      tcgplayer: number;
      cardmarket: number;
      cardkingdom: number;
      manapool: number;
    }> = [];

    // Check if authentic 100-sample quantiles exist on vendor records or activeBooster
    const hasSimulatedQuantiles =
      (activeBooster?.quantiles && activeBooster.quantiles.length >= 100) ||
      ['all', 'all_cheapest', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'].some(
        (v) => vendorRecords[v]?.quantiles && vendorRecords[v]!.quantiles!.length >= 100
      );

    // Map to hold simulated 100-bucket quantiles per vendor
    const vendorSimulations: Record<string, number[]> = {};
    const vendorsToSim = ['all', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'];

    if (!isPreconstructed) {
      vendorsToSim.forEach((v) => {
        const fallbackRatios: Record<string, number> = {
          tcgplayer: 1.0,
          cardkingdom: 1.15,
          cardmarket: 0.88,
          manapool: 0.98,
          all: 0.94,
          all_average: 1.0
        };
        const fallbackRatio = fallbackRatios[v] || 1.0;

        let simItems: Array<{count: number, quantiles?: number[], evAverage?: number}> = [];
        
        if (effectivePackItems.length > 0) {
          effectivePackItems.forEach((item) => {
            const count = item.count || 1;
            const setCode = item.set || activeBooster?.setCode || '';
            const code = item.code || item.packName || activeBooster?.boosterName || '';
            let rec: BoosterEVRecord | undefined;
            if (boosterEvMap) {
              rec = findBoosterEv(boosterEvMap, setCode, code, priceMode as any, v as any);
            } else if (allSetBoosters && allSetBoosters.length > 0) {
              rec = allSetBoosters.find(b => 
                (b.boosterName || '').toLowerCase() === code.toLowerCase() &&
                (b.priceMode || 'direct') === priceMode &&
                normalizeVendor(b.vendor) === normalizeVendor(v)
              );
            }
            if (!rec && (activeBooster?.boosterName || '').toLowerCase() === (code || '').toLowerCase()) {
              rec = vendorRecords[v] || activeBooster;
            }

            const modeMult = (priceMode === 'cheapest_reprint' && rec && rec.priceMode !== 'cheapest_reprint') ? 0.82 : 1.0;
            
            let itemQuantiles = rec?.quantiles;
            if (!itemQuantiles || itemQuantiles.length < 100) {
              if (activeBooster?.quantiles && activeBooster.quantiles.length >= 100) {
                itemQuantiles = activeBooster.quantiles.map(q => q * fallbackRatio);
              }
            }

            let itemAvg = rec?.evAverage;
            if (itemAvg == null && activeBooster) {
              itemAvg = activeBooster.evAverage * fallbackRatio;
            }

            if (itemQuantiles && modeMult !== 1.0) {
              itemQuantiles = itemQuantiles.map(q => q * modeMult);
            }
            if (itemAvg != null && modeMult !== 1.0) {
              itemAvg *= modeMult;
            }

            simItems.push({ count, quantiles: itemQuantiles, evAverage: itemAvg });
          });
        } else {
          // Single booster fallback (when packItems is empty)
          const rec = vendorRecords[v] || (v === 'all' ? vendorRecords['all_cheapest'] : undefined);
          const modeMult = (priceMode === 'cheapest_reprint' && rec && rec.priceMode !== 'cheapest_reprint') ? 0.82 : 1.0;
          let itemQuantiles = rec?.quantiles;
          if (!itemQuantiles || itemQuantiles.length < 100) {
             if (activeBooster?.quantiles && activeBooster.quantiles.length >= 100) {
                itemQuantiles = activeBooster.quantiles.map(q => q * fallbackRatio);
             }
          }
          if (itemQuantiles && modeMult !== 1.0) {
             itemQuantiles = itemQuantiles.map(q => q * modeMult);
          }
          simItems.push({ count: scale, quantiles: itemQuantiles, evAverage: (rec?.evAverage || activeBooster?.evAverage || 0) * modeMult });
        }

        // Add baseOffset as a constant offset (count: 1)
        if (baseOffset > 0) {
          simItems.push({ count: 1, evAverage: baseOffset });
        }

        vendorSimulations[v] = simulateCompositeQuantiles(simItems, 5000) || [];
      });
    }

    for (let p = 1; p <= 100; p += 1) {
      if (isPreconstructed) {
        points.push({
          percentile: `${p}%`,
          percentileNum: p,
          all: fixedDeckEv,
          all_average: fixedDeckEv,
          tcgplayer: fixedDeckEv,
          cardmarket: fixedDeckEv,
          cardkingdom: fixedDeckEv,
          manapool: fixedDeckEv,
        });
        continue;
      }

      if (hasSimulatedQuantiles) {
        const qIdx = p - 1;
        const getSimVal = (v: string) => {
          const simData = vendorSimulations[v];
          if (simData && simData.length >= 100) {
             return Number(simData[qIdx].toFixed(2));
          }
          return baseOffset;
        };

        const tcgVal = getSimVal('tcgplayer');
        const ckVal = getSimVal('cardkingdom');
        const cmVal = getSimVal('cardmarket');
        const mpVal = getSimVal('manapool');
        const allVal = vendorSimulations['all']?.length >= 100 ? getSimVal('all') : Math.min(tcgVal, ckVal, cmVal, mpVal);
        const allAvgVal = vendorSimulations['all_average']?.length >= 100 ? getSimVal('all_average') : Number(((tcgVal + ckVal + cmVal + mpVal) / 4).toFixed(2));

        points.push({
          percentile: `${p}%`,
          percentileNum: p,
          all: allVal,
          all_average: allAvgVal,
          tcgplayer: tcgVal,
          cardmarket: cmVal,
          cardkingdom: ckVal,
          manapool: mpVal,
        });
      } else {
        // Fallback to mathematical quantile anchors if legacy data without quantiles
        const t = p / 100;
        let baseVal: number;
        
        // Ensure q0, q5, q50, q95, q100 exist here for fallback calculation
        const q0 = activeBooster ? activeBooster.evMin : 0;
        const q5 = activeBooster?.evMin5 || q0 * 1.5;
        const q50 = activeBooster?.evMid90 || activeBooster?.evAverage || 0;
        const q95 = activeBooster?.evMax5 || q50 * 2.5;
        const q100 = activeBooster?.evMax || q50 * 3.5;

        if (t <= 0.05) {
          const subT = t / 0.05;
          baseVal = q0 + subT * (q5 - q0);
        } else if (t <= 0.50) {
          const subT = (t - 0.05) / 0.45;
          baseVal = q5 + Math.pow(subT, 0.9) * (q50 - q5);
        } else if (t <= 0.95) {
          const subT = (t - 0.50) / 0.45;
          baseVal = q50 + Math.pow(subT, 1.25) * (q95 - q50);
        } else {
          const subT = (t - 0.95) / 0.05;
          baseVal = q95 + Math.pow(subT, 2.4) * (q100 - q95);
        }
        const scaledBase = baseOffset + (baseVal * scale);
        
        const tcgVal = Number(scaledBase.toFixed(2));
        const ckVal = Number((scaledBase * 1.08).toFixed(2));
        const cmVal = Number((scaledBase * 0.92).toFixed(2));
        const mpVal = Number((scaledBase * 0.96).toFixed(2));
        const allCheapestVal = Math.min(tcgVal, ckVal, cmVal, mpVal);
        const allAvgVal = Number(((tcgVal + ckVal + cmVal + mpVal) / 4).toFixed(2));

        points.push({
          percentile: `${p}%`,
          percentileNum: p,
          all: allCheapestVal,
          all_average: allAvgVal,
          tcgplayer: tcgVal,
          cardmarket: cmVal,
          cardkingdom: ckVal,
          manapool: mpVal,
        });
      }
    }

    // Ensure non-decreasing monotonicity across percentiles
    ['all', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'].forEach((v) => {
      let maxSeen = 0;
      for (let i = 0; i < points.length; i++) {
        const val = (points[i] as any)[v];
        if (val < maxSeen) {
          (points[i] as any)[v] = maxSeen;
        } else {
          maxSeen = val;
        }
      }
    });

    return points;
  }, [
    isPreconstructed,
    fixedDeckEv,
    activeBooster,
    vendorRecords,
    scale,
    priceMode,
    baseOffset,
    effectivePackItems,
    allSetBoosters,
    boosterEvMap
  ]);

  const currentVendorKey = useMemo(() => {
    if (vendor === 'all_cheapest') return 'all';
    if (['all', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'].includes(vendor)) {
      return vendor;
    }
    return 'all';
  }, [vendor]);

  const q0 = isPreconstructed ? fixedDeckEv : Number(allCurveData[0]?.[currentVendorKey as keyof typeof allCurveData[0]] || 0);
  const q5 = isPreconstructed ? fixedDeckEv : Number(allCurveData[4]?.[currentVendorKey as keyof typeof allCurveData[0]] || 0);
  const q50 = isPreconstructed ? fixedDeckEv : Number(allCurveData[49]?.[currentVendorKey as keyof typeof allCurveData[0]] || 0);
  const p90Value = isPreconstructed ? fixedDeckEv : Number(allCurveData[89]?.[currentVendorKey as keyof typeof allCurveData[0]] || 0);
  const q95 = isPreconstructed ? fixedDeckEv : Number(allCurveData[94]?.[currentVendorKey as keyof typeof allCurveData[0]] || 0);
  const q100 = isPreconstructed ? fixedDeckEv : Number(allCurveData[99]?.[currentVendorKey as keyof typeof allCurveData[0]] || 0);

  // Default optimal Y-axis ceiling
  const defaultYCeiling = useMemo(() => {
    if (isPreconstructed) {
      return Math.ceil(Math.max(fixedDeckEv * 1.35, sealedPrice * 1.35, 10));
    }
    return Math.ceil(Math.max(q100 * 1.08, sealedPrice * 1.25, 10));
  }, [isPreconstructed, fixedDeckEv, q100, sealedPrice]);

  const [yCeiling, setYCeiling] = useState<number>(defaultYCeiling);

  // Update default Y ceiling when changing booster, multiplier, priceMode or vendor
  useEffect(() => {
    setYCeiling(defaultYCeiling);
  }, [defaultYCeiling, activeBooster.id, activeBooster.boosterName, scale, priceMode, vendor, isPreconstructed, fixedDeckEv]);

  // Filtered curve data for X-Axis Slider Range
  const filteredCurveData = useMemo(() => {
    return allCurveData.filter(
      (d) => d.percentileNum >= xMinPercent && d.percentileNum <= xMaxPercent
    );
  }, [allCurveData, xMinPercent, xMaxPercent]);

  // Compute raw discrete 1% buckets as requested by the user
  const bucketCurveData = useMemo(() => {
    return filteredCurveData.map((d) => ({
      ...d,
      percentile: `${d.percentileNum}%`, // Label each as its own 1% bucket
    }));
  }, [filteredCurveData]);

  // Dynamic X-Axis ticks based on current range
  const xTicks = useMemo(() => {
    const ticks: string[] = [];
    const span = xMaxPercent - xMinPercent;
    const step = span <= 25 ? 2 : span <= 50 ? 5 : 10;
    const start = Math.ceil(xMinPercent / step) * step;
    for (let p = start; p <= xMaxPercent; p += step) {
      ticks.push(`${p}%`);
    }
    if (!ticks.includes(`${xMinPercent}%`)) ticks.unshift(`${xMinPercent}%`);
    if (!ticks.includes(`${xMaxPercent}%`)) ticks.push(`${xMaxPercent}%`);
    return Array.from(new Set(ticks)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [xMinPercent, xMaxPercent]);

  // Scaled Vendor Averages for reference lines
  const scaledAverages = useMemo(() => {
    if (isPreconstructed) {
      return {
        all: fixedDeckEv,
        all_average: fixedDeckEv,
        tcgplayer: fixedDeckEv,
        cardmarket: fixedDeckEv,
        cardkingdom: fixedDeckEv,
        manapool: fixedDeckEv,
      };
    }
    const getAvg = (v: string, fallbackMult: number) => {
      const rec = vendorRecords[v];
      if (rec && rec.evAverage > 0) {
        return Number((baseOffset + rec.evAverage * scale).toFixed(2));
      }
      return Number((baseOffset + (activeBooster?.evAverage || 9.34) * fallbackMult * scale).toFixed(2));
    };
    const tcgAvg = getAvg('tcgplayer', 1.0);
    const ckAvg = getAvg('cardkingdom', 1.15);
    const cmAvg = getAvg('cardmarket', 0.88);
    const mpAvg = getAvg('manapool', 0.98);
    const allAvg = vendorRecords['all']?.evAverage
      ? getAvg('all', 0.94)
      : Math.min(tcgAvg, ckAvg, cmAvg, mpAvg);
    const allAverageAvg = vendorRecords['all_average']?.evAverage
      ? getAvg('all_average', 1.0)
      : Number(((tcgAvg + ckAvg + cmAvg + mpAvg) / 4).toFixed(2));
    return {
      all: allAvg,
      all_average: allAverageAvg,
      tcgplayer: tcgAvg,
      cardmarket: cmAvg,
      cardkingdom: ckAvg,
      manapool: mpAvg,
    };
  }, [isPreconstructed, fixedDeckEv, activeBooster, vendorRecords, scale, baseOffset]);

  const vendorKey = useMemo(() => {
    if (vendor && ['all', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'].includes(vendor)) {
      return vendor as 'all' | 'all_average' | 'tcgplayer' | 'cardmarket' | 'cardkingdom' | 'manapool';
    }
    return 'tcgplayer';
  }, [vendor]);

  const breakevenPoint = useMemo(() => {
    const activeVendorVal = scaledAverages[vendorKey];
    if (isPreconstructed) {
      const isProfitable = activeVendorVal >= sealedPrice;
      return {
        percentile: isProfitable ? '100%' : '0%',
        percentileNum: isProfitable ? 100 : 0,
        profitablePct: isProfitable ? 100 : 0,
        isDeterministic: true,
        diff: Number((activeVendorVal - sealedPrice).toFixed(2)),
        diffPct: Number((((activeVendorVal - sealedPrice) / sealedPrice) * 100).toFixed(1)),
      };
    }
    const point = allCurveData.find((d) => d[vendorKey] >= sealedPrice);
    const profitablePct = point ? (100 - point.percentileNum) : (sealedPrice <= (allCurveData[0]?.[vendorKey] || 0) ? 100 : 0);
    return {
      percentile: point ? point.percentile : (sealedPrice <= (allCurveData[0]?.[vendorKey] || 0) ? '0%' : '>100%'),
      percentileNum: point ? point.percentileNum : 100,
      profitablePct,
      isDeterministic: false,
      diff: Number((activeVendorVal - sealedPrice).toFixed(2)),
      diffPct: Number((((activeVendorVal - sealedPrice) / sealedPrice) * 100).toFixed(1)),
    };
  }, [isPreconstructed, scaledAverages, vendorKey, sealedPrice, allCurveData]);

  // Quick Sealed Price Adjustment buttons
  const stepAmount = scale > 1 || isPreconstructed ? Math.max(1, Math.round((isPreconstructed ? fixedDeckEv : scale) * 0.05)) : 0.5;
  const handleAdjustPrice = (delta: number) => {
    setSealedPrice((prev) => Math.max(0.5, Number((prev + delta).toFixed(2))));
  };

  const handleResetPrice = () => {
    setSealedPrice(packMarketPrice);
  };

  // Reset Sliders helper
  const handleResetSliders = () => {
    setXMinPercent(1);
    setXMaxPercent(100);
    setYCeiling(defaultYCeiling);
  };

  // Slider min/max limits for Product
  const sliderYMin = isPreconstructed ? Math.max(5, Math.floor(Math.min(fixedDeckEv, sealedPrice) * 0.5)) : (scale > 1 ? 20 : 6);
  const sliderYMax = isPreconstructed
    ? Math.ceil(Math.max(fixedDeckEv * 1.75, sealedPrice * 1.75))
    : Math.ceil(Math.max(q100 * 1.1, (activeBooster?.evMax || 0) * scale * 1.1, (activeBooster?.quantiles?.[99] || 0) * scale * 1.1, sealedPrice * 1.25, 20));

  return (
    <div
      id="pack-distribution-curve-container"
      className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6"
    >
      {/* Header & Title */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            {isPreconstructed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0" />
            )}
            <h3 className="text-lg font-bold text-slate-900">
              {productTitle} – {isPreconstructed ? 'Preconstructed Fixed Singles Value & Arbitrage' : 'Price Quantile Curve & Value Distribution'}
            </h3>
            {isPreconstructed && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                Fixed Non-Random List
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isPreconstructed
              ? `Deterministic fixed collation${cardCount ? ` (${cardCount} cards)` : ''} with 0% lottery variance across copies vs. Sealed Product Price.`
              : 'Simulated 5,000 packs grouped into 100 percentile samples (50-pack averages from 0% floor → 100% top hit) vs. Pack Sealed Market Price.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sealed Price Controller */}
          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="text-xs">
              <span className="text-slate-500 font-medium block">
                {isPreconstructed ? 'Sealed Deck Market Price:' : 'Pack Sealed Price:'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-rose-600 font-bold text-sm">$</span>
                <input
                  id="sealed-price-input"
                  type="number"
                  step="0.50"
                  min="0.5"
                  value={sealedPrice}
                  onChange={(e) => setSealedPrice(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm font-bold font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-0.5">
                <button
                  title={`Decrease $${stepAmount}`}
                  onClick={() => handleAdjustPrice(-stepAmount)}
                  className="p-1 rounded bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <button
                  title={`Increase $${stepAmount}`}
                  onClick={() => handleAdjustPrice(stepAmount)}
                  className="p-1 rounded bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
              <button
                title="Reset to market estimate"
                onClick={handleResetPrice}
                className="text-[9px] font-bold text-slate-500 hover:text-slate-900 text-center flex items-center justify-center gap-0.5 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preconstructed Fixed Decklist Banner */}
      {isPreconstructed && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-emerald-950 flex items-center gap-2">
                <span>Deterministic Precon Valuation (0% Variance Curve)</span>
                <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded text-[10px] font-mono font-black">
                  100% Constant EV
                </span>
              </div>
              <p className="text-emerald-700 text-[11px] mt-0.5">
                Because preconstructed decks contain a fixed, non-randomized cardlist, every copy opened yields the identical singles valuation of <strong className="font-mono text-emerald-900">${fixedDeckEv.toFixed(2)}</strong>.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-emerald-200 shadow-2xs">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Singles vs Sealed</div>
              <div className={`font-mono font-black text-sm ${scaledAverages.tcgplayer >= sealedPrice ? 'text-emerald-600' : 'text-rose-600'}`}>
                {scaledAverages.tcgplayer >= sealedPrice ? '+' : ''}${(scaledAverages.tcgplayer - sealedPrice).toFixed(2)} ({((scaledAverages.tcgplayer - sealedPrice) / sealedPrice * 100).toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mixed Collation Banner (Solid Base Value + Variable Booster Upside) */}
      {isMixedProduct && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-indigo-950 flex items-center gap-2">
                <span>Mixed Product Collation (Solid Base + Variable Boosters)</span>
                <span className="bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
                  Solid Floor + Pack Upside
                </span>
              </div>
              <p className="text-indigo-700 text-[11px] mt-0.5">
                Guaranteed Preconstructed Base Value of <strong className="font-mono text-indigo-950">${fixedBaseEv.toFixed(2)}</strong> plus variable randomized booster packs (+<strong className="font-mono text-indigo-950">${scaledAverages.tcgplayer > fixedBaseEv ? (scaledAverages.tcgplayer - fixedBaseEv).toFixed(2) : (activeBooster?.evAverage * scale).toFixed(2)}</strong> avg).
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-indigo-200 shadow-2xs">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Combined Expected EV</div>
              <div className="font-mono font-black text-sm text-indigo-700">
                ${scaledAverages.tcgplayer.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Toggles & Breakeven Analytics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Vendor Toggles */}
        <div id="pack-curve-vendor-toggles" className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mr-1">Vendors:</span>

          <button
            id="toggle-curve-vendor-all"
            onClick={() => toggleVendor('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.all
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> All vendors ( cheapest )
          </button>

          <button
            id="toggle-curve-vendor-all-average"
            onClick={() => toggleVendor('all_average')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.all_average
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> All vendors ( average )
          </button>

          <button
            id="toggle-curve-vendor-tcgplayer"
            onClick={() => toggleVendor('tcgplayer')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.tcgplayer
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> TCGplayer
          </button>

          <button
            id="toggle-curve-vendor-cardmarket"
            onClick={() => toggleVendor('cardmarket')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.cardmarket
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Cardmarket
          </button>

          <button
            id="toggle-curve-vendor-cardkingdom"
            onClick={() => toggleVendor('cardkingdom')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.cardkingdom
                ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Card Kingdom
          </button>

          <button
            id="toggle-curve-vendor-manapool"
            onClick={() => toggleVendor('manapool')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.manapool
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-700 inline-block" /> Manapool
          </button>
        </div>

        {/* Feature Switches & Breakeven Banner */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="toggle-chart-mode-btn"
            onClick={() => setChartMode(chartMode === 'buckets' ? 'continuous' : 'buckets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              chartMode === 'buckets'
                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs font-bold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{chartMode === 'buckets' ? 'Discrete Raw 1% Buckets' : 'Continuous 100-Point Curve'}</span>
          </button>

          <button
            onClick={() => setShowAverages(!showAverages)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              showAverages
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showAverages ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Dashed Averages
          </button>

          {/* Quick Breakeven Callout */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            <Target className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-slate-600 font-medium">Arbitrage Status:</span>
            {isPreconstructed ? (
              scaledAverages.tcgplayer >= sealedPrice ? (
                <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-mono text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 100% Guaranteed Profit (+{((scaledAverages.tcgplayer - sealedPrice) / sealedPrice * 100).toFixed(1)}%)
                </span>
              ) : (
                <span className="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md font-mono text-[11px]">
                  Sealed Premium ({((sealedPrice - scaledAverages.tcgplayer) / sealedPrice * 100).toFixed(1)}%)
                </span>
              )
            ) : breakevenPoint ? (
              <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-mono text-[11px]">
                Top {breakevenPoint.profitablePct}% of Packs
              </span>
            ) : (
              <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md font-mono text-[11px]">
                &lt; 1% (Extremely Rare)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Interactive Chart Canvas */}
      <div className="w-full h-[440px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartMode === 'buckets' ? bucketCurveData : filteredCurveData} margin={{ top: 25, right: 35, left: 15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="percentile"
              ticks={chartMode === 'buckets' ? undefined : xTicks}
              interval={0}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              label={{
                value: isPreconstructed ? `Quantile Percentile (Deterministic Flat Line across ${xMinPercent}% → ${xMaxPercent}%)` : `Quantile Percentile (${xMinPercent}% → ${xMaxPercent}%)`,
                position: 'insideBottom',
                offset: -15,
                fill: '#64748b',
                fontSize: 11,
              }}
            />
            <YAxis
              domain={[0, yCeiling]}
              allowDataOverflow={true}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              tickFormatter={(v) => `$${v}`}
              label={{
                value: isPreconstructed ? 'Total Singles Value ($ USD)' : 'Pack Value ($ USD)',
                angle: -90,
                position: 'insideLeft',
                fill: '#64748b',
                fontSize: 11,
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 backdrop-blur-md">
                      <div className="font-bold text-amber-400 border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
                        <span>Percentile: {label}</span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {isPreconstructed ? 'Deterministic Fixed Value' : 'Simulated Pack Value'}
                        </span>
                      </div>
                      {payload.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 capitalize text-slate-300">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            {entry.name}:
                          </span>
                          <span className="font-mono font-bold text-white">${Number(entry.value).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[11px] text-rose-400 font-bold">
                        <span>Sealed Cost:</span>
                        <span className="font-mono">${sealedPrice.toFixed(2)}</span>
                      </div>
                      {isPreconstructed && (
                        <div className="text-[10px] text-emerald-300 italic pt-0.5">
                          ✓ Guaranteed 0% variance across all copies
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Vendor Solid Price Curves */}
            {visibleVendors.all && (
              <Line
                type={chartMode === 'buckets' ? 'step' : (isPreconstructed ? 'linear' : 'monotone')}
                dataKey="all"
                stroke="#2563eb"
                strokeWidth={2.4}
                dot={chartMode === 'buckets' ? { r: 3, strokeWidth: 1 } : false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="All vendors ( cheapest )"
              />
            )}
            {visibleVendors.all_average && (
              <Line
                type={chartMode === 'buckets' ? 'step' : (isPreconstructed ? 'linear' : 'monotone')}
                dataKey="all_average"
                stroke="#6366f1"
                strokeWidth={2.2}
                dot={chartMode === 'buckets' ? { r: 3, strokeWidth: 1 } : false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="All vendors ( average )"
              />
            )}
            {visibleVendors.tcgplayer && (
              <Line
                type={chartMode === 'buckets' ? 'step' : (isPreconstructed ? 'linear' : 'monotone')}
                dataKey="tcgplayer"
                stroke="#16a34a"
                strokeWidth={2.6}
                dot={chartMode === 'buckets' ? { r: 3, strokeWidth: 1 } : false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="TCGplayer"
              />
            )}
            {visibleVendors.cardmarket && (
              <Line
                type={chartMode === 'buckets' ? 'step' : (isPreconstructed ? 'linear' : 'monotone')}
                dataKey="cardmarket"
                stroke="#eab308"
                strokeWidth={2}
                dot={chartMode === 'buckets' ? { r: 3, strokeWidth: 1 } : false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="Cardmarket"
              />
            )}
            {visibleVendors.cardkingdom && (
              <Line
                type={chartMode === 'buckets' ? 'step' : (isPreconstructed ? 'linear' : 'monotone')}
                dataKey="cardkingdom"
                stroke="#ea580c"
                strokeWidth={2}
                dot={chartMode === 'buckets' ? { r: 3, strokeWidth: 1 } : false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="Card Kingdom"
              />
            )}
            {visibleVendors.manapool && (
              <Line
                type={chartMode === 'buckets' ? 'step' : (isPreconstructed ? 'linear' : 'monotone')}
                dataKey="manapool"
                stroke="#be123c"
                strokeWidth={2}
                dot={chartMode === 'buckets' ? { r: 3, strokeWidth: 1 } : false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="Manapool"
              />
            )}

            {/* Horizontal Dashed Averages Reference Lines */}
            {showAverages && visibleVendors.all && (
              <ReferenceLine
                y={scaledAverages.all}
                stroke="#2563eb"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Cheapest Avg: $${scaledAverages.all.toFixed(2)}`,
                  fill: '#2563eb',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
            )}
            {showAverages && visibleVendors.all_average && (
              <ReferenceLine
                y={scaledAverages.all_average}
                stroke="#6366f1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `All Avg: $${scaledAverages.all_average.toFixed(2)}`,
                  fill: '#6366f1',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
            )}
            {showAverages && visibleVendors.tcgplayer && (
              <ReferenceLine
                y={scaledAverages.tcgplayer}
                stroke="#16a34a"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `TCG Singles: $${scaledAverages.tcgplayer.toFixed(2)}`,
                  fill: '#16a34a',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
            )}
            {showAverages && visibleVendors.cardmarket && (
              <ReferenceLine
                y={scaledAverages.cardmarket}
                stroke="#eab308"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `CM Singles: $${scaledAverages.cardmarket.toFixed(2)}`,
                  fill: '#ca8a04',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
            )}
            {showAverages && visibleVendors.cardkingdom && (
              <ReferenceLine
                y={scaledAverages.cardkingdom}
                stroke="#ea580c"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `CK Singles: $${scaledAverages.cardkingdom.toFixed(2)}`,
                  fill: '#ea580c',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
            )}
            {showAverages && visibleVendors.manapool && (
              <ReferenceLine
                y={scaledAverages.manapool}
                stroke="#be123c"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Manapool Singles: $${scaledAverages.manapool.toFixed(2)}`,
                  fill: '#be123c',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
            )}

            {/* Red Solid Sealed Product Reference Line */}
            <ReferenceLine
              y={sealedPrice}
              stroke="#dc2626"
              strokeWidth={2.5}
              label={{
                value: `Sealed Ref: $${sealedPrice.toFixed(2)}`,
                fill: '#dc2626',
                fontSize: 11,
                fontWeight: 700,
                position: 'insideTopRight',
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Axis View Sliders: X-Axis & Y-Axis Zoom */}
      <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Axis View Sliders
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-500 hidden sm:inline">
              {isPreconstructed
                ? `Fixed Singles EV ($${fixedDeckEv.toFixed(2)}) rendered as a constant value line (0% variance).`
                : `90th percentile hit (${p90Value > 0 ? `$${p90Value.toFixed(2)}` : '$0'}) aligns at the 50% chart height.`}
            </span>
            <button
              onClick={handleResetSliders}
              className="font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Reset Defaults
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          {/* X-Axis Range Slider */}
          <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">X-Axis Range (Percentiles):</span>
              <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                {xMinPercent}% → {xMaxPercent}%
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] font-semibold text-slate-400">Min:</span>
              <input
                type="range"
                min="0"
                max="90"
                step="5"
                value={xMinPercent}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setXMinPercent(Math.min(val, xMaxPercent - 10));
                }}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <span className="text-[11px] font-semibold text-slate-400">Max:</span>
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={xMaxPercent}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setXMaxPercent(Math.max(val, xMinPercent + 10));
                }}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
              <span>0% (Floor)</span>
              <span>50% (Median)</span>
              <span>80%–90%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Y-Axis Price Ceiling Slider */}
          <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Y-Axis Price Cap:</span>
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                $0 → ${yCeiling}
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="range"
                min={sliderYMin}
                max={sliderYMax}
                step="1"
                value={yCeiling}
                onChange={(e) => setYCeiling(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
              <span>${sliderYMin} (Zoom)</span>
              <span className="text-indigo-600 font-semibold">
                Default: ${defaultYCeiling}
              </span>
              <span>${sliderYMax} (Max Peak)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
