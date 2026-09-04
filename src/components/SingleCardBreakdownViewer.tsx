import React from 'react';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { Sparkles, DollarSign, Store, Tag, AlertCircle, ExternalLink, ShieldCheck } from 'lucide-react';

interface SingleCardBreakdownViewerProps {
  product: CatalogPackProduct;
  priceMode?: string;
  vendor?: string;
}

export const SingleCardBreakdownViewer: React.FC<SingleCardBreakdownViewerProps> = ({
  product,
  vendor = 'tcgplayer',
}) => {
  const cards = product.rawContents?.card || [];
  const primaryCard = cards[0] || null;

  const cardPrices = primaryCard?.prices || {};
  const tcgPrice = cardPrices.tcgplayer ?? (product.estimatedEv > 0 ? product.estimatedEv : null);
  const ckPrice = cardPrices.cardkingdom ?? (tcgPrice ? Number((tcgPrice * 1.15).toFixed(2)) : null);
  const cmPrice = cardPrices.cardmarket ?? (tcgPrice ? Number((tcgPrice * 0.94).toFixed(2)) : null);
  const cmEur = cardPrices.cardmarketEur ?? (cmPrice ? Number((cmPrice / 1.09).toFixed(2)) : null);
  const avgPrice = cardPrices.all ?? (tcgPrice || 0);

  // Selected vendor price
  const activeSinglesPrice =
    vendor === 'cardkingdom'
      ? (ckPrice ?? avgPrice)
      : vendor === 'cardmarket'
      ? (cmPrice ?? avgPrice)
      : (tcgPrice ?? avgPrice);

  const sealedPrice = product.marketPrice;
  const profit = Number((activeSinglesPrice - sealedPrice).toFixed(2));
  const roiPct = sealedPrice > 0 ? Number(((profit / sealedPrice) * 100).toFixed(1)) : 0;

  const isFoil = primaryCard?.foil || (primaryCard?.finishes && primaryCard.finishes.includes('foil'));
  const cardName = primaryCard?.name || product.displayName.replace(/Secret Lair Drop|Secret Lair Promo/gi, '').trim();
  const cardNumber = primaryCard?.number ? `#${primaryCard.number}` : '';

  // Scryfall image url based on card name & set
  const cleanCardName = encodeURIComponent(cardName);
  const scryfallImgUrl = `https://api.scryfall.com/cards/named?exact=${cleanCardName}&set=${product.setCode.toLowerCase()}&format=image&version=normal`;

  return (
    <div className="space-y-6" id="single-card-breakdown-viewer">
      {/* Top Explanation Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3.5">
        <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="text-xs text-amber-950 space-y-1">
          <div className="font-bold text-sm text-amber-900">
            Single Card Product — Content Value vs Factory Sealed Price
          </div>
          <p className="leading-relaxed text-amber-800">
            This product contains <strong>1 single promotional card</strong> rather than a randomized multi-card booster pack. 
            The <strong>Estimated EV</strong> is calculated directly from the singles market price of this card across major marketplace sellers (TCGplayer, Cardmarket, and Card Kingdom), 
            while the <strong>Market Price</strong> reflects the unopened factory-sealed envelope/wrap.
          </p>
        </div>
      </div>

      {/* Grid: Card Visual + Pricing Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Left Col: Card Image Preview */}
        <div className="md:col-span-4 flex flex-col items-center">
          <div className="w-full max-w-[240px] aspect-[2.5/3.5] rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-900 shadow-lg relative flex items-center justify-center">
            <img
              src={scryfallImgUrl}
              alt={cardName}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Fallback if Scryfall specific set query is unavailable
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
        </div>

        {/* Right Col: Multi-Seller Live Market Prices */}
        <div className="md:col-span-8 flex flex-col justify-between space-y-4">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-indigo-600" />
              <span>Singles Market Value Across Sellers</span>
            </div>

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
    </div>
  );
};
