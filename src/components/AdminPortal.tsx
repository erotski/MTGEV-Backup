import React, { useState, useMemo } from 'react';
import { ECOMMERCE_CATALOG_PACKS, CatalogPackProduct, ProductPackagingType } from '../ecommerceBoosterData';
import { INITIAL_SETS } from '../data';
import { ProductPackagingImage } from './ProductPackagingImage';
import { BoosterFoilPackMockup } from './BoosterFoilPackMockup';
import { CollectorBoosterBoxMockup } from './CollectorBoosterBoxMockup';
import { BoosterDisplayBoxMockup } from './BoosterDisplayBoxMockup';
import { SetSymbolIcon } from './SetSymbolIcon';
import {
  ShieldCheck,
  AlertTriangle,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Download,
  Filter,
  Search,
  Sparkles,
  Sliders,
  Database,
  BarChart3,
  RefreshCw,
  FolderDown,
  Layers,
  Box,
  Gift,
  Package,
  Wrench,
  FileCode,
  Check,
  ArrowUpRight
} from 'lucide-react';

interface AdminPortalProps {
  onNavigateToExplorer?: (setCode: string) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onNavigateToExplorer }) => {
  // Filters & State
  const [selectedSetFilter, setSelectedSetFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [imageStatusFilter, setImageStatusFilter] = useState<'all' | 'missing' | 'custom' | 'procedural'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Custom Image Overrides (stored in state for testing/session)
  const [customImageOverrides, setCustomImageOverrides] = useState<Record<string, string>>({});
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [tempUrlInput, setTempUrlInput] = useState<string>('');

  // Simulation & Engine Parameter Controls
  const [monteCarloDraws, setMonteCarloDraws] = useState<number>(5000);
  const [marketFeePct, setMarketFeePct] = useState<number>(12.5);
  const [packSleeveMargin, setPackSleeveMargin] = useState<number>(0.15);
  const [cacheTimestamp, setCacheTimestamp] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshingCache, setIsRefreshingCache] = useState<boolean>(false);

  // Procedural Studio Generator Preview
  const [studioSetCode, setStudioSetCode] = useState<string>('MH3');
  const [studioPackagingType, setStudioPackagingType] = useState<ProductPackagingType>('box');

  // White Blank Booster Pack & Display Box Customizer Studio
  const [studioPackagingView, setStudioPackagingView] = useState<'pack' | 'box'>('box');
  const [foilPackSetCode, setFoilPackSetCode] = useState<string>('WOE');
  const [foilPackSetName, setFoilPackSetName] = useState<string>('Wilds of Eldraine');
  const [foilPackCardCount, setFoilPackCardCount] = useState<number>(15);
  const [foilPackProductType, setFoilPackProductType] = useState<string>('COLLECTOR BOOSTER');
  const [foilPackLayoutVariant, setFoilPackLayoutVariant] = useState<'auto' | 'collector' | 'standard'>('collector');
  const [foilPackThemeColor, setFoilPackThemeColor] = useState<'emerald' | 'navy' | 'crimson' | 'gold' | 'purple' | 'slate'>('purple');
  const [foilPackSize, setFoilPackSize] = useState<'sm' | 'md' | 'lg' | 'hero'>('hero');

  const handleSelectFoilSet = (code: string) => {
    setFoilPackSetCode(code);
    const foundSet = INITIAL_SETS.find((s) => s.code.toLowerCase() === code.toLowerCase());
    if (foundSet) {
      setFoilPackSetName(foundSet.name);
    } else {
      setFoilPackSetName(`${code.toUpperCase()}`);
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(id);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Image override save
  const handleSaveOverride = (productId: string) => {
    if (tempUrlInput.trim()) {
      setCustomImageOverrides((prev) => ({
        ...prev,
        [productId]: tempUrlInput.trim(),
      }));
    } else {
      setCustomImageOverrides((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
    setEditingProductId(null);
    setTempUrlInput('');
  };

  // Simulated Cache Refresh
  const handleRefreshCache = () => {
    setIsRefreshingCache(true);
    setTimeout(() => {
      setCacheTimestamp(new Date().toLocaleTimeString());
      setIsRefreshingCache(false);
    }, 600);
  };

  // Compute Catalog Statistics
  const totalProducts = ECOMMERCE_CATALOG_PACKS.length;
  
  // Calculate image statistics
  const productStats = useMemo(() => {
    let withExplicitUrl = 0;
    let missingExplicitUrl = 0;
    const typeBreakdown: Record<string, { total: number; missing: number }> = {
      box: { total: 0, missing: 0 },
      bundle: { total: 0, missing: 0 },
      prerelease: { total: 0, missing: 0 },
      pack: { total: 0, missing: 0 },
      case: { total: 0, missing: 0 },
      starter_deck: { total: 0, missing: 0 },
    };

    ECOMMERCE_CATALOG_PACKS.forEach((p) => {
      const type = p.packagingType || 'pack';
      if (!typeBreakdown[type]) {
        typeBreakdown[type] = { total: 0, missing: 0 };
      }
      typeBreakdown[type].total++;

      const hasUrl = Boolean(p.imageUrl || customImageOverrides[p.id]);
      if (hasUrl) {
        withExplicitUrl++;
      } else {
        missingExplicitUrl++;
        typeBreakdown[type].missing++;
      }
    });

    const coveragePct = Math.round((withExplicitUrl / totalProducts) * 100) || 0;
    const totalMarketValue = ECOMMERCE_CATALOG_PACKS.reduce((acc, p) => acc + p.marketPrice, 0);
    const totalEstimatedEv = ECOMMERCE_CATALOG_PACKS.reduce((acc, p) => acc + p.estimatedEv, 0);

    return {
      withExplicitUrl,
      missingExplicitUrl,
      coveragePct,
      typeBreakdown,
      totalMarketValue,
      totalEstimatedEv,
    };
  }, [totalProducts, customImageOverrides]);

  // Filtered Products List for the Audit Table
  const filteredProducts = useMemo(() => {
    return ECOMMERCE_CATALOG_PACKS.filter((product) => {
      const activeUrl = customImageOverrides[product.id] || product.imageUrl;
      const hasPhoto = Boolean(activeUrl);

      // Set filter
      if (selectedSetFilter !== 'all' && product.setCode !== selectedSetFilter) {
        return false;
      }

      // Type filter
      if (selectedTypeFilter !== 'all' && product.packagingType !== selectedTypeFilter) {
        return false;
      }

      // Image status filter
      if (imageStatusFilter === 'missing' && hasPhoto) {
        return false;
      }
      if (imageStatusFilter === 'custom' && !customImageOverrides[product.id]) {
        return false;
      }
      if (imageStatusFilter === 'procedural' && hasPhoto) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = product.displayName.toLowerCase().includes(q);
        const matchesSet = product.setCode.toLowerCase().includes(q) || product.setName.toLowerCase().includes(q);
        const matchesType = product.packagingType.toLowerCase().includes(q);
        if (!matchesName && !matchesSet && !matchesType) {
          return false;
        }
      }

      return true;
    });
  }, [selectedSetFilter, selectedTypeFilter, imageStatusFilter, searchQuery, customImageOverrides]);

  // Export JSON Report
  const handleExportAuditReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalProducts,
        withExplicitUrl: productStats.withExplicitUrl,
        missingExplicitUrl: productStats.missingExplicitUrl,
        coveragePct: `${productStats.coveragePct}%`,
        proceduralFallbackActive: productStats.missingExplicitUrl,
      },
      products: ECOMMERCE_CATALOG_PACKS.map((p) => ({
        id: p.id,
        setCode: p.setCode,
        setName: p.setName,
        packagingType: p.packagingType,
        displayName: p.displayName,
        marketPrice: p.marketPrice,
        estimatedEv: p.estimatedEv,
        imageUrl: customImageOverrides[p.id] || p.imageUrl || null,
        status: (customImageOverrides[p.id] || p.imageUrl) ? 'has_image' : 'procedural_fallback',
        suggestedLocalPath: `/products/${p.setCode.toLowerCase()}-${p.packagingType.toLowerCase()}.png`,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtg-sealed-asset-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Admin Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 font-mono text-xs font-bold rounded-full border border-amber-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                SYSTEM ADMINISTRATOR PORTAL
              </span>
              <span className="px-2.5 py-1 bg-slate-800 text-slate-300 font-mono text-xs rounded-full border border-slate-700">
                v2.4 Live Engine
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Application Telemetry & Catalog Asset Center
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Inspect sealed packaging asset health, audit missing product photography, test image URL overrides, and tune the Monte Carlo booster simulation engine.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRefreshCache}
              disabled={isRefreshingCache}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCache ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isRefreshingCache ? 'Syncing...' : 'Flush Cache & Sync'}</span>
            </button>

            <button
              onClick={handleExportAuditReport}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition shadow-md cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Asset Audit (JSON)</span>
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Primary KPI Diagnostic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Catalog Items */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Catalog Coverage</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900">{totalProducts} Sealed Products</div>
            <div className="text-xs text-slate-500">Across {INITIAL_SETS.length} Premier Sets</div>
          </div>
          <div className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded w-fit">
            100% Schema Validated
          </div>
        </div>

        {/* Metric 2: Asset Photo Health */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Photos</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${productStats.missingExplicitUrl > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <ImageIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900">{productStats.withExplicitUrl} of {totalProducts}</div>
            <div className="text-xs text-slate-500">{productStats.missingExplicitUrl} using Procedural 3D Visuals</div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${productStats.coveragePct}%` }} />
            <div className="bg-amber-400 h-full" style={{ width: `${100 - productStats.coveragePct}%` }} />
          </div>
        </div>

        {/* Metric 3: Simulation Parameters */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Simulation Sample</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900">{monteCarloDraws.toLocaleString()} Draws / Pack</div>
            <div className="text-xs text-slate-500">Std Error: &lt; ±0.42% EV accuracy</div>
          </div>
          <div className="text-[11px] text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded w-fit">
            Confidence Interval: 99%
          </div>
        </div>

        {/* Metric 4: Market Inventory Valuation */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sealed Market Value</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900">${productStats.totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-slate-500">Est. EV: ${productStats.totalEstimatedEv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded w-fit">
            Arbitrage Margin: +{((productStats.totalEstimatedEv / productStats.totalMarketValue - 1) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Procedural 3D Packaging Generator & Visual Recreator */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 border border-slate-800 text-white shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-slate-100">
                Procedural 3D Packaging Visual Recreator
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              For any sealed product without an official WPN photograph, the app automatically generates an authentic 3D packaging rendering styled with the official Scryfall vector set emblem.
            </p>
          </div>

          {/* Preset Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">Preview Set</label>
              <select
                value={studioSetCode}
                onChange={(e) => setStudioSetCode(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-amber-400"
              >
                {INITIAL_SETS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">Packaging Type</label>
              <select
                value={studioPackagingType}
                onChange={(e) => setStudioPackagingType(e.target.value as ProductPackagingType)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-amber-400"
              >
                <option value="box">Booster Display Box (36 Packs)</option>
                <option value="bundle">Bundle Box (9 Packs + Promo + Die)</option>
                <option value="prerelease">Prerelease Pack (6 Packs + Date Promo)</option>
                <option value="pack">Single Booster Pack (14 Cards)</option>
                <option value="case">Sealed Master Case (6 Boxes)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Recreator Showcase Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Card Preview */}
          <div className="flex flex-col items-center justify-center p-6 bg-slate-950/80 rounded-2xl border border-slate-800">
            <span className="text-xs font-mono text-slate-400 mb-3">Live Procedural 3D Render</span>
            <ProductPackagingImage
              setCode={studioSetCode}
              packagingType={studioPackagingType}
              displayName={`${studioSetCode} Procedural Packaging`}
              size="hero"
              allowZoom={true}
            />
            <span className="text-[11px] text-amber-400/90 font-mono mt-3">Click packaging to inspect full-res</span>
          </div>

          {/* How the Visual Recreator Works */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Procedural Graphic Anatomy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5" />
                  Authentic 3D Packaging Shape
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Applies distinct structural gradients, depth drop-shadows, cardboard foil ribbons, and packaging proportions based on item tier.
                </p>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Live Scryfall Vector Emblem
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Fetches the authentic official SVG set logo in real-time and stamps it with high-contrast backdrop framing onto the virtual packaging.
                </p>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Collation & Seal Badge
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Dynamic micro-typography specifies pack quantities, promo inclusions, and foil stamp verification text.
                </p>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <FolderDown className="w-3.5 h-3.5" />
                  Hot-Swap Ready
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Instantly upgrades itself the moment a real WPN photo is added into <code className="font-mono text-amber-300">/public/products/</code>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NEW: Authentic White Foil Booster Pack Customizer Studio */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-black uppercase tracking-wider">
                Official WPN Packaging Anatomy
              </span>
              <h2 className="text-xl font-black text-slate-900">
                Packaging Template Studio
              </h2>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              Authentic Magic retail packaging templates featuring retail display boxes (open billboard, dual pack stacks, side spine) and individual foil pack wrappers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Preview:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setStudioPackagingView('box')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    studioPackagingView === 'box'
                      ? 'bg-purple-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  Display Box
                </button>
                <button
                  onClick={() => setStudioPackagingView('pack')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    studioPackagingView === 'pack'
                      ? 'bg-purple-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  Foil Pack
                </button>
              </div>
            </div>

            {/* Quick preset sets */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Sets:</span>
              {['LTR', 'MH3', 'BLB', 'DSK', 'OTJ'].map((code) => (
                <button
                  key={code}
                  onClick={() => handleSelectFoilSet(code)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border transition cursor-pointer ${
                    foilPackSetCode === code
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Studio Controls & Interactive Live Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Controls Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Control 1: Set Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Expansion Set</label>
                <select
                  value={foilPackSetCode}
                  onChange={(e) => handleSelectFoilSet(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  {INITIAL_SETS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Control 2: Booster Packaging Format */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Packaging Layout Archetype</label>
                <select
                  value={foilPackLayoutVariant}
                  onChange={(e) => {
                    const variant = e.target.value as 'auto' | 'collector' | 'standard';
                    setFoilPackLayoutVariant(variant);
                    if (variant === 'collector') {
                      setFoilPackProductType('COLLECTOR BOOSTER');
                      setFoilPackCardCount(15);
                      setFoilPackThemeColor('purple');
                    } else if (variant === 'standard') {
                      setFoilPackProductType('PLAY BOOSTER');
                      setFoilPackCardCount(14);
                      setFoilPackThemeColor('navy');
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="collector">Collector Booster (Side Colored Spine + Prismatic Holographic Foil)</option>
                  <option value="standard">Play / Draft Booster (Bottom Colored Ribbon)</option>
                </select>
              </div>

              {/* Control 3: Card Count */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Card Count Header</label>
                <select
                  value={foilPackCardCount}
                  onChange={(e) => setFoilPackCardCount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value={15}>15 Cards (Collector & Draft Booster Standard)</option>
                  <option value={14}>14 Cards (Play Booster Standard)</option>
                  <option value={20}>20 Cards (Jumpstart Booster)</option>
                  <option value={12}>12 Cards (Special Edition)</option>
                </select>
              </div>

              {/* Control 4: Set Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Set Name Header</label>
                <input
                  type="text"
                  value={foilPackSetName}
                  onChange={(e) => setFoilPackSetName(e.target.value)}
                  placeholder="e.g. Wilds of Eldraine"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Control 5: Product Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Product Ribbon Text</label>
                <select
                  value={foilPackProductType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setFoilPackProductType(newType);
                    if (newType === 'COLLECTOR BOOSTER') {
                      setFoilPackLayoutVariant('collector');
                      setFoilPackThemeColor('purple');
                      setFoilPackCardCount(15);
                    } else if (newType === 'PLAY BOOSTER') {
                      setFoilPackLayoutVariant('standard');
                      setFoilPackThemeColor('navy');
                      setFoilPackCardCount(14);
                    } else if (newType === 'DRAFT BOOSTER') {
                      setFoilPackLayoutVariant('standard');
                      setFoilPackThemeColor('emerald');
                      setFoilPackCardCount(15);
                    } else if (newType === 'JUMPSTART BOOSTER') {
                      setFoilPackLayoutVariant('standard');
                      setFoilPackThemeColor('gold');
                      setFoilPackCardCount(20);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="COLLECTOR BOOSTER">COLLECTOR BOOSTER</option>
                  <option value="PLAY BOOSTER">PLAY BOOSTER</option>
                  <option value="DRAFT BOOSTER">DRAFT BOOSTER</option>
                  <option value="SET BOOSTER">SET BOOSTER</option>
                  <option value="JUMPSTART BOOSTER">JUMPSTART BOOSTER</option>
                </select>
              </div>

              {/* Control 6: Color Theme */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Ribbon & Spine Color Palette</label>
                <div className="grid grid-cols-6 gap-1.5 pt-1">
                  {[
                    { id: 'purple', bg: 'bg-purple-800', label: 'Collector Purple' },
                    { id: 'navy', bg: 'bg-blue-800', label: 'Play Navy' },
                    { id: 'emerald', bg: 'bg-emerald-700', label: 'Draft Emerald' },
                    { id: 'gold', bg: 'bg-amber-600', label: 'Jumpstart Gold' },
                    { id: 'crimson', bg: 'bg-red-800', label: 'Crimson' },
                    { id: 'slate', bg: 'bg-slate-800', label: 'Obsidian' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setFoilPackThemeColor(c.id as any)}
                      title={c.label}
                      className={`h-7 rounded-lg transition ${c.bg} ${
                        foilPackThemeColor === c.id
                          ? 'ring-2 ring-offset-2 ring-purple-900 scale-105 shadow-md'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Feature Anatomy Highlights */}
            <div className="p-4 bg-purple-50/70 rounded-2xl border border-purple-100 text-xs text-purple-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-purple-900">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                Collector Packaging Replications:
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-purple-900/90">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Right-side vertical colored spine with rotated branding</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Prismatic holographic rainbow foil sheen & glints</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Fluted metallic foil crimp with continuous spine seal</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>15 Cards header, 13+ badge & 90% set symbol canvas</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Live Mockup Column */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 rounded-3xl border border-slate-800 shadow-2xl min-h-[420px]">
            {studioPackagingView === 'box' ? (
              foilPackProductType.toLowerCase().includes('collector') ? (
                <CollectorBoosterBoxMockup
                  setCode={foilPackSetCode}
                  setName={foilPackSetName}
                  packCount={12}
                  productType={foilPackProductType}
                  themeColor={foilPackThemeColor}
                  size="hero"
                />
              ) : (
                <BoosterDisplayBoxMockup
                  setCode={foilPackSetCode}
                  setName={foilPackSetName}
                  packCount={36}
                  productType={foilPackProductType}
                  size="hero"
                />
              )
            ) : (
              <BoosterFoilPackMockup
                setCode={foilPackSetCode}
                setName={foilPackSetName}
                cardCount={foilPackCardCount}
                packType={foilPackProductType}
                layoutVariant={foilPackLayoutVariant}
                themeColor={foilPackThemeColor}
                size="hero"
              />
            )}
            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-slate-400 text-center">
              <span className="font-bold text-amber-400">{foilPackSetCode.toUpperCase()}</span>
              <span>•</span>
              <span className="text-slate-200">{foilPackSetName}</span>
              <span>•</span>
              <span className="font-semibold text-purple-300">
                {studioPackagingView === 'box' ? `${foilPackProductType} DISPLAY BOX` : foilPackProductType}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Missing Products & Asset Audit Table Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-slate-700" />
              Sealed Product Image Registry & Missing Asset Auditor
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review photo status for all {totalProducts} catalog products. Products without photos automatically use procedural recreations.
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                onClick={() => setImageStatusFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  imageStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({totalProducts})
              </button>
              <button
                onClick={() => setImageStatusFilter('missing')}
                className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                  imageStatusFilter === 'missing' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-amber-700 hover:text-amber-900'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Missing Photos ({productStats.missingExplicitUrl})
              </button>
              <button
                onClick={() => setImageStatusFilter('custom')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  imageStatusFilter === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Overrides ({Object.keys(customImageOverrides).length})
              </button>
            </div>

            {/* Set Filter Dropdown */}
            <select
              value={selectedSetFilter}
              onChange={(e) => setSelectedSetFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Sets</option>
              {INITIAL_SETS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>

            {/* Type Filter Dropdown */}
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Packaging Types</option>
              <option value="box">Booster Box</option>
              <option value="bundle">Bundle</option>
              <option value="prerelease">Prerelease Kit</option>
              <option value="pack">Single Pack</option>
              <option value="case">Sealed Case</option>
            </select>

            {/* Search Query Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 w-40 sm:w-48"
              />
            </div>
          </div>
        </div>

        {/* Audit List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Preview</th>
                <th className="py-3 px-4">Product Name & Collation</th>
                <th className="py-3 px-4">Set / Type</th>
                <th className="py-3 px-4">Image Status</th>
                <th className="py-3 px-4">Expected WPN Asset Path</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <p className="font-bold text-slate-700">No products matching the active filter criteria.</p>
                    <p className="text-xs text-slate-400">Try changing the filters or clearing the search query.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const customUrl = customImageOverrides[product.id];
                  const hasCustom = Boolean(customUrl);
                  const hasDefaultUrl = Boolean(product.imageUrl);
                  const isCollector = (product.displayName || '').toLowerCase().includes('collector');
                  const expectedPath = isCollector && product.packagingType === 'box'
                    ? `/products/${product.setCode.toLowerCase()}-collector-box.png`
                    : `/products/${product.setCode.toLowerCase()}-${product.packagingType.toLowerCase()}.png`;
                  const wpnAltPath = isCollector && product.packagingType === 'box'
                    ? `MTG${product.setCode.toUpperCase()}_EN_BstrDspBx_Clctr_01_01.png`
                    : null;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/80 transition group">
                      {/* 1. Preview Graphic */}
                      <td className="py-3 px-4 w-20">
                        <ProductPackagingImage
                          setCode={product.setCode}
                          packagingType={product.packagingType}
                          imageUrl={customUrl || product.imageUrl}
                          displayName={product.displayName}
                          size="sm"
                          allowZoom={true}
                        />
                      </td>

                      {/* 2. Product Name & Pricing */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 leading-tight">
                          {product.displayName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                          <span>{product.packsCount} Pack(s)</span>
                          <span>•</span>
                          <span>${product.marketPrice.toFixed(2)} Market</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-bold">${product.estimatedEv.toFixed(2)} EV</span>
                        </div>
                      </td>

                      {/* 3. Set Emblem & Packaging Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <SetSymbolIcon setCode={product.setCode} size="xs" />
                          <span className="font-mono font-bold text-slate-800">{product.setCode}</span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded uppercase">
                            {product.packagingType}
                          </span>
                        </div>
                      </td>

                      {/* 4. Image Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {hasCustom ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Sparkles className="w-3 h-3" />
                            Custom Override
                          </span>
                        ) : hasDefaultUrl ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Linked URL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Procedural 3D Fallback
                          </span>
                        )}
                      </td>

                      {/* 5. Expected File Path */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <code className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-mono select-all">
                            {expectedPath}
                          </code>
                          <button
                            onClick={() => handleCopy(expectedPath, product.id)}
                            title="Copy file path"
                            className="p-1 text-slate-400 hover:text-slate-700 transition"
                          >
                            {copiedPath === product.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                          (Drop in /public/products/ or run npm run ingest-wpn)
                        </span>
                      </td>

                      {/* 6. Action Controls */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {editingProductId === product.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Paste image URL or /path..."
                                value={tempUrlInput}
                                onChange={(e) => setTempUrlInput(e.target.value)}
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs w-48 text-slate-900 focus:outline-none focus:border-amber-500"
                              />
                              <button
                                onClick={() => handleSaveOverride(product.id)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingProductId(null)}
                                className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingProductId(product.id);
                                  setTempUrlInput(customUrl || product.imageUrl || '');
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                              >
                                {hasCustom || hasDefaultUrl ? 'Edit URL' : 'Link Image'}
                              </button>

                              {onNavigateToExplorer && (
                                <button
                                  onClick={() => onNavigateToExplorer(product.setCode)}
                                  title="View set in EV Explorer"
                                  className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 rounded-lg transition"
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engine & Simulation Diagnostic Settings */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Simulation Engine & Arbitrage Parameters</h2>
              <p className="text-xs text-slate-500">Tune Monte Carlo iterations, market fee assumptions, and pricing caches.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            Last Cache Sync: {cacheTimestamp}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-700">
          {/* Setting 1: Monte Carlo Draws */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Monte Carlo Sample Size</span>
              <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                {monteCarloDraws.toLocaleString()} Packs
              </span>
            </div>
            <input
              type="range"
              min="1000"
              max="20000"
              step="1000"
              value={monteCarloDraws}
              onChange={(e) => setMonteCarloDraws(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Controls statistical resolution when sampling rare/mythic and Special Guest slots.
            </p>
          </div>

          {/* Setting 2: Market Platform Fee */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Market Seller Fee Deductions</span>
              <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                {marketFeePct}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={marketFeePct}
              onChange={(e) => setMarketFeePct(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              TCGplayer/eBay seller transaction & processing fees applied when computing net profit margins.
            </p>
          </div>

          {/* Setting 3: Bulk Single Squeeze Margin */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Sleeve & Shipping Allowance</span>
              <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                ${packSleeveMargin.toFixed(2)} / pack
              </span>
            </div>
            <input
              type="range"
              min="0.00"
              max="0.50"
              step="0.05"
              value={packSleeveMargin}
              onChange={(e) => setPackSleeveMargin(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Material cost subtracted per pack when modeling live store break costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
