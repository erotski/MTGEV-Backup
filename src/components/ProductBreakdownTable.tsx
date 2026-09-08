import React, { useState } from 'react';
import { BoosterEVRecord, PriceMode, Vendor, PreconstructedDeckDetail } from '../types';
import {
  RecursiveProductBreakdownResult,
  resolveRecursiveProductAudit,
} from '../utils/productUtils';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Package,
  Layers3,
  Search,
  ArrowUpDown,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Boxes,
} from 'lucide-react';

export interface ProductBreakdownTableProps {
  product: any;
  arbitrageMap?: Record<string, any>;
  productMap?: Map<string, any>;
  preconDecks?: Record<string, PreconstructedDeckDetail>;
  boosterEvMap?: Record<string, BoosterEVRecord[]>;
  singleCardPrices?: any;
  vendor?: Vendor;
  priceMode?: PriceMode;
  reprintMultiplier?: number;
  auditResult?: RecursiveProductBreakdownResult | null;
  className?: string;
  theme?: 'dark' | 'light';
}

export const ProductBreakdownTable: React.FC<ProductBreakdownTableProps> = ({
  product,
  arbitrageMap = {},
  productMap = new Map(),
  preconDecks = {},
  boosterEvMap = {},
  singleCardPrices = { byUuid: {}, byName: {}, byNameSet: {} },
  vendor = 'all',
  priceMode = 'direct',
  reprintMultiplier = 1.0,
  auditResult: passedAuditResult,
  className = '',
  theme = 'dark',
}) => {
  const [expandedAuditDeck, setExpandedAuditDeck] = useState<number | null>(null);
  const [expandedSealedChild, setExpandedSealedChild] = useState<number | null>(null);
  const [auditDeckSearch, setAuditDeckSearch] = useState<string>('');
  const [auditDeckSort, setAuditDeckSort] = useState<'price_desc' | 'price_asc' | 'name'>('price_desc');

  if (!product) return null;

  // Resolve audit if not passed directly
  const audit: RecursiveProductBreakdownResult =
    passedAuditResult ||
    resolveRecursiveProductAudit(
      product,
      productMap,
      arbitrageMap,
      boosterEvMap,
      preconDecks,
      singleCardPrices,
      vendor || 'all',
      (priceMode || 'direct') as PriceMode,
      1
    );

  const uid = product.id || product.uuid || product.productUuid || '';
  const arb = arbitrageMap[uid];
  const marketPrice = product.marketPrice || (arb ? arb.marketPrice : 0);
  const totalEv = audit.totalEv > 0 ? audit.totalEv : (arb ? arb.totalEvAvg * reprintMultiplier : 0);
  const netSpread = totalEv > 0 && marketPrice > 0 ? Number((totalEv - marketPrice).toFixed(2)) : 0;
  const roiPct = marketPrice > 0 ? Number(((netSpread / marketPrice) * 100).toFixed(1)) : 0;

  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-2xl border ${
        isDark
          ? 'bg-slate-900 text-white border-slate-800'
          : 'bg-slate-950 text-white border-slate-800'
      } p-4.5 space-y-4 shadow-md ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
          <Calculator className="w-4 h-4" />
          <span className="uppercase tracking-wider">Sub-Item Price & EV Multiplication Audit</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-400">
          <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700">
            {audit.totalCards} Total Cards
          </span>
          {audit.totalPacks > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
              {audit.totalPacks} Packs
            </span>
          )}
          {audit.totalDecks > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">
              {audit.totalDecks} Decks
            </span>
          )}
          {audit.sealedItems.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
              {audit.sealedItems.reduce((acc, s) => acc + s.count, 0)} Sub-Products
            </span>
          )}
          {audit.otherItems.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {audit.otherItems.length} Accessories
            </span>
          )}
        </div>
      </div>

      {/* Table of Child Elements & Multipliers */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
              <th className="text-left pb-2 font-bold">Sub-Item Component</th>
              <th className="text-left pb-2 font-bold">Classification & Resolution</th>
              <th className="text-center pb-2 font-bold">Qty</th>
              <th className="text-right pb-2 font-bold text-slate-300">Unit EV</th>
              <th className="text-right pb-2 font-bold text-amber-400">Contents EV Subtotal</th>
              <th className="text-right pb-2 font-bold text-indigo-300">EV Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {/* Packs */}
            {audit.packItems.map((p, idx) => {
              const evShare = totalEv > 0 ? ((p.subtotalEv / totalEv) * 100).toFixed(1) : '0.0';
              return (
                <tr key={`audit-pack-${idx}`} className="hover:bg-slate-800/40">
                  <td className="py-2.5 text-slate-200 font-medium">
                    <span className="text-amber-400 mr-1.5">📦</span>
                    {p.packName}
                  </td>
                  <td className="py-2.5 text-slate-400 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                      Booster Pack • {p.set} ({p.cardsPerPack} cards/pack)
                    </span>
                  </td>
                  <td className="py-2.5 text-center font-bold text-indigo-300">×{p.count}</td>
                  <td className="py-2.5 text-right text-slate-300">${p.unitEv.toFixed(2)}</td>
                  <td className="py-2.5 text-right font-bold text-amber-400">${p.subtotalEv.toFixed(2)}</td>
                  <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                </tr>
              );
            })}

            {/* Standalone Cards */}
            {audit.cardItems.map((c, idx) => {
              const evShare = totalEv > 0 ? ((c.subtotalEv / totalEv) * 100).toFixed(1) : '0.0';
              return (
                <tr key={`audit-card-${idx}`} className="hover:bg-slate-800/40">
                  <td className="py-2.5 text-slate-200 font-medium">
                    <span className="text-emerald-400 mr-1.5">✨</span>
                    {c.name}
                    {c.foil ? (
                      <span className="ml-1.5 text-[10px] text-amber-300 font-bold px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/30">
                        ★ Foil
                      </span>
                    ) : (
                      <span className="ml-1.5 text-[10px] text-slate-400 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
                        Nonfoil
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-400 text-[11px]">
                    Singles / Promo • {c.set} {c.number ? `#${c.number}` : ''} (1 card)
                  </td>
                  <td className="py-2.5 text-center font-bold text-indigo-300">×{c.count}</td>
                  <td className="py-2.5 text-right text-slate-300">${c.unitEv.toFixed(2)}</td>
                  <td className="py-2.5 text-right font-bold text-amber-400">${c.subtotalEv.toFixed(2)}</td>
                  <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                </tr>
              );
            })}

            {/* Sealed Child Products */}
            {audit.sealedItems.map((s, idx) => {
              const evShare = totalEv > 0 ? ((s.subtotalEv / totalEv) * 100).toFixed(1) : '0.0';
              const isChildOpen = expandedSealedChild === idx;
              return (
                <React.Fragment key={`audit-sealed-${idx}`}>
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2.5 text-slate-200 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-blue-400">🎁</span>
                        <span>{s.name}</span>
                        {s.childBreakdown && (
                          <button
                            onClick={() => setExpandedSealedChild(isChildOpen ? null : idx)}
                            className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 flex items-center gap-1 transition cursor-pointer"
                          >
                            {isChildOpen ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                            <span>{isChildOpen ? 'Hide Sub-Items' : `Inspect (${s.totalCards} cards)`}</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-400 text-[11px]">
                      Sealed Unit • {s.set} • {s.totalCards} total cards
                    </td>
                    <td className="py-2.5 text-center font-bold text-indigo-300">×{s.count}</td>
                    <td className="py-2.5 text-right text-slate-300">${s.unitEv.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-bold text-amber-400">${s.subtotalEv.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                  </tr>
                  {/* Nested Sealed Child Drilldown */}
                  {isChildOpen && s.childBreakdown && (
                    <tr>
                      <td colSpan={6} className="p-3 bg-slate-950/90 border-y border-slate-800">
                        <div className="text-[11px] text-blue-300 font-bold mb-2 flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5" />
                          <span>Nested Breakdown for: {s.name} ({s.totalCards} cards resolved)</span>
                        </div>
                        <div className="space-y-1 pl-4 border-l border-blue-800/60 font-mono text-[11px]">
                          {s.childBreakdown.packItems.map((cp, cidx) => (
                            <div key={cidx} className="flex items-center justify-between text-slate-300 py-0.5">
                              <span>📦 {cp.packName} ×{cp.count} ({cp.cardsPerPack} cards/pk = {cp.totalCards} cards)</span>
                              <span className="text-amber-400 font-bold">${cp.subtotalEv.toFixed(2)}</span>
                            </div>
                          ))}
                          {s.childBreakdown.cardItems.map((cc, cidx) => (
                            <div key={cidx} className="flex items-center justify-between text-slate-300 py-0.5">
                              <span>✨ {cc.name} ×{cc.count} {cc.foil ? '(Foil)' : ''}</span>
                              <span className="text-amber-400 font-bold">${cc.subtotalEv.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Decks */}
            {audit.deckItems.map((d, idx) => {
              const evShare = totalEv > 0 ? ((d.subtotalSinglesEv / totalEv) * 100).toFixed(1) : '0.0';
              const isDeckAuditOpen = expandedAuditDeck === idx;
              const deckCards = d.cards || [];
              const filterTerm = auditDeckSearch.toLowerCase().trim();
              const filteredDeckCards = deckCards.filter((c: any) =>
                !filterTerm || (c.name || '').toLowerCase().includes(filterTerm) || (c.type || '').toLowerCase().includes(filterTerm)
              );
              const sortedDeckCards = [...filteredDeckCards].sort((a: any, b: any) => {
                if (auditDeckSort === 'price_desc') return (b.totalPrice || b.price || 0) - (a.totalPrice || a.price || 0);
                if (auditDeckSort === 'price_asc') return (a.totalPrice || a.price || 0) - (b.totalPrice || b.price || 0);
                return (a.name || '').localeCompare(b.name || '');
              });
              const top3 = [...deckCards].sort((a: any, b: any) => (b.price || 0) - (a.price || 0)).slice(0, 3);

              return (
                <React.Fragment key={`audit-deck-fragment-${idx}`}>
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2.5 text-slate-200 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">🎴</span>
                        <span>{d.name}</span>
                        {d.isFoil ? (
                          <span className="text-[10px] text-amber-300 font-bold px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/30">
                            ★ Foil Deck
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
                            Nonfoil Deck
                          </span>
                        )}
                        {deckCards.length > 0 && (
                          <button
                            onClick={() => setExpandedAuditDeck(isDeckAuditOpen ? null : idx)}
                            className="ml-2 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 transition flex items-center gap-1 cursor-pointer"
                          >
                            {isDeckAuditOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>{isDeckAuditOpen ? 'Hide Cards' : `Breakdown ${d.cardCount} Cards`}</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-400 text-[11px]">
                      Precon Deck • {d.cardCount} Cards
                    </td>
                    <td className="py-2.5 text-center font-bold text-indigo-300">×{d.count}</td>
                    <td className="py-2.5 text-right text-slate-300">${d.unitSinglesEv.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-bold text-amber-400">${d.subtotalSinglesEv.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-bold text-indigo-300">{evShare}%</td>
                  </tr>

                  {/* Inline Deck Cards Pricing Breakdown */}
                  {isDeckAuditOpen && deckCards.length > 0 && (
                    <tr>
                      <td colSpan={6} className="p-3 bg-slate-950/80 border-y border-slate-800">
                        <div className="space-y-2.5">
                          {/* Top singles pills */}
                          {top3.length > 0 && top3[0]?.price > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Top Value Singles:
                              </span>
                              {top3.map((c: any, cidx: number) => (
                                <span
                                  key={`top-${cidx}`}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 font-semibold"
                                >
                                  {c.name} (${c.price?.toFixed(2)})
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Deck Cards Search & Sort Controls */}
                          <div className="flex items-center justify-between gap-3 pt-1">
                            <div className="relative flex-1 max-w-xs">
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                              <input
                                type="text"
                                placeholder="Search deck cards..."
                                value={auditDeckSearch}
                                onChange={(e) => setAuditDeckSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                              />
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                              <select
                                value={auditDeckSort}
                                onChange={(e) => setAuditDeckSort(e.target.value as any)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-amber-400"
                              >
                                <option value="price_desc">Price: High to Low</option>
                                <option value="price_asc">Price: Low to High</option>
                                <option value="name">Card Name: A-Z</option>
                              </select>
                            </div>
                          </div>

                          {/* Deck Cards Table */}
                          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-800">
                            <table className="w-full text-xs font-mono">
                              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase sticky top-0">
                                <tr>
                                  <th className="text-left p-2">Card Name</th>
                                  <th className="text-left p-2">Type</th>
                                  <th className="text-center p-2">Qty</th>
                                  <th className="text-right p-2">Unit Price</th>
                                  <th className="text-right p-2">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40">
                                {sortedDeckCards.map((c: any, cidx: number) => (
                                  <tr key={`dc-${cidx}`} className="hover:bg-slate-900/60">
                                    <td className="p-2 text-slate-200">
                                      <div className="flex items-center gap-1.5">
                                        <span>{c.name}</span>
                                        {c.foil && (
                                          <span className="text-[9px] text-amber-300 font-bold px-1 rounded bg-amber-400/10">
                                            ★
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-2 text-slate-400 text-[11px] truncate max-w-[140px]">{c.type || 'Card'}</td>
                                    <td className="p-2 text-center text-slate-300">{c.count || 1}</td>
                                    <td className="p-2 text-right text-slate-300">${(c.price || 0).toFixed(2)}</td>
                                    <td className="p-2 text-right font-bold text-amber-400">${(c.totalPrice || c.price || 0).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Variable Slots */}
            {audit.variableItems.map((v, idx) => (
              <tr key={`audit-variable-${idx}`} className="hover:bg-slate-800/40">
                <td className="py-2.5 text-slate-200 font-medium">
                  <span className="text-yellow-400 mr-1.5">🎲</span>
                  Variable Slot #{v.slotIndex + 1}
                </td>
                <td className="py-2.5 text-slate-400 text-[11px]">
                  {v.configs.length} Probabilistic Configurations
                </td>
                <td className="py-2.5 text-center font-bold text-indigo-300">1 Slot</td>
                <td className="py-2.5 text-right text-slate-300">${v.slotEv.toFixed(2)}</td>
                <td className="py-2.5 text-right font-bold text-amber-400">${v.slotEv.toFixed(2)}</td>
                <td className="py-2.5 text-right font-bold text-indigo-300">
                  {totalEv > 0 ? ((v.slotEv / totalEv) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            ))}

            {/* Accessories / Other Items (EV: $0.00) */}
            {audit.otherItems.map((o, idx) => (
              <tr key={`audit-other-${idx}`} className="hover:bg-slate-800/40 opacity-75">
                <td className="py-2.5 text-slate-300">
                  <span className="text-slate-500 mr-1.5">🏷️</span>
                  {o.name}
                </td>
                <td className="py-2.5 text-slate-400 text-[11px]">{o.category} (Physical Item)</td>
                <td className="py-2.5 text-center font-bold text-slate-400">×{o.count}</td>
                <td className="py-2.5 text-right text-slate-500">$0.00</td>
                <td className="py-2.5 text-right text-slate-500 font-mono">$0.00</td>
                <td className="py-2.5 text-right text-slate-500 font-mono">0.0%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reconciliation Summary Footer */}
      <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="space-y-1">
          <div className="text-slate-400">
            • Product Market Price:{' '}
            <strong className="text-emerald-400">${marketPrice.toFixed(2)}</strong>
          </div>
          <div className="text-slate-400">
            • Aggregated Contents EV:{' '}
            {totalEv > 0 ? (
              <strong className="text-amber-400">${totalEv.toFixed(2)}</strong>
            ) : (
              <span className="text-slate-400 italic">Pending EV</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-right">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Net Arbitrage Spread</div>
            {totalEv > 0 ? (
              <div className={`text-sm font-bold ${netSpread >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {netSpread >= 0 ? `+$${netSpread.toFixed(2)}` : `-$${Math.abs(netSpread).toFixed(2)}`}
                <span className="text-xs font-normal text-slate-400 ml-1">
                  ({roiPct >= 0 ? `+${roiPct}%` : `${roiPct}%`})
                </span>
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-400">—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
