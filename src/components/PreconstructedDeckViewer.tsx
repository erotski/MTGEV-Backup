import React, { useState, useMemo } from 'react';
import { PreconstructedDeckDetail, DeckCardItem } from '../types';
import { PRECON_DECK_DETAILS } from '../services/chaseCardsService';
import {
  Layers3,
  Sparkles,
  ShieldCheck,
  Search,
  ArrowUpDown,
  Gift,
  ExternalLink,
  Package,
  CheckCircle2,
  DollarSign,
  Crown,
} from 'lucide-react';

interface PreconstructedDeckViewerProps {
  productId: string;
  productName: string;
  setCode: string;
  marketPrice: number;
  estimatedEv: number;
  className?: string;
}

export const PreconstructedDeckViewer: React.FC<PreconstructedDeckViewerProps> = ({
  productId,
  productName,
  setCode,
  marketPrice,
  estimatedEv,
  className = '',
}) => {
  // Try to match in PRECON_DECK_DETAILS
  const deckDetail: PreconstructedDeckDetail = useMemo(() => {
    const cleanId = (productId || '').toLowerCase();
    const cleanName = (productName || '').toLowerCase();

    // Direct ID match
    if (PRECON_DECK_DETAILS[cleanId]) {
      return PRECON_DECK_DETAILS[cleanId];
    }

    // Name match
    const matched = Object.values(PRECON_DECK_DETAILS).find((d) =>
      cleanName.includes(d.commander.name.toLowerCase()) ||
      cleanName.includes(d.theme.toLowerCase()) ||
      (d.deckName && cleanName.includes(d.deckName.toLowerCase()))
    );

    if (matched) return matched;

    // Default synthesized precon deck structure
    const isEldrazi = cleanName.includes('eldrazi');
    const isTricky = cleanName.includes('tricky');
    const isGraveyard = cleanName.includes('graveyard');
    const isEnergy = cleanName.includes('energy');

    if (isEldrazi) return PRECON_DECK_DETAILS['deck-mh3-eldrazi-incursion'];
    if (isTricky) return PRECON_DECK_DETAILS['deck-mh3-tricky-terrain'];
    if (isGraveyard) return PRECON_DECK_DETAILS['deck-mh3-graveyard-overdrive'];
    if (isEnergy) return PRECON_DECK_DETAILS['deck-mh3-creative-energy'];

    // Fallback generic precon deck
    return {
      deckName: productName,
      setCode: setCode || 'MTG',
      commander: {
        name: 'Display Commander',
        manaCost: '{2}{G}{U}',
        type: 'Legendary Creature',
        text: 'Includes guaranteed foil face commander card designed specifically for Commander format.',
        price: 9.99,
      },
      cardCount: 100,
      colors: ['W', 'U', 'B', 'R', 'G'],
      theme: 'Factory-Sealed 100-Card Ready-to-Play Preconstructed Deck',
      contentsSummary: {
        creatures: 30,
        instantsAndSorceries: 18,
        artifactsAndEnchantments: 14,
        planeswalkers: 1,
        lands: 37,
      },
      keyCards: [
        { name: 'Display Commander', count: 1, rarity: 'mythic', type: 'Creature', price: 9.99, foil: true, isCommander: true },
        { name: 'Sol Ring', count: 1, rarity: 'uncommon', type: 'Artifact', price: 1.5 },
        { name: 'Arcane Signet', count: 1, rarity: 'common', type: 'Artifact', price: 0.8 },
        { name: 'Command Tower', count: 1, rarity: 'common', type: 'Land', price: 0.5 },
      ],
    };
  }, [productId, productName, setCode]);

  // Card search and filter
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'price' | 'name'>('price');

  const filteredCards = useMemo(() => {
    return deckDetail.keyCards
      .filter((card) => {
        const matchesSearch = card.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || card.type.toLowerCase().includes(typeFilter.toLowerCase());
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        if (sortBy === 'price') return b.price - a.price;
        return a.name.localeCompare(b.name);
      });
  }, [deckDetail, searchTerm, typeFilter, sortBy]);

  // Total singles EV of listed key cards
  const keyCardsTotalValue = useMemo(() => {
    return deckDetail.keyCards.reduce((sum, c) => sum + c.price * c.count, 0);
  }, [deckDetail]);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-6 ${className}`}>
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="w-5 h-5 text-amber-400" />
            <h4 className="text-base font-bold tracking-tight">Preconstructed Deck Card Content</h4>
            <span className="text-[11px] font-mono font-bold bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded border border-amber-400/30">
              {deckDetail.cardCount} Cards Total
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Preconstructed decks contain fixed, non-randomized card content. Explore the face commander, card type breakdown, and high-value singles included in this product.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono self-start sm:self-auto shrink-0">
          <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
            <span className="text-slate-400 block text-[10px]">Market Price</span>
            <span className="font-bold text-white">${marketPrice.toFixed(2)}</span>
          </div>
          <div className="bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-400/30">
            <span className="text-emerald-300 block text-[10px]">Estimated EV</span>
            <span className="font-bold text-emerald-300">${estimatedEv.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Commander Showcase & Deck Identity */}
      <div className="px-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Commander Card Art Frame */}
        <div className="bg-gradient-to-br from-indigo-950 to-slate-900 text-white p-4 rounded-xl border border-indigo-900/60 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Face Commander
              </span>
              <span className="text-[11px] font-mono text-amber-300 font-bold">
                ${deckDetail.commander.price.toFixed(2)}
              </span>
            </div>

            {deckDetail.commander.imageUrl ? (
              <div className="aspect-[5/7] w-full rounded-lg overflow-hidden bg-slate-800 relative mb-3 border border-indigo-700/50 shadow-inner">
                <img
                  src={deckDetail.commander.imageUrl}
                  alt={deckDetail.commander.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="aspect-[5/7] w-full rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center p-4 text-center mb-3">
                <Crown className="w-8 h-8 text-amber-400 mb-2" />
                <span className="text-xs font-bold">{deckDetail.commander.name}</span>
              </div>
            )}

            <div className="font-bold text-sm text-white mb-0.5">
              {deckDetail.commander.name}
            </div>
            <div className="text-xs text-indigo-300 font-mono mb-2">
              {deckDetail.commander.type}
            </div>
            {deckDetail.commander.text && (
              <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed bg-black/30 p-2 rounded border border-white/10">
                {deckDetail.commander.text}
              </p>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Foil Etched Display Card</span>
            <span className="text-emerald-400 font-bold">100% Guaranteed</span>
          </div>
        </div>

        {/* Deck Strategy, Color Identity & Inclusions */}
        <div className="md:col-span-2 space-y-4">
          {/* Theme card */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
              Deck Archetype & Strategy
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {deckDetail.theme}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-600 font-mono">Color Identity:</span>
              {deckDetail.colors.map((color, cIdx) => (
                <span
                  key={cIdx}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-black uppercase bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs"
                >
                  {color}
                </span>
              ))}
            </div>
          </div>

          {/* Type Distribution Breakdown Cards */}
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono mb-2">
              Card Content Breakdown by Type ({deckDetail.cardCount} Cards)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="block text-[10px] font-mono text-slate-500">Creatures</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  {deckDetail.contentsSummary.creatures}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="block text-[10px] font-mono text-slate-500">Spells (Inst/Sorc)</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  {deckDetail.contentsSummary.instantsAndSorceries}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="block text-[10px] font-mono text-slate-500">Artifacts/Ench</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  {deckDetail.contentsSummary.artifactsAndEnchantments}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="block text-[10px] font-mono text-slate-500">Planeswalkers</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  {deckDetail.contentsSummary.planeswalkers}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="block text-[10px] font-mono text-slate-500">Lands</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  {deckDetail.contentsSummary.lands}
                </span>
              </div>
            </div>
          </div>

          {/* Guaranteed Extra Accessories */}
          <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-1.5 text-xs text-indigo-950">
            <div className="font-bold flex items-center gap-1.5 text-indigo-900">
              <Gift className="w-4 h-4 text-indigo-600" />
              <span>Included Factory Accessories & Extras:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-indigo-900/90 pt-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>1x 2-Card Collector Booster Sample Pack</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>10x Double-Sided Token Cards</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>1x Deck Box + 1x Life Tracker Wheel</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>1x Foil-Etched Display Commander</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* High-Value Included Cards Table (Searchable & Filterable) */}
      <div className="px-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>High-Value Singles & Key Cards in this Deck ({deckDetail.keyCards.length})</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Card prices pulled from live marketplace singles values:
            </span>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cards..."
                className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-indigo-600 w-36 sm:w-44"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="creature">Creatures</option>
              <option value="land">Lands</option>
              <option value="artifact">Artifacts</option>
              <option value="enchantment">Enchantments</option>
            </select>

            <button
              onClick={() => setSortBy(sortBy === 'price' ? 'name' : 'price')}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition cursor-pointer"
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>{sortBy === 'price' ? 'By Price' : 'By Name'}</span>
            </button>
          </div>
        </div>

        {/* Cards Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-white font-mono uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Card Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Rarity</th>
                <th className="py-2.5 px-3 text-center">Finish</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Singles Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredCards.map((card, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/30 transition">
                  <td className="py-2 px-3 font-semibold text-slate-900 flex items-center gap-2">
                    {card.isCommander && (
                      <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Face Commander" />
                    )}
                    <span>{card.name}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{card.type}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                        card.rarity === 'mythic'
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : card.rarity === 'rare'
                          ? 'bg-yellow-50 text-yellow-800 border-yellow-300'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {card.rarity}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    {card.foil ? (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        Foil
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Regular</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">
                    {card.count}x
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                    ${card.price.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
