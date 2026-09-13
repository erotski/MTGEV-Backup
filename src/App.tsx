import React, { useState, useEffect } from 'react';
import { INITIAL_BOX_ARBITRAGE, INITIAL_SETS, INITIAL_BOOSTER_EV_DATA } from './data';
import { PriceMode, Vendor, SetOption, BoxArbitrageRecord, BoosterEVRecord, EvBasis, PricingReliability } from './types';
import { resolveToMainSetCode } from './utils/setHierarchyUtils';
import { dataService } from './services/dataService';
import { ArbitrageLeaderboard } from './components/ArbitrageLeaderboard';
import { BoosterDetailExplorer } from './components/BoosterDetailExplorer';
import { SpecialChaseShowcase } from './components/SpecialChaseShowcase';
import { AdminPortal } from './components/AdminPortal';
import { GlobalControlFooter } from './components/GlobalControlFooter';
import { TrendingUp, Layers, Sparkles, Box, Sliders, Package, Database, Award } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'arbitrage' | 'explorer' | 'chase' | 'admin'>('arbitrage');
  const [selectedSetCode, setSelectedSetCode] = useState<string>('MH3');
  const [initialProductId, setInitialProductId] = useState<string>('');
  const [priceMode, setPriceMode] = useState<PriceMode>('direct');
  const [vendor, setVendor] = useState<Vendor>('all_cheapest');
  const [evBasis, setEvBasis] = useState<EvBasis>('avg');

  // Dynamic state loaded from pipeline JSON files
  const [availableSets, setAvailableSets] = useState<SetOption[]>(INITIAL_SETS);
  const [arbitrageRecords, setArbitrageRecords] = useState<BoxArbitrageRecord[]>(INITIAL_BOX_ARBITRAGE);
  const [boosterEvMap, setBoosterEvMap] = useState<Record<string, BoosterEVRecord[]>>(INITIAL_BOOSTER_EV_DATA);
  const [pricingReliability, setPricingReliability] = useState<Record<string, PricingReliability>>({});
  const [isLiveDatabase, setIsLiveDatabase] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadPipelineData() {
      try {
        setIsLoading(true);
        const [setsRes, arbsRes, evRes, reliabilityRes] = await Promise.all([
          dataService.getSets(),
          dataService.getArbitrageRecords(),
          dataService.getBoosterEVs(),
          dataService.getPricingReliability(),
        ]);

        if (setsRes.sets && setsRes.sets.length > 0) {
          setAvailableSets(setsRes.sets);
          setIsLiveDatabase(setsRes.isLive);
          setSelectedSetCode((prev) => {
            const resolved = resolveToMainSetCode(prev);
            const exists = setsRes.sets.some((s) => s.code === resolved);
            if (exists) return resolved;
            const firstMain = setsRes.sets.find((s) => !s.isCommanderSubSet);
            return firstMain ? firstMain.code : setsRes.sets[0].code;
          });
        }
        if (arbsRes && arbsRes.length > 0) {
          setArbitrageRecords(arbsRes);
        }
        if (evRes && Object.keys(evRes).length > 0) {
          setBoosterEvMap(evRes);
        }
        if (reliabilityRes && Object.keys(reliabilityRes).length > 0) {
          setPricingReliability(reliabilityRes);
        }
      } catch (err) {
        console.warn('Error loading dynamic pipeline data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadPipelineData();
  }, []);

  // Flattened Booster EV records for exploration
  const allBoosterRecords = Object.values(boosterEvMap).flat();
  const handleSelectSetFromArbitrage = (setCode: string, productUuid?: string) => {
    setSelectedSetCode(resolveToMainSetCode(setCode));
    if (productUuid) {
      setInitialProductId(productUuid);
    }
    setActiveTab('explorer');
  };

  const handleNavigateToExplorerFromAdmin = (setCode: string) => {
    setSelectedSetCode(resolveToMainSetCode(setCode));
    setActiveTab('explorer');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                MTG Booster EV & Cube Studio
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  isLiveDatabase 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {isLiveDatabase ? `Live Cloud DB (${arbitrageRecords.length} Products)` : 'Live TCG Engine'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Monte Carlo Expected Value & Products Overview</p>
            </div>
          </div>

          {/* Right Navigation Mode Tabs */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                id="tab-arbitrage-btn"
                onClick={() => setActiveTab('arbitrage')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'arbitrage'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Products Overview
              </button>
              <button
                id="tab-explorer-btn"
                onClick={() => setActiveTab('explorer')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'explorer'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Booster EV & Chase Cards
              </button>
              <button
                id="tab-admin-btn"
                onClick={() => setActiveTab('admin')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Admin Portal
              </button>
              <button
                id="tab-chase-btn"
                onClick={() => setActiveTab('chase')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'chase' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                Special Chases
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* View Switcher */}
        {activeTab === 'arbitrage' && (
          <ArbitrageLeaderboard
            records={arbitrageRecords}
            onSelectSet={handleSelectSetFromArbitrage}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            vendor={vendor}
            onVendorChange={setVendor}
            evBasis={evBasis}
            onEvBasisChange={setEvBasis}
            boosterEvMap={boosterEvMap}
            pricingReliability={pricingReliability}
          />
        )}

        {activeTab === 'explorer' && (
          <BoosterDetailExplorer
            selectedSetCode={selectedSetCode}
            onSelectSetCode={setSelectedSetCode}
            availableSets={availableSets}
            boosterRecords={allBoosterRecords}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            vendor={vendor}
            onVendorChange={setVendor}
            evBasis={evBasis}
            onEvBasisChange={setEvBasis}
            initialProductId={initialProductId}
            onClearInitialProductId={() => setInitialProductId('')}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPortal
            onNavigateToExplorer={handleNavigateToExplorerFromAdmin}
            vendor={vendor}
            onVendorChange={setVendor}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
          />
        )}

        {activeTab === 'chase' && (
          <SpecialChaseShowcase
            onSelectProduct={(setCode, productId) => {
              setSelectedSetCode(resolveToMainSetCode(setCode));
              setInitialProductId(productId);
              setActiveTab('explorer');
            }}
            vendor={vendor}
            priceMode={priceMode}
          />
        )}
      </main>

      {/* Persistent Global Valuation Control Footer */}
      <GlobalControlFooter
        evBasis={evBasis}
        onEvBasisChange={setEvBasis}
        priceMode={priceMode}
        onPriceModeChange={setPriceMode}
        vendor={vendor}
        onVendorChange={setVendor}
      />

      {/* Static Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-4 text-center text-xs text-slate-400">
        <p>
          MTG Booster EV & Products Overview — Powered by Scryfall Image & Symbol CDN, TCGplayer Direct APIs, MTGJSON sheets, and Monte Carlo simulations.
        </p>
      </footer>
    </div>
  );
}
