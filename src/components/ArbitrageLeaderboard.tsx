import React, { useState, useMemo, useEffect } from 'react';
import { BoxArbitrageRecord, PriceMode, ProductCategory, Vendor, BoosterEVRecord, EvBasis, PricingReliability } from '../types';
import { dataService } from '../services/dataService';
import { SetSymbolIcon } from './SetSymbolIcon';
import { ProductPackagingImage } from './ProductPackagingImage';
import { ProductPackagingType } from '../ecommerceBoosterData';
import { calculateEvScore, getEvScoreBadgeClass, getEvScoreDarkBadgeClass } from '../utils/evScore';
import { findBoosterEv, resolveCardPrice, normalizeVendor } from '../utils/vendorUtils';
import { getCanonicalProductMetrics, findMatchingPreconDeck } from '../utils/productUtils';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Search,
  Layers,
  Award,
  ChevronLeft,
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
  HelpCircle,
  Clock,
} from 'lucide-react';

interface ArbitrageLeaderboardProps {
  records: BoxArbitrageRecord[];
  onSelectSet: (setCode: string, productUuid?: string) => void;
  priceMode: PriceMode;
  onPriceModeChange: (mode: PriceMode) => void;
  vendor: Vendor;
  onVendorChange: (vendor: Vendor) => void;
  evBasis?: EvBasis;
  onEvBasisChange?: (basis: EvBasis) => void;
  boosterEvMap?: Record<string, BoosterEVRecord[]>;
  pricingReliability?: Record<string, PricingReliability>;
}

export const ArbitrageLeaderboard: React.FC<ArbitrageLeaderboardProps> = ({
  records,
  onSelectSet,
  priceMode,
  onPriceModeChange,
  vendor,
  onVendorChange,
  evBasis: propEvBasis,
  onEvBasisChange,
  boosterEvMap,
  pricingReliability = {},
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all');
  const [internalEvBasis, setInternalEvBasis] = useState<EvBasis>('avg');
  const evBasis = propEvBasis ?? internalEvBasis;
  const setEvBasis = onEvBasisChange ?? setInternalEvBasis;
  const [sortBy, setSortBy] = useState<'roi' | 'profit' | 'boxPrice' | 'boxEv' | 'evScore' | 'packs' | 'cards'>('roi');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [highlightTab, setHighlightTab] = useState<'best' | 'worst'>('best');
  const [preconDecks, setPreconDecks] = useState<Record<string, any>>({});
  const [singleCardPrices, setSingleCardPrices] = useState<any>({ byUuid: {}, byName: {}, byNameSet: {} });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [pipelineRunId, setPipelineRunId] = useState<string>('unavailable');
  const [pipelineGeneratedAt, setPipelineGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    // Defer loading heavy auxiliary precon & single card indexes until main thread is idle
    const timer = setTimeout(() => {
      Promise.all([
        dataService.getPreconDecks(),
        dataService.getSingleCardPrices(),
      ]).then(([pd, sc]) => {
        if (isMounted) {
          if (pd) setPreconDecks(pd);
          if (sc) setSingleCardPrices(sc);
        }
      }).catch(() => {});
    }, 300);

    // Same provenance gateway as dataService.getProductMetrics(), surfaced once for the whole table
    dataService.getLatestPipelineRun().then((run) => {
      if (!isMounted || !run) return;
      setPipelineRunId(run.pipelineRunId || run.id || 'unavailable');
      setPipelineGeneratedAt(run.generatedAt || run.timestamp || null);
    }).catch(() => {});

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const recordByUuid = useMemo(() => new Map(records.map((r) => [r.productUuid, r])), [records]);
  const recordByUuidObj = useMemo(() => {
    const obj: Record<string, any> = {};
    records.forEach((r) => {
      if (r.productUuid) obj[r.productUuid] = r;
      if (r.id) obj[r.id] = r;
    });
    return obj;
  }, [records]);

  const getCardCount = (box: BoxArbitrageRecord, visited = new Set<string>()): number => {
    const uid = box.productUuid || '';
    if (uid) {
      if (visited.has(uid)) return 0;
      visited.add(uid);
    }
    const contents = box.contents;
    const hasStructuredContents = Boolean(
      contents &&
      (
        (contents.pack && contents.pack.length > 0) ||
        (contents.sealed && contents.sealed.length > 0) ||
        (contents.card && contents.card.length > 0) ||
        (contents.deck && contents.deck.length > 0) ||
        (contents.variable && contents.variable.length > 0)
      )
    );

    if (hasStructuredContents && contents) {
      let sum = 0;
      if (contents.pack) {
        contents.pack.forEach((pk: any) => {
          const count = pk.count || 1;
          const code = (pk.code || '').toLowerCase();
          const cardsPerPack = (code.includes('sample') || code.includes('prerelease')) ? 2 : (code.includes('jumpstart') ? 20 : (code.includes('theme') ? 35 : 15));
          sum += count * cardsPerPack;
        });
      }
      if (contents.card) {
        sum += contents.card.reduce((cAcc: number, c: any) => cAcc + (c.count || 1), 0);
      }
      if (contents.deck) {
        if (typeof box.cardCount === 'number' && box.cardCount > 0) {
          sum += box.cardCount;
        } else {
          contents.deck.forEach((dk: any) => {
            const matchedDeck = preconDecks ? findMatchingPreconDeck(preconDecks, dk.name, dk.set || (box as any).setCode, (box as any).id || (box as any).uuid) : undefined;
            const isCmd = Boolean(
              matchedDeck?.isCommander ||
              matchedDeck?.format === 'commander' ||
              Boolean(matchedDeck?.commander && matchedDeck.commander.name && matchedDeck.commander.name.toLowerCase().trim() !== 'face commander') ||
              (box.category || '').toLowerCase() === 'commander_deck' ||
              (box.boxName || '').toLowerCase().includes('commander') ||
              (dk.name || '').toLowerCase().includes('commander')
            );
            const dCount = matchedDeck?.totalCards || matchedDeck?.cardCount || (matchedDeck?.cards ? matchedDeck.cards.reduce((s: number, c: any) => s + (c.count || 1), 0) : 0) || (isCmd ? 100 : 60);
            sum += dCount;
          });
        }
      }
      if (contents.sealed) {
        contents.sealed.forEach((s: any) => {
          const count = s.count || 1;
          const child = s.uuid ? recordByUuid.get(s.uuid) : null;
          if (child) {
            sum += count * getCardCount(child, new Set(visited));
          } else {
            const sName = (s.name || '').toLowerCase();
            const childCards = sName.includes('sample') ? 2 : (sName.includes('booster box') ? 36 * 15 : (sName.includes('deck') ? 100 : 15));
            sum += count * childCards;
          }
        });
      }
      if (contents.variable) {
        sum += contents.variable.length;
      }
      if (sum > 0) return sum;
    }

    if (typeof box.cardCount === 'number' && box.cardCount > 0) return box.cardCount;
    const cat = (box.category || '').toLowerCase();
    if (cat === 'commander_deck' || box.boxName.toLowerCase().includes('commander')) return 100;
    if (box.packCount > 0) {
      return box.packCount * 15;
    }
    return 0;
  };

  // Dynamically compute adjusted pricing and EV based on selected PriceMode, Vendor & EV Basis
  const adjustedRecords = useMemo(() => {
    // Fast path: if default options (direct, all) are selected, records in arbitrage_leaderboard.json
    // are already the canonical metrics. We only need to adjust effectiveEv/profitUsd/roiPct per evBasis.
    const isDefaultPricing = priceMode === 'direct' && (vendor === 'all' || vendor === 'all_cheapest');
    if (isDefaultPricing) {
      return records.map((r) => {
        let effectiveEv = r.totalEvAvg || 0;
        if (evBasis === 'min') effectiveEv = r.totalEvMin || 0;
        else if (evBasis === 'mid90') effectiveEv = r.totalEvMid90 || effectiveEv;
        else if (evBasis === 'max') effectiveEv = r.totalEvMax || 0;

        const profitUsd = Number((effectiveEv - (r.marketPrice || 0)).toFixed(2));
        const roiPct = (r.marketPrice || 0) > 0 ? Number(((profitUsd / r.marketPrice) * 100).toFixed(2)) : 0;
        const isPrecon = (r.category || '').toLowerCase().includes('deck') || (r.packCount === 0);
        const evScore = calculateEvScore(
          r.marketPrice,
          r.totalEvAvg,
          r.totalEvMin,
          r.totalEvMid90,
          r.totalEvMax,
          isPrecon
        );

        return {
          ...r,
          effectiveEv,
          profitUsd,
          roiPct,
          evScore,
        };
      });
    }

    return records.map((r) => {
      // Single canonical source of truth for containment, breakdown, and EV calculation
      const metrics = getCanonicalProductMetrics(
        r,
        recordByUuid,
        recordByUuidObj,
        boosterEvMap || {},
        preconDecks,
        singleCardPrices,
        vendor,
        priceMode,
        evBasis
      );

      const adjustedTotalPrice = r.marketPrice;
      const adjustedTotalEv = metrics.estimatedEv;
      const adjustedTotalMin = metrics.minEv;
      const adjustedTotalMid90 = metrics.mid90Ev;
      const adjustedTotalMax = metrics.maxEv;
      const effectiveEv = metrics.effectiveEv;
      const profitUsd = metrics.netSpread;
      const roiPct = metrics.roiPct;
      const pCount = metrics.packsCount;
      const cCount = metrics.cardCount;
      const boosterName = metrics.primaryBoosterName;
      const fixedBaseEv = metrics.fixedBaseEv || 0;

      // Unit EV covers only the per-pack (variable) contribution. A fixed base
      // (e.g. an included promo card or precon deck) is never divided across
      // packs, matching the Total EV / Unit EV definitions in PROJECT_REVIEW.md.
      const toUnitEv = (totalForBasis: number) =>
        pCount > 0 ? Number((Math.max(0, totalForBasis - fixedBaseEv) / pCount).toFixed(2)) : 0;
      const adjustedUnitEv = toUnitEv(adjustedTotalEv);
      const adjustedUnitMin = toUnitEv(adjustedTotalMin);
      const adjustedUnitMid90 = toUnitEv(adjustedTotalMid90);
      const adjustedUnitMax = toUnitEv(adjustedTotalMax);

      const isPrecon = (r.category || '').toLowerCase().includes('deck') || pCount === 0;
      const evScore = calculateEvScore(
        adjustedTotalPrice,
        adjustedTotalEv,
        adjustedTotalMin,
        adjustedTotalMid90,
        adjustedTotalMax,
        isPrecon
      );

      return {
        ...r,
        boosterName,
        packCount: pCount,
        cardCount: cCount,
        marketPrice: adjustedTotalPrice,
        unitEvMin: adjustedUnitMin,
        unitEvAvg: adjustedUnitEv,
        unitEvMid90: adjustedUnitMid90,
        unitEvMax: adjustedUnitMax,
        totalEvMin: adjustedTotalMin,
        totalEvAvg: adjustedTotalEv,
        totalEvMid90: adjustedTotalMid90,
        totalEvMax: adjustedTotalMax,
        effectiveEv,
        evScore,
        profitUsd,
        roiPct,
      };
    });
  }, [records, priceMode, vendor, evBasis, boosterEvMap, recordByUuid, recordByUuidObj, preconDecks, singleCardPrices]);

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
          valA = a.marketPrice;
          valB = b.marketPrice;
        } else if (sortBy === 'boxEv') {
          valA = a.effectiveEv ?? a.totalEvAvg;
          valB = b.effectiveEv ?? b.totalEvAvg;
        } else if (sortBy === 'evScore') {
          valA = a.evScore ?? 0;
          valB = b.evScore ?? 0;
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

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortBy, sortOrder, evBasis]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRecords = useMemo(() => {
    const startIndex = (validPage - 1) * pageSize;
    return filteredRecords.slice(startIndex, startIndex + pageSize);
  }, [filteredRecords, validPage, pageSize]);

  // Derive Top 3 Best ROI and Top 3 Worst ROI from all products
  const sortedByRoi = useMemo(() => {
    return [...adjustedRecords].sort((a, b) => b.roiPct - a.roiPct);
  }, [adjustedRecords]);

  const top3BestRoi = sortedByRoi.slice(0, 3);
  const top3WorstRoi = [...sortedByRoi].reverse().slice(0, 3);

  // 24-hour rotating Pick of the Day (randomly changes every 24 hours based on UTC calendar day)
  const pickOfTheDay = useMemo(() => {
    if (adjustedRecords.length === 0) return null;

    // Filter candidate products that are solid sealed recommendations:
    // positive ROI, real market price (>= $10), and calculated EV > 0
    let candidates = adjustedRecords.filter(
      (r) => r.roiPct > 5 && r.marketPrice >= 10 && r.totalEvAvg > 0
    );

    if (candidates.length < 5) {
      candidates = adjustedRecords.filter((r) => r.roiPct > 0 && r.marketPrice > 0);
    }
    if (candidates.length === 0) {
      candidates = adjustedRecords;
    }

    // Sort deterministically so candidate order is invariant to current table filters/sorts
    const sortedCandidates = [...candidates].sort((a, b) =>
      (a.productUuid || a.boxName).localeCompare(b.productUuid || b.boxName)
    );

    // Hash based on UTC calendar day (increments every 24h at 00:00 UTC)
    const daySeed = Math.floor(Date.now() / 86400000);
    let hash = (daySeed ^ 0x5bf03635) * 2654435761;
    hash = (hash ^ (hash >>> 16)) * 2246822507;
    hash = hash ^ (hash >>> 13);
    const selectedIdx = Math.abs(hash) % sortedCandidates.length;

    return sortedCandidates[selectedIdx] || adjustedRecords[0];
  }, [adjustedRecords]);

  // Time remaining until the next 24-hour Pick of the Day rotation
  const hoursUntilRotation = useMemo(() => {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const hoursLeft = 23 - utcHours;
    const minutesLeft = 59 - utcMinutes;
    return `${hoursLeft}h ${minutesLeft}m`;
  }, []);

  const toggleSort = (field: 'roi' | 'profit' | 'boxPrice' | 'boxEv' | 'evScore' | 'packs' | 'cards') => {
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
                  productId={pickOfTheDay.productUuid || pickOfTheDay.id || `${pickOfTheDay.setCode}-${pickOfTheDay.boxName}`}
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
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1 bg-slate-800/70 px-2.5 py-1 rounded-full border border-slate-700/50">
                    <Clock className="w-3 h-3 text-amber-400" />
                    Rotates daily • Next in {hoursUntilRotation}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {pickOfTheDay.boxName}
                </h2>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-300">
                  <span>
                    Market Price: <span className="font-bold text-white">${pickOfTheDay.marketPrice.toFixed(2)}</span>
                  </span>
                  <span>•</span>
                  <span>
                    Expected Value ({pickOfTheDay.packCount > 0 ? `${pickOfTheDay.packCount} Packs` : 'Full Deck'}):{' '}
                    <span className="font-extrabold text-emerald-400">${(pickOfTheDay.effectiveEv ?? pickOfTheDay.totalEvAvg).toFixed(2)}</span>
                  </span>
                  {pickOfTheDay.evScore != null && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span>EV Score:</span>
                        <span
                          title={`EV Score: ${pickOfTheDay.evScore}/100. Estimated probability of singles value exceeding sealed cost.`}
                          className={`font-mono font-black text-xs px-2 py-0.5 rounded-full border ${getEvScoreDarkBadgeClass(pickOfTheDay.evScore)}`}
                        >
                          {pickOfTheDay.evScore}/100
                        </span>
                      </span>
                    </>
                  )}
                </div>
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
                onClick={() => onSelectSet(pickOfTheDay.setCode, pickOfTheDay.productUuid || pickOfTheDay.id)}
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

                    <div className="mt-2 text-[11px] text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Market:</span>
                        <span className="font-semibold text-slate-800">${item.marketPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expected EV:</span>
                        <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-slate-700'}`}>
                          ${(item.effectiveEv ?? item.totalEvAvg).toFixed(2)}
                        </span>
                      </div>
                      {item.evScore != null && (
                        <div className="flex justify-between items-center">
                          <span>EV Score:</span>
                          <span
                            title={`EV Score: ${item.evScore}/100. Chance of singles value exceeding sealed cost.`}
                            className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${getEvScoreBadgeClass(
                              item.evScore
                            )}`}
                          >
                            {item.evScore}/100
                          </span>
                        </div>
                      )}
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
                    onClick={() => onSelectSet(item.setCode, item.productUuid || item.id)}
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
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900">Products Overview</h3>
            <p className="text-xs text-slate-500">
              Showing {filteredRecords.length} sealed items • Page {currentPage} of {totalPages || 1}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Basis: <strong className="text-slate-900">{evBasis === 'min' ? 'Floor (Min)' : evBasis === 'mid90' ? 'Mid 90%' : evBasis === 'max' ? 'Ceiling (Max)' : 'Average (Mean)'}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs">
              Pricing: <strong className="text-slate-900">{priceMode === 'direct' ? 'Direct Set' : 'Cheapest Reprint (-18%)'}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs">
              Vendor: <strong className="text-slate-900 capitalize">{vendor.replace(/_/g, ' ')}</strong>
            </span>
            {pricingReliability[`${vendor}:${priceMode}`] && !vendor.startsWith('all_') && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs"
                title="Booster card-slot telemetry only; fixed products and decks are not included."
              >
                Reliability: <strong className="text-slate-900">
                  {priceMode === 'direct'
                    ? `${(pricingReliability[`${vendor}:${priceMode}`].directExactPct ?? 0).toFixed(1)}% exact`
                    : `${(pricingReliability[`${vendor}:${priceMode}`].reprintResolvedPct ?? 0).toFixed(1)}% resolved`}
                </strong>
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs"
              title={pipelineGeneratedAt ? `Pipeline run generated at ${pipelineGeneratedAt}` : 'Pipeline run identity unavailable'}
            >
              Run: <strong className="text-slate-900 font-mono">{pipelineRunId}</strong>
            </span>
          </div>
        </div>

        {/* Active EV Basis Notice Banner when non-average basis is selected */}
        {evBasis !== 'avg' && (
          <div
            id="arbitrage-ev-basis-alert"
            className={`px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b ${
              evBasis === 'max'
                ? 'bg-amber-500/10 text-amber-900 border-amber-500/20'
                : evBasis === 'min'
                ? 'bg-blue-500/10 text-blue-900 border-blue-500/20'
                : 'bg-slate-100 text-slate-800 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                {evBasis === 'max' ? (
                  <>
                    <strong>Active EV Basis: Ceiling (Max 5% / 99th Percentile).</strong> Values reflect extreme simulated upper bounds (e.g. hitting jackpot Masterpieces/foils across packs), not mean expected return.
                  </>
                ) : evBasis === 'min' ? (
                  <>
                    <strong>Active EV Basis: Floor (Min 5% / 1st Percentile).</strong> Values reflect worst-case simulated collation floors.
                  </>
                ) : (
                  <>
                    <strong>Active EV Basis: Mid 90% (Trimmed Median).</strong> Values reflect the 5th-95th percentile trimmed mean.
                  </>
                )}
              </span>
            </div>
            <button
              onClick={() => setEvBasis('avg')}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-lg border border-slate-200 shadow-2xs cursor-pointer text-[11px] self-start sm:self-auto shrink-0 transition"
            >
              Reset to Mean (Avg)
            </button>
          </div>
        )}

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
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900 font-bold"
                  onClick={() => toggleSort('boxEv')}
                  title={`Estimated EV based on active Calc Basis (${
                    evBasis === 'min'
                      ? 'Min EV Floor'
                      : evBasis === 'mid90'
                      ? 'Mid 90% EV'
                      : evBasis === 'max'
                      ? 'Max EV Ceiling'
                      : 'Average EV Mean'
                  }). Click to sort.`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Estimated EV</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-900 text-white shadow-xs">
                      {evBasis === 'min' ? 'Floor' : evBasis === 'mid90' ? 'Mid 90%' : evBasis === 'max' ? 'Ceiling' : 'Avg'}
                    </span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('profit')}
                  title="Net Profit/Loss calculated as (Estimated EV - Live Market Price). Click to sort."
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Profit / Loss</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('roi')}
                >
                  <div className="flex items-center justify-end gap-1">
                    ROI %
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-slate-900"
                  onClick={() => toggleSort('evScore')}
                  title="EV Score (0 - 100): Statistical probability or value-retention ratio of opening singles >= sealed market price. Click to sort."
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>EV Score</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center text-slate-500">
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
                paginatedRecords.map((box, i) => {
                const isPositive = box.profitUsd > 0;
                return (
                  <tr
                    key={box.productUuid || i}
                    id={`arbitrage-row-${box.setCode}-${box.boosterName}`}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="py-3.5 px-4 font-medium text-slate-900 flex items-center gap-2">
                      {getCategoryIcon(box.category, box.boxName)}
                      <span>{box.boxName}</span>
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
                      ${box.marketPrice.toFixed(2)}
                    </td>
                    <td
                      className="py-3.5 px-3 text-right font-mono font-bold text-slate-900"
                      title={`Range: Floor: $${(box.totalEvMin ?? 0).toFixed(2)} | Mid 90%: $${box.totalEvMid90.toFixed(2)} | Avg: $${box.totalEvAvg.toFixed(2)} | Ceiling: $${(box.totalEvMax ?? 0).toFixed(2)}`}
                    >
                      ${(box.effectiveEv ?? box.totalEvAvg).toFixed(2)}
                    </td>
                    <td
                      className={`py-3.5 px-3 text-right font-mono font-bold ${
                        isPositive ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isPositive ? `+$${box.profitUsd.toFixed(2)}` : `-$${Math.abs(box.profitUsd).toFixed(2)}`}
                    </td>
                    <td className="py-3.5 px-3 text-right">
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
                    <td className="py-3.5 px-3 text-center">
                      {box.evScore != null ? (
                        <span
                          title={`EV Score: ${box.evScore}/100. Probability of opening singles value >= sealed price.`}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold font-mono border ${getEvScoreBadgeClass(
                            box.evScore
                          )}`}
                        >
                          {box.evScore}/100
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        id={`btn-explore-set-${box.setCode}`}
                        onClick={() => onSelectSet(box.setCode, box.productUuid || box.id)}
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

        {/* High Performance Responsive Pagination Footer */}
        {filteredRecords.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                Showing <strong className="text-slate-900 font-mono font-semibold">{(validPage - 1) * pageSize + 1}</strong> to{' '}
                <strong className="text-slate-900 font-mono font-semibold">
                  {Math.min(validPage * pageSize, filteredRecords.length).toLocaleString()}
                </strong>{' '}
                of <strong className="text-slate-900 font-mono font-semibold">{filteredRecords.length.toLocaleString()}</strong> products
              </span>

              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                <span className="text-slate-500 text-[11px]">Per page:</span>
                <select
                  id="pagination-page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  id="pagination-prev-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition shadow-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - validPage) <= 2)
                    .reduce((acc: (number | string)[], p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                        acc.push('...');
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((pageItem, idx) => {
                      if (typeof pageItem === 'string') {
                        return (
                          <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400">
                            ...
                          </span>
                        );
                      }
                      const isCur = pageItem === validPage;
                      return (
                        <button
                          key={pageItem}
                          id={`pagination-page-${pageItem}-btn`}
                          onClick={() => setCurrentPage(pageItem)}
                          className={`w-8 h-8 rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center justify-center ${
                            isCur
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-xs'
                          }`}
                        >
                          {pageItem}
                        </button>
                      );
                    })}
                </div>

                <button
                  id="pagination-next-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition shadow-xs"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
