import React, { useState } from 'react';
import { CHASE_CARDS_BY_SET, INITIAL_BOX_ARBITRAGE, INITIAL_SETS, MOCK_BOOSTER_EV_DATA } from './data';
import { PriceMode, Vendor } from './types';
import { ArbitrageLeaderboard } from './components/ArbitrageLeaderboard';
import { BoosterDetailExplorer } from './components/BoosterDetailExplorer';
import { CubeBuilderStudio } from './components/CubeBuilderStudio';
import { AdminPortal } from './components/AdminPortal';
import { TrendingUp, Layers, Sparkles, Box, Sliders, Dices, Package } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'arbitrage' | 'explorer' | 'cube' | 'admin'>('arbitrage');
  const [selectedSetCode, setSelectedSetCode] = useState<string>('MH3');
  const [priceMode, setPriceMode] = useState<PriceMode>('direct');
  const [vendor, setVendor] = useState<Vendor>('all');

  // Flattened Booster EV records for exploration
  const allBoosterRecords = Object.values(MOCK_BOOSTER_EV_DATA).flat();
  const currentChaseCards = CHASE_CARDS_BY_SET[selectedSetCode] || CHASE_CARDS_BY_SET['MH3'] || [];

  const handleSelectSetFromArbitrage = (setCode: string) => {
    setSelectedSetCode(setCode);
    setActiveTab('explorer');
  };

  const handleNavigateToExplorerFromAdmin = (setCode: string) => {
    setSelectedSetCode(setCode);
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
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                  Live TCG Engine
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
                id="tab-cube-btn"
                onClick={() => setActiveTab('cube')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'cube'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Dices className="w-3.5 h-3.5" />
                Cube & Pack Builder
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
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* View Switcher */}
        {activeTab === 'arbitrage' && (
          <ArbitrageLeaderboard
            records={INITIAL_BOX_ARBITRAGE}
            onSelectSet={handleSelectSetFromArbitrage}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            vendor={vendor}
            onVendorChange={setVendor}
          />
        )}

        {activeTab === 'explorer' && (
          <BoosterDetailExplorer
            selectedSetCode={selectedSetCode}
            onSelectSetCode={setSelectedSetCode}
            availableSets={INITIAL_SETS}
            boosterRecords={allBoosterRecords}
            chaseCards={currentChaseCards}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            vendor={vendor}
            onVendorChange={setVendor}
          />
        )}

        {activeTab === 'cube' && <CubeBuilderStudio />}

        {activeTab === 'admin' && (
          <AdminPortal onNavigateToExplorer={handleNavigateToExplorerFromAdmin} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-auto">
        <p>
          MTG Booster EV & Products Overview — Powered by Scryfall Image & Symbol CDN, TCGplayer Direct APIs, MTGJSON sheets, and Monte Carlo simulations.
        </p>
      </footer>
    </div>
  );
}
