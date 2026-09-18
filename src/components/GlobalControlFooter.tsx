import React from 'react';
import { PriceMode, Vendor, EvBasis } from '../types';
import { SlidersHorizontal, Calculator, DollarSign, Store, Info } from 'lucide-react';

interface GlobalControlFooterProps {
  evBasis: EvBasis;
  onEvBasisChange: (basis: EvBasis) => void;
  priceMode: PriceMode;
  onPriceModeChange: (mode: PriceMode) => void;
  vendor: Vendor;
  onVendorChange: (vendor: Vendor) => void;
}

export const GlobalControlFooter: React.FC<GlobalControlFooterProps> = ({
  evBasis,
  onEvBasisChange,
  priceMode,
  onPriceModeChange,
  vendor,
  onVendorChange,
}) => {
  const getBasisLabel = (basis: EvBasis) => {
    switch (basis) {
      case 'min':
        return 'Floor (Min)';
      case 'mid90':
        return 'Mid 90%';
      case 'avg':
        return 'Average (Mean)';
      case 'max':
        return 'Ceiling (Max)';
    }
  };

  const getVendorLabel = (v: Vendor) => {
    switch (v) {
      case 'all_cheapest':
        return 'All Vendors (Cheapest)';
      case 'all_average':
        return 'All Vendors (Average)';
      case 'tcgplayer':
        return 'TCGplayer';
      case 'cardmarket':
        return 'Cardmarket';
      case 'cardkingdom':
        return 'Card Kingdom';
      case 'manapool':
        return 'Manapool';
      default:
        return v;
    }
  };

  return (
    <footer
      id="global-valuation-footer"
      className="sticky bottom-0 z-40 bg-slate-900/95 backdrop-blur-md text-white border-t border-slate-800 shadow-2xl transition-all"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          {/* Left: Global Valuation Controls Indicator */}
          <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shadow-xs">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-xs font-black tracking-tight text-white flex items-center gap-2">
                <span>Valuation Settings</span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  Global Impact
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Applies to all EV calculations, products, and spreads
              </p>
            </div>
          </div>

          {/* Center / Right Controls Group */}
          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2.5 sm:gap-3 w-full lg:w-auto">
            {/* 1. EV Calculation Basis Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1.5 pr-0.5 flex items-center gap-1">
                <Calculator className="w-3 h-3 text-amber-400" />
                <span>Basis:</span>
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  id="footer-ev-basis-min-btn"
                  onClick={() => onEvBasisChange('min')}
                  title="Calculate values on Minimum EV Floor (worst-case collation simulation)"
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                    evBasis === 'min'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <span>Floor</span>
                </button>
                <button
                  type="button"
                  id="footer-ev-basis-mid90-btn"
                  onClick={() => onEvBasisChange('mid90')}
                  title="Calculate values on Mid 90% EV (5-95th percentile trimmed EV)"
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                    evBasis === 'mid90'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <span>Mid 90%</span>
                </button>
                <button
                  type="button"
                  id="footer-ev-basis-avg-btn"
                  onClick={() => onEvBasisChange('avg')}
                  title="Calculate values on Average EV (Mathematical Mean of all simulations)"
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                    evBasis === 'avg'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <span>Mean (Avg)</span>
                </button>
                <button
                  type="button"
                  id="footer-ev-basis-max-btn"
                  onClick={() => onEvBasisChange('max')}
                  title="Calculate values on Maximum EV Ceiling (jackpot collation ceiling)"
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                    evBasis === 'max'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <span>Ceiling</span>
                </button>
              </div>
            </div>

            {/* 2. Pricing Mode Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1.5 pr-0.5 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                <span>Price:</span>
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  id="footer-mode-direct-btn"
                  onClick={() => onPriceModeChange('direct')}
                  title="Use exact card printing prices from the target set"
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    priceMode === 'direct'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  Direct Set
                </button>
                <button
                  type="button"
                  id="footer-mode-reprint-btn"
                  onClick={() => onPriceModeChange('cheapest_reprint')}
                  title="Price cards using lowest available tournament-legal reprint (-18% discount)"
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    priceMode === 'cheapest_reprint'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  Cheapest Reprint
                </button>
              </div>
            </div>

            {/* 3. Vendor Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700/80 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Store className="w-3 h-3 text-blue-400" />
                <span>Vendor:</span>
              </span>
              <select
                id="footer-vendor-select"
                value={vendor}
                onChange={(e) => onVendorChange(e.target.value as Vendor)}
                className="text-[11px] font-bold bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
              >
                <option value="all_cheapest">All Vendors (Cheapest)</option>
                <option value="all_average">All Vendors (Average)</option>
                <option value="tcgplayer">TCGplayer</option>
                <option value="cardmarket">Cardmarket (EUR)</option>
                <option value="cardkingdom">Card Kingdom</option>
                <option value="manapool">Manapool</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
