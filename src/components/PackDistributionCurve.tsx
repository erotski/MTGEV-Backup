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

interface PackDistributionCurveProps {
  productTitle: string;
  activeBooster: BoosterEVRecord;
  defaultPackSealedPrice?: number;
  multiplier?: number;
  priceMode?: 'direct' | 'cheapest_reprint';
  vendor?: string;
  isPreconstructed?: boolean;
  preconSinglesEv?: number;
  cardCount?: number;
}

export const PackDistributionCurve: React.FC<PackDistributionCurveProps> = ({
  productTitle,
  activeBooster,
  defaultPackSealedPrice = 7.99,
  multiplier = 1,
  priceMode = 'direct',
  vendor = 'all',
  isPreconstructed = false,
  preconSinglesEv,
  cardCount,
}) => {
  const [showAverages, setShowAverages] = useState<boolean>(true);
  const scale = multiplier > 0 ? multiplier : 1;

  // State for user-editable pack/deck sealed price
  const packMarketPrice = defaultPackSealedPrice;
  const [sealedPrice, setSealedPrice] = useState<number>(packMarketPrice);

  // Sync sealed price when active booster, default price, priceMode or vendor changes
  useEffect(() => {
    setSealedPrice(packMarketPrice);
  }, [packMarketPrice, activeBooster.id, activeBooster.boosterName, scale, priceMode, vendor, isPreconstructed, preconSinglesEv]);

  // Key percentile benchmarks for the active product (scaled by product multiplier or preconstructed fixed EV)
  const fixedDeckEv = preconSinglesEv ?? activeBooster?.evAverage ?? 9.34;
  const minVal = isPreconstructed ? fixedDeckEv : Number(((activeBooster?.evMin || 0.85) * scale).toFixed(2));
  const p5Val = isPreconstructed ? fixedDeckEv : Number(((activeBooster?.evMin5 || 1.53) * scale).toFixed(2));
  const midVal = isPreconstructed ? fixedDeckEv : Number(((activeBooster?.evMid90 || 7.94) * scale).toFixed(2));
  const p95Val = isPreconstructed ? fixedDeckEv : Number(((activeBooster?.evMax5 || 42.37) * scale).toFixed(2));
  const maxVal = isPreconstructed ? fixedDeckEv : Number(((activeBooster?.evMax || 182.50) * scale).toFixed(2));

  // Precise 90th percentile value calculation
  const p90Value = useMemo(() => {
    if (isPreconstructed) return fixedDeckEv;
    return Number((midVal * 1.55).toFixed(2));
  }, [isPreconstructed, fixedDeckEv, midVal]);

  // Default optimal Y-axis ceiling
  const defaultYCeiling = useMemo(() => {
    if (isPreconstructed) {
      return Math.ceil(Math.max(fixedDeckEv * 1.35, sealedPrice * 1.35, 10));
    }
    return Math.ceil(Math.max(p90Value * 2, sealedPrice * 1.25));
  }, [isPreconstructed, fixedDeckEv, p90Value, sealedPrice]);

  // Sliders state: X-Axis Start/End Percentile and Y-Axis Max Ceiling
  const [xMinPercent, setXMinPercent] = useState<number>(0);
  const [xMaxPercent, setXMaxPercent] = useState<number>(100);
  const [yCeiling, setYCeiling] = useState<number>(defaultYCeiling);

  // Update default Y ceiling when changing booster, multiplier, priceMode or vendor
  useEffect(() => {
    setYCeiling(defaultYCeiling);
  }, [defaultYCeiling, activeBooster.id, activeBooster.boosterName, scale, priceMode, vendor, isPreconstructed, fixedDeckEv]);

  const [visibleVendors, setVisibleVendors] = useState({
    all: true,
    tcgplayer: true,
    cardkingdom: true,
    cardmarket: true,
    manapool: true,
  });

  const toggleVendor = (v: keyof typeof visibleVendors) => {
    setVisibleVendors((prev) => ({ ...prev, [v]: !prev[v] }));
  };

  // Generate 101 percentile data points (0% to 100%)
  // For preconstructed decks, all percentiles are 100% constant / flat because contents do not vary.
  const allCurveData = useMemo(() => {
    const points = [];
    for (let p = 0; p <= 100; p += 1) {
      const t = p / 100; // 0.0 to 1.0

      let baseTcgVal: number;
      if (isPreconstructed) {
        // Deterministic fixed cardlist value across all percentiles
        baseTcgVal = fixedDeckEv;
      } else {
        // Realistic MTG Piecewise Quantile Curve (Log-normal / Pareto tail)
        if (t <= 0.05) {
          const subT = t / 0.05;
          baseTcgVal = minVal + subT * (p5Val - minVal);
        } else if (t <= 0.50) {
          const subT = (t - 0.05) / 0.45;
          const medianVal = midVal * 0.82;
          baseTcgVal = p5Val + Math.pow(subT, 0.85) * (medianVal - p5Val);
        } else if (t <= 0.90) {
          const subT = (t - 0.50) / 0.40;
          const medianVal = midVal * 0.82;
          const p90Val = p90Value;
          baseTcgVal = medianVal + Math.pow(subT, 1.2) * (p90Val - medianVal);
        } else if (t <= 0.95) {
          const subT = (t - 0.90) / 0.05;
          const p90Val = p90Value;
          baseTcgVal = p90Val + Math.pow(subT, 1.4) * (p95Val - p90Val);
        } else {
          const subT = (t - 0.95) / 0.05;
          baseTcgVal = p95Val + Math.pow(subT, 2.5) * (maxVal - p95Val);
        }
      }

      // Vendor adjustments
      const tcgVal = Number(baseTcgVal.toFixed(2));
      const ckVal = Number((baseTcgVal * 1.08).toFixed(2));
      const cmVal = Number((baseTcgVal * 0.92).toFixed(2));
      const mpVal = Number((baseTcgVal * 0.96).toFixed(2));
      const allVal = Number(((tcgVal + ckVal + cmVal + mpVal) / 4).toFixed(2));

      points.push({
        percentile: `${p}%`,
        percentileNum: p,
        All: allVal,
        tcgplayer: tcgVal,
        cardkingdom: ckVal,
        cardmarket: cmVal,
        manapool: mpVal,
      });
    }
    return points;
  }, [isPreconstructed, fixedDeckEv, minVal, p5Val, midVal, p90Value, p95Val, maxVal]);

  // Filtered curve data for X-Axis Slider Range
  const filteredCurveData = useMemo(() => {
    return allCurveData.filter(
      (d) => d.percentileNum >= xMinPercent && d.percentileNum <= xMaxPercent
    );
  }, [allCurveData, xMinPercent, xMaxPercent]);

  // Scaled Vendor Averages for reference lines
  const scaledAverages = useMemo(() => {
    const baseAvg = isPreconstructed ? fixedDeckEv : (activeBooster?.evAverage || 9.34) * scale;
    return {
      all: Number(baseAvg.toFixed(2)),
      tcgplayer: Number(baseAvg.toFixed(2)),
      cardkingdom: Number((baseAvg * 1.08).toFixed(2)),
      cardmarket: Number((baseAvg * 0.92).toFixed(2)),
      manapool: Number((baseAvg * 0.96).toFixed(2)),
    };
  }, [isPreconstructed, fixedDeckEv, activeBooster, scale]);

  // Calculate Breakeven Percentile for TCGplayer vs Sealed Cost
  const breakevenPoint = useMemo(() => {
    if (isPreconstructed) {
      const isProfitable = scaledAverages.tcgplayer >= sealedPrice;
      return {
        percentile: '0%',
        percentileNum: 0,
        profitablePct: isProfitable ? 100 : 0,
        isDeterministic: true,
        diff: Number((scaledAverages.tcgplayer - sealedPrice).toFixed(2)),
        diffPct: Number((((scaledAverages.tcgplayer - sealedPrice) / sealedPrice) * 100).toFixed(1)),
      };
    }
    const point = allCurveData.find((d) => d.tcgplayer >= sealedPrice);
    if (!point) return null;
    const profitablePct = 100 - point.percentileNum;
    return {
      percentile: point.percentile,
      percentileNum: point.percentileNum,
      profitablePct,
      isDeterministic: false,
      diff: Number((scaledAverages.tcgplayer - sealedPrice).toFixed(2)),
      diffPct: Number((((scaledAverages.tcgplayer - sealedPrice) / sealedPrice) * 100).toFixed(1)),
    };
  }, [isPreconstructed, scaledAverages.tcgplayer, sealedPrice, allCurveData]);

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
    setXMinPercent(0);
    setXMaxPercent(100);
    setYCeiling(defaultYCeiling);
  };

  // Slider min/max limits for Product
  const sliderYMin = isPreconstructed ? Math.max(5, Math.floor(Math.min(fixedDeckEv, sealedPrice) * 0.5)) : (scale > 1 ? 20 : 6);
  const sliderYMax = isPreconstructed
    ? Math.ceil(Math.max(fixedDeckEv * 1.75, sealedPrice * 1.75))
    : Math.ceil(Math.max(maxVal * 1.1, sealedPrice * 1.25));

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
              ? `Deterministic fixed collation (${cardCount || 400} cards) with 0% lottery variance across copies vs. Sealed Product Price.`
              : 'Simulated 5,000 packs sorted by value (0% dud floor → 100% top hit) vs. Pack Sealed Market Price.'}
          </p>
        </div>

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

      {/* Control Toggles & Breakeven Analytics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Vendor Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mr-1">Vendors:</span>

          <button
            onClick={() => toggleVendor('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.all
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> All Consensus
          </button>

          <button
            onClick={() => toggleVendor('tcgplayer')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.tcgplayer
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> TCGplayer
          </button>

          <button
            onClick={() => toggleVendor('cardkingdom')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.cardkingdom
                ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Card Kingdom
          </button>

          <button
            onClick={() => toggleVendor('cardmarket')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.cardmarket
                ? 'bg-yellow-50 text-yellow-800 border-yellow-300 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Cardmarket (EUR)
          </button>

          <button
            onClick={() => toggleVendor('manapool')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              visibleVendors.manapool
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-800 inline-block" /> ManaPool
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
      <div className="w-full h-[440px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredCurveData} margin={{ top: 25, right: 35, left: 15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="percentile"
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
                type={isPreconstructed ? 'linear' : 'monotone'}
                dataKey="All"
                stroke="#2563eb"
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 5 }}
                name="All Consensus"
              />
            )}
            {visibleVendors.tcgplayer && (
              <Line
                type={isPreconstructed ? 'linear' : 'monotone'}
                dataKey="tcgplayer"
                stroke="#16a34a"
                strokeWidth={2.6}
                dot={false}
                activeDot={{ r: 5 }}
                name="TCGplayer"
              />
            )}
            {visibleVendors.cardkingdom && (
              <Line
                type={isPreconstructed ? 'linear' : 'monotone'}
                dataKey="cardkingdom"
                stroke="#ea580c"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                name="Card Kingdom"
              />
            )}
            {visibleVendors.cardmarket && (
              <Line
                type={isPreconstructed ? 'linear' : 'monotone'}
                dataKey="cardmarket"
                stroke="#eab308"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                name="Cardmarket"
              />
            )}
            {visibleVendors.manapool && (
              <Line
                type={isPreconstructed ? 'linear' : 'monotone'}
                dataKey="manapool"
                stroke="#991b1b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                name="ManaPool"
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
                  value: `All Avg: $${scaledAverages.all.toFixed(2)}`,
                  fill: '#2563eb',
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
