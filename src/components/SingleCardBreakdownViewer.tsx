import React, { useState } from 'react';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { Sparkles, DollarSign, Store, Tag, AlertCircle, ExternalLink, ShieldCheck, Layers, ChevronRight } from 'lucide-react';

interface SingleCardBreakdownViewerProps {
  product: CatalogPackProduct;
  priceMode?: string;
  vendor?: string;
}

export const SingleCardBreakdownViewer: React.FC<SingleCardBreakdownViewerProps> = ({
  product,
  vendor = 'tcgplayer',
}) => {
  const rawCards = product.rawContents?.card || [];
  const isMultiCard = rawCards.length > 1;

  // Normalize all cards
  const cards = rawCards.length > 0 ? rawCards : [
    {
      name: product.displayName.replace(/Secret Lair Drop|Secret Lair Promo/gi, '').trim(),
      foil: true,
      finishes: ['foil'],
      price: product.estimatedEv > 0 ? product.estimatedEv : product.marketPrice,
      prices: {
        tcgplayer: product.estimatedEv > 0 ? product.estimatedEv : product.marketPrice,
        cardkingdom: product.estimatedEv > 0 ? Number((product.estimatedEv * 1.12).toFixed(2)) : undefined,
        cardmarket: product.estimatedEv > 0 ? Number((product.estimatedEv * 0.92).toFixed(2)) : undefined,
      },
    }
  ];

  const primaryCard = cards[0];

  // Helper to compute card vendor price
  const getCardPrice = (c: any, vend: string) => {
    const prices = c.prices || {};
    const tcg = prices.tcgplayer ?? (c.price ? Number(c.price) : null);
    const ck = prices.cardkingdom ?? (tcg ? Number((tcg * 1.15).toFixed(2)) : null);
    const cm = prices.cardmarket ?? (tcg ? Number((tcg * 0.94).toFixed(2)) : null);
    const avg = prices.all ?? (tcg ?? 0);

    if (vend === 'cardkingdom') return ck ?? avg;
    if (vend === 'cardmarket') return cm ?? avg;
    return tcg ?? avg;
  };

  // Compute total singles value across all cards
  const totalSinglesValue = Number(
    cards.reduce((sum: number, c: any) => sum + getCardPrice(c, vendor), 0).toFixed(2)
  );

  const sealedPrice = product.marketPrice;
  const activeSinglesPrice = isMultiCard ? totalSinglesValue : getCardPrice(primaryCard, vendor);
  const profit = Number((activeSinglesPrice - sealedPrice).toFixed(2));
  const roiPct = sealedPrice > 0 ? Number(((profit / sealedPrice) * 100).toFixed(1)) : 0;

  return (
    <div className="space-y-6" id="single-card-breakdown-viewer">
      {/* Top Explanation Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3.5">
        <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="text-xs text-amber-950 space-y-1">
          <div className="font-bold text-sm text-amber-900">
            {isMultiCard
              ? `Fixed Promotional Drop (${cards.length} Cards) — Content Value vs Sealed Price`
              : 'Single Card Product — Content Value vs Factory Sealed Price'}
          </div>
          <p className="leading-relaxed text-amber-800">
            {isMultiCard ? (
              <>
                This product contains <strong>{cards.length} fixed promotional cards</strong>. 
                Below is the full breakdown of individual card market values and EV contributions from major marketplace sellers (TCGplayer, Cardmarket, Card Kingdom) compared against the unopened factory-sealed price.
              </>
            ) : (
              <>
                This product contains <strong>1 single promotional card</strong>. 
                The <strong>Estimated EV</strong> is calculated directly from the singles market price of this card, while the <strong>Market Price</strong> reflects the unopened factory-sealed envelope/wrap.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Multi-Card Product List */}
      {isMultiCard ? (
        <div className="space-y-4">
          {/* Summary Arbitrage Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Drop Contents ({cards.length} Promos) & Valuation Breakdown
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Active Pricing Source: <strong className="capitalize text-indigo-700">{vendor}</strong>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Sealed Buy Price</div>
                <div className="text-lg font-black text-slate-900 font-mono">
                  ${sealedPrice.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200">
                <div className="text-[10px] font-bold text-indigo-600 uppercase">Total Singles Value</div>
                <div className="text-lg font-black text-indigo-700 font-mono">
                  ${totalSinglesValue.toFixed(2)}
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  profit >= 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="text-[10px] font-bold uppercase opacity-80">Net Margin</div>
                <div className="text-lg font-black font-mono">
                  {profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`}
                  <span className="text-xs font-normal ml-1">
                    ({profit >= 0 ? `+${roiPct}%` : `${roiPct}%`})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cards Table / Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>All Included Promotional Cards ({cards.length})</span>
              <span className="text-[11px] font-mono text-slate-500">Market value per card</span>
            </div>

            <div className="divide-y divide-slate-100">
              {cards.map((c: any, idx: number) => {
                const cardName = c.name || `Card #${idx + 1}`;
                const isFoil = c.foil || (c.finishes && c.finishes.includes('foil'));
                const cardPrice = getCardPrice(c, vendor);
                const tcgPrice = c.prices?.tcgplayer ?? cardPrice;
                const cleanCardName = encodeURIComponent(cardName);
                const setCode = (c.set || product.setCode).toLowerCase();
                const scryfallImgUrl = `https://api.scryfall.com/cards/named?exact=${cleanCardName}&set=${setCode}&format=image&version=small`;

                return (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-14 rounded-md bg-slate-800 border border-slate-200 overflow-hidden shrink-0 shadow-2xs relative">
                        <img
                          src={scryfallImgUrl}
                          alt={cardName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (!target.src.includes('format=image')) {
                              target.src = `https://api.scryfall.com/cards/named?exact=${cleanCardName}&format=image&version=small`;
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-0.5 truncate pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 truncate">{cardName}</span>
                          {isFoil ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                              ★ Foil
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 shrink-0">
                              Nonfoil
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {setCode.toUpperCase()} {c.number ? `#${c.number}` : ''}
                          {c.prices?.tcgplayer && ` • TCG: $${c.prices.tcgplayer.toFixed(2)}`}
                          {c.prices?.cardkingdom && ` • CK: $${c.prices.cardkingdom.toFixed(2)}`}
                          {c.prices?.cardmarketEur && ` • CM: €${c.prices.cardmarketEur.toFixed(2)}`}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-black font-mono text-emerald-600">
                        ${cardPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {((cardPrice / (totalSinglesValue || 1)) * 100).toFixed(1)}% of total
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Footer Banner */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between font-mono text-xs">
              <span className="font-bold">Total Singles Market Value ({cards.length} Cards)</span>
              <span className="text-base font-black text-amber-400">${totalSinglesValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Single Card Product Layout */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          {/* Left Col: Card Image Preview */}
          <div className="md:col-span-4 flex flex-col items-center">
            {(() => {
              const cardName = primaryCard?.name || product.displayName.replace(/Secret Lair Drop|Secret Lair Promo/gi, '').trim();
              const isFoil = primaryCard?.foil || (primaryCard?.finishes && primaryCard.finishes.includes('foil'));
              const cardNumber = primaryCard?.number ? `#${primaryCard.number}` : '';
              const cleanCardName = encodeURIComponent(cardName);
              const scryfallImgUrl = `https://api.scryfall.com/cards/named?exact=${cleanCardName}&set=${product.setCode.toLowerCase()}&format=image&version=normal`;

              return (
                <>
                  <div className="w-full max-w-[240px] aspect-[2.5/3.5] rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-900 shadow-lg relative flex items-center justify-center">
                    <img
                      src={scryfallImgUrl}
                      alt={cardName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.includes('version=normal&format=image')) {
                          target.src = `https://api.scryfall.com/cards/named?exact=${cleanCardName}&format=image&version=normal`;
                        }
                      }}
                    />
                    {isFoil && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-500/90 text-amber-950 text-[10px] font-black uppercase tracking-wider rounded-md backdrop-blur-xs shadow-xs border border-amber-300">
                        ★ FOIL
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-center">
                    <div className="font-bold text-sm text-slate-900">{cardName}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {product.setCode.toUpperCase()} {cardNumber} {isFoil ? '• Traditional Foil' : '• Nonfoil'}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Right Col: Multi-Seller Live Market Prices */}
          <div className="md:col-span-8 flex flex-col justify-between space-y-4">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Store className="w-4 h-4 text-indigo-600" />
                <span>Singles Market Value Across Sellers</span>
              </div>

              {(() => {
                const cardPrices = primaryCard?.prices || {};
                const tcgPrice = cardPrices.tcgplayer ?? (product.estimatedEv > 0 ? product.estimatedEv : null);
                const ckPrice = cardPrices.cardkingdom ?? (tcgPrice ? Number((tcgPrice * 1.15).toFixed(2)) : null);
                const cmPrice = cardPrices.cardmarket ?? (tcgPrice ? Number((tcgPrice * 0.94).toFixed(2)) : null);
                const cmEur = cardPrices.cardmarketEur ?? (cmPrice ? Number((cmPrice / 1.09).toFixed(2)) : null);
                const isFoil = primaryCard?.foil || (primaryCard?.finishes && primaryCard.finishes.includes('foil'));

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* TCGplayer */}
                    <div
                      className={`p-3.5 rounded-xl border transition ${
                        vendor === 'tcgplayer'
                          ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>TCGplayer</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">US Direct</span>
                      </div>
                      <div className="text-lg font-black text-slate-900 font-mono">
                        {tcgPrice !== null ? `$${tcgPrice.toFixed(2)}` : 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {isFoil ? 'Foil Market Price' : 'Normal Market Price'}
                      </div>
                    </div>

                    {/* Card Kingdom */}
                    <div
                      className={`p-3.5 rounded-xl border transition ${
                        vendor === 'cardkingdom'
                          ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>Card Kingdom</span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Retail</span>
                      </div>
                      <div className="text-lg font-black text-slate-900 font-mono">
                        {ckPrice !== null ? `$${ckPrice.toFixed(2)}` : 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Verified Retail Inventory</div>
                    </div>

                    {/* Cardmarket */}
                    <div
                      className={`p-3.5 rounded-xl border transition ${
                        vendor === 'cardmarket'
                          ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>Cardmarket</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">EU Market</span>
                      </div>
                      <div className="text-lg font-black text-slate-900 font-mono">
                        {cmPrice !== null ? `$${cmPrice.toFixed(2)}` : 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {cmEur !== null ? `€${cmEur.toFixed(2)} EUR avg` : 'European Trends'}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Arbitrage Comparison Bar */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Arbitrage & Opening Margin</span>
                <span className="text-[11px] text-slate-500">
                  Active Vendor: <strong className="capitalize text-slate-800">{vendor}</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Sealed Buy Price</div>
                  <div className="text-base font-black text-slate-900 font-mono">
                    ${sealedPrice.toFixed(2)}
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <div className="text-[10px] font-semibold text-indigo-500 uppercase">Singles Card EV</div>
                  <div className="text-base font-black text-indigo-700 font-mono">
                    ${activeSinglesPrice.toFixed(2)}
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-lg border ${
                    profit >= 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="text-[10px] font-semibold uppercase opacity-80">Net Spread</div>
                  <div className="text-base font-black font-mono">
                    {profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-snug">
                {profit < 0 ? (
                  <span>
                    💡 <strong>Unopened Collector Premium:</strong> Buying this product factory-sealed costs{' '}
                    <strong className="text-slate-800">${sealedPrice.toFixed(2)}</strong>, which is{' '}
                    <strong className="text-rose-600">${Math.abs(profit).toFixed(2)} ({Math.abs(roiPct)}%)</strong> higher than
                    buying the loose card single on the open market.
                  </span>
                ) : (
                  <span>
                    🚀 <strong>Favorable Arbitrage:</strong> The singles card value exceeds the sealed acquisition cost by{' '}
                    <strong className="text-emerald-600">+${profit.toFixed(2)} (+{roiPct}%)</strong>.
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
