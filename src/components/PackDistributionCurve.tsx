import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
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
import { calculateDiscreteOutcomeEvScore } from '../utils/evScore';

const CURVE_VENDORS = ['all_cheapest', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'] as const;
type CurveVendor = (typeof CURVE_VENDORS)[number];

const VENDOR_COLORS: Record<CurveVendor, string> = {
  all_cheapest: '#2563eb',
  all_average: '#6366f1',
  tcgplayer: '#16a34a',
  cardmarket: '#eab308',
  cardkingdom: '#ea580c',
  manapool: '#be123c',
};

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
  defaultPackSealedPrice: number;
  multiplier: number;
  priceMode: 'direct' | 'cheapest_reprint';
  vendor: string;
  isPreconstructed: boolean;
  isConfigurationProduct?: boolean;
  preconSinglesEv?: number;
  fixedBaseEv: number;
  variableEv?: number;
  cardCount?: number;
  packItems?: CompositePackItem[];
  quantilesByVendor?: Record<string, number[]>;
  pipelineRunId?: string;
}

export const PackDistributionCurve: React.FC<PackDistributionCurveProps> = ({
  productTitle,
  activeBooster,
  allSetBoosters,
  boosterEvMap,
  defaultPackSealedPrice,
  multiplier,
  priceMode,
  vendor,
  isPreconstructed,
  isConfigurationProduct = false,
  preconSinglesEv,
  fixedBaseEv,
  variableEv,
  cardCount,
  packItems,
  quantilesByVendor,
  pipelineRunId,
}) => {
  const [showAverages, setShowAverages] = useState<boolean>(true);
  const scale = multiplier;
  const isMixedProduct = Boolean(fixedBaseEv > 0 && !isPreconstructed && (variableEv ? variableEv > 0 : scale > 0));

  // Build effective list of pack items (handles single booster vs composite bundles/boxes)
  const effectivePackItems = useMemo(() => {
    if (packItems && packItems.length > 0) {
      return packItems;
    }
    return [{
      code: activeBooster.boosterName,
      set: activeBooster.setCode,
      count: scale,
      packName: activeBooster.fullBoosterName || activeBooster.boosterName,
    }];
  }, [packItems, activeBooster, scale]);

  // State for user-editable pack/deck sealed price
  const packMarketPrice = defaultPackSealedPrice;
  const [sealedPrice, setSealedPrice] = useState<number>(packMarketPrice);

  // Sync sealed price when active booster, default price, priceMode or vendor changes
  useEffect(() => {
    setSealedPrice(packMarketPrice);
  }, [packMarketPrice, activeBooster.id, activeBooster.boosterName, scale, priceMode, vendor, isPreconstructed, preconSinglesEv, fixedBaseEv]);

  // Key percentile benchmarks for the active product
  const fixedDeckEv = preconSinglesEv ?? (isPreconstructed ? activeBooster.evAverage : fixedBaseEv);
  const baseOffset = isMixedProduct ? fixedBaseEv : 0;

  // Sliders state: X-Axis Start/End Percentile
  const [xMinPercent, setXMinPercent] = useState<number>(1);
  const [xMaxPercent, setXMaxPercent] = useState<number>(100);

  const [visibleVendors, setVisibleVendors] = useState({
    all_cheapest: true,
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
      (b) => (b?.boosterName || '').toLowerCase().trim() === targetName && b?.priceMode === mode
    );
    CURVE_VENDORS.forEach((v) => {
      byVendor[v] = exactCandidates.find((b) => b.vendor === v);
    });
    return byVendor;
  }, [allSetBoosters, activeBooster, priceMode]);

  const isSingleBoosterLeaf =
    !isPreconstructed &&
    !isMixedProduct &&
    scale === 1 &&
    effectivePackItems.length === 1 &&
    effectivePackItems[0].count === 1;

  const curveSource = isPreconstructed
    ? 'sealed_products.json.quantilesByVendor'
    : isSingleBoosterLeaf
    ? 'booster_ev.json.quantiles'
    : 'sealed_products.json.quantilesByVendor';
  const curveDiagnostics = useMemo(() => {
    const selectedKey = vendor === 'all' ? 'all_cheapest' : vendor;
    const values = isSingleBoosterLeaf
      ? vendorRecords[selectedKey]?.quantiles
      : quantilesByVendor?.[selectedKey];
    return {
      productTitle,
      setCode: activeBooster?.setCode || '',
      boosterName: activeBooster?.boosterName || '',
      vendor: selectedKey,
      priceMode,
      source: curveSource,
      pointCount: values?.length || 0,
      firstPoint: values?.[0] ?? null,
      lastPoint: values?.[values.length - 1] ?? null,
      status: values && values.length >= 100 ? 'valid' : 'unavailable',
      pipelineRunId: pipelineRunId || 'unavailable',
    };
  }, [productTitle, activeBooster, vendor, priceMode, quantilesByVendor, vendorRecords, curveSource, pipelineRunId]);

  // Generate 100 percentile data points (1% to 100%)
  // Leaf boosters use the authoritative booster simulation directly.
  const allCurveData = useMemo(() => {
    const points: Array<{
      percentile: string;
      percentileNum: number;
      all_cheapest: number | null;
      all_average: number | null;
      tcgplayer: number | null;
      cardmarket: number | null;
      cardkingdom: number | null;
      manapool: number | null;
    }> = [];

    // Map to hold simulated 100-bucket quantiles per vendor
    const vendorSimulations: Record<string, number[]> = {};
    const vendorsToSim = CURVE_VENDORS;

    const effectiveVendorQuantiles = quantilesByVendor;
    const hasPrecomputedComposite = Boolean(
      effectiveVendorQuantiles && Object.keys(effectiveVendorQuantiles).length > 0
    );

    if (!CURVE_VENDORS.includes(vendor as CurveVendor)) return [];

    if (isPreconstructed) {
      const hasFixedVendorValues = vendorsToSim.every(
        (v) => effectiveVendorQuantiles?.[v]?.length >= 1
      );
      if (!hasFixedVendorValues) return [];
    }

    if (!isPreconstructed) {
      if (hasPrecomputedComposite && !isSingleBoosterLeaf) {
        // Fast path: Authentic 10,000-draw precomputed quantiles exist on the product
        vendorsToSim.forEach((v) => {
          const qArr =
            effectiveVendorQuantiles[v];
          if (qArr && qArr.length >= 100) {
            vendorSimulations[v] = qArr;
          }
        });
      } else if (isSingleBoosterLeaf) {
        vendorsToSim.forEach((v) => {
          const itemQuantiles = vendorRecords[v]?.quantiles;
          if (itemQuantiles && itemQuantiles.length >= 100) {
            vendorSimulations[v] = [...itemQuantiles];
          }
        });
      }
    }

    const hasValidSimulations = Object.values(vendorSimulations).some((arr) => arr && arr.length >= 100);

    if (!isPreconstructed && !hasValidSimulations) {
      // Pure empirical enforcement: Do NOT output fake flat fallback curves.
      // Return empty points array so an explicit missing-data error state is displayed in the UI.
      return [];
    }

    const selectedVendorKey = vendor === 'all' ? 'all_cheapest' : vendor;
    if (!isPreconstructed && !vendorSimulations[selectedVendorKey]?.length) {
      return [];
    }

    for (let p = 1; p <= 100; p += 1) {
      if (isPreconstructed) {
        points.push({
          percentile: `${p}%`,
          percentileNum: p,
          all_cheapest: effectiveVendorQuantiles?.all_cheapest?.[0] ?? 0,
          all_average: effectiveVendorQuantiles?.all_average?.[0] ?? 0,
          tcgplayer: effectiveVendorQuantiles?.tcgplayer?.[0] ?? 0,
          cardmarket: effectiveVendorQuantiles?.cardmarket?.[0] ?? 0,
          cardkingdom: effectiveVendorQuantiles?.cardkingdom?.[0] ?? 0,
          manapool: effectiveVendorQuantiles?.manapool?.[0] ?? 0,
        });
        continue;
      }

      const qIdx = p - 1;
      const getSimVal = (v: string) => {
        const simData = vendorSimulations[v];
        if (simData && simData.length >= 100) {
          return Number((simData[qIdx] + baseOffset).toFixed(2));
        }
        return null;
      };

      const tcgVal = getSimVal('tcgplayer');
      const ckVal = getSimVal('cardkingdom');
      const cmVal = getSimVal('cardmarket');
      const mpVal = getSimVal('manapool');
      const allVal = getSimVal('all_cheapest');
      const allAvgVal = getSimVal('all_average');

      points.push({
        percentile: `${p}%`,
        percentileNum: p,
        all_cheapest: allVal,
        all_average: allAvgVal,
        tcgplayer: tcgVal,
        cardmarket: cmVal,
        cardkingdom: ckVal,
        manapool: mpVal,
      });
    }

    // Reject malformed backend curves instead of silently changing their values.
    ['all_cheapest', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'].forEach((v) => {
      for (let i = 0; i < points.length; i++) {
        const val = (points[i] as any)[v];
        const previous = i > 0 ? (points[i - 1] as any)[v] : null;
        if (val != null && previous != null && val < previous) {
          points.length = 0;
          return;
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
    boosterEvMap,
    isSingleBoosterLeaf,
    quantilesByVendor
  ]);

  const currentVendorKey = useMemo(() => {
    if (vendor && CURVE_VENDORS.includes(vendor as CurveVendor)) {
      return vendor as CurveVendor;
    }
    return null;
  }, [vendor]);
  const selectedDiscreteRecord = currentVendorKey ? (vendorRecords[currentVendorKey] || activeBooster) : activeBooster;
  const isDiscreteFixedConfigurationChart = Boolean(
    // Only a standalone booster pack gets a configuration/theme x-axis.
    // Boxes, cases, bundles, and multipacks still use product-level Monte Carlo quantiles.
    (isSingleBoosterLeaf || isConfigurationProduct) &&
    selectedDiscreteRecord?.distributionType === 'discrete_fixed_configurations' &&
    selectedDiscreteRecord?.configurationOutcomes?.length
  );
  const discreteConfigurationData = useMemo(() => {
    if (!isDiscreteFixedConfigurationChart || !selectedDiscreteRecord?.configurationOutcomes) {
      return [];
    }
    return selectedDiscreteRecord.configurationOutcomes
      .map((outcome) => ({
        ...outcome,
        displayLabel: outcome.label || `Configuration ${outcome.configurationIndex}`,
        value: outcome.ev == null ? 0 : Number(outcome.ev),
      }))
      .sort((a, b) => a.value - b.value || a.configurationIndex - b.configurationIndex);
  }, [isDiscreteFixedConfigurationChart, selectedDiscreteRecord]);

  const q0 = isPreconstructed ? fixedDeckEv : Number((currentVendorKey ? allCurveData[0]?.[currentVendorKey] : 0) || 0);
  const q5 = isPreconstructed ? fixedDeckEv : Number((currentVendorKey ? allCurveData[4]?.[currentVendorKey] : 0) || 0);
  const q50 = isPreconstructed ? fixedDeckEv : Number((currentVendorKey ? allCurveData[49]?.[currentVendorKey] : 0) || 0);
  const p90Value = isPreconstructed ? fixedDeckEv : Number((currentVendorKey ? allCurveData[89]?.[currentVendorKey] : 0) || 0);
  const q95 = isPreconstructed ? fixedDeckEv : Number((currentVendorKey ? allCurveData[94]?.[currentVendorKey] : 0) || 0);
  const q100 = isPreconstructed ? fixedDeckEv : Number((currentVendorKey ? allCurveData[99]?.[currentVendorKey] : 0) || 0);

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

  // Dynamic X-Axis ticks with strictly 10% increments
  const xTicks = useMemo(() => {
    const ticks: string[] = [];
    for (let p = 10; p <= 100; p += 10) {
      if (p >= xMinPercent && p <= xMaxPercent) {
        ticks.push(`${p}%`);
      }
    }
    return ticks;
  }, [xMinPercent, xMaxPercent]);

  // Scaled Vendor Averages for reference lines
  const scaledAverages = useMemo(() => {
    if (isPreconstructed) {
      return {
        all_cheapest: fixedDeckEv,
        all_average: fixedDeckEv,
        tcgplayer: fixedDeckEv,
        cardmarket: fixedDeckEv,
        cardkingdom: fixedDeckEv,
        manapool: fixedDeckEv,
      };
    }
    const getAvg = (v: string) => {
      const rec = vendorRecords[v];
      if (rec && rec.evAverage > 0) {
        return Number((baseOffset + rec.evAverage * scale).toFixed(2));
      }
      return baseOffset;
    };
    const tcgAvg = getAvg('tcgplayer');
    const ckAvg = getAvg('cardkingdom');
    const cmAvg = getAvg('cardmarket');
    const mpAvg = getAvg('manapool');
    const allAvg = getAvg('all_cheapest');
    const allAverageAvg = getAvg('all_average');
    return {
      all_cheapest: allAvg,
      all_average: allAverageAvg,
      tcgplayer: tcgAvg,
      cardmarket: cmAvg,
      cardkingdom: ckAvg,
      manapool: mpAvg,
    };
  }, [isPreconstructed, fixedDeckEv, activeBooster, vendorRecords, scale, baseOffset]);

  const vendorKey = useMemo(() => {
    if (vendor && CURVE_VENDORS.includes(vendor as CurveVendor)) {
      return vendor;
    }
    return null;
  }, [vendor]);

  const breakevenPoint = useMemo(() => {
    if (!vendorKey) return null;
    const activeVendorVal = scaledAverages[vendorKey];
    if (isDiscreteFixedConfigurationChart) {
      const evScore = calculateDiscreteOutcomeEvScore(sealedPrice, discreteConfigurationData);
      const profitablePct = evScore ?? 0;
      return {
        percentile: `${profitablePct}%`,
        percentileNum: profitablePct,
        profitablePct,
        isDeterministic: false,
        diff: Number((activeVendorVal - sealedPrice).toFixed(2)),
        diffPct: Number((((activeVendorVal - sealedPrice) / sealedPrice) * 100).toFixed(1)),
      };
    }
    if (allCurveData.length === 0) return null;
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
  }, [isPreconstructed, isDiscreteFixedConfigurationChart, discreteConfigurationData, scaledAverages, vendorKey, sealedPrice, allCurveData]);

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
    : Math.ceil(Math.max(q100 * 1.1, sealedPrice * 1.25, 20));

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
            ) : isDiscreteFixedConfigurationChart ? (
              <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
            ) : (
              <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0" />
            )}
            <h3 className="text-lg font-bold text-slate-900">
              {productTitle} – {isPreconstructed ? 'Preconstructed Fixed Singles Value & Arbitrage' : isDiscreteFixedConfigurationChart ? 'Fixed Theme EV Outcomes' : 'Price Quantile Curve & Value Distribution'}
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
              : isDiscreteFixedConfigurationChart
              ? `${discreteConfigurationData.length} fixed booster configurations, each rendered as its own deterministic theme outcome vs. Pack Sealed Market Price.`
              : 'Simulated 5,000 packs reduced to 100 empirical percentile buckets (1% floor → 100% top hit) vs. Pack Sealed Market Price.'}
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
      {isDiscreteFixedConfigurationChart && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-blue-950 flex items-center gap-2">
                <span>Discrete Fixed Booster Themes</span>
                <span className="bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
                  {discreteConfigurationData.length} Outcomes
                </span>
              </div>
              <p className="text-blue-700 text-[11px] mt-0.5">
                Every theme is fixed once selected, so the chart uses booster configuration on the x-axis instead of stretching discrete outcomes over 100 percentile buckets.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-200 shadow-2xs">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Theme Probability</div>
              <div className="font-mono font-black text-sm text-blue-700">
                {(100 / Math.max(1, discreteConfigurationData.length)).toFixed(2)}% each
              </div>
            </div>
          </div>
        </div>
      )}

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
            onClick={() => toggleVendor('all_cheapest')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.all_cheapest
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
      {!isPreconstructed && !isDiscreteFixedConfigurationChart && (!allCurveData || allCurveData.length === 0) ? (
        <div className="w-full h-[320px] flex flex-col items-center justify-center p-8 bg-rose-50 border-2 border-dashed border-rose-300 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-rose-950">Missing Empirical Simulation Quantiles</h4>
            <p className="text-xs text-rose-700 max-w-md mt-1">
              No valid backend curve is available for {vendor} / {priceMode}. Check the selected product, booster, vendor, and price mode in the published snapshot. Synthetic fallbacks and artificial ratio estimators are disabled.
            </p>
            <p data-testid="curve-diagnostics" className="text-[10px] text-rose-600 max-w-lg mt-2 font-mono break-words">
              {curveDiagnostics.productTitle} | {curveDiagnostics.setCode}/{curveDiagnostics.boosterName} | {curveDiagnostics.vendor}/{curveDiagnostics.priceMode} | source={curveDiagnostics.source} | run={curveDiagnostics.pipelineRunId} | points={curveDiagnostics.pointCount} | status={curveDiagnostics.status}
            </p>
          </div>
        </div>
      ) : isDiscreteFixedConfigurationChart && currentVendorKey ? (
        <div className="w-full h-[440px] pt-2" data-testid="curve-diagnostics" data-curve-source="booster_ev.json.configurationOutcomes" data-curve-vendor={currentVendorKey} data-curve-price-mode={priceMode} data-curve-pipeline-run={curveDiagnostics.pipelineRunId} data-curve-point-count={discreteConfigurationData.length}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={discreteConfigurationData} margin={{ top: 25, right: 35, left: 15, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="configurationIndex"
                tick={false}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                height={20}
              />
              <YAxis
                domain={[0, yCeiling]}
                allowDataOverflow={true}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(v) => `$${v}`}
                label={{
                  value: 'Fixed Theme EV ($ USD)',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#64748b',
                  fontSize: 11,
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0]?.payload;
                    return (
                      <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 backdrop-blur-md">
                        <div className="font-bold text-blue-300 border-b border-slate-800 pb-1">
                          {row?.displayLabel || `Configuration ${label}`}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-300">Fixed Theme EV:</span>
                          <span className="font-mono font-bold text-white">${Number(payload[0].value).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-300">Probability:</span>
                          <span className="font-mono font-bold text-white">{((row?.probability || 0) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[11px] text-rose-400 font-bold">
                          <span>Sealed Cost:</span>
                          <span className="font-mono">${sealedPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" fill={VENDOR_COLORS[currentVendorKey]} name="Fixed Theme EV" radius={[3, 3, 0, 0]} />
              {showAverages && (
                <ReferenceLine
                  y={scaledAverages[currentVendorKey]}
                  stroke={VENDOR_COLORS[currentVendorKey]}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Average: $${scaledAverages[currentVendorKey].toFixed(2)}`,
                    fill: VENDOR_COLORS[currentVendorKey],
                    fontSize: 10,
                    position: 'insideBottomLeft',
                  }}
                />
              )}
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
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="w-full h-[440px] pt-2" data-testid="curve-diagnostics" data-curve-source={curveDiagnostics.source} data-curve-vendor={curveDiagnostics.vendor} data-curve-price-mode={curveDiagnostics.priceMode} data-curve-pipeline-run={curveDiagnostics.pipelineRunId} data-curve-point-count={curveDiagnostics.pointCount}>
          <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredCurveData} margin={{ top: 25, right: 35, left: 15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="percentile"
              ticks={xTicks}
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
            {visibleVendors.all_cheapest && (
              <Line
                type="linear"
                dataKey="all_cheapest"
                stroke="#2563eb"
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="All vendors ( cheapest )"
              />
            )}
            {visibleVendors.all_average && (
              <Line
                type="linear"
                dataKey="all_average"
                stroke="#6366f1"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="All vendors ( average )"
              />
            )}
            {visibleVendors.tcgplayer && (
              <Line
                type="linear"
                dataKey="tcgplayer"
                stroke="#16a34a"
                strokeWidth={2.6}
                dot={false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="TCGplayer"
              />
            )}
            {visibleVendors.cardmarket && (
              <Line
                type="linear"
                dataKey="cardmarket"
                stroke="#eab308"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="Cardmarket"
              />
            )}
            {visibleVendors.cardkingdom && (
              <Line
                type="linear"
                dataKey="cardkingdom"
                stroke="#ea580c"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="Card Kingdom"
              />
            )}
            {visibleVendors.manapool && (
              <Line
                type="linear"
                dataKey="manapool"
                stroke="#be123c"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                name="Manapool"
              />
            )}

            {/* Horizontal Dashed Averages Reference Lines */}
            {showAverages && visibleVendors.all_cheapest && (
              <ReferenceLine
                y={scaledAverages.all_cheapest}
                stroke="#2563eb"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Cheapest Avg: $${scaledAverages.all_cheapest.toFixed(2)}`,
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
                  value: `Vendors Average: $${scaledAverages.all_average.toFixed(2)}`,
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
      )}

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
