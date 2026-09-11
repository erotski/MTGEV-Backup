import React, { useState, useEffect, useMemo } from 'react';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { PreconstructedDeckDetail, BoosterEVRecord, EvBasis } from '../types';
import { dataService } from '../services/dataService';
import { BoosterSlotViewer } from './BoosterSlotViewer';
import { PreconstructedDeckViewer } from './PreconstructedDeckViewer';
import { ProductChaseCardsViewer } from './ProductChaseCardsViewer';
import { ProductPackagingImage } from './ProductPackagingImage';
import { SingleCardBreakdownViewer } from './SingleCardBreakdownViewer';
import { ProductBreakdownTable } from './ProductBreakdownTable';
import { calculateEvScore, getEvScoreBadgeClass } from '../utils/evScore';
import {
  X,
  Package,
  Sliders,
  Flame,
  Archive,
  Layers3,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Sparkles,
  Crown,
} from 'lucide-react';

interface ProductBreakdownModalProps {
  product: CatalogPackProduct | null;
  isOpen: boolean;
  onClose: () => void;
  priceMode?: string;
  vendor?: string;
  evBasis?: EvBasis | string;
  preconDecks?: Record<string, PreconstructedDeckDetail>;
  deckDetail?: PreconstructedDeckDetail;
  onNavigateToSet?: (setCode: string, boosterName?: string) => void;
  arbitrageMap?: Record<string, any>;
  productMap?: Map<string, any> | Record<string, any>;
  boosterEvMap?: Record<string, BoosterEVRecord[]>;
  singleCardPrices?: any;
  reprintMultiplier?: number;
}

export const ProductBreakdownModal: React.FC<ProductBreakdownModalProps> = ({
  product,
  isOpen,
  onClose,
  priceMode = 'direct',
  vendor = 'tcgplayer',
  evBasis = 'avg',
  preconDecks,
  deckDetail,
  onNavigateToSet,
  arbitrageMap,
  productMap,
  boosterEvMap,
  singleCardPrices,
  reprintMultiplier = 1.0,
}) => {
  if (!isOpen || !product) return null;

  const [activeTab, setActiveTab] = useState<'slots_content' | 'chase_cards' | 'hierarchy'>('slots_content');

  // Internal state to ensure complete data availability even if props are omitted
  const [internalSingleCardPrices, setInternalSingleCardPrices] = useState<any>(null);
  const [internalArbitrageMap, setInternalArbitrageMap] = useState<Record<string, any> | null>(null);
  const [internalProductMap, setInternalProductMap] = useState<Map<string, any> | null>(null);
  const [internalBoosterEvMap, setInternalBoosterEvMap] = useState<Record<string, BoosterEVRecord[]> | null>(null);
  const [internalPreconDecks, setInternalPreconDecks] = useState<Record<string, PreconstructedDeckDetail> | null>(null);

  useEffect(() => {
    let isMounted = true;
    const needsSingle = !singleCardPrices || Object.keys(singleCardPrices?.byUuid || {}).length === 0;
    const needsArb = !arbitrageMap || Object.keys(arbitrageMap).length === 0;
    const needsProd = !productMap || (productMap instanceof Map ? productMap.size === 0 : Object.keys(productMap).length === 0);
    const needsBooster = !boosterEvMap || Object.keys(boosterEvMap).length === 0;
    const needsPrecon = !preconDecks || Object.keys(preconDecks).length === 0;

    if (needsSingle || needsArb || needsProd || needsBooster || needsPrecon) {
      Promise.all([
        needsSingle ? dataService.getSingleCardPrices() : Promise.resolve(null),
        needsArb ? dataService.getArbitrageRecords() : Promise.resolve(null),
        needsProd ? dataService.getSealedProducts() : Promise.resolve(null),
        needsBooster ? dataService.getBoosterEVs() : Promise.resolve(null),
        needsPrecon ? dataService.getPreconDecks() : Promise.resolve(null),
      ]).then(([single, arbList, prods, boosters, precons]) => {
        if (!isMounted) return;
        if (single) setInternalSingleCardPrices(single);
        if (Array.isArray(arbList)) {
          const aMap: Record<string, any> = {};
          arbList.forEach((a) => {
            if (a.productUuid) aMap[a.productUuid] = a;
            if (a.id) aMap[a.id] = a;
          });
          setInternalArbitrageMap(aMap);
        }
        if (Array.isArray(prods)) {
          const pMap = new Map<string, any>();
          prods.forEach((p) => {
            if (p.uuid) pMap.set(p.uuid, p);
            if (p.id) pMap.set(p.id, p);
          });
          setInternalProductMap(pMap);
        }
        if (boosters) setInternalBoosterEvMap(boosters);
        if (precons) setInternalPreconDecks(precons);
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [singleCardPrices, arbitrageMap, productMap, boosterEvMap, preconDecks]);

  const effectiveSingleCardPrices = useMemo(() => {
    if (singleCardPrices && (Object.keys(singleCardPrices?.byUuid || {}).length > 0 || Object.keys(singleCardPrices?.byName || {}).length > 0)) {
      return singleCardPrices;
    }
    return internalSingleCardPrices || dataService.getSingleCardPricesSync() || { byUuid: {}, byName: {}, byNameSet: {} };
  }, [singleCardPrices, internalSingleCardPrices]);

  const effectiveArbitrageMap = useMemo(() => {
    if (arbitrageMap && Object.keys(arbitrageMap).length > 0) {
      return arbitrageMap;
    }
    return internalArbitrageMap || {};
  }, [arbitrageMap, internalArbitrageMap]);

  const effectiveProductMap = useMemo(() => {
    if (productMap && (productMap instanceof Map ? productMap.size > 0 : Object.keys(productMap).length > 0)) {
      return productMap instanceof Map ? productMap : new Map(Object.entries(productMap));
    }
    return internalProductMap || new Map();
  }, [productMap, internalProductMap]);

  const effectiveBoosterEvMap = useMemo(() => {
    if (boosterEvMap && Object.keys(boosterEvMap).length > 0) {
      return boosterEvMap;
    }
    return internalBoosterEvMap || dataService.getBoosterEvsSync() || {};
  }, [boosterEvMap, internalBoosterEvMap]);

  const effectivePreconDecks = useMemo(() => {
    if (preconDecks && Object.keys(preconDecks).length > 0) {
      return preconDecks;
    }
    return internalPreconDecks || dataService.getPreconDecksSync() || {};
  }, [preconDecks, internalPreconDecks]);

  // Enrich product with real non-zero marketPrice and estimatedEv if missing
  const effectiveProduct = useMemo(() => {
    if (!product) return null;
    const pId = product.id || (product as any).uuid || '';
    const arb = effectiveArbitrageMap[pId] || Object.values(effectiveArbitrageMap).find((a: any) =>
      (a.productUuid && a.productUuid === pId) ||
      ((a.boxName || a.displayName || '').toLowerCase().trim() === (product.displayName || '').toLowerCase().trim())
    );
    const mapped = pId
      ? effectiveProductMap instanceof Map
        ? effectiveProductMap.get(pId)
        : (effectiveProductMap as any)?.[pId]
      : null;

    let resMarket = product.marketPrice;
    if (!resMarket || resMarket <= 0) {
      resMarket = arb?.marketPrice || mapped?.marketPrice || (product as any).price || 0;
    }

    let resEv = product.estimatedEv;
    if (!resEv || resEv <= 0) {
      resEv = arb?.totalEvAvg || mapped?.estimatedEv || 0;
    }

    return {
      ...product,
      marketPrice: resMarket,
      estimatedEv: resEv,
    };
  }, [product, effectiveArbitrageMap, effectiveProductMap]);

  const displayProduct = effectiveProduct || product;

  const isDeck =
    product.packagingType === 'starter_deck' ||
    product.rawCategory === 'multiple_decks' ||
    product.rawCategory === 'deck' ||
    product.rawCategory === 'starter_deck' ||
    product.rawCategory === 'commander_deck' ||
    (product.displayName || '').toLowerCase().includes('commander deck') ||
    (product.displayName || '').toLowerCase().includes('precon') ||
    (product.displayName || '').toLowerCase().includes('clash pack') ||
    (product.displayName || '').toLowerCase().includes('starter kit') ||
    (product.displayName || '').toLowerCase().includes('duel deck');

  const isSingleCard =
    product.boosterName === 'single_card' ||
    (product.packsCount === 0 &&
      (product.cardCount === 1 ||
        Boolean(product.rawContents?.card && product.rawContents.card.length > 0 && !product.rawContents?.pack && !product.rawContents?.sealed)));

  const isBundle = !isSingleCard && !isDeck && Boolean(
    product.rawCategory === 'bundle' ||
    product.rawCategory === 'box_set' ||
    product.rawCategory === 'secret_lair' ||
    product.subtype === 'secret_lair' ||
    product.packagingType === 'bundle' ||
    product.packagingType === 'box_set' ||
    (product.packsCount === 0 && Boolean(product.rawContents?.sealed || product.rawContents?.deck || product.rawContents?.variable || product.rawContents?.card)) ||
    (product.rawContents?.sealed && product.rawContents.sealed.length > 0 && (!product.variations || product.variations.length === 0))
  );

  const isBoosterProduct = !isSingleCard && !isDeck && !isBundle && Boolean(
    (product.packsCount && product.packsCount > 0) ||
    product.packagingType === 'booster_pack' ||
    product.packagingType === 'booster_box' ||
    product.packagingType === 'case' ||
    (product.variations && product.variations.length > 0)
  );

  const isDeterministic = Boolean(
    isSingleCard ||
    isDeck ||
    product.packagingType === 'starter_deck' ||
    (((displayProduct as any).packsCount === 0 || (displayProduct as any).packCount === 0) && (!displayProduct.variations || displayProduct.variations.length === 0)) ||
    (displayProduct as any).archetype === 'pure_precon'
  );

  const profit = Number((displayProduct.estimatedEv - displayProduct.marketPrice).toFixed(2));
  const roiPct = displayProduct.marketPrice > 0 ? Number(((profit / displayProduct.marketPrice) * 100).toFixed(1)) : 0;
  const productEvScore = typeof (displayProduct as any).evScore === 'number'
    ? (displayProduct as any).evScore
    : calculateEvScore(
        displayProduct.marketPrice,
        displayProduct.estimatedEv,
        (displayProduct as any).evMin ?? displayProduct.estimatedEv * 0.25,
        (displayProduct as any).evMid90 ?? displayProduct.estimatedEv,
        (displayProduct as any).evMax ?? displayProduct.estimatedEv * 3.5,
        isDeterministic,
        (displayProduct as any).quantiles
      );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-100 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden animate-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="p-5 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
              <ProductPackagingImage
                productId={product.id}
                setCode={product.setCode}
                setName={product.setName}
                packagingType={product.packagingType}
                displayName={product.displayName}
                cardCount={product.cardCount}
                imageUrl={product.imageUrl}
                size="sm"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 uppercase">
                  {product.setCode}
                </span>
                {product.packsCount > 0 ? (
                  <span className="font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                    {product.packsCount} {product.packsCount === 1 ? 'Pack' : 'Packs'}
                  </span>
                ) : product.cardCount === 1 ? (
                  <span className="font-mono text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                    1 Single Card
                  </span>
                ) : product.cardCount && product.cardCount > 1 ? (
                  <span className="font-mono text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                    {product.cardCount} Cards
                  </span>
                ) : null}
              </div>

              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {product.displayName}
              </h3>
              <div className="text-xs text-slate-500 mt-0.5">
                {product.setName} • Released {product.releaseDate || '2024'}
              </div>
            </div>
          </div>

          {/* Pricing & EV pill stats + Action buttons */}
          <div className="flex flex-wrap items-center gap-3 self-end md:self-center shrink-0">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-mono text-right">
              <span className="text-[10px] text-slate-400 block">Market Price</span>
              <span className="text-sm font-black text-slate-900">
                ${product.marketPrice.toFixed(2)}
              </span>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 font-mono text-right">
              <span className="text-[10px] text-indigo-500 block">Estimated EV</span>
              <span className="text-sm font-black text-indigo-700">
                ${product.estimatedEv.toFixed(2)}
              </span>
            </div>

            <div
              className={`rounded-xl px-3 py-1.5 font-mono text-right border ${
                profit >= 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <span className="text-[10px] block opacity-75">Net Margin</span>
              <span className="text-sm font-black">
                {profit >= 0 ? `+${roiPct}%` : `${roiPct}%`}
              </span>
            </div>

            {productEvScore != null && (
              <div
                className={`rounded-xl px-3 py-1.5 font-mono text-right border ${getEvScoreBadgeClass(productEvScore)}`}
                title={`EV Score: ${productEvScore}/100. Probability of opening singles value >= sealed price.`}
              >
                <span className="text-[10px] block opacity-75">EV Score</span>
                <span className="text-sm font-black">
                  {productEvScore}/100
                </span>
              </div>
            )}

            {onNavigateToSet && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToSet(product.setCode, product.boosterName);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs"
              >
                <span>Set Explorer</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 bg-white border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('slots_content')}
            className={`py-3 px-3.5 font-bold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'slots_content'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {isSingleCard ? (
              <Sparkles className="w-4 h-4 text-amber-500" />
            ) : isDeck ? (
              <Layers3 className="w-4 h-4 text-purple-600" />
            ) : isBundle || !isBoosterProduct ? (
              <Archive className="w-4 h-4 text-indigo-600" />
            ) : (
              <Sliders className="w-4 h-4" />
            )}
            <span>
              {isSingleCard
                ? 'Single Card Content & Multi-Seller Pricing'
                : isDeck
                ? 'Deck Card Content & Singles EV Breakdown'
                : isBundle || !isBoosterProduct
                ? 'Contained Products & Sealed Hierarchy'
                : 'Slot Information & Options'}
            </span>
          </button>

          {/* Chase Cards Tab for ALL products */}
          <button
            onClick={() => setActiveTab('chase_cards')}
            className={`py-3 px-3.5 font-bold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'chase_cards'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Top 5 Chase Cards</span>
          </button>

          {!isBundle && isBoosterProduct && product.rawContents && (
            <button
              onClick={() => setActiveTab('hierarchy')}
              className={`py-3 px-3.5 font-bold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'hierarchy'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Archive className="w-4 h-4" />
              <span>Factory Sealed Hierarchy & Promos</span>
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* Tab 1: Slot Collation OR Preconstructed Deck Contents OR Bundle Hierarchy OR Single Card Viewer */}
          {activeTab === 'slots_content' && (
            <div>
              {isSingleCard ? (
                <SingleCardBreakdownViewer
                  product={displayProduct}
                  priceMode={priceMode}
                  vendor={vendor}
                />
              ) : isDeck ? (
                <PreconstructedDeckViewer
                  productId={displayProduct.id}
                  productName={displayProduct.displayName}
                  setCode={displayProduct.setCode}
                  marketPrice={displayProduct.marketPrice}
                  estimatedEv={displayProduct.estimatedEv}
                  preconDecks={effectivePreconDecks}
                  deckDetail={deckDetail || (displayProduct as any)?.deckDetail}
                />
              ) : isBundle || !isBoosterProduct ? (
                <div className="space-y-4">
                  <ProductBreakdownTable
                    product={displayProduct}
                    vendor={vendor as any}
                    priceMode={priceMode as any}
                    evBasis={evBasis as any}
                    hideModalLaunchButton={true}
                    preconDecks={effectivePreconDecks}
                    arbitrageMap={effectiveArbitrageMap}
                    productMap={effectiveProductMap}
                    boosterEvMap={effectiveBoosterEvMap}
                    singleCardPrices={effectiveSingleCardPrices}
                    reprintMultiplier={reprintMultiplier}
                    title="Product & Prize breakdown"
                    defaultCollapsed={false}
                    collapsible={false}
                  />

                  {displayProduct.rawContents && (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Package className="w-4 h-4 text-indigo-600" />
                        <span>MTGJSON Factory Sealed Contents Specification</span>
                      </div>

                      {displayProduct.rawContents.note && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                          <span className="font-bold">Collation Logic Note: </span>
                          <span>{displayProduct.rawContents.note}</span>
                        </div>
                      )}

                      {/* Contained Cards & Promotional Singles */}
                      {displayProduct.rawContents.card && displayProduct.rawContents.card.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Contained Promotional Cards / Singles ({displayProduct.rawContents.card.length}):</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {displayProduct.rawContents.card.map((c: any, idx: number) => {
                              if (!c) return null;
                              return (
                                <div
                                  key={idx}
                                  className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="font-semibold text-slate-800 truncate">{c.name}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      Set: {(c.set || displayProduct.setCode).toUpperCase()} {c.number ? `#${c.number}` : ''} {c.foil ? '• Foil' : ''}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <BoosterSlotViewer
                  setCode={displayProduct.setCode}
                  boosterName={displayProduct.boosterName}
                  variations={displayProduct.variations || []}
                  packsCount={displayProduct.packsCount}
                  packagingType={displayProduct.packagingType}
                  productName={displayProduct.displayName}
                />
              )}
            </div>
          )}

          {/* Tab 2: Chase Cards Within This Product (Available for all products) */}
          {activeTab === 'chase_cards' && (
            <ProductChaseCardsViewer
              product={displayProduct}
              setCode={displayProduct.setCode}
              priceMode={priceMode}
              preconDecks={effectivePreconDecks}
              deckDetail={deckDetail || (displayProduct as any)?.deckDetail}
              singleCardPrices={effectiveSingleCardPrices}
            />
          )}

          {/* Tab 3: Factory Sealed Hierarchy & Contained Drops (Booster products only) */}
          {activeTab === 'hierarchy' && !isBundle && isBoosterProduct && displayProduct.rawContents && (
            <div className="space-y-4">
              {/* Authoritative Sub-Item Price & EV Reconciliation Table */}
              <ProductBreakdownTable
                product={displayProduct}
                vendor={vendor as any}
                priceMode={priceMode as any}
                hideModalLaunchButton={true}
                preconDecks={effectivePreconDecks}
                arbitrageMap={effectiveArbitrageMap}
                productMap={effectiveProductMap}
                boosterEvMap={effectiveBoosterEvMap}
                singleCardPrices={effectiveSingleCardPrices}
                reprintMultiplier={reprintMultiplier}
                title="Product & Prize breakdown"
                defaultCollapsed={false}
                collapsible={false}
              />

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Package className="w-4 h-4 text-indigo-600" />
                  <span>MTGJSON Factory Sealed Contents Specification</span>
                </div>

                {product.rawContents.note && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                    <span className="font-bold">Collation Logic Note: </span>
                    <span>{product.rawContents.note}</span>
                  </div>
                )}

                {/* Contained Cards & Promotional Singles */}
                {product.rawContents.card && product.rawContents.card.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Contained Promotional Cards / Singles ({product.rawContents.card.length}):</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {product.rawContents.card.map((c: any, idx: number) => {
                        if (!c) return null;
                        const cPrices = c.prices || {};
                        const isFoil = c.foil || (c.finishes && c.finishes.includes('foil'));
                        return (
                          <div
                            key={idx}
                            className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-semibold text-slate-800 truncate">{c.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {c.number ? `#${c.number}` : ''} {isFoil ? '• Foil' : '• Nonfoil'}
                              </div>
                            </div>
                            {cPrices.tcgplayer ? (
                              <div className="text-right shrink-0">
                                <span className="font-mono text-xs font-black text-indigo-700 block">
                                  ${cPrices.tcgplayer.toFixed(2)}
                                </span>
                                <span className="text-[9px] text-slate-400 block">TCG Market</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Contained Sealed Drops */}
                {product.rawContents.sealed && product.rawContents.sealed.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700">
                      Contained Drops & Sealed Products ({product.rawContents.sealed.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {product.rawContents.sealed.map((s: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <span className="font-semibold text-slate-800 truncate pr-2">{s.name}</span>
                          <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                            {s.count || 1}x Copy
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contained Booster Packs */}
                {product.rawContents.pack && product.rawContents.pack.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700">
                      Contained Booster Packs ({product.rawContents.pack.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {product.rawContents.pack.map((pk: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <span className="font-semibold text-slate-800 capitalize">
                            {pk.code ? `${pk.code.replace(/_/g, ' ')} Booster` : 'Booster Pack'}
                          </span>
                          <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                            {pk.count}x Packs
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
