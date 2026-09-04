import React, { useState, useMemo, useEffect } from 'react';
import { BoosterVariation, SheetConfig } from '../ecommerceBoosterData';
import {
  dataService,
  DbBoosterData,
  convertDbBoosterToVariations,
} from '../services/dataService';
import {
  Sliders,
  Sparkles,
  Dices,
  Layers,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent,
  Database,
  Search,
  Filter,
} from 'lucide-react';

interface BoosterSlotViewerProps {
  setCode?: string;
  boosterName?: string;
  variations?: BoosterVariation[];
  packsCount: number;
  packagingType: string;
  productName: string;
  className?: string;
}

export const BoosterSlotViewer: React.FC<BoosterSlotViewerProps> = ({
  setCode,
  boosterName,
  variations: propVariations,
  packsCount,
  packagingType,
  productName,
  className = '',
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [dbBooster, setDbBooster] = useState<DbBoosterData | null>(null);
  const [activeVariations, setActiveVariations] = useState<BoosterVariation[]>(
    propVariations && propVariations.length > 0 ? propVariations : []
  );

  // Selected variation index (0-indexed matching database boosterIndex)
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [simulatedRoll, setSimulatedRoll] = useState<{
    optionIndex: number;
    name: string;
    weight: number;
    pct: string;
  } | null>(null);

  // Search/Filter for variations when there are many (e.g., MOM has 24 options)
  const [optionFilter, setOptionFilter] = useState<string>('');

  // Fetch authentic collation data directly from database service
  useEffect(() => {
    let isMounted = true;

    async function loadAuthenticBoosterSlots() {
      if (!setCode) {
        if (propVariations && propVariations.length > 0) {
          setActiveVariations(propVariations);
        }
        return;
      }

      setLoading(true);
      try {
        const rawDb = await dataService.getBoosterSlots(setCode, boosterName, productName);
        if (isMounted) {
          if (rawDb && rawDb.boosters && rawDb.boosters.length > 0) {
            setDbBooster(rawDb);
            const converted = convertDbBoosterToVariations(rawDb);
            setActiveVariations(converted);
            setSelectedOptionIndex(0);
          } else if (propVariations && propVariations.length > 0) {
            setActiveVariations(propVariations);
          } else {
            setDbBooster(null);
            setActiveVariations([]);
          }
        }
      } catch (err) {
        console.error('Failed to load database booster collation:', err);
        if (isMounted && propVariations && propVariations.length > 0) {
          setActiveVariations(propVariations);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAuthenticBoosterSlots();

    return () => {
      isMounted = false;
    };
  }, [setCode, boosterName, productName, propVariations]);

  // Total weight from authentic database
  const totalWeight = useMemo(() => {
    if (dbBooster?.boostersTotalWeight && dbBooster.boostersTotalWeight > 0) {
      return dbBooster.boostersTotalWeight;
    }
    return activeVariations.reduce((sum, v) => sum + (v.boosterWeight || 1), 0);
  }, [dbBooster, activeVariations]);

  const getOptionProbability = (weight: number): { pctStr: string; rawPct: number } => {
    if (totalWeight <= 0) {
      const p = 100 / (activeVariations.length || 1);
      return { pctStr: p.toFixed(2), rawPct: p };
    }
    const raw = (weight / totalWeight) * 100;
    const str = raw < 0.001 ? raw.toExponential(2) : raw.toFixed(3);
    return { pctStr: str, rawPct: raw };
  };

  const activeVariation = activeVariations[selectedOptionIndex] || activeVariations[0];
  const baseVariation = activeVariations[0];

  // Precise diff between active variation and Base Option 0 using exact database sheet names
  const optionDifferences = useMemo(() => {
    if (selectedOptionIndex === 0 || !activeVariation || !baseVariation) return [];
    const diffs: string[] = [];

    const baseSheetPicks: Record<string, number> = {};
    baseVariation.sheets.forEach((s) => {
      baseSheetPicks[s.sheetCode] = s.sheetPicks;
    });

    const activeSheetPicks: Record<string, number> = {};
    activeVariation.sheets.forEach((s) => {
      activeSheetPicks[s.sheetCode] = s.sheetPicks;
    });

    // Detect added/upgraded sheets not present in Option 0
    activeVariation.sheets.forEach((s) => {
      if (!baseSheetPicks[s.sheetCode]) {
        diffs.push(`Replaces a standard slot with authentic database sheet "${s.sheetName}" (${s.sheetPicks}x)`);
      } else if (baseSheetPicks[s.sheetCode] !== s.sheetPicks) {
        diffs.push(
          `Changes "${s.sheetName}" quantity from ${baseSheetPicks[s.sheetCode]} to ${s.sheetPicks} cards`
        );
      }
    });

    // Detect sheets dropped from base
    baseVariation.sheets.forEach((s) => {
      if (!activeSheetPicks[s.sheetCode]) {
        diffs.push(`Substitutes out "${s.sheetName}" (${s.sheetPicks}x)`);
      }
    });

    return diffs;
  }, [selectedOptionIndex, activeVariation, baseVariation]);

  // Roll a simulated pack according to database collation weights
  const handleSimulateRoll = () => {
    if (activeVariations.length === 0 || totalWeight <= 0) return;
    const rand = Math.random() * totalWeight;
    let running = 0;
    for (let i = 0; i < activeVariations.length; i++) {
      running += activeVariations[i].boosterWeight || 1;
      if (rand <= running || i === activeVariations.length - 1) {
        setSelectedOptionIndex(i);
        const prob = getOptionProbability(activeVariations[i].boosterWeight || 1);
        setSimulatedRoll({
          optionIndex: activeVariations[i].boosterIndex ?? i,
          name: activeVariations[i].name,
          weight: activeVariations[i].boosterWeight,
          pct: prob.pctStr,
        });
        break;
      }
    }
  };

  // Flatten active variation sheets into individual physical card slots (e.g. 15 cards for MOM Collector)
  const expandedPackCards = useMemo(() => {
    if (!activeVariation) return [];
    const cards: Array<{
      slotNumber: number;
      sheet: SheetConfig;
      meta?: any;
      isDiffFromBase: boolean;
    }> = [];

    const baseCodes = new Set(baseVariation?.sheets.map((s) => s.sheetCode) || []);
    let slotCount = 1;

    activeVariation.sheets.forEach((sheet) => {
      const isDiff = selectedOptionIndex > 0 && !baseCodes.has(sheet.sheetCode);
      const meta = dbBooster?.sheets?.[sheet.sheetCode];
      for (let p = 0; p < sheet.sheetPicks; p++) {
        cards.push({
          slotNumber: slotCount++,
          sheet,
          meta,
          isDiffFromBase: isDiff,
        });
      }
    });

    return cards;
  }, [activeVariation, baseVariation, selectedOptionIndex, dbBooster]);

  // Packaging container projected yield
  const containerSummary = useMemo(() => {
    if (!activeVariation) return { cards: 0, foils: 0, rares: 0 };
    let raresPerPack = 0;
    let foilsPerPack = 0;
    let totalCardsPerPack = 0;

    activeVariation.sheets.forEach((sheet) => {
      totalCardsPerPack += sheet.sheetPicks;
      const lower = sheet.sheetName.toLowerCase();
      const meta = dbBooster?.sheets?.[sheet.sheetCode];

      if (lower.includes('rare') || lower.includes('mythic') || lower.includes('mul')) {
        raresPerPack += sheet.sheetPicks;
      }
      if (meta?.foil || lower.includes('foil')) {
        foilsPerPack += sheet.sheetPicks;
      }
    });

    return {
      cardsPerPack: totalCardsPerPack,
      totalContainerCards: totalCardsPerPack * packsCount,
      projectedRares: Math.round(raresPerPack * packsCount),
      projectedFoils: Math.round(foilsPerPack * packsCount),
    };
  }, [activeVariation, dbBooster, packsCount]);

  // Filtered variations for sets with high option counts (like MOM's 24 options)
  const filteredVariations = useMemo(() => {
    if (!optionFilter.trim()) return activeVariations;
    const q = optionFilter.toLowerCase().trim();
    return activeVariations.filter((v, idx) => {
      const optNum = String(v.boosterIndex ?? idx);
      const matchSheet = v.sheets.some((s) => s.sheetName.toLowerCase().includes(q));
      return optNum === q || v.name.toLowerCase().includes(q) || matchSheet;
    });
  }, [activeVariations, optionFilter]);

  // Loading State
  if (loading) {
    return (
      <div className={`bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 ${className}`}>
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-mono text-slate-500">
          Loading authentic database booster collation for {setCode || 'product'}...
        </p>
      </div>
    );
  }

  // Empty / No Database Collation State
  if (activeVariations.length === 0) {
    return (
      <div className={`bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3 ${className}`}>
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <Database className="w-5 h-5" />
        </div>
        <div className="text-sm font-bold text-slate-800">
          No Discrete Database Collation Table
        </div>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          The database does not define a variable pack collation matrix for{' '}
          <span className="font-semibold text-slate-700">{productName}</span> ({setCode || 'Unknown'}). Standard fixed contents or non-randomized distribution applies.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden ${className}`}>
      {/* Database Provenance Banner Header */}
      <div className="p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400 shrink-0" />
            <h4 className="text-base font-bold tracking-tight">
              Authentic MTGJSON Booster Collation
            </h4>
            <span className="text-[11px] font-mono font-bold bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded border border-indigo-400/40">
              {activeVariations.length} Collation {activeVariations.length === 1 ? 'Variation' : 'Variations'}
            </span>
            {dbBooster?.boosterName && (
              <span className="text-[11px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                Type: {dbBooster.boosterName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Strictly driven by MTGJSON database tables (<code className="text-indigo-300">setBoosterContentWeights</code>, <code className="text-indigo-300">setBoosterContents</code>, and <code className="text-indigo-300">setBoosterSheets</code>). No mock approximations.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
          <button
            onClick={handleSimulateRoll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition shadow-xs cursor-pointer active:scale-95"
            title="Simulate cracking a pack rolled against authentic database weights"
          >
            <Dices className="w-4 h-4" />
            <span>Roll Collation</span>
          </button>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition border cursor-pointer ${
              compareMode
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{compareMode ? 'Pack Slot View' : 'Compare Variations'}</span>
          </button>
        </div>
      </div>

      {/* Variation Selection & Navigation */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/70 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
              Select Collation Option:
            </span>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
              Option {activeVariation.boosterIndex ?? selectedOptionIndex}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            <span>
              Collation Weight Pool: <strong className="text-slate-800 font-bold">{totalWeight.toLocaleString()}</strong>
            </span>
            {activeVariations.length > 6 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter sheet or option..."
                  value={optionFilter}
                  onChange={(e) => setOptionFilter(e.target.value)}
                  className="pl-7 pr-3 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Compact Quick Option Switcher Pills (Essential for sets like MOM with 24 options) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          <button
            onClick={() => setSelectedOptionIndex((prev) => Math.max(0, prev - 1))}
            disabled={selectedOptionIndex === 0}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title="Previous Option"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {filteredVariations.map((v) => {
              const optIdx = v.boosterIndex ?? activeVariations.indexOf(v);
              const isSelected = selectedOptionIndex === optIdx;
              const prob = getOptionProbability(v.boosterWeight || 1);
              const isBase = optIdx === 0;

              return (
                <button
                  key={optIdx}
                  onClick={() => {
                    setSelectedOptionIndex(optIdx);
                    setSimulatedRoll(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <span>Option {optIdx}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                      isSelected
                        ? 'bg-indigo-700 text-indigo-100'
                        : isBase
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-800 font-semibold'
                    }`}
                  >
                    {prob.pctStr}%
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() =>
              setSelectedOptionIndex((prev) => Math.min(activeVariations.length - 1, prev + 1))
            }
            disabled={selectedOptionIndex === activeVariations.length - 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title="Next Option"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* Selected Option Collation Details Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black bg-slate-900 text-white px-2 py-0.5 rounded">
                Option {activeVariation.boosterIndex ?? selectedOptionIndex}
              </span>
              <span className="text-xs font-bold text-slate-900">
                Collation Weight: {activeVariation.boosterWeight?.toLocaleString()} / {totalWeight.toLocaleString()}
              </span>
              <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                {getOptionProbability(activeVariation.boosterWeight || 1).pctStr}% Probability
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              Contains {expandedPackCards.length} cards across {activeVariation.sheets.length} distinct database sheets.
            </p>
          </div>

          {/* Simulated Roll Outcome Banner */}
          {simulatedRoll && (
            <div className="px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-xs text-amber-900 animate-in fade-in">
              <Dices className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Simulated Hit: <strong>Option {simulatedRoll.optionIndex}</strong> ({simulatedRoll.pct}%)
              </span>
            </div>
          )}
        </div>

        {/* Collation Diff from Base Collation (Option 0) */}
        {selectedOptionIndex > 0 && optionDifferences.length > 0 && (
          <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1.5 text-xs text-amber-950">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>
                Collation Variance: How Option {activeVariation.boosterIndex ?? selectedOptionIndex} differs from Base Option 0:
              </span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-amber-900/90 text-[11px]">
              {optionDifferences.map((diff, dIdx) => (
                <li key={dIdx}>{diff}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Main Display: Side-by-side Table or Visual Pack Strip */}
      {compareMode ? (
        /* Full Database Side-by-Side Collation Table */
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Database Sheet Collation Matrix ({activeVariations.length} Options)</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Horizontal scroll for all variation options
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-white font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-950 z-10">Database Sheet Name</th>
                  <th className="py-2.5 px-3">Foil</th>
                  <th className="py-2.5 px-3">Pool Size</th>
                  <th className="py-2.5 px-3">Sheet Weight</th>
                  {activeVariations.map((v, idx) => (
                    <th
                      key={idx}
                      className={`py-2.5 px-3 text-center whitespace-nowrap ${
                        selectedOptionIndex === (v.boosterIndex ?? idx) ? 'bg-indigo-900' : ''
                      }`}
                    >
                      Option {v.boosterIndex ?? idx}
                      <div className="text-[9px] font-normal text-slate-300">
                        {getOptionProbability(v.boosterWeight || 1).pctStr}%
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-mono">
                {/* Aggregate all unique database sheet names */}
                {Array.from<string>(
                  new Set(activeVariations.flatMap((v) => v.sheets.map((s) => s.sheetName)))
                ).map((sheetName, sIdx) => {
                  const meta = dbBooster?.sheets?.[sheetName];
                  const isFoil = meta?.foil ?? sheetName.toLowerCase().includes('foil');

                  return (
                    <tr key={sIdx} className="hover:bg-slate-50 transition">
                      <td className="py-2 px-3 font-semibold text-slate-900 sticky left-0 bg-white hover:bg-slate-50 border-r border-slate-200 z-10">
                        <code>{sheetName}</code>
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {isFoil ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                            Foil
                          </span>
                        ) : (
                          <span className="text-slate-400">Non-Foil</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {meta?.cardCount ? `${meta.cardCount} cards` : '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {meta?.totalWeight?.toLocaleString() || '—'}
                      </td>
                      {activeVariations.map((v, vIdx) => {
                        const match = v.sheets.find((s) => s.sheetName === sheetName);
                        const isCurrentCol = selectedOptionIndex === (v.boosterIndex ?? vIdx);
                        return (
                          <td
                            key={vIdx}
                            className={`py-2 px-3 text-center ${
                              isCurrentCol ? 'bg-indigo-50/60 font-bold' : ''
                            }`}
                          >
                            {match ? (
                              <span className="text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded border border-indigo-200 font-bold">
                                {match.sheetPicks}x
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visual Interactive Pack Strip View (Physical Cards in Booster) */
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>
                  Physical Booster Pack Slots ({expandedPackCards.length} Cards) — Option{' '}
                  {activeVariation.boosterIndex ?? selectedOptionIndex}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Each card slot maps directly to an authentic database sheet:
              </p>
            </div>

            <div className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 shrink-0">
              {packsCount} {packsCount === 1 ? 'Pack' : 'Packs'} in this {packagingType.toUpperCase()}
            </div>
          </div>

          {/* Card Pack Strip Horizontal Scroller / Responsive Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
            {expandedPackCards.map((card, cIdx) => {
              const isFoil = card.meta?.foil ?? card.sheet.sheetName.toLowerCase().includes('foil');

              return (
                <div
                  key={cIdx}
                  className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                    card.isDiffFromBase
                      ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-400/70 shadow-xs'
                      : isFoil
                      ? 'bg-yellow-50/70 border-yellow-300 shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Slot Header */}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-mono text-[10px] font-black text-slate-500">
                        Slot #{card.slotNumber}
                      </span>
                      {card.isDiffFromBase && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-400 text-amber-950 uppercase tracking-tighter">
                          UPGRADE
                        </span>
                      )}
                    </div>

                    {/* Foil / Finish indicator */}
                    <div className="mb-1.5">
                      {isFoil ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-yellow-200 text-yellow-950 border border-yellow-300">
                          Traditional Foil
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-500 bg-white border border-slate-200">
                          Non-Foil
                        </span>
                      )}
                    </div>

                    {/* Authentic Database Sheet Name */}
                    <div
                      className="text-xs font-mono font-bold text-slate-900 break-words leading-tight"
                      title={card.sheet.sheetName}
                    >
                      {card.sheet.sheetName}
                    </div>
                  </div>

                  {/* Sheet Metadata Footer */}
                  <div className="mt-3 pt-2 border-t border-slate-200/80 text-[10px] font-mono text-slate-500 space-y-0.5">
                    {card.meta?.cardCount && (
                      <div>Pool: {card.meta.cardCount} cards</div>
                    )}
                    {card.meta?.totalWeight && (
                      <div>Weight: {card.meta.totalWeight}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Container Projection Summary: Yield across this sealed product */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold text-slate-800">
            Yield Projection across this {packagingType.toUpperCase()} ({packsCount} {packsCount === 1 ? 'Pack' : 'Packs'}):
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded border border-slate-300 font-bold">
            {containerSummary.totalContainerCards} Total Cards
          </span>
          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-bold">
            ~{containerSummary.projectedRares} Rares/Mythics/Legends
          </span>
          <span className="bg-yellow-100 text-yellow-900 px-2 py-0.5 rounded border border-yellow-300 font-bold">
            ~{containerSummary.projectedFoils} Foil Cards
          </span>
        </div>
      </div>
    </div>
  );
};
