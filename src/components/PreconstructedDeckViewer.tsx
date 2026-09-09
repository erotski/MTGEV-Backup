import React, { useState, useEffect, useMemo } from 'react';
import { PreconstructedDeckDetail, DeckCardItem } from '../types';
import { ManaCostRenderer } from './ManaCostRenderer';
import { dataService } from '../services/dataService';
import { PRECON_DECK_DETAILS } from '../services/chaseCardsService';
import { findMatchingPreconDeck } from '../utils/productUtils';
import {
  Layers3,
  Sparkles,
  ShieldCheck,
  Search,
  ArrowUpDown,
  ExternalLink,
  Package,
  CheckCircle2,
  DollarSign,
  Crown,
  LayoutGrid,
  ListFilter,
  Layers,
  Sparkle,
  Flame,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

interface PreconstructedDeckViewerProps {
  productId: string;
  productName: string;
  setCode: string;
  marketPrice: number;
  estimatedEv: number;
  className?: string;
  preconDecks?: Record<string, PreconstructedDeckDetail>;
  deckDetail?: PreconstructedDeckDetail;
}

export const PreconstructedDeckViewer: React.FC<PreconstructedDeckViewerProps> = ({
  productId,
  productName,
  setCode,
  marketPrice,
  estimatedEv,
  className = '',
  preconDecks,
  deckDetail: propDeckDetail,
}) => {
  const [allDecks, setAllDecks] = useState<Record<string, PreconstructedDeckDetail> | null>(
    preconDecks || null
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    !propDeckDetail && !preconDecks
  );

  // Grouping & Display States
  const [groupBy, setGroupBy] = useState<'type' | 'rarity' | 'flat'>('type');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [cmcFilter, setCmcFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<
    'price_desc' | 'price_asc' | 'total_ev_desc' | 'name_asc' | 'cmc_desc' | 'cmc_asc' | 'rarity' | 'commander'
  >('total_ev_desc');
  const [vendorMode, setVendorMode] = useState<'all' | 'tcgplayer' | 'cardmarket' | 'cardkingdom'>('all');
  const [previewCard, setPreviewCard] = useState<DeckCardItem | null>(null);

  // Load precon decks json via dataService (cached & deduplicated)
  useEffect(() => {
    if (propDeckDetail && propDeckDetail.cards && propDeckDetail.cards.length > 0) {
      setIsLoading(false);
      return;
    }

    if (preconDecks && Object.keys(preconDecks).length > 0) {
      setAllDecks(preconDecks);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    dataService
      .getPreconDecks()
      .then((data: Record<string, PreconstructedDeckDetail>) => {
        if (isMounted) {
          setAllDecks(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Could not load precon_decks:', err);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [propDeckDetail, preconDecks]);

  // Match the deck for this product
  const deckDetail: PreconstructedDeckDetail = useMemo(() => {
    // 0. If directly passed via prop, use it immediately
    if (propDeckDetail && propDeckDetail.cards && propDeckDetail.cards.length > 0) {
      return propDeckDetail;
    }

    const cleanId = (productId || '').toLowerCase().trim();
    const cleanName = (productName || '').toLowerCase().trim();
    const cleanSet = (setCode || '').toUpperCase().trim();

    // 1. Synchronous bundled decks (instant, 0ms latency)
    if (PRECON_DECK_DETAILS[cleanId]) return PRECON_DECK_DETAILS[cleanId];
    if (PRECON_DECK_DETAILS[productId]) return PRECON_DECK_DETAILS[productId];
    if (PRECON_DECK_DETAILS[cleanName]) return PRECON_DECK_DETAILS[cleanName];
    if (PRECON_DECK_DETAILS[productName]) return PRECON_DECK_DETAILS[productName];

    for (const d of Object.values(PRECON_DECK_DETAILS)) {
      if (d.deckName) {
        const dNameLower = d.deckName.toLowerCase().trim();
        if (
          dNameLower === cleanName ||
          cleanName.includes(dNameLower) ||
          dNameLower.includes(cleanName)
        ) {
          return d;
        }
      }
    }

    const availableDecks = preconDecks || allDecks;
    if (availableDecks) {
      const matched = findMatchingPreconDeck(availableDecks, productName, setCode, productId);
      if (matched) return matched;
    }

    const fallbackMatched = findMatchingPreconDeck(PRECON_DECK_DETAILS, productName, setCode, productId);
    if (fallbackMatched) return fallbackMatched;

    const isCommanderProduct = Boolean(
      (cleanName.includes('commander deck') ||
        cleanName.includes('edh') ||
        (cleanName.includes('commander') && !cleanName.includes('unsanctioned')) ||
        cleanId.includes('commander')) &&
      !cleanName.includes('clash') &&
      !cleanName.includes('intro') &&
      !cleanName.includes('game night')
    );

    // Default synthesized precon deck structure if not in prebuilt json
    return {
      deckName: productName || (isCommanderProduct ? 'Preconstructed Commander Deck' : 'Preconstructed Deck'),
      setCode: setCode || 'MTG',
      theme: isCommanderProduct
        ? 'Factory-Sealed 100-Card Ready-to-Play Commander Deck'
        : 'Factory-Sealed Ready-to-Play Preconstructed Deck',
      cardCount: isCommanderProduct ? 100 : 60,
      totalSinglesEv: estimatedEv || marketPrice * 1.15 || 0,
      commander: undefined,
      colors: [],
      cards: [],
      keyCards: [],
      isCommander: isCommanderProduct,
    };
  }, [allDecks, preconDecks, propDeckDetail, productId, productName, setCode, estimatedEv, marketPrice]);

  // All cards array with normalized isCommander flag
  const rawCards: DeckCardItem[] = useMemo(() => {
    let list: DeckCardItem[] = [];
    if (deckDetail.cards && deckDetail.cards.length > 0) {
      list = deckDetail.cards;
    } else if (deckDetail.keyCards && deckDetail.keyCards.length > 0) {
      list = deckDetail.keyCards;
    }

    const commanderName =
      deckDetail.commander?.name && deckDetail.commander.name.toLowerCase().trim() !== 'face commander'
        ? deckDetail.commander.name.toLowerCase().trim()
        : null;

    return list.map((c) => {
      const isCardCmd = Boolean(
        c.isCommander ||
        (c as any).commander ||
        (commanderName && c.name.toLowerCase().trim() === commanderName)
      );
      return isCardCmd ? { ...c, isCommander: true } : c;
    });
  }, [deckDetail]);

  // Determine if a genuine commander card exists
  const commanderCard: DeckCardItem | null = useMemo(() => {
    // 1. Look for card with isCommander in rawCards (excluding generic dummy 'Face Commander')
    const fromCards = rawCards.find(
      (c) => c.isCommander && c.name.toLowerCase().trim() !== 'face commander'
    );
    if (fromCards) return fromCards;

    // 2. Check deckDetail.commander if it's a genuine card
    if (
      deckDetail.commander &&
      deckDetail.commander.name &&
      deckDetail.commander.name.toLowerCase().trim() !== 'face commander' &&
      deckDetail.commander.name.trim() !== ''
    ) {
      const matched = rawCards.find(
        (c) => c.name.toLowerCase().trim() === deckDetail.commander!.name.toLowerCase().trim()
      );
      if (matched) {
        return { ...matched, isCommander: true };
      }
      return {
        name: deckDetail.commander.name,
        count: 1,
        rarity: (deckDetail.commander.rarity as any) || 'mythic',
        type: deckDetail.commander.type || 'Legendary Creature',
        primaryType: 'Creature',
        manaCost: deckDetail.commander.manaCost || '',
        price: deckDetail.commander.price || 0,
        imageUrl: deckDetail.commander.imageUrl,
        text: deckDetail.commander.text,
        foil: true,
        isCommander: true,
      };
    }

    return null;
  }, [rawCards, deckDetail.commander]);

  const hasCommanderCard = Boolean(commanderCard);

  // Helper to compute unit card price dynamically based on vendorMode
  const getCardPrice = (c?: DeckCardItem | null): number => {
    if (!c) return 0;
    if (vendorMode === 'cardkingdom' && c.prices?.cardkingdom) return c.prices.cardkingdom;
    if (vendorMode === 'cardmarket' && c.prices?.cardmarket) return c.prices.cardmarket;
    if (vendorMode === 'tcgplayer' && (c.prices?.tcgplayer || c.price)) return c.prices?.tcgplayer || c.price;
    if (vendorMode === 'all') {
      if (c.prices?.all) return c.prices.all;
      const vals: number[] = [];
      if (c.prices?.tcgplayer || c.price) vals.push(c.prices?.tcgplayer || c.price);
      if (c.prices?.cardmarket) vals.push(c.prices.cardmarket);
      if (c.prices?.cardkingdom) vals.push(c.prices.cardkingdom);
      if (vals.length > 0) {
        return vals.reduce((sum, v) => sum + v, 0) / vals.length;
      }
    }
    return c.price || 0;
  };

  // Total calculated EV of currently displayed cards based on selected vendor mode
  const currentEvTotal = useMemo(() => {
    return rawCards.reduce((sum, c) => sum + getCardPrice(c) * (c.count || 1), 0);
  }, [rawCards, vendorMode]);

  // Total quantity of cards in deck (accounting for multiple basic lands)
  const totalCardsInDeck = useMemo(() => {
    return rawCards.reduce((sum, c) => sum + (c.count || 1), 0);
  }, [rawCards]);

  // Filtered & Sorted Cards
  const processedCards = useMemo(() => {
    return rawCards
      .filter((card) => {
        // Search Filter
        const matchesSearch =
          card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (card.type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (card.manaCost && card.manaCost.toLowerCase().includes(searchTerm.toLowerCase()));

        // Rarity Filter
        const matchesRarity =
          rarityFilter === 'all' || (card.rarity || '').toLowerCase() === rarityFilter.toLowerCase();

        // Card Type Filter
        const matchesType =
          typeFilter === 'all' ||
          (card.primaryType && card.primaryType.toLowerCase() === typeFilter.toLowerCase()) ||
          (card.type || '').toLowerCase().includes(typeFilter.toLowerCase());

        // Mana Value (CMC) Filter
        const mv = card.manaValue ?? 0;
        let matchesCmc = true;
        if (cmcFilter === '0') matchesCmc = mv === 0;
        else if (cmcFilter === '1') matchesCmc = mv === 1;
        else if (cmcFilter === '2') matchesCmc = mv === 2;
        else if (cmcFilter === '3') matchesCmc = mv === 3;
        else if (cmcFilter === '4') matchesCmc = mv === 4;
        else if (cmcFilter === '5') matchesCmc = mv === 5;
        else if (cmcFilter === '6+') matchesCmc = mv >= 6;

        // Color Identity Filter
        let matchesColor = true;
        const cost = card.manaCost || '';
        if (colorFilter === 'colorless') {
          matchesColor = !cost.includes('W') && !cost.includes('U') && !cost.includes('B') && !cost.includes('R') && !cost.includes('G');
        } else if (colorFilter === 'multi') {
          const colors = ['W', 'U', 'B', 'R', 'G'].filter((c) => cost.includes(c));
          matchesColor = colors.length > 1;
        } else if (colorFilter !== 'all') {
          matchesColor = cost.toUpperCase().includes(colorFilter.toUpperCase());
        }

        return matchesSearch && matchesRarity && matchesType && matchesCmc && matchesColor;
      })
      .sort((a, b) => {
        const aUnitPrice = getCardPrice(a);
        const bUnitPrice = getCardPrice(b);
        const aTotalVal = aUnitPrice * (a.count || 1);
        const bTotalVal = bUnitPrice * (b.count || 1);

        if (sortBy === 'commander') {
          if (a.isCommander && !b.isCommander) return -1;
          if (!a.isCommander && b.isCommander) return 1;
          return bTotalVal - aTotalVal;
        }
        if (sortBy === 'total_ev_desc') return bTotalVal - aTotalVal;
        if (sortBy === 'price_desc') return bUnitPrice - aUnitPrice;
        if (sortBy === 'price_asc') return aUnitPrice - bUnitPrice;
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'cmc_desc') return (b.manaValue || 0) - (a.manaValue || 0);
        if (sortBy === 'cmc_asc') return (a.manaValue || 0) - (b.manaValue || 0);
        if (sortBy === 'rarity') {
          const rWeight: Record<string, number> = { mythic: 4, rare: 3, uncommon: 2, common: 1, land: 0 };
          return (rWeight[(b.rarity || '').toLowerCase()] || 0) - (rWeight[(a.rarity || '').toLowerCase()] || 0);
        }
        return 0;
      });
  }, [rawCards, searchTerm, rarityFilter, typeFilter, cmcFilter, colorFilter, sortBy, vendorMode]);

  // Grouped by Type
  const cardsGroupedByType = useMemo(() => {
    const groups: Record<string, { count: number; ev: number; cards: DeckCardItem[] }> = {};
    const typeOrder = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Other', 'Land'];

    typeOrder.forEach((t) => {
      groups[t] = { count: 0, ev: 0, cards: [] };
    });

    const normalizeGroupType = (typeStr: string): string => {
      const t = (typeStr || 'Other').toLowerCase().trim();
      if (t.includes('creature')) return 'Creature';
      if (t.includes('instant')) return 'Instant';
      if (t.includes('sorcery')) return 'Sorcery';
      if (t.includes('enchantment')) return 'Enchantment';
      if (t.includes('artifact')) return 'Artifact';
      if (t.includes('planeswalker')) return 'Planeswalker';
      if (t.includes('land')) return 'Land';
      return 'Other';
    };

    processedCards.forEach((c) => {
      const rawType = c.primaryType || c.type || 'Other';
      const pType = normalizeGroupType(rawType);
      if (!groups[pType]) {
        groups[pType] = { count: 0, ev: 0, cards: [] };
      }
      const qty = c.count || 1;
      groups[pType].count += qty;
      groups[pType].ev += getCardPrice(c) * qty;
      groups[pType].cards.push(c);
    });

    // Sort by typeOrder custom order
    return Object.entries(groups)
      .filter(([_, data]) => data.cards.length > 0)
      .sort((a, b) => typeOrder.indexOf(a[0]) - typeOrder.indexOf(b[0]));
  }, [processedCards, vendorMode]);

  // Grouped by Rarity
  const cardsGroupedByRarity = useMemo(() => {
    const groups: Record<string, { count: number; ev: number; cards: DeckCardItem[] }> = {
      mythic: { count: 0, ev: 0, cards: [] },
      rare: { count: 0, ev: 0, cards: [] },
      uncommon: { count: 0, ev: 0, cards: [] },
      common: { count: 0, ev: 0, cards: [] },
    };

    processedCards.forEach((c) => {
      const r = (c.rarity || 'common').toLowerCase();
      if (!groups[r]) {
        groups[r] = { count: 0, ev: 0, cards: [] };
      }
      const qty = c.count || 1;
      groups[r].count += qty;
      groups[r].ev += getCardPrice(c) * qty;
      groups[r].cards.push(c);
    });

    const rarityOrder = ['mythic', 'rare', 'uncommon', 'common'];
    return rarityOrder
      .map((r) => [r, groups[r]] as [string, { count: number; ev: number; cards: DeckCardItem[] }])
      .filter(([_, data]) => data && data.cards.length > 0);
  }, [processedCards, vendorMode]);

  const netProfit = Number((currentEvTotal - marketPrice).toFixed(2));
  const netRoi = marketPrice > 0 ? Number(((netProfit / marketPrice) * 100).toFixed(1)) : 0;

  // Processed cards total count (accounting for multiple basic lands)
  const processedCardsTotalCount = useMemo(() => {
    return processedCards.reduce((sum, c) => sum + (c.count || 1), 0);
  }, [processedCards]);

  if (isLoading) {
    return (
      <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[320px] text-white ${className}`}>
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-3" />
        <h4 className="text-base font-bold text-white">Loading Complete Decklist...</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          Retrieving complete card collation, live singles valuation, and card hierarchy.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-6 ${className}`}>
      {/* Header Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded shadow-2xs">
              Preconstructed Product
            </span>
            <span className="text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              100% Guaranteed Card Contents (No RNG)
            </span>
          </div>
          <h4 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <Layers3 className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{deckDetail.deckName}</span>
          </h4>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            {deckDetail.theme || `Complete ${deckDetail.cardCount || totalCardsInDeck || processedCardsTotalCount}-card factory-sealed decklist with live singles pricing, mana collation, and rarity breakdown.`}
          </p>
        </div>

        {/* Financial Stat Pills */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono shrink-0">
          {marketPrice > 0 ? (
            <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 text-right">
              <span className="text-slate-400 block text-[10px]">Market Price</span>
              <span className="font-black text-white text-sm">${marketPrice.toFixed(2)}</span>
            </div>
          ) : (
            <div className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-right">
              <span className="text-slate-400 block text-[10px]">Market Price</span>
              <span className="font-semibold text-slate-300 text-sm">N/A (Sub-deck)</span>
            </div>
          )}

          <div className="bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-400/30 text-right">
            <span className="text-emerald-300 block text-[10px]">
              {vendorMode === 'all' ? 'All Vendors Avg EV' : `${vendorMode.toUpperCase()} Total EV`}
            </span>
            <span className="font-black text-emerald-300 text-sm">
              ${currentEvTotal.toFixed(2)}
            </span>
          </div>

          {marketPrice > 0 ? (
            <div
              className={`px-3 py-1.5 rounded-xl border text-right ${
                netProfit >= 0
                  ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                  : 'bg-rose-500/20 border-rose-400/30 text-rose-300'
              }`}
            >
              <span className="text-[10px] block opacity-80">Net Margin</span>
              <span className="font-black text-sm">
                {netProfit >= 0 ? `+${netRoi}% (+$${netProfit})` : `${netRoi}% ($${netProfit})`}
              </span>
            </div>
          ) : (
            <div className="bg-indigo-500/10 border border-indigo-400/20 px-3 py-1.5 rounded-xl text-right text-indigo-300">
              <span className="text-[10px] block opacity-80">Margin Status</span>
              <span className="font-bold text-sm">Included Component</span>
            </div>
          )}
        </div>
      </div>

      {/* Commander Spotlight - rendered only if the commander card exists */}
      {hasCommanderCard && commanderCard && (
        <div className="px-6">
          <div className="max-w-md bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white p-4 rounded-2xl border border-indigo-900/60 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Guaranteed Face Commander
                </span>
                <span className="text-xs font-mono text-amber-300 font-black">
                  ${getCardPrice(commanderCard).toFixed(2)}
                </span>
              </div>

              {commanderCard.imageUrl ? (
                <div className="aspect-[5/7] w-full max-w-[240px] mx-auto rounded-xl overflow-hidden bg-slate-900 relative mb-3.5 border border-indigo-500/30 shadow-xl group">
                  <img
                    src={commanderCard.imageUrl}
                    alt={commanderCard.name}
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="aspect-[5/7] w-full max-w-[240px] mx-auto rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center p-4 text-center mb-3.5">
                  <Crown className="w-10 h-10 text-amber-400 mb-2" />
                  <span className="text-sm font-bold text-white">{commanderCard.name}</span>
                  <span className="text-xs text-indigo-300 mt-1 font-mono">{commanderCard.type}</span>
                </div>
              )}

              <div className="font-black text-base text-white mb-0.5 flex items-center justify-between gap-2">
                <span className="truncate">{commanderCard.name}</span>
                {commanderCard.manaCost && (
                  <ManaCostRenderer manaCost={commanderCard.manaCost} size="md" />
                )}
              </div>
              <div className="text-xs text-indigo-300 font-mono mb-2">
                {commanderCard.type}
              </div>
              {commanderCard.text && (
                <p className="text-[11px] text-slate-300 line-clamp-4 leading-relaxed bg-black/40 p-2.5 rounded-lg border border-white/10">
                  {commanderCard.text}
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300 font-mono">
              <span className="text-amber-300 font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Foil-Etched Display Card
              </span>
              <span className="text-emerald-400 font-bold">100% Guaranteed</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Controls Bar: Group By, View Mode, Search, Filters, Vendor */}
      <div className="px-6 pt-3 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
          {/* Left: Grouping Mode Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-600 font-mono uppercase mr-1">
              Group By:
            </span>
            <button
              onClick={() => setGroupBy('type')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                groupBy === 'type'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Card Type</span>
            </button>
            <button
              onClick={() => setGroupBy('rarity')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                groupBy === 'rarity'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Sparkle className="w-3.5 h-3.5" />
              <span>Rarity</span>
            </button>
            <button
              onClick={() => setGroupBy('flat')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                groupBy === 'flat'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>All {totalCardsInDeck || 60} Cards</span>
            </button>
          </div>

          {/* Right: Search, Filter, Sort, Vendor, View Layout */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cards or mana..."
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-indigo-600 w-32 sm:w-44 shadow-2xs"
              />
            </div>

            {/* Mana Value (CMC) Filter */}
            <select
              value={cmcFilter}
              onChange={(e) => setCmcFilter(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium cursor-pointer shadow-2xs"
              title="Filter by Mana Value / CMC"
            >
              <option value="all">All Mana Values</option>
              <option value="0">0 CMC / Lands</option>
              <option value="1">1 CMC</option>
              <option value="2">2 CMC</option>
              <option value="3">3 CMC</option>
              <option value="4">4 CMC</option>
              <option value="5">5 CMC</option>
              <option value="6+">6+ CMC</option>
            </select>

            {/* Color Identity Filter */}
            <select
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium cursor-pointer shadow-2xs"
              title="Filter by Color"
            >
              <option value="all">All Colors</option>
              <option value="W">White (W)</option>
              <option value="U">Blue (U)</option>
              <option value="B">Black (B)</option>
              <option value="R">Red (R)</option>
              <option value="G">Green (G)</option>
              <option value="multi">Multicolor</option>
              <option value="colorless">Colorless</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium cursor-pointer shadow-2xs"
            >
              <option value="all">All Types</option>
              <option value="creature">Creatures</option>
              <option value="instant">Instants</option>
              <option value="sorcery">Sorceries</option>
              <option value="artifact">Artifacts</option>
              <option value="enchantment">Enchantments</option>
              <option value="planeswalker">Planeswalkers</option>
              <option value="land">Lands</option>
            </select>

            {/* Rarity Filter */}
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium cursor-pointer shadow-2xs"
            >
              <option value="all">All Rarities</option>
              <option value="mythic">Mythic Rares</option>
              <option value="rare">Rares</option>
              <option value="uncommon">Uncommons</option>
              <option value="common">Commons</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium cursor-pointer shadow-2xs"
            >
              <option value="total_ev_desc">Total Value: High to Low</option>
              <option value="price_desc">Unit Price: High to Low</option>
              <option value="price_asc">Unit Price: Low to High</option>
              <option value="commander">Commander Card First</option>
              <option value="name_asc">Name: A to Z</option>
              <option value="cmc_desc">Mana Cost: High to Low</option>
              <option value="cmc_asc">Mana Cost: Low to High</option>
              <option value="rarity">Rarity (Mythic First)</option>
            </select>

            {/* Vendor Price Mode with All Vendors Option */}
            <select
              value={vendorMode}
              onChange={(e) => setVendorMode(e.target.value as any)}
              className="px-2 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold cursor-pointer shadow-2xs"
            >
              <option value="all">All Vendors (Average $)</option>
              <option value="tcgplayer">TCGplayer ($)</option>
              <option value="cardmarket">Cardmarket (€ / $)</option>
              <option value="cardkingdom">Card Kingdom ($)</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Table View"
              >
                <ListFilter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Visual Card Grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Counter Banner */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-mono">
          <span>
            Showing <strong className="text-slate-900">{processedCardsTotalCount}</strong> cards ({processedCards.length} unique entries) of{' '}
            <strong className="text-slate-900">{totalCardsInDeck}</strong> total cards
          </span>
          <span>
            {vendorMode === 'all' ? 'All Vendors Avg Subset EV: ' : 'Subset EV: '}
            <strong className="text-indigo-600 font-black">
              $
              {processedCards
                .reduce((sum, c) => sum + getCardPrice(c) * (c.count || 1), 0)
                .toFixed(2)}
            </strong>
          </span>
        </div>
      </div>

      {/* Main Card Content Display */}
      <div className="px-6 pb-6 space-y-6">
        {/* GROUPED BY CARD TYPE */}
        {groupBy === 'type' && (
          <div className="space-y-6">
            {cardsGroupedByType.map(([typeTitle, groupData]) => (
              <div
                key={typeTitle}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Group Header */}
                <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black uppercase text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-300">
                      {typeTitle}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      ({groupData.count} {groupData.count === 1 ? 'Card' : 'Cards'})
                    </span>
                  </div>
                  <div className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    Group EV: ${groupData.ev.toFixed(2)}
                  </div>
                </div>

                {/* Group Content */}
                {viewMode === 'table' ? (
                  <DeckTableSection
                    cards={groupData.cards}
                    vendorMode={vendorMode}
                    getCardPrice={getCardPrice}
                    onPreview={setPreviewCard}
                  />
                ) : (
                  <DeckGridSection
                    cards={groupData.cards}
                    getCardPrice={getCardPrice}
                    onPreview={setPreviewCard}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* GROUPED BY RARITY */}
        {groupBy === 'rarity' && (
          <div className="space-y-6">
            {cardsGroupedByRarity.map(([rarityName, groupData]) => (
              <div
                key={rarityName}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Group Header */}
                <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xs font-black uppercase px-2.5 py-1 rounded-lg border ${
                        rarityName === 'mythic'
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : rarityName === 'rare'
                          ? 'bg-yellow-50 text-yellow-800 border-yellow-300'
                          : rarityName === 'uncommon'
                          ? 'bg-slate-200 text-slate-800 border-slate-300'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {rarityName}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      ({groupData.count} {groupData.count === 1 ? 'Card' : 'Cards'})
                    </span>
                  </div>
                  <div className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    Group EV: ${groupData.ev.toFixed(2)}
                  </div>
                </div>

                {/* Group Content */}
                {viewMode === 'table' ? (
                  <DeckTableSection
                    cards={groupData.cards}
                    vendorMode={vendorMode}
                    getCardPrice={getCardPrice}
                    onPreview={setPreviewCard}
                  />
                ) : (
                  <DeckGridSection
                    cards={groupData.cards}
                    getCardPrice={getCardPrice}
                    onPreview={setPreviewCard}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* FLAT LIST / ALL CARDS */}
        {groupBy === 'flat' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {viewMode === 'table' ? (
              <DeckTableSection
                cards={processedCards}
                vendorMode={vendorMode}
                getCardPrice={getCardPrice}
                onPreview={setPreviewCard}
              />
            ) : (
              <DeckGridSection
                cards={processedCards}
                getCardPrice={getCardPrice}
                onPreview={setPreviewCard}
              />
            )}
          </div>
        )}
      </div>

      {/* Card Visual Preview Modal */}
      {previewCard && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewCard(null)}
        >
          <div
            className="bg-slate-900 text-white rounded-2xl max-w-sm w-full p-4 border border-slate-700 shadow-2xl overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <span className="font-bold text-sm truncate">{previewCard.name}</span>
              <button
                onClick={() => setPreviewCard(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {(() => {
              const setCodeVal = (previewCard.set || deckDetail.setCode || setCode || '').toLowerCase().trim();
              const numVal = String(previewCard.number || '').trim();
              const exactPrintUrl = (setCodeVal && numVal)
                ? `https://api.scryfall.com/cards/${setCodeVal}/${numVal}?format=image`
                : previewCard.imageUrl;

              return exactPrintUrl ? (
                <img
                  src={exactPrintUrl}
                  alt={previewCard.name}
                  className="w-full rounded-xl shadow-lg mb-3"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="aspect-[5/7] bg-slate-800 rounded-xl flex items-center justify-center mb-3 text-slate-500 font-mono text-xs">
                  No Image Available
                </div>
              );
            })()}

            <div className="flex items-center justify-between text-xs font-mono pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">{previewCard.type}</span>
                {previewCard.manaCost && (
                  <ManaCostRenderer manaCost={previewCard.manaCost} size="sm" />
                )}
              </div>
              <div className="text-right">
                <span className="font-black text-amber-400 text-sm block">
                  ${(getCardPrice(previewCard) * (previewCard.count || 1)).toFixed(2)}
                </span>
                {(previewCard.count || 1) > 1 && (
                  <span className="text-[10px] text-slate-400 font-normal">
                    {previewCard.count}x @ ${getCardPrice(previewCard).toFixed(2)} ea
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Full Table Subcomponent with Mana Cost column
interface TableSectionProps {
  cards: DeckCardItem[];
  vendorMode: 'all' | 'tcgplayer' | 'cardmarket' | 'cardkingdom';
  getCardPrice: (card: DeckCardItem) => number;
  onPreview: (card: DeckCardItem) => void;
}

const DeckTableSection: React.FC<TableSectionProps> = ({ cards, vendorMode, getCardPrice, onPreview }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-900 text-white font-mono uppercase text-[10px]">
          <tr>
            <th className="py-2.5 px-3">Card Name</th>
            <th className="py-2.5 px-3 text-center">Mana Cost</th>
            <th className="py-2.5 px-3">Type Line</th>
            <th className="py-2.5 px-3">Rarity</th>
            <th className="py-2.5 px-3 text-center">Finish</th>
            <th className="py-2.5 px-3 text-center">Qty</th>
            <th className="py-2.5 px-3 text-right">
              {vendorMode === 'all'
                ? 'Avg Unit Price'
                : vendorMode === 'cardmarket'
                ? 'Cardmarket Price'
                : vendorMode === 'cardkingdom'
                ? 'Card Kingdom'
                : 'Unit Price'}
            </th>
            <th className="py-2.5 px-3 text-right font-bold text-emerald-300">
              Total EV
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {cards.map((card, idx) => {
            const unitVal = getCardPrice(card);
            const qty = card.count || 1;
            const totalVal = unitVal * qty;

            return (
              <tr
                key={idx}
                onClick={() => onPreview(card)}
                className="hover:bg-indigo-50/40 transition cursor-pointer group"
              >
                <td className="py-2 px-3 font-semibold text-slate-900 flex items-center gap-2">
                  {card.isCommander && (
                    <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Face Commander" />
                  )}
                  <span className="group-hover:text-indigo-600 transition truncate max-w-xs">
                    {card.name}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  <ManaCostRenderer manaCost={card.manaCost} size="sm" />
                </td>
                <td className="py-2 px-3 text-slate-500 font-mono text-[11px] truncate max-w-[180px]">
                  {card.type}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                      card.rarity === 'mythic'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : card.rarity === 'rare'
                        ? 'bg-yellow-50 text-yellow-800 border-yellow-300'
                        : card.rarity === 'uncommon'
                        ? 'bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {card.rarity}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  {card.treatment ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm">
                      {card.treatment}
                    </span>
                  ) : card.foil || card.isCommander ? (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Foil
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[10px]">Nonfoil</span>
                  )}
                </td>
                <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                  <span className={qty > 1 ? 'bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px] font-black' : ''}>
                    {qty}x
                  </span>
                </td>
                <td className="py-2 px-3 text-right font-mono font-medium text-slate-600">
                  ${unitVal.toFixed(2)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-black text-emerald-600 text-xs">
                  ${totalVal.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Visual Grid Subcomponent with Mana Cost & Qty Badges
interface GridSectionProps {
  cards: DeckCardItem[];
  getCardPrice: (card: DeckCardItem) => number;
  onPreview: (card: DeckCardItem) => void;
}

const DeckGridSection: React.FC<GridSectionProps> = ({ cards, getCardPrice, onPreview }) => {
  return (
    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {cards.map((card, idx) => {
        const unitVal = getCardPrice(card);
        const qty = card.count || 1;
        const totalVal = unitVal * qty;

        return (
          <div
            key={idx}
            onClick={() => onPreview(card)}
            className="bg-slate-50 hover:bg-white rounded-xl border border-slate-200 hover:border-indigo-300 p-2 text-xs flex flex-col justify-between transition cursor-pointer hover:shadow-md group"
          >
            {card.imageUrl ? (
              <div className="aspect-[5/7] rounded-lg overflow-hidden bg-slate-900 mb-2 border border-slate-200 relative">
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {card.isCommander && (
                  <span className="absolute top-1.5 left-1.5 bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow flex items-center gap-1 font-mono">
                    <Crown className="w-2.5 h-2.5 text-slate-950" />
                    CMD
                  </span>
                )}
                {qty > 1 && (
                  <span className="absolute top-1.5 right-1.5 bg-indigo-900/90 backdrop-blur-xs text-white text-[10px] font-mono font-black px-1.5 py-0.5 rounded shadow">
                    {qty}x
                  </span>
                )}
              </div>
            ) : (
              <div className="aspect-[5/7] rounded-lg bg-slate-800 text-white flex flex-col items-center justify-center p-2 text-center mb-2 relative">
                {card.isCommander && (
                  <span className="absolute top-1.5 left-1.5 bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow flex items-center gap-1 font-mono">
                    <Crown className="w-2.5 h-2.5 text-slate-950" />
                    CMD
                  </span>
                )}
                <span className="font-bold text-[11px] line-clamp-2">{card.name}</span>
                {qty > 1 && (
                  <span className="absolute top-1.5 right-1.5 bg-indigo-600 text-white text-[10px] font-mono font-black px-1.5 py-0.5 rounded shadow">
                    {qty}x
                  </span>
                )}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <div className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition">
                  {card.name}
                </div>
                {card.manaCost && (
                  <div className="shrink-0 scale-90 origin-right">
                    <ManaCostRenderer manaCost={card.manaCost} size="sm" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-slate-500 uppercase">{card.rarity}</span>
                <span className="font-black text-emerald-600 text-xs">
                  ${totalVal.toFixed(2)}
                  {qty > 1 && <span className="text-[9px] text-slate-400 font-normal block">${unitVal.toFixed(2)} ea</span>}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
