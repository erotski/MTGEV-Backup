import React, { useState, useMemo, useEffect } from 'react';
import { ChaseCard } from '../types';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { getChaseCardsForProduct, fetchLiveChaseCardsForSet } from '../services/chaseCardsService';
import {
  Sparkles,
  Flame,
  Search,
  ZoomIn,
  Crown,
  ExternalLink,
  ShieldCheck,
  Tag,
  HelpCircle,
  X,
} from 'lucide-react';

interface ProductChaseCardsViewerProps {
  product: CatalogPackProduct;
  setCode: string;
  priceMode?: string;
  className?: string;
  onSelectCard?: (card: ChaseCard) => void;
}

export const ProductChaseCardsViewer: React.FC<ProductChaseCardsViewerProps> = ({
  product,
  setCode,
  priceMode = 'direct',
  className = '',
  onSelectCard,
}) => {
  const [zoomedCard, setZoomedCard] = useState<ChaseCard | null>(null);
  const [liveCards, setLiveCards] = useState<ChaseCard[]>([]);
  const [loadingLive, setLoadingLive] = useState<boolean>(false);

  // Retrieve curated chase cards specifically for this product
  const curatedCards = useMemo(() => {
    return getChaseCardsForProduct(product, setCode);
  }, [product, setCode]);

  // If no curated cards, dynamically query Scryfall API for authentic set cards
  useEffect(() => {
    let isMounted = true;
    if (curatedCards.length === 0 && setCode) {
      setLoadingLive(true);
      fetchLiveChaseCardsForSet(setCode)
        .then((cards) => {
          if (isMounted) {
            setLiveCards(cards);
          }
        })
        .catch((err) => {
          console.warn('Could not load live Scryfall chase cards:', err);
        })
        .finally(() => {
          if (isMounted) setLoadingLive(false);
        });
    } else {
      setLiveCards([]);
    }
    return () => {
      isMounted = false;
    };
  }, [curatedCards.length, setCode]);

  const chaseCards = curatedCards.length > 0 ? curatedCards : liveCards;

  // Filter to the top 5 most valuable chase cards for this product
  const topChaseCards = useMemo(() => {
    const sorted = [...chaseCards].sort((a, b) => (b.price || 0) - (a.price || 0));
    return sorted.slice(0, 5);
  }, [chaseCards]);

  // Helper for rarity styling
  const getRarityBadge = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case 'mythic':
        return 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-600 shadow-2xs';
      case 'rare':
        return 'bg-gradient-to-r from-amber-200 to-yellow-300 text-amber-950 border-amber-400 font-bold';
      case 'special':
        return 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-purple-600 shadow-2xs';
      case 'uncommon':
        return 'bg-slate-200 text-slate-800 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const isCollector = (product.displayName || '').toLowerCase().includes('collector');
  const isDeck =
    product.packagingType === 'starter_deck' ||
    (product.displayName || '').toLowerCase().includes('commander deck');

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              Top 5 Most Valuable Chase Cards
            </h4>
            <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
              {isDeck ? 'Deck Key Singles' : isCollector ? 'Collector Top Hits' : 'Top 5 Hits'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDeck
              ? `Guaranteed highest-value singles included in ${product.displayName}.`
              : `Top 5 most valuable cards pullable from ${product.displayName} sorted by live market price.`}
          </p>
        </div>
      </div>

      {/* Grid of Top 5 Chase Cards */}
      {loadingLive ? (
        <div className="text-center py-8 space-y-2">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-mono">
            Fetching authentic live market cards from Scryfall API...
          </p>
        </div>
      ) : topChaseCards.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          No chase cards found for this product.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 pt-1">
          {topChaseCards.map((card, cardIndex) => {
            const displayPriceNormal =
              priceMode === 'cheapest_reprint'
                ? Number((card.priceNormal * 0.74).toFixed(2))
                : card.priceNormal;
            const displayPriceFoil = card.priceFoil
              ? priceMode === 'cheapest_reprint'
                ? Number((card.priceFoil * 0.78).toFixed(2))
                : card.priceFoil
              : undefined;

            const cardImg =
              card.imageUrl ||
              (card.scryfallId
                ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg`
                : '');

            return (
              <div
                key={card.uuid}
                onClick={() => setZoomedCard(card)}
                className="group bg-slate-50 hover:bg-white rounded-xl p-2.5 border border-slate-200 hover:border-indigo-400 hover:shadow-md transition flex flex-col justify-between cursor-pointer relative"
              >
                <div>
                  {/* Card Art */}
                  <div className="aspect-[5/7] w-full rounded-lg overflow-hidden bg-slate-200 relative mb-2.5 border border-slate-200">
                    {cardImg ? (
                      <img
                        src={cardImg}
                        alt={card.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(e) => {
                          if (card.scryfallId) {
                            (e.target as HTMLImageElement).src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal`;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-100 text-slate-400">
                        <Sparkles className="w-6 h-6 text-slate-300 mb-1" />
                        <span className="text-[10px] font-medium">{card.name}</span>
                      </div>
                    )}

                    {/* Rarity badge */}
                    <span
                      className={`absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider border backdrop-blur-md ${getRarityBadge(
                        card.rarity
                      )}`}
                    >
                      {card.rarity}
                    </span>

                    {/* Zoom preview icon hint */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                      <ZoomIn className="w-5 h-5 drop-shadow" />
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition">
                    {card.name}
                  </div>

                  {card.cardType && (
                    <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                      {card.cardType}
                    </div>
                  )}

                  {card.pullOddsDesc && (
                    <div className="mt-1.5 text-[9px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 line-clamp-1">
                      {card.pullOddsDesc}
                    </div>
                  )}
                </div>

                {/* Price block */}
                <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">#{card.number}</span>
                  <div className="text-right font-mono">
                    <div className="text-xs font-black text-emerald-600">
                      ${displayPriceNormal.toFixed(2)}
                    </div>
                    {displayPriceFoil && (
                      <div className="text-[9px] text-amber-500 font-bold">
                        Foil: ${displayPriceFoil.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zoom Modal Popover */}
      {zoomedCard && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setZoomedCard(null)}
        >
          <div
            className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-300 shadow-2xl relative space-y-3 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomedCard(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center font-bold text-slate-900 text-sm">
              {zoomedCard.name}
            </div>

            <div className="aspect-[5/7] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-lg">
              <img
                src={
                  zoomedCard.imageUrl ||
                  (zoomedCard.scryfallId
                    ? `https://cards.scryfall.io/large/front/${zoomedCard.scryfallId.charAt(0)}/${zoomedCard.scryfallId.charAt(1)}/${zoomedCard.scryfallId}.jpg`
                    : '')
                }
                alt={zoomedCard.name}
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Rarity & Number:</span>
                <span className="font-mono font-bold uppercase text-slate-800">
                  {zoomedCard.rarity} #{zoomedCard.number}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Market Price:</span>
                <span className="font-mono font-black text-emerald-600">
                  ${zoomedCard.priceNormal.toFixed(2)}
                </span>
              </div>
              {zoomedCard.priceFoil && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Foil Price:</span>
                  <span className="font-mono font-bold text-amber-600">
                    ${zoomedCard.priceFoil.toFixed(2)}
                  </span>
                </div>
              )}
              {zoomedCard.pullOddsDesc && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Collation Origin:</span>
                  <span className="font-mono text-indigo-700 font-bold">
                    {zoomedCard.pullOddsDesc}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
