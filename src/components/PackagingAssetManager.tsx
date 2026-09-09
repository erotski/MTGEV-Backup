import React, { useState, useMemo, useEffect } from 'react';
import { ECOMMERCE_CATALOG_PACKS, CatalogPackProduct, ProductPackagingType } from '../ecommerceBoosterData';
import { INITIAL_SETS } from '../data';
import { dataService } from '../services/dataService';
import {
  loadSavedAssetMappings,
  saveAssetMappings,
  ProductAssetMapping,
  guessAssetSlotsForProduct,
  KNOWN_SYSTEM_ASSET_FILES,
  MATCHING_RULES,
  getProductEffectiveAssetSlots,
  GuessMatchResult,
} from '../utils/productAssetMatcher';
import { ProductPackagingImage } from './ProductPackagingImage';
import {
  Sparkles,
  Lock,
  Unlock,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Search,
  Filter,
  Check,
  Download,
  Upload,
  Eye,
  Sliders,
  Package,
  Layers,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';

interface PackagingAssetManagerProps {
  onSelectProductPreview?: (product: CatalogPackProduct) => void;
}

export const PackagingAssetManager: React.FC<PackagingAssetManagerProps> = ({
  onSelectProductPreview,
}) => {
  const [mappings, setMappings] = useState<Record<string, ProductAssetMapping>>(() => loadSavedAssetMappings());
  const [catalogProducts, setCatalogProducts] = useState<CatalogPackProduct[]>(ECOMMERCE_CATALOG_PACKS);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [selectedSetFilter, setSelectedSetFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'manual' | 'guessed' | 'empty'>('all');
  const [previewProduct, setPreviewProduct] = useState<CatalogPackProduct | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showRuleGuide, setShowRuleGuide] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    dataService.getSealedProducts()
      .then((sealedList) => {
        if (isMounted && Array.isArray(sealedList) && sealedList.length > 0) {
          const mapped: CatalogPackProduct[] = sealedList.map((p) => {
            const id = String(p.id || p.uuid || '').trim();
            const setCode = String(p.setCode || p.set_code || 'SET').toUpperCase();
            const name = p.displayName || p.name || 'Sealed Product';
            const lowerName = name.toLowerCase();

            let packagingType: ProductPackagingType = 'box';
            if (lowerName.includes('booster pack') || lowerName.includes('pack')) packagingType = 'pack';
            else if (lowerName.includes('bundle')) packagingType = 'bundle';
            else if (lowerName.includes('booster box') || lowerName.includes('display')) packagingType = 'box';
            else if (lowerName.includes('collector') || lowerName.includes('collector booster')) packagingType = 'booster';

            return {
              id: id || `${setCode}-${name}`,
              setCode,
              setName: setCode,
              displayName: name,
              packagingType,
              imageUrl: p.imageUrl || p.image_url,
              cardCount: p.cardCount,
              marketPrice: p.marketPrice || p.price,
            };
          });

          const existingIds = new Set(ECOMMERCE_CATALOG_PACKS.map(p => p.id));
          const combined = [
            ...ECOMMERCE_CATALOG_PACKS,
            ...mapped.filter(p => !existingIds.has(p.id))
          ];
          setCatalogProducts(combined);
        }
      })
      .catch((err) => {
        console.warn('Failed loading sealed products for asset manager:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingProducts(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Available files list (including known assets + user additions)
  const [knownFilesList, setKnownFilesList] = useState<string[]>(KNOWN_SYSTEM_ASSET_FILES);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sync state to localStorage whenever mappings change
  const updateMappings = (newMappings: Record<string, ProductAssetMapping>) => {
    setMappings(newMappings);
    saveAssetMappings(newMappings);
  };

  // Toggle manual override for a specific product
  const handleToggleManual = (product: CatalogPackProduct) => {
    const current = mappings[product.id];
    const isNowManual = current ? !current.isManualOverride : true;

    // If enabling manual for the first time, populate with effective slots
    let slots = current?.slots || [];
    if (slots.length === 0) {
      const effective = getProductEffectiveAssetSlots(product, mappings, knownFilesList);
      slots = effective.slots;
    }

    const updated: ProductAssetMapping = {
      productId: product.id,
      setCode: product.setCode,
      isManualOverride: isNowManual,
      slots: slots.slice(0, 10),
      updatedAt: new Date().toISOString(),
    };

    updateMappings({
      ...mappings,
      [product.id]: updated,
    });

    showToast(isNowManual ? `Locked manual overrides for ${product.displayName}` : `Reverted to auto-matcher for ${product.displayName}`);
  };

  // Update a specific slot value
  const handleUpdateSlot = (product: CatalogPackProduct, slotIndex: number, newValue: string) => {
    const current = mappings[product.id] || {
      productId: product.id,
      setCode: product.setCode,
      isManualOverride: true,
      slots: [],
    };

    const newSlots = [...(current.slots || [])];
    while (newSlots.length <= slotIndex) {
      newSlots.push('');
    }
    newSlots[slotIndex] = newValue.trim();

    // Also add to known files list if it's a new clean filename
    const cleanName = newValue.replace(/^\/products\//, '').trim();
    if (cleanName && !knownFilesList.includes(cleanName)) {
      setKnownFilesList((prev) => [cleanName, ...prev]);
    }

    updateMappings({
      ...mappings,
      [product.id]: {
        ...current,
        isManualOverride: true,
        slots: newSlots.slice(0, 10),
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // Add a new slot
  const handleAddSlot = (product: CatalogPackProduct) => {
    const current = mappings[product.id] || {
      productId: product.id,
      setCode: product.setCode,
      isManualOverride: true,
      slots: [],
    };

    if ((current.slots || []).length >= 10) {
      showToast('Maximum 10 image slots reached per product');
      return;
    }

    const newSlots = [...(current.slots || []), ''];
    updateMappings({
      ...mappings,
      [product.id]: {
        ...current,
        isManualOverride: true,
        slots: newSlots,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // Remove a slot
  const handleRemoveSlot = (product: CatalogPackProduct, slotIndex: number) => {
    const current = mappings[product.id];
    if (!current) return;

    const newSlots = current.slots.filter((_, idx) => idx !== slotIndex);
    updateMappings({
      ...mappings,
      [product.id]: {
        ...current,
        slots: newSlots,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // Reorder slots
  const handleMoveSlot = (product: CatalogPackProduct, slotIndex: number, direction: 'up' | 'down') => {
    const current = mappings[product.id];
    if (!current || !current.slots) return;

    const targetIndex = direction === 'up' ? slotIndex - 1 : slotIndex + 1;
    if (targetIndex < 0 || targetIndex >= current.slots.length) return;

    const newSlots = [...current.slots];
    const temp = newSlots[slotIndex];
    newSlots[slotIndex] = newSlots[targetIndex];
    newSlots[targetIndex] = temp;

    updateMappings({
      ...mappings,
      [product.id]: {
        ...current,
        slots: newSlots,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // Run Guessing Game on a single product
  const handleRunGuessSingle = (product: CatalogPackProduct) => {
    const guesses = guessAssetSlotsForProduct(product, knownFilesList, 10);
    const guessedUrls = guesses.map((g) => g.url);

    updateMappings({
      ...mappings,
      [product.id]: {
        productId: product.id,
        setCode: product.setCode,
        isManualOverride: true, // Lock the guessed slots so user can tweak them
        slots: guessedUrls,
        updatedAt: new Date().toISOString(),
      },
    });

    showToast(`Smart Guesser assigned ${guessedUrls.length} image slots to ${product.displayName}`);
  };

  // Run Guessing Game on all products in the filtered set
  const handleAutoGuessSet = () => {
    const targetProducts = catalogProducts.filter((p) => {
      if (selectedSetFilter !== 'all' && p.setCode.toLowerCase() !== selectedSetFilter.toLowerCase()) {
        return false;
      }
      // Skip manually locked products unless user confirms
      const current = mappings[p.id];
      return !(current && current.isManualOverride);
    });

    const newMappings = { ...mappings };
    let count = 0;

    targetProducts.forEach((p) => {
      const guesses = guessAssetSlotsForProduct(p, knownFilesList, 10);
      if (guesses.length > 0) {
        newMappings[p.id] = {
          productId: p.id,
          setCode: p.setCode,
          isManualOverride: false, // Keep unlocked
          slots: guesses.map((g) => g.url),
          updatedAt: new Date().toISOString(),
        };
        count++;
      }
    });

    updateMappings(newMappings);
    showToast(`Guessed asset mappings for ${count} product(s) in set [${selectedSetFilter.toUpperCase()}]`);
  };

  // Export JSON configuration
  const handleExportJson = () => {
    const data = {
      exportVersion: '2.0',
      exportedAt: new Date().toISOString(),
      mappings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-asset-mappings-${selectedSetFilter}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported mapping configuration JSON');
  };

  // Import JSON configuration
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.mappings) {
          updateMappings({ ...mappings, ...parsed.mappings });
          showToast(`Imported mappings for ${Object.keys(parsed.mappings).length} products`);
        } else {
          showToast('Invalid JSON mapping structure');
        }
      } catch {
        showToast('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
  };

  // Filtered Products List
  const filteredProducts = useMemo(() => {
    return catalogProducts.filter((product) => {
      if (selectedSetFilter !== 'all' && product.setCode.toLowerCase() !== selectedSetFilter.toLowerCase()) {
        return false;
      }
      if (selectedTypeFilter !== 'all' && product.packagingType.toLowerCase() !== selectedTypeFilter.toLowerCase()) {
        return false;
      }

      const mapping = mappings[product.id];
      const isManual = mapping?.isManualOverride;
      const hasSlots = mapping?.slots && mapping.slots.length > 0;

      if (statusFilter === 'manual' && !isManual) return false;
      if (statusFilter === 'guessed' && isManual) return false;
      if (statusFilter === 'empty' && hasSlots) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = product.displayName.toLowerCase().includes(q);
        const matchCode = product.setCode.toLowerCase().includes(q);
        const matchType = product.packagingType.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchType) return false;
      }

      return true;
    });
  }, [selectedSetFilter, selectedTypeFilter, statusFilter, searchQuery, mappings]);

  return (
    <div className="space-y-6">
      {/* Header & Description */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 font-mono text-xs font-bold rounded-full border border-amber-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                PACKAGING ASSET MATCHER & STUDIO
              </span>
              <span className="px-2.5 py-1 bg-slate-800 text-slate-300 font-mono text-xs rounded-full border border-slate-700">
                Max 10 Slots / Product
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Product Packaging Image Mapper & Guesser
            </h2>
            <p className="text-sm text-slate-400 max-w-3xl">
              Solve WPN marketing filenames with the intelligent Guessing Game engine. Map up to 10 image slots per product (Primary Front, Pack Arts 01–05, Box Angles, Inside Kits). Toggle <strong>Manual Override</strong> to lock your selections so background tools won't modify them.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowRuleGuide(!showRuleGuide)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 transition cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>{showRuleGuide ? 'Hide Rules' : 'Guessing Game Rules'}</span>
            </button>

            <button
              onClick={handleAutoGuessSet}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition shadow-md cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Auto-Guess Unlocked ({selectedSetFilter.toUpperCase()})</span>
            </button>

            <button
              onClick={handleExportJson}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export JSON</span>
            </button>

            <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 transition cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Import JSON</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mt-4 px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-300 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* Matching Rules Explainer Drawer */}
      {showRuleGuide && (
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 text-xs text-slate-300 space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <span className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" />
              How the Guessing Game Matcher Works
            </span>
            <span className="text-[11px] text-slate-400">Exact token heuristic parser</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {MATCHING_RULES.map((rule, idx) => (
              <div key={idx} className="p-3 bg-slate-900/80 rounded-xl border border-slate-700/60">
                <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {rule.label}
                </div>
                <div className="text-[11px] text-amber-300/90 font-mono">{rule.description}</div>
                <div className="text-[10px] text-slate-400 mt-1">Target Type: {rule.targetType}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Set Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Set:</span>
            <select
              value={selectedSetFilter}
              onChange={(e) => setSelectedSetFilter(e.target.value)}
              className="text-xs font-bold bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Sets</option>
              {INITIAL_SETS.map((s) => (
                <option key={s.code} value={s.code.toLowerCase()}>
                  {s.name} ({s.code.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Packaging Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type:</span>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="text-xs font-bold bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="pack">Booster Pack</option>
              <option value="box">Display Box</option>
              <option value="bundle">Bundle / Scene</option>
              <option value="prerelease">Prerelease / Draft Night</option>
              <option value="starter_deck">Starter Deck / Commander</option>
              <option value="case">Case</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs font-bold bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="manual">Manual Overrides (Locked)</option>
              <option value="guessed">Auto-Guessed</option>
              <option value="empty">No Slots Configured</option>
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search product name, code, file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Products Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
          <span>Showing {filteredProducts.length} Products</span>
          <span>Set: {selectedSetFilter.toUpperCase()}</span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">No products found matching filters</div>
            <p className="text-xs text-slate-400">Try selecting a different set or clearing your search term.</p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const mapping = mappings[product.id];
            const isManual = Boolean(mapping?.isManualOverride);
            const effective = getProductEffectiveAssetSlots(product, mappings, knownFilesList);
            const slots = isManual ? (mapping?.slots || []) : effective.slots;
            const guesses = effective.guesses;

            return (
              <div
                key={product.id}
                className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                  isManual ? 'border-amber-400/80 ring-1 ring-amber-400/40' : 'border-slate-200'
                }`}
              >
                {/* Product Card Header */}
                <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Compact Live Thumbnail Preview */}
                    <div className="w-14 h-18 bg-slate-900 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-slate-300 shadow-xs relative">
                      <ProductPackagingImage
                        setCode={product.setCode}
                        setName={product.setName}
                        packagingType={product.packagingType}
                        displayName={product.displayName}
                        imageUrl={slots[0]}
                        size="xs"
                        cardCount={product.cardsPerPack}
                      />
                      {slots.length > 1 && (
                        <span className="absolute bottom-1 right-1 bg-amber-500 text-slate-950 font-mono font-black text-[9px] px-1 rounded-sm shadow-xs">
                          {slots.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-900 text-white font-mono text-[10px] font-bold rounded-md">
                          {product.setCode.toUpperCase()}
                        </span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md uppercase">
                          {product.packagingType}
                        </span>
                        {isManual ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Manual Override Locked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-md flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            Auto-Guessed Match
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">
                        {product.displayName}
                      </h3>
                      <div className="text-xs text-slate-500 flex items-center gap-3 font-mono">
                        <span>Price: ${(product.marketPrice ?? 0).toFixed(2)}</span>
                        <span>•</span>
                        <span>EV: ${(product.estimatedEv ?? 0).toFixed(2)}</span>
                        <span>•</span>
                        <span>Slots: {slots.length} / 10</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Manual Override Toggle */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Toggle Button */}
                    <button
                      onClick={() => handleToggleManual(product)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        isManual
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                      }`}
                    >
                      {isManual ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      <span>{isManual ? 'Manual: LOCKED' : 'Enable Manual Override'}</span>
                    </button>

                    {/* Run Guesser on this single product */}
                    <button
                      onClick={() => handleRunGuessSingle(product)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      title="Run guessing game heuristics and fill slots"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Re-Guess Assets</span>
                    </button>

                    {/* Live Preview Button */}
                    <button
                      onClick={() => setPreviewProduct(product)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Preview Gallery</span>
                    </button>
                  </div>
                </div>

                {/* 10 Image Slots Section */}
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                      Assigned Image Files ({slots.length} of max 10 slots)
                    </span>
                    {slots.length < 10 && (
                      <button
                        onClick={() => handleAddSlot(product)}
                        className="text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Slot</span>
                      </button>
                    )}
                  </div>

                  {/* Slot Items */}
                  {slots.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                      No custom image slots assigned. Click <strong>"Re-Guess Assets"</strong> or <strong>"Add Slot"</strong> to assign pictures.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {slots.map((slotUrl, index) => {
                        const isPrimary = index === 0;
                        const slotLabel = isPrimary
                          ? 'Slot 1 (Primary Front Render)'
                          : `Slot ${index + 1} (Art / Variation 0${index + 1})`;

                        return (
                          <div
                            key={index}
                            className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3 relative group hover:border-slate-300 transition"
                          >
                            {/* Slot Thumbnail */}
                            <div className="w-12 h-16 bg-slate-900 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-slate-300 relative shadow-xs">
                              {slotUrl ? (
                                <img
                                  src={slotUrl}
                                  alt={slotLabel}
                                  className="w-full h-full object-contain p-0.5"
                                  onError={(e) => {
                                    // Fallback icon on broken image
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-600" />
                              )}
                              <span className="absolute top-0.5 left-0.5 bg-slate-950/80 text-[8px] font-mono font-bold text-amber-300 px-1 rounded-xs">
                                #{index + 1}
                              </span>
                            </div>

                            {/* Slot Input & Selectors */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  {slotLabel}
                                </span>
                                {/* Reorder & Delete controls */}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleMoveSlot(product, index, 'up')}
                                    disabled={index === 0}
                                    className="p-1 rounded-md hover:bg-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer"
                                    title="Move Up"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveSlot(product, index, 'down')}
                                    disabled={index === slots.length - 1}
                                    className="p-1 rounded-md hover:bg-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer"
                                    title="Move Down"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveSlot(product, index)}
                                    className="p-1 rounded-md hover:bg-rose-100 text-rose-600 cursor-pointer"
                                    title="Remove Slot"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Direct Text Input for File Path */}
                              <input
                                type="text"
                                value={slotUrl}
                                placeholder={`e.g. /products/${product.setCode.toLowerCase()}-pack_01.png`}
                                onChange={(e) => handleUpdateSlot(product, index, e.target.value)}
                                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />

                              {/* Dropdown Quick Match Picker */}
                              <select
                                value={knownFilesList.includes(slotUrl.replace(/^\/products\//, '')) ? slotUrl.replace(/^\/products\//, '') : ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleUpdateSlot(product, index, `/products/${e.target.value}`);
                                  }
                                }}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                              >
                                <option value="">Select from detected files...</option>
                                {knownFilesList.map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Guessing Suggestions Chips */}
                  {guesses.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Smart Guesser Candidates for this Product:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {guesses.map((guess, gIdx) => {
                          const isAssigned = slots.includes(guess.url);
                          return (
                            <button
                              key={gIdx}
                              onClick={() => {
                                if (!isAssigned && slots.length < 10) {
                                  const current = mappings[product.id] || {
                                    productId: product.id,
                                    setCode: product.setCode,
                                    isManualOverride: true,
                                    slots: [],
                                  };
                                  updateMappings({
                                    ...mappings,
                                    [product.id]: {
                                      ...current,
                                      isManualOverride: true,
                                      slots: [...slots, guess.url].slice(0, 10),
                                      updatedAt: new Date().toISOString(),
                                    },
                                  });
                                }
                              }}
                              disabled={isAssigned || slots.length >= 10}
                              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-semibold flex items-center gap-1 transition ${
                                isAssigned
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-60'
                                  : 'bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 cursor-pointer'
                              }`}
                              title={`Score: ${guess.score}% • ${guess.reason}`}
                            >
                              <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                              <span>{guess.filename}</span>
                              <span className="text-[9px] text-slate-400">({guess.score}%)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Live Preview Modal */}
      {previewProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 text-white space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold font-mono text-amber-400 uppercase">
                  Live Packaging Preview
                </span>
                <h3 className="text-lg font-black">{previewProduct.displayName}</h3>
              </div>
              <button
                onClick={() => setPreviewProduct(null)}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[320px] border border-slate-800">
              <ProductPackagingImage
                setCode={previewProduct.setCode}
                setName={previewProduct.setName}
                packagingType={previewProduct.packagingType}
                displayName={previewProduct.displayName}
                imageUrl={mappings[previewProduct.id]?.slots?.[0] || previewProduct.imageUrl}
                size="hero"
                allowZoom={true}
                cardCount={previewProduct.cardsPerPack}
              />
            </div>

            <div className="text-xs text-slate-400 space-y-1 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
              <div className="font-bold text-slate-200">Active Image Slots ({mappings[previewProduct.id]?.slots?.length || 1}):</div>
              <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px] text-amber-300/80">
                {(mappings[previewProduct.id]?.slots || [previewProduct.imageUrl || 'Auto-matched']).map((s, idx) => (
                  <li key={idx}>Slot {idx + 1}: {s}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setPreviewProduct(null)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Done Testing
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
