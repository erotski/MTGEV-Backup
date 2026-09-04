import React, { useState } from 'react';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { BoosterSlotViewer } from './BoosterSlotViewer';
import { PreconstructedDeckViewer } from './PreconstructedDeckViewer';
import { ProductChaseCardsViewer } from './ProductChaseCardsViewer';
import { ProductPackagingImage } from './ProductPackagingImage';
import { SingleCardBreakdownViewer } from './SingleCardBreakdownViewer';
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
  onNavigateToSet?: (setCode: string, boosterName?: string) => void;
}

export const ProductBreakdownModal: React.FC<ProductBreakdownModalProps> = ({
  product,
  isOpen,
  onClose,
  priceMode = 'direct',
  vendor = 'tcgplayer',
  onNavigateToSet,
}) => {
  if (!isOpen || !product) return null;

  const [activeTab, setActiveTab] = useState<'slots_content' | 'chase_cards' | 'hierarchy'>('slots_content');

  const isDeck =
    product.packagingType === 'starter_deck' ||
    (product.displayName || '').toLowerCase().includes('commander deck') ||
    (product.displayName || '').toLowerCase().includes('precon') ||
    product.rawCategory === 'deck' ||
    product.rawCategory === 'starter_deck' ||
    product.rawCategory === 'commander_deck';

  const isSingleCard =
    product.boosterName === 'single_card' ||
    (product.packsCount === 0 &&
      (product.cardCount === 1 ||
        Boolean(product.rawContents?.card && product.rawContents.card.length > 0 && !product.rawContents?.pack && !product.rawContents?.sealed)));

  const profit = Number((product.estimatedEv - product.marketPrice).toFixed(2));
  const roiPct = product.marketPrice > 0 ? Number(((profit / product.marketPrice) * 100).toFixed(1)) : 0;

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
                setCode={product.setCode}
                setName={product.setName}
                packagingType={product.packagingType}
                displayName={product.displayName}
                imageUrl={product.imageUrl}
                size="sm"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 uppercase">
                  {product.setCode}
                </span>
                <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 uppercase">
                  {product.packagingType.replace(/_/g, ' ')}
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
              <Layers3 className="w-4 h-4" />
            ) : (
              <Sliders className="w-4 h-4" />
            )}
            <span>
              {isSingleCard
                ? 'Single Card Content & Multi-Seller Pricing'
                : isDeck
                ? 'Deck Card Content (100-Card Breakdown & EV)'
                : 'Slot Information & Options (0, 1, 2...)'}
            </span>
          </button>

          {/* Chase Cards are only displayed for booster products with randomized slots, never for fixed precon decks or singles */}
          {!isDeck && !isSingleCard && (
            <button
              onClick={() => setActiveTab('chase_cards')}
              className={`py-3 px-3.5 font-bold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'chase_cards'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Chase Cards in this Product</span>
            </button>
          )}

          {product.rawContents && (
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
          {/* Tab 1: Slot Collation Information OR Preconstructed Deck Contents OR Single Card Viewer */}
          {(activeTab === 'slots_content' || (activeTab === 'chase_cards' && (isDeck || isSingleCard))) && (
            <div>
              {isSingleCard ? (
                <SingleCardBreakdownViewer
                  product={product}
                  priceMode={priceMode}
                  vendor={vendor}
                />
              ) : isDeck ? (
                <PreconstructedDeckViewer
                  productId={product.id}
                  productName={product.displayName}
                  setCode={product.setCode}
                  marketPrice={product.marketPrice}
                  estimatedEv={product.estimatedEv}
                />
              ) : (
                <BoosterSlotViewer
                  setCode={product.setCode}
                  boosterName={product.boosterName}
                  variations={product.variations || []}
                  packsCount={product.packsCount}
                  packagingType={product.packagingType}
                  productName={product.displayName}
                />
              )}
            </div>
          )}

          {/* Tab 2: Chase Cards Within This Product (Booster products only) */}
          {activeTab === 'chase_cards' && !isDeck && !isSingleCard && (
            <ProductChaseCardsViewer
              product={product}
              setCode={product.setCode}
              priceMode={priceMode}
            />
          )}

          {/* Tab 3: Factory Sealed Hierarchy & Contained Drops */}
          {activeTab === 'hierarchy' && product.rawContents && (
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
          )}
        </div>
      </div>
    </div>
  );
};
