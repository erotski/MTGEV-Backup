import React, { useState, useMemo, useEffect } from 'react';
import { ChaseCard } from '../types';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { getCardProductAvailability, getCardImageUrl } from '../services/chaseCardsService';
import { dataService } from '../services/dataService';
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
  Package,
  Layers,
} from 'lucide-react';

interface ProductChaseCardsViewerProps {
  product: CatalogPackProduct;
  setCode: string;
  priceMode?: string;
  vendor: string;
  singleCardPrices?: any;
  className?: string;
  onSelectCard?: (card: ChaseCard) => void;
  allProducts?: CatalogPackProduct[];
  onSelectRelatedProduct?: (prodId: string) => void;
  preconDecks?: Record<string, any>;
  deckDetail?: any;
}

/**
 * Filter products in this set that can contain the given chase card
 */
const getMatchingProductsForCard = (card: ChaseCard, allProducts: CatalogPackProduct[]) => {
  const isCollectorOnly = card.productType === 'collector' || card.pullOddsDesc?.includes('Collector Exclusive') || card.pullOddsDesc?.includes('Serialized');
  const isDeckCard = card.productType === 'deck' || card.pullOddsDesc?.includes('Commander') || card.pullOddsDesc?.includes('Deck');
  const isPromo = card.productType === 'card' || card.pullOddsDesc?.includes('Included Single/Promo');

  const matches: CatalogPackProduct[] = [];

  if (isDeckCard) {
    allProducts.forEach(p => {
      const isPDeck = p.packagingType === 'starter_deck' || p.rawCategory === 'deck' || p.category === 'deck' || (p.displayName || '').toLowerCase().includes('deck') || (p.displayName || '').toLowerCase().includes('commander');
      if (isPDeck) {
        if (card.deckName) {
          const dn = card.deckName.toLowerCase().replace(/['"’]/g, '');
          const pn = (p.displayName || '').toLowerCase().replace(/['"’]/g, '');
          if (pn.includes(dn) || dn.includes(pn)) {
            matches.push(p);
          } else {
            matches.push(p);
          }
        } else {
          matches.push(p);
        }
      }
    });
  } else if (isCollectorOnly) {
    allProducts.forEach(p => {
      const pn = (p.displayName || '').toLowerCase();
      if (pn.includes('collector') || (p.boosterName || '').toLowerCase().includes('collector')) {
        matches.push(p);
      }
    });
  } else if (isPromo) {
    allProducts.forEach(p => {
      const pn = (p.displayName || '').toLowerCase();
      if (pn.includes('bundle') || pn.includes('promo') || pn.includes('gift') || pn.includes('prerelease')) {
        matches.push(p);
      }
    });
  } else {
    allProducts.forEach(p => {
      const pn = (p.displayName || '').toLowerCase();
      const rawCat = (p.rawCategory || p.category || '').toLowerCase();
      const isBooster = p.packagingType === 'box' || p.packagingType === 'pack' || rawCat.includes('booster') || pn.includes('booster') || pn.includes('bundle') || pn.includes('gift');
      if (isBooster) {
        matches.push(p);
      }
    });
  }

  const seenIds = new Set<string>();
  return matches.filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });
};

export const ProductChaseCardsViewer: React.FC<ProductChaseCardsViewerProps> = ({
  product,
  setCode,
  priceMode = 'direct',
  vendor,
  singleCardPrices: propPrices,
  className = '',
  onSelectCard,
  allProducts = [],
  onSelectRelatedProduct,
  preconDecks: propPreconDecks,
  deckDetail,
}) => {
  const [zoomedCard, setZoomedCard] = useState<ChaseCard | null>(null);
  const [backendCards, setBackendCards] = useState<ChaseCard[] | null>(null);
  const [backendCardsLoaded, setBackendCardsLoaded] = useState<boolean>(false);
  const [missingRecordReason, setMissingRecordReason] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const productId = product.id || (product as any).uuid || (product as any).productUuid;
    if (!productId) {
      setBackendCards([]);
      setBackendCardsLoaded(true);
      setMissingRecordReason('This product has no resolvable identifier for chase-card lookup.');
      return () => { mounted = false; };
    }

    const normaliseKey = (value?: string) => (value ? String(value).trim().toLowerCase() : '');
    const productKeyCandidates = Array.from(new Set([
      product.id,
      (product as any).uuid,
      (product as any).productUuid,
    ].filter(Boolean))) as string[];

    dataService.getProductChaseCards().then((data) => {
      if (!mounted) return;
      const mode = priceMode === 'cheapest_reprint' ? 'cheapest_reprint' : 'direct';
      const match = productKeyCandidates
        .map((candidate) => ({ candidate, record: data[candidate] }))
        .find(({ record }) => record && typeof record === 'object');

      const fallbackMatch = Object.entries(data || {}).find(([key, record]) => (
        record && typeof record === 'object' &&
        productKeyCandidates.some((candidate) => normaliseKey(candidate) === normaliseKey(key))
      ));

      const record = match?.record || fallbackMatch?.[1] || {};
      const cards = Array.isArray(record[`${mode}:${vendor}`]) ? record[`${mode}:${vendor}`] : [];

      setBackendCards(cards);
      if (!cards.length) {
        if (!Object.keys(data || {}).length) {
          setMissingRecordReason('No chase-card snapshot is loaded for this product. The generated product_chase_cards.json file may be missing or stale in the current public/data snapshot.');
        } else if (match || fallbackMatch) {
          setMissingRecordReason(`No chase-card record exists for ${vendor} / ${mode} in the loaded snapshot for this product.`);
        } else {
          setMissingRecordReason(`No matching product key was found in the loaded chase-card snapshot for ${productId}. This often means the data is from a different pipeline run or branch.`);
        }
      } else {
        setMissingRecordReason(null);
      }
      setBackendCardsLoaded(true);
    });
    return () => { mounted = false; };
  }, [product, priceMode, vendor]);

  // Determine if this is a fixed preconstructed / non-booster product
  const isFixedProduct = useMemo(() => {
    const pName = (product.displayName || '').toLowerCase();
    const pkg = (product.packagingType || '').toLowerCase();
    const rawCat = ((product as any).rawCategory || (product as any).category || '').toLowerCase();
    const rawSub = ((product as any).rawSubtype || (product as any).subtype || '').toLowerCase();
    const hasFixedContents = Boolean(
      (product as any).contents?.sealed ||
      (product as any).rawContents?.sealed ||
      (product as any).contents?.deck ||
      (product as any).rawContents?.deck ||
      (product as any).contents?.card ||
      (product as any).rawContents?.card
    );
    return (
      product.packsCount === 0 ||
      pkg === 'starter_deck' ||
      pkg === 'deck' ||
      pkg === 'box_set' ||
      rawCat === 'deck' ||
      rawCat === 'box_set' ||
      rawCat === 'secret_lair' ||
      rawSub.includes('secret_lair') ||
      pName.includes('secret lair') ||
      pName.includes('commander deck') ||
      pName.includes('bundle') ||
      hasFixedContents
    );
  }, [product]);

  // Product TOP 5 data is authoritative only when supplied by the backend snapshot.
  const curatedCards = useMemo(() => {
    return backendCardsLoaded ? backendCards || [] : [];
  }, [backendCards, backendCardsLoaded]);

  const chaseCards = curatedCards;

  // Filter to the top 5 most valuable chase cards for this product
  const topChaseCards = useMemo(() => {
    const getCardValue = (c: ChaseCard) => {
      if (typeof c.price === 'number' && c.price > 0) return c.price;
      const pNorm = c.priceNormal ?? 0;
      const pFoil = c.priceFoil ?? 0;
      return Math.max(pNorm, pFoil);
    };
    const sorted = [...chaseCards].sort((a, b) => getCardValue(b) - getCardValue(a));
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
  const isSecretLair = (product.displayName || '').toLowerCase().includes('secret lair');

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              {isFixedProduct
                ? 'Top 5 Most Valuable Cards in This Product'
                : 'Top 5 Most Valuable Chase Cards in Selected Product'}
            </h4>
            <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
              {isDeck
                ? 'Deck Key Singles'
                : isSecretLair
                ? 'Secret Lair Hits'
                : isFixedProduct
                ? 'Guaranteed Singles'
                : isCollector
                ? 'Collector Top Hits'
                : 'Top 5 Hits'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isFixedProduct
              ? `Guaranteed highest-value cards included in ${product.displayName}.`
              : `Top 5 cards pullable or included in ${product.displayName} with prices queried from MTGJSON.`}
          </p>
        </div>
      </div>

      {/* Grid of Top 5 Chase Cards */}
      {topChaseCards.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center space-y-2">
          <Package className="w-8 h-8 text-slate-400 mx-auto" />
          <h5 className="text-sm font-bold text-slate-800">No Cards Available</h5>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {missingRecordReason || `Unable to retrieve card values for ${product.displayName}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 pt-1">
          {topChaseCards.map((card, cardIndex) => {
            const pNormVal = card.priceNormal ?? card.price ?? 0;
            const displayPriceNormal = pNormVal;
            const displayPriceFoil = card.priceFoil
              ? card.priceFoil
              : undefined;

            const cardImg = getCardImageUrl(card, 'normal');
            const isEtched = card.finish === 'etched';
            const isCardFoil = isEtched || card.finish === 'foil' || (product.displayName || '').toLowerCase().includes('foil');

            return (
              <div
                key={card.uuid || `${card.name}-${card.number}-${cardIndex}`}
                onClick={() => setZoomedCard(card)}
                className="group bg-slate-50 hover:bg-white rounded-xl p-2.5 border border-slate-200 hover:border-indigo-400 hover:shadow-md transition flex flex-col justify-between cursor-pointer relative"
              >
                <div>
                  {/* Card Art */}
                  <div className="aspect-[5/7] w-full rounded-lg overflow-hidden bg-slate-200 relative mb-2 border border-slate-200 shadow-2xs">
                    {cardImg ? (
                      <img
                        src={cardImg}
                        alt={card.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (card.scryfallId && !target.src.includes('api.scryfall.com')) {
                            target.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal`;
                          } else if (card.number) {
                            target.src = `https://api.scryfall.com/cards/${(card.setCode || setCode || 'sld').toLowerCase()}/${card.number}?format=image&version=normal`;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-100 text-slate-400">
                        <Sparkles className="w-6 h-6 text-slate-300 mb-1" />
                        <span className="text-[10px] font-medium">{card.name}</span>
                      </div>
                    )}

                    {/* Rainbow Flat Surface Holographic Foil Sheen */}
                    {isCardFoil && (
                      <div
                        className={`absolute inset-0 pointer-events-none rounded-lg transition-opacity duration-300 overflow-hidden ${
                          isEtched
                            ? 'opacity-85 group-hover:opacity-100 ring-1 ring-inset ring-purple-300/50'
                            : 'opacity-75 group-hover:opacity-95 ring-1 ring-inset ring-amber-300/40'
                        }`}
                        style={{
                          mixBlendMode: 'color-dodge',
                          backgroundImage: isEtched
                            ? 'radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.45) 0%, rgba(180,220,255,0.25) 45%, rgba(230,170,255,0.3) 75%, rgba(255,255,255,0.15) 100%)'
                            : 'linear-gradient(135deg, rgba(255,0,80,0.16) 0%, rgba(255,180,0,0.22) 25%, rgba(0,255,140,0.18) 50%, rgba(0,180,255,0.22) 75%, rgba(180,0,255,0.18) 100%)',
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                      </div>
                    )}

                    {/* Finish Badge (Star / Sparkly Star) */}
                    {isEtched ? (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider border backdrop-blur-md bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 text-white border-white/40 shadow-xs flex items-center gap-0.5 z-10">
                        <Sparkles className="w-2.5 h-2.5 text-amber-200" />
                        <span>Etched</span>
                      </span>
                    ) : isCardFoil ? (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider border backdrop-blur-md bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 border-amber-300 shadow-xs flex items-center gap-0.5 z-10">
                        <span>★ Foil</span>
                      </span>
                    ) : null}

                    {/* Rarity badge */}
                    <span
                      className={`absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider border backdrop-blur-md z-10 ${getRarityBadge(
                        card.rarity
                      )}`}
                    >
                      {card.rarity}
                    </span>

                    {/* Zoom preview icon hint */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white z-20">
                      <ZoomIn className="w-5 h-5 drop-shadow" />
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition">
                    {card.name}
                  </div>

                  {card.pullOddsDesc ? (
                    <div className="text-[10px] text-indigo-600 font-semibold line-clamp-1 mt-0.5">
                      {card.pullOddsDesc.replace('Guaranteed in ', '')}
                    </div>
                  ) : card.cardType ? (
                    <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                      {card.cardType}
                    </div>
                  ) : null}
                </div>

                {/* Price block - Strictly MTGJSON vendor prices */}
                <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    #{card.number}
                    {card.setCode && card.setCode.toLowerCase() !== setCode.toLowerCase() && (
                      <span className="ml-1 text-[8px] uppercase text-indigo-500 font-bold">{card.setCode}</span>
                    )}
                  </span>
                  <div className="text-right font-mono">
                    {isCardFoil ? (
                      <>
                        <div className="text-xs font-black text-amber-600 flex items-center gap-1 justify-end">
                          <Tag className="w-2.5 h-2.5 text-amber-500" />
                          <span>{isEtched ? '✧★ ' : '★ '}${(displayPriceFoil || displayPriceNormal).toFixed(2)}</span>
                        </div>
                        {displayPriceNormal > 0 && displayPriceFoil && displayPriceNormal !== displayPriceFoil && (
                          <div className="text-[9px] text-slate-400">
                            Non-foil: ${displayPriceNormal.toFixed(2)}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-black text-emerald-600 flex items-center gap-1 justify-end">
                          <Tag className="w-2.5 h-2.5 text-emerald-500" />
                          <span>${displayPriceNormal.toFixed(2)}</span>
                        </div>
                        {displayPriceFoil && (
                          <div className="text-[9px] text-amber-500 font-bold">
                            Foil: ${displayPriceFoil.toFixed(2)}
                          </div>
                        )}
                      </>
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

            {(() => {
              const isEtchedZoom = zoomedCard.finish === 'etched';
              const isFoilZoom = isEtchedZoom || zoomedCard.finish === 'foil' || (product.displayName || '').toLowerCase().includes('foil');
              const zoomImg = getCardImageUrl(zoomedCard, 'large');

              return (
                <div className="aspect-[5/7] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-lg relative">
                  <img
                    src={zoomImg}
                    alt={zoomedCard.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (zoomedCard.scryfallId && !target.src.includes('api.scryfall.com')) {
                        target.src = `https://api.scryfall.com/cards/${zoomedCard.scryfallId}?format=image&version=large`;
                      } else if (zoomedCard.number) {
                        target.src = `https://api.scryfall.com/cards/${(zoomedCard.setCode || setCode || 'sld').toLowerCase()}/${zoomedCard.number}?format=image&version=large`;
                      }
                    }}
                  />

                  {/* Rainbow Holographic Foil Sheen */}
                  {isFoilZoom && (
                    <div
                      className={`absolute inset-0 pointer-events-none rounded-xl ${
                        isEtchedZoom
                          ? 'opacity-85 ring-2 ring-inset ring-purple-300/60'
                          : 'opacity-75 ring-2 ring-inset ring-amber-300/50'
                      }`}
                      style={{
                        mixBlendMode: 'color-dodge',
                        backgroundImage: isEtchedZoom
                          ? 'radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.45) 0%, rgba(180,220,255,0.25) 45%, rgba(230,170,255,0.3) 75%, rgba(255,255,255,0.15) 100%)'
                          : 'linear-gradient(135deg, rgba(255,0,80,0.16) 0%, rgba(255,180,0,0.22) 25%, rgba(0,255,140,0.18) 50%, rgba(0,180,255,0.22) 75%, rgba(180,0,255,0.18) 100%)',
                      }}
                    />
                  )}

                  {/* Finish Badge Overlay */}
                  {isEtchedZoom ? (
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border backdrop-blur-md bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 text-white border-white/40 shadow-sm flex items-center gap-1 z-10">
                      <Sparkles className="w-3 h-3 text-amber-200" />
                      <span>Etched Foil</span>
                    </span>
                  ) : isFoilZoom ? (
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border backdrop-blur-md bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 border-amber-300 shadow-sm flex items-center gap-1 z-10">
                      <span>★ Traditional Foil</span>
                    </span>
                  ) : null}
                </div>
              );
            })()}

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Rarity & Number:</span>
                <span className="font-mono font-bold uppercase text-slate-800">
                  {zoomedCard.rarity} #{zoomedCard.number} {zoomedCard.setCode && `(${zoomedCard.setCode.toUpperCase()})`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Finish:</span>
                <span className="font-medium">
                  {zoomedCard.finish === 'etched' ? (
                    <span className="text-purple-700 font-bold">✧★✧ Etched Foil</span>
                  ) : zoomedCard.finish === 'foil' || (product.displayName || '').toLowerCase().includes('foil') ? (
                    <span className="text-amber-600 font-bold">★ Traditional Foil</span>
                  ) : (
                    <span className="text-slate-600">Non-foil</span>
                  )}
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
              {(() => {
                const avail = getCardProductAvailability(zoomedCard, product);
                const matchedProds = getMatchingProductsForCard(zoomedCard, allProducts);
                return (
                  <div className="pt-2.5 border-t border-slate-200 space-y-2">
                    <span className="text-[11px] font-bold text-slate-800 block flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Available in Set Products (Click to view EV):</span>
                    </span>
                    {matchedProds.length > 0 ? (
                      <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
                        {matchedProds.map((p) => {
                          const isCurrent = p.id === product.id;
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (onSelectRelatedProduct) {
                                  onSelectRelatedProduct(p.id);
                                }
                                setZoomedCard(null);
                              }}
                              className={`w-full text-left px-2.5 py-1 rounded-md border text-[10px] font-medium flex items-center justify-between transition cursor-pointer ${
                                isCurrent
                                  ? 'bg-emerald-50 text-emerald-950 border-emerald-300 ring-2 ring-emerald-100'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900 hover:border-indigo-300'
                              }`}
                            >
                              <span className="truncate pr-2 font-mono font-bold">{p.displayName}</span>
                              <span className="text-[8px] text-slate-400 font-mono shrink-0">
                                {isCurrent ? 'Selected' : 'View EV'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {avail.availableProductsList.map((pName, pIdx) => (
                          <span
                            key={pIdx}
                            className="bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-2xs"
                          >
                            {pName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
