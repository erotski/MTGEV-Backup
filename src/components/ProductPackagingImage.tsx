import React, { useState, useEffect } from 'react';
import { ProductPackagingType } from '../ecommerceBoosterData';
import { SetSymbolIcon } from './SetSymbolIcon';
import { BoosterFoilPackMockup, cleanPureSetName } from './BoosterFoilPackMockup';
import { CollectorBoosterBoxMockup } from './CollectorBoosterBoxMockup';
import { BoosterDisplayBoxMockup } from './BoosterDisplayBoxMockup';
import { Package, Box as BoxIcon, Archive, Gift, Layers3, Sparkles, Image as ImageIcon, ZoomIn, X, Crown, ChevronLeft, ChevronRight, Layers, RotateCw } from 'lucide-react';

interface ProductPackagingImageProps {
  setCode: string;
  setName: string;
  packagingType: ProductPackagingType;
  imageUrl?: string;
  displayName: string;
  cardCount?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  themeColor?: 'emerald' | 'navy' | 'crimson' | 'gold' | 'purple' | 'slate';
  allowZoom?: boolean;
}

export const ProductPackagingImage: React.FC<ProductPackagingImageProps> = ({
  setCode,
  setName,
  packagingType,
  imageUrl,
  displayName,
  cardCount,
  size = 'md',
  className = '',
  themeColor,
  allowZoom = false,
}) => {
  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [hasImageLoaded, setHasImageLoaded] = useState<boolean>(false);
  const [allCandidatesFailed, setAllCandidatesFailed] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [activeVariationIdx, setActiveVariationIdx] = useState<number>(0);
  const [foundVariations, setFoundVariations] = useState<string[]>([]);

  const cleanCode = (setCode || '').toLowerCase().trim();
  const cleanType = (packagingType || 'pack').toLowerCase().trim();
  const cleanName = (displayName || '').toLowerCase().trim();
  const isCollector = cleanName.includes('collector');
  const isGift = cleanName.includes('gift');
  const isJumpstart = cleanName.includes('jumpstart');
  const isStarter = cleanName.includes('starter') || cleanName.includes('beginner');
  const isPrerelease = cleanName.includes('prerelease') || cleanName.includes('pre-release');

  // Generate candidate list of local and remote image paths to test
  const candidateUrls = React.useMemo(() => {
    const urls: string[] = [];
    if (imageUrl && imageUrl.trim().length > 0) {
      urls.push(imageUrl.trim());
    }

    if (cleanCode) {
      // 1. Slugified display name candidates (e.g. /products/hob-riders_of_rohan.png)
      const nameSlug = cleanName
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      if (nameSlug) {
        urls.push(`/products/${cleanCode}-${nameSlug}.png`);
        urls.push(`/products/${cleanCode}-${nameSlug}.webp`);
        const strippedSlug = nameSlug
          .replace(/^(commander_deck_|commander_|deck_|scene_box_|scene_)/, '');
        if (strippedSlug && strippedSlug !== nameSlug) {
          urls.push(`/products/${cleanCode}-commander_${strippedSlug}.png`);
          urls.push(`/products/${cleanCode}-deck_${strippedSlug}.png`);
          urls.push(`/products/${cleanCode}-${strippedSlug}.png`);
        }
      }

      // 2. Specialty product types
      if (isGift) {
        urls.push(`/products/${cleanCode}-gift_bundle.png`);
        urls.push(`/products/${cleanCode}-gift.png`);
      }

      if (isCollector) {
        if (cleanType === 'pack' || cleanName.includes('pack')) {
          urls.push(`/products/${cleanCode}-collector_pack.png`);
        }
        urls.push(`/products/${cleanCode}-collector.png`);
        urls.push(`/products/${cleanCode}-collector_box.png`);
        urls.push(`/products/${cleanCode}-collector.webp`);
      }

      if (isJumpstart) {
        if (cleanType === 'pack' || cleanName.includes('pack')) {
          urls.push(`/products/${cleanCode}-jumpstart_pack.png`);
        }
        urls.push(`/products/${cleanCode}-jumpstart_box.png`);
        urls.push(`/products/${cleanCode}-jumpstart.png`);
      }

      if (isStarter) {
        urls.push(`/products/${cleanCode}-starter_kit.png`);
        urls.push(`/products/${cleanCode}-starter.png`);
      }

      if (isPrerelease) {
        urls.push(`/products/${cleanCode}-prerelease.png`);
        urls.push(`/products/${cleanCode}-pr.png`);
      }

      // 3. Standard type files
      urls.push(`/products/${cleanCode}-${cleanType}.png`);
      urls.push(`/products/${cleanCode}-${cleanType}.webp`);
      urls.push(`/products/${cleanCode}-${cleanType}.jpg`);

      // 4. Common packaging aliases
      if (cleanType === 'box') {
        urls.push(`/products/${cleanCode}-box.png`);
        urls.push(`/products/${cleanCode}-play_box.png`);
        urls.push(`/products/${cleanCode}-display.png`);
        urls.push(`/products/${cleanCode}-booster_box.png`);
      } else if (cleanType === 'pack') {
        urls.push(`/products/${cleanCode}-pack.png`);
        urls.push(`/products/${cleanCode}-play_pack.png`);
        urls.push(`/products/${cleanCode}-booster.png`);
      } else if (cleanType === 'bundle') {
        urls.push(`/products/${cleanCode}-bundle.png`);
        urls.push(`/products/${cleanCode}-fatpack.png`);
      } else if (cleanType === 'prerelease' || cleanType === 'limited_aid_tool') {
        urls.push(`/products/${cleanCode}-prerelease.png`);
        urls.push(`/products/${cleanCode}-pr.png`);
      } else if (cleanType === 'case' || cleanType === 'bundle_case') {
        urls.push(`/products/${cleanCode}-case.png`);
      } else if (cleanType === 'starter_deck') {
        urls.push(`/products/${cleanCode}-deck.png`);
        urls.push(`/products/${cleanCode}-commander.png`);
      }
    }

    // Deduplicate while preserving priority order
    return Array.from(new Set(urls));
  }, [imageUrl, cleanCode, cleanType, cleanName, isCollector, isGift, isJumpstart, isStarter, isPrerelease]);

  // Reset image candidate testing when props change
  useEffect(() => {
    setCandidateIndex(0);
    setHasImageLoaded(false);
    setAllCandidatesFailed(candidateUrls.length === 0);
    setFoundVariations([]);
    setActiveVariationIdx(0);
  }, [candidateUrls]);

  const handleImageError = () => {
    if (candidateIndex < candidateUrls.length - 1) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setAllCandidatesFailed(true);
    }
  };

  const handleImageSuccess = () => {
    setHasImageLoaded(true);
  };

  const activeSrc = candidateUrls[candidateIndex];

  // Discover and probe other angle & art variations for this product
  useEffect(() => {
    if (!hasImageLoaded || !activeSrc) return;

    let isMounted = true;
    setFoundVariations([activeSrc]);

    const basePathWithoutExt = activeSrc.replace(/\.(png|webp|jpg|jpeg)$/i, '');
    const variationCandidates: string[] = [];

    // Check _01 through _06 variations
    for (let i = 1; i <= 6; i++) {
      const padNum = i.toString().padStart(2, '0');
      const varPath = `${basePathWithoutExt}_${padNum}.png`;
      if (varPath !== activeSrc) {
        variationCandidates.push(varPath);
      }
    }

    // Check play_pack variations if it's a pack
    if (cleanType === 'pack' && !basePathWithoutExt.includes('play_pack')) {
      for (let i = 1; i <= 5; i++) {
        const padNum = i.toString().padStart(2, '0');
        const varPath = `/products/${cleanCode}-play_pack_${padNum}.png`;
        if (varPath !== activeSrc && !variationCandidates.includes(varPath)) {
          variationCandidates.push(varPath);
        }
      }
    }

    // Probe candidates gently in the background
    variationCandidates.forEach((candidateUrl) => {
      const img = new Image();
      img.src = candidateUrl;
      img.onload = () => {
        if (!isMounted) return;
        setFoundVariations((prev) => {
          if (prev.includes(candidateUrl)) return prev;
          return [...prev, candidateUrl];
        });
      };
    });

    return () => {
      isMounted = false;
    };
  }, [hasImageLoaded, activeSrc, cleanType, cleanCode]);

  // Keyboard navigation for zoomed gallery
  useEffect(() => {
    if (!isZoomed) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomed(false);
      } else if (e.key === 'ArrowRight' && foundVariations.length > 1) {
        setActiveVariationIdx((prev) => (prev + 1) % foundVariations.length);
      } else if (e.key === 'ArrowLeft' && foundVariations.length > 1) {
        setActiveVariationIdx((prev) => (prev - 1 + foundVariations.length) % foundVariations.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed, foundVariations.length]);

  const currentDisplaySrc = foundVariations[activeVariationIdx] || activeSrc;

  const handleNextVariation = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (foundVariations.length > 1) {
      setActiveVariationIdx((prev) => (prev + 1) % foundVariations.length);
    }
  };

  const handlePrevVariation = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (foundVariations.length > 1) {
      setActiveVariationIdx((prev) => (prev - 1 + foundVariations.length) % foundVariations.length);
    }
  };

  // Dynamic packaging styles and themes for procedural fallback
  const getPackagingTheme = () => {
    const isGift = (displayName || '').toLowerCase().includes('gift');
    const isCommander = (displayName || '').toLowerCase().includes('commander');
    const isBlister = (displayName || '').toLowerCase().includes('blister') || (displayName || '').toLowerCase().includes('3-pack');

    switch (packagingType) {
      case 'case':
        if (isCollector) {
          return {
            label: 'Collector Master Case',
            icon: Archive,
            gradient: 'from-purple-950 via-slate-900 to-indigo-950',
            accent: 'border-purple-500/40 text-purple-300',
            badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
            sealText: '6 COLLECTOR BOXES (72 PACKS)',
            sub: '1,080 Premium Foil MTG Cards',
          };
        }
        return {
          label: 'Master Case',
          icon: Archive,
          gradient: 'from-rose-950 via-slate-900 to-rose-900',
          accent: 'border-rose-500/40 text-rose-300',
          badgeBg: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
          sealText: 'FACTORY SEALED CASE',
          sub: '6 Display Boxes (216 Packs)',
        };
      case 'box':
        if (isCollector) {
          return {
            label: 'Collector Booster Display',
            icon: Crown,
            gradient: 'from-slate-950 via-purple-950 to-indigo-950',
            accent: 'border-purple-500/50 text-purple-300',
            badgeBg: 'bg-purple-950/90 text-purple-200 border-purple-500/60',
            sealText: '12 FACTORY SEALED PACKS',
            sub: '180 Premium Foil MTG Cards',
          };
        }
        return {
          label: 'Booster Display Box',
          icon: BoxIcon,
          gradient: 'from-slate-900 via-indigo-950 to-slate-900',
          accent: 'border-indigo-500/40 text-indigo-300',
          badgeBg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
          sealText: '36 SEALED BOOSTERS',
          sub: '504 MTG Cards Total',
        };
      case 'bundle':
        if (isGift) {
          return {
            label: 'Gift Bundle Box',
            icon: Sparkles,
            gradient: 'from-amber-950 via-purple-950 to-amber-900',
            accent: 'border-amber-500/50 text-amber-300',
            badgeBg: 'bg-amber-950/90 text-amber-200 border-amber-500/60',
            sealText: '9 PLAY + 1 COLLECTOR PACK',
            sub: 'Includes Gold Spindown + Lands',
          };
        }
        return {
          label: 'Bundle Box',
          icon: Gift,
          gradient: 'from-purple-950 via-slate-900 to-fuchsia-950',
          accent: 'border-purple-500/40 text-purple-300',
          badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
          sealText: '9 PACKS + PROMO + DIE',
          sub: 'Includes 30 Basic Lands',
        };
      case 'bundle_case':
        if (isGift) {
          return {
            label: 'Gift Bundle Master Case',
            icon: Archive,
            gradient: 'from-amber-950 via-slate-900 to-purple-950',
            accent: 'border-amber-500/50 text-amber-300',
            badgeBg: 'bg-amber-950/90 text-amber-200 border-amber-500/60',
            sealText: '6 GIFT BUNDLES (60 PACKS)',
            sub: '54 Play + 6 Collector Boosters',
          };
        }
        return {
          label: 'Bundle Master Case',
          icon: Archive,
          gradient: 'from-purple-950 via-slate-900 to-indigo-950',
          accent: 'border-purple-500/40 text-purple-300',
          badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
          sealText: '6 FACTORY SEALED BUNDLES',
          sub: '54 Play Boosters (756 Cards)',
        };
      case 'sample_pack':
        return {
          label: 'Sample Booster Pack',
          icon: Sparkles,
          gradient: 'from-purple-950 via-slate-900 to-amber-950',
          accent: 'border-purple-500/40 text-purple-300',
          badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
          sealText: '2-CARD PROMO PACK',
          sub: '1 Foil + 1 Showcase/Alt-Art',
        };
      case 'limited_aid_tool':
      case 'prerelease':
        return {
          label: 'Prerelease Pack',
          icon: Sparkles,
          gradient: 'from-emerald-950 via-slate-900 to-teal-950',
          accent: 'border-emerald-500/40 text-emerald-300',
          badgeBg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
          sealText: '6 BOOSTERS + DATE PROMO',
          sub: 'Deck Box & Spindown',
        };
      case 'box_set': {
        const isSldBundle = displayName.toLowerCase().includes('bundle') || displayName.toLowerCase().includes('superdrop');
        const isSld = displayName.toLowerCase().includes('secret lair');
        if (isSldBundle) {
          return {
            label: 'Secret Lair Bundle',
            icon: Sparkles,
            gradient: 'from-amber-950 via-purple-950 to-indigo-950',
            accent: 'border-amber-400/50 text-amber-300',
            badgeBg: 'bg-amber-950/90 text-amber-200 border-amber-500/60',
            sealText: 'SUPERDROP BUNDLE',
            sub: 'Curated Secret Lair Collection',
          };
        }
        if (isSld) {
          return {
            label: 'Secret Lair Drop',
            icon: Sparkles,
            gradient: 'from-purple-950 via-slate-900 to-indigo-950',
            accent: 'border-purple-400/50 text-purple-300',
            badgeBg: 'bg-purple-950/90 text-purple-200 border-purple-500/60',
            sealText: 'CURATED DROP BOX',
            sub: 'Special Collector Cards',
          };
        }
        return {
          label: 'Box Set',
          icon: Sparkles,
          gradient: 'from-slate-900 via-indigo-950 to-slate-950',
          accent: 'border-indigo-400/40 text-indigo-300',
          badgeBg: 'bg-indigo-950/80 text-indigo-200 border-indigo-700/60',
          sealText: 'FACTORY SEALED BOX SET',
          sub: 'Collector Edition',
        };
      }
      case 'kit':
        return {
          label: 'Specialty Kit',
          icon: Sparkles,
          gradient: 'from-teal-950 via-slate-900 to-slate-950',
          accent: 'border-teal-500/40 text-teal-300',
          badgeBg: 'bg-teal-950/80 text-teal-300 border-teal-700/60',
          sealText: 'TOOLKIT & ACCESSORIES',
          sub: 'Cards & Supplies',
        };
      case 'starter_deck': {
        const isCommander = displayName.toLowerCase().includes('commander');
        const isSinglePrecon = !displayName.toLowerCase().includes('set of') && !displayName.toLowerCase().includes('4 decks') && !displayName.toLowerCase().includes('(4x)');
        if (isCollector) {
          if (isSinglePrecon) {
            return {
              label: isCommander ? "Collector's Precon Deck" : "Collector's Deck",
              icon: Crown,
              gradient: 'from-amber-950 via-purple-950 to-slate-950',
              accent: 'border-amber-500/50 text-amber-300',
              badgeBg: 'bg-amber-950/90 text-amber-200 border-amber-500/60',
              sealText: isCommander ? '100% RIPPLE FOIL (100 CARDS)' : 'PRECONSTRUCTED FOIL DECK',
              sub: 'Deck Box + Promos',
            };
          }
          return {
            label: "Collector's Deck Set",
            icon: Crown,
            gradient: 'from-amber-950 via-purple-950 to-slate-950',
            accent: 'border-amber-500/50 text-amber-300',
            badgeBg: 'bg-amber-950/90 text-amber-200 border-amber-500/60',
            sealText: '100% RIPPLE FOIL SET',
            sub: 'Collector Foil Decks',
          };
        }
        if (isSinglePrecon) {
          return {
            label: isCommander ? 'Commander Precon Deck' : 'Preconstructed Deck',
            icon: Layers3,
            gradient: 'from-amber-950 via-slate-900 to-stone-900',
            accent: 'border-amber-500/40 text-amber-300',
            badgeBg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
            sealText: isCommander ? '100-CARD READY-TO-PLAY DECK' : 'READY-TO-PLAY DECK',
            sub: 'Complete Precon Deck',
          };
        }
        return {
          label: isCommander ? 'Commander Decks (Set of 4)' : 'Preconstructed Decks (Multi-Pack)',
          icon: Layers3,
          gradient: 'from-amber-950 via-slate-900 to-stone-900',
          accent: 'border-amber-500/40 text-amber-300',
          badgeBg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
          sealText: 'MULTIPLE DECKS INCLUDED',
          sub: 'Multi-Deck Box Set',
        };
      }
      default:
        if (isBlister) {
          return {
            label: '3-Pack Blister',
            icon: Package,
            gradient: 'from-slate-900 via-blue-950 to-slate-950',
            accent: 'border-blue-500/40 text-blue-300',
            badgeBg: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
            sealText: '3 PACKS + FOIL PROMO',
            sub: '43 Cards Total',
          };
        }
        return {
          label: 'Booster Pack',
          icon: Package,
          gradient: 'from-slate-900 via-slate-800 to-slate-950',
          accent: 'border-slate-600/40 text-slate-300',
          badgeBg: 'bg-slate-800 text-slate-200 border-slate-700',
          sealText: '14-CARD BOOSTER',
          sub: 'Standard Collation',
        };
    }
  };

  const theme = getPackagingTheme();
  const Icon = theme.icon;

  const sizeClasses = {
    xs: 'w-12 h-16 text-[8px]',
    sm: 'w-16 h-20 text-[10px]',
    md: 'w-24 h-32 text-xs',
    lg: 'w-36 h-48 text-xs',
    hero: 'w-48 h-64 text-sm',
  };

  const hasMultipleVariations = foundVariations.length > 1;

  // 1. If a local or remote product photo is available and hasn't failed all candidates
  if (!allCandidatesFailed && activeSrc) {
    return (
      <>
        <div
          onClick={(e) => {
            if (allowZoom) {
              setIsZoomed(true);
            } else if (hasMultipleVariations) {
              handleNextVariation(e);
            }
          }}
          className={`relative rounded-xl overflow-hidden shadow-md bg-slate-950 border border-slate-800 flex items-center justify-center select-none group ${
            allowZoom || hasMultipleVariations ? 'cursor-pointer hover:border-amber-500/50 transition' : ''
          } ${sizeClasses[size]} ${className}`}
        >
          <img
            key={currentDisplaySrc}
            src={currentDisplaySrc}
            alt={displayName}
            onLoad={handleImageSuccess}
            onError={handleImageError}
            className={`w-full h-full object-contain p-1.5 transition-all duration-300 ${
              hasImageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            referrerPolicy="no-referrer"
            loading="lazy"
          />

          {/* Fallback placeholder while image is probing/loading */}
          {!hasImageLoaded && (
            <div className="absolute inset-0 bg-slate-900 animate-pulse flex flex-col items-center justify-center p-2 text-center text-slate-500">
              <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
              <span className="text-[9px] font-mono">{cleanCode}</span>
            </div>
          )}

          {/* Set Symbol Stamp Badge */}
          <div className="absolute bottom-1 right-1 bg-slate-950/80 backdrop-blur-sm p-1 rounded border border-slate-700 shadow-sm flex items-center gap-1 z-10 pointer-events-none">
            <SetSymbolIcon setCode={setCode} size="xs" />
          </div>

          {/* Multiple Variation Indicator Badge (e.g. 1/4) */}
          {hasMultipleVariations && hasImageLoaded && (
            <div className="absolute top-1 left-1 bg-slate-950/85 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-0.5 z-10 pointer-events-none">
              <Layers className="w-2.5 h-2.5" />
              <span>
                {activeVariationIdx + 1}/{foundVariations.length}
              </span>
            </div>
          )}

          {/* Quick Hover Navigation Chevrons when multiple variations exist */}
          {hasMultipleVariations && hasImageLoaded && size !== 'xs' && (
            <>
              <button
                onClick={handlePrevVariation}
                title="Previous art variation"
                className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-900/90 text-slate-200 hover:text-white hover:bg-amber-600 border border-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg z-20"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={handleNextVariation}
                title="Next art variation"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-900/90 text-slate-200 hover:text-white hover:bg-amber-600 border border-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg z-20"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </>
          )}

          {/* Zoom Overlay (if allowZoom enabled) */}
          {allowZoom && hasImageLoaded && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white pointer-events-none">
              <ZoomIn className="w-5 h-5 drop-shadow" />
            </div>
          )}
        </div>

        {/* Modal Lightbox for Packaging Close-Up Inspection & Multi-Variation Gallery */}
        {isZoomed && (
          <div
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setIsZoomed(false)}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 text-white shadow-2xl relative space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <SetSymbolIcon setCode={setCode} size="sm" />
                  <div>
                    <h3 className="text-base font-bold text-slate-100 leading-tight">{displayName}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {setName} ({setCode.toUpperCase()}) • {theme.label}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsZoomed(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Visual Display Stage with Previous/Next Arrows */}
              <div className="relative w-full h-80 bg-slate-950 rounded-xl p-4 flex items-center justify-center border border-slate-800 overflow-hidden group">
                <img
                  key={currentDisplaySrc}
                  src={currentDisplaySrc}
                  alt={displayName}
                  className="max-h-full max-w-full object-contain drop-shadow-2xl transition-transform duration-200"
                />

                {/* Left & Right navigation buttons */}
                {hasMultipleVariations && (
                  <>
                    <button
                      onClick={handlePrevVariation}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/90 text-slate-200 hover:text-white hover:bg-amber-600 border border-slate-700 flex items-center justify-center transition shadow-xl"
                      title="Previous variation (Left arrow key)"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleNextVariation}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/90 text-slate-200 hover:text-white hover:bg-amber-600 border border-slate-700 flex items-center justify-center transition shadow-xl"
                      title="Next variation (Right arrow key)"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Variation Counter Tag */}
                {hasMultipleVariations && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-amber-300 border border-amber-500/40 shadow-lg flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Variation {activeVariationIdx + 1} of {foundVariations.length}</span>
                  </div>
                )}
              </div>

              {/* Variation Thumbnails Strip */}
              {hasMultipleVariations && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Pack Art & Angle Variations ({foundVariations.length})
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {foundVariations.map((varUrl, idx) => {
                      const isCurrent = idx === activeVariationIdx;
                      return (
                        <button
                          key={varUrl}
                          onClick={() => setActiveVariationIdx(idx)}
                          className={`relative w-14 h-16 rounded-lg p-1 bg-slate-950 border transition-all flex items-center justify-center shrink-0 ${
                            isCurrent
                              ? 'border-amber-400 ring-2 ring-amber-400/30 scale-105 shadow-md'
                              : 'border-slate-800 hover:border-slate-600 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={varUrl}
                            alt={`Variation ${idx + 1}`}
                            className="max-h-full max-w-full object-contain"
                          />
                          <span className="absolute bottom-0.5 right-1 text-[8px] font-mono font-bold text-amber-300">
                            #{idx + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer File Info */}
              <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <span className="font-mono text-amber-400 truncate max-w-xs">{currentDisplaySrc}</span>
                <span className="font-semibold text-slate-300 shrink-0">WPN Marketing Asset</span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // 2. Fallback: For single booster packs, use the authentic blank white MTG foil pack wrapper template
  if (packagingType === 'pack') {
    const isCollectorPack = (displayName || '').toLowerCase().includes('collector');
    const inferredPackType = (() => {
      const nameLower = (displayName || '').toLowerCase();
      if (nameLower.includes('collector')) return 'COLLECTOR BOOSTER';
      if (nameLower.includes('jumpstart')) return 'JUMPSTART BOOSTER';
      if (nameLower.includes('set booster')) return 'SET BOOSTER';
      if (nameLower.includes('draft')) return 'DRAFT BOOSTER';
      return 'PLAY BOOSTER';
    })();

    const resolvedCardCount = cardCount ?? (isCollectorPack ? 15 : 14);
    const resolvedThemeColor =
      themeColor ||
      (isCollectorPack
        ? 'purple'
        : inferredPackType.includes('JUMPSTART')
        ? 'gold'
        : inferredPackType.includes('PLAY')
        ? 'emerald'
        : inferredPackType.includes('DRAFT')
        ? 'navy'
        : inferredPackType.includes('SET')
        ? 'gold'
        : 'emerald');

    const resolvedSetName = cleanPureSetName(setName || displayName, setCode);

    return (
      <>
        <BoosterFoilPackMockup
          setCode={setCode}
          setName={resolvedSetName}
          packType={inferredPackType}
          cardCount={resolvedCardCount}
          layoutVariant={isCollectorPack ? 'collector' : 'standard'}
          themeColor={resolvedThemeColor}
          size={size}
          className={className}
          onClick={() => allowZoom && setIsZoomed(true)}
        />

        {/* Modal Lightbox for Pack Close-Up Inspection */}
        {isZoomed && (
          <div
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsZoomed(false)}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl relative space-y-4 flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <SetSymbolIcon setCode={setCode} size="sm" />
                  <div>
                    <h3 className="text-base font-bold text-slate-100">{displayName}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {resolvedSetName} ({setCode.toUpperCase()}) • {inferredPackType} ({resolvedCardCount} Cards)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsZoomed(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Large Booster Pack Preview */}
              <div className="w-full py-4 flex items-center justify-center bg-slate-950/80 rounded-2xl border border-slate-800">
                <BoosterFoilPackMockup
                  setCode={setCode}
                  setName={resolvedSetName}
                  packType={inferredPackType}
                  cardCount={resolvedCardCount}
                  layoutVariant={isCollectorPack ? 'collector' : 'standard'}
                  themeColor={resolvedThemeColor}
                  size="hero"
                />
              </div>

              <div className="w-full flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className={`font-mono ${isCollectorPack ? 'text-purple-400' : 'text-emerald-400'}`}>
                  {isCollectorPack ? 'Prismatic Holographic Foil Collector Template' : 'Authentic White Foil Pack Template'}
                </span>
                <span className="text-slate-300 font-medium">Official Vector Scryfall Emblem</span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // 3. Fallback for Booster Display Box: Render authentic Collector Prism or Open Retail 3-Column Display Box
  if (packagingType === 'box') {
    const resolvedSetName = cleanPureSetName(setName || displayName, setCode);
    const inferredProductType = (() => {
      const nameLower = (displayName || '').toLowerCase();
      if (nameLower.includes('collector')) return 'collector';
      if (nameLower.includes('play')) return 'play';
      if (nameLower.includes('draft')) return 'draft';
      if (nameLower.includes('set')) return 'set';
      if (nameLower.includes('jumpstart')) return 'jumpstart';
      return 'play';
    })();

    const packCount = isCollector ? 12 : 36;
    const typeLabel = isCollector ? 'COLLECTOR BOOSTER (12 Packs)' : `${inferredProductType.toUpperCase()} BOOSTER DISPLAY (36 Packs)`;

    const resolvedBoxThemeColor =
      themeColor ||
      (isCollector
        ? 'purple'
        : inferredProductType === 'draft'
        ? 'navy'
        : inferredProductType === 'set'
        ? 'gold'
        : inferredProductType === 'jumpstart'
        ? 'emerald'
        : 'emerald');

    return (
      <>
        {isCollector ? (
          <CollectorBoosterBoxMockup
            setCode={setCode}
            setName={resolvedSetName}
            packCount={12}
            themeColor={resolvedBoxThemeColor}
            size={size}
            className={className}
            onClick={() => allowZoom && setIsZoomed(true)}
          />
        ) : (
          <BoosterDisplayBoxMockup
            setCode={setCode}
            setName={resolvedSetName}
            productType={inferredProductType}
            themeColor={resolvedBoxThemeColor}
            packCount={36}
            size={size}
            className={className}
            onClick={() => allowZoom && setIsZoomed(true)}
          />
        )}

        {/* Modal Lightbox for Packaging Close-Up Inspection */}
        {isZoomed && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsZoomed(false)}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl relative space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <SetSymbolIcon setCode={setCode} size="sm" />
                  <div>
                    <h3 className="text-base font-bold text-slate-100">{displayName}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {resolvedSetName} ({setCode.toUpperCase()}) • {typeLabel}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsZoomed(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Large Booster Box Preview */}
              <div className="w-full py-6 flex items-center justify-center bg-slate-950/80 rounded-2xl border border-slate-800 min-h-[320px]">
                {isCollector ? (
                  <CollectorBoosterBoxMockup
                    setCode={setCode}
                    setName={resolvedSetName}
                    packCount={12}
                    themeColor={resolvedBoxThemeColor}
                    size="hero"
                  />
                ) : (
                  <BoosterDisplayBoxMockup
                    setCode={setCode}
                    setName={resolvedSetName}
                    productType={inferredProductType}
                    themeColor={resolvedBoxThemeColor}
                    packCount={36}
                    size="hero"
                  />
                )}
              </div>

              <div className="w-full flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className={`font-mono ${isCollector ? 'text-purple-400' : 'text-indigo-400'}`}>
                  {isCollector ? 'Authentic 12-Pack Collector Retail Display Box (200 x 130 x 72 mm)' : 'Authentic 36-Pack Retail Open Display Box (200 x 130 x 72 mm)'}
                </span>
                <span className="text-slate-300 font-medium">Official Vector Scryfall Emblem</span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // 4. Fallback for Bundle, Prerelease, Case: Render stylized procedural 3D physical packaging representation with official Scryfall SVG set emblem
  return (
    <>
      <div
        onClick={() => allowZoom && setIsZoomed(true)}
        className={`relative rounded-xl overflow-hidden shadow-xl bg-gradient-to-br ${theme.gradient} border ${theme.accent} flex flex-col justify-between p-2.5 select-none transition-all duration-300 group ${
          allowZoom ? 'cursor-pointer hover:scale-[1.02] hover:shadow-2xl hover:border-amber-400' : ''
        } ${sizeClasses[size]} ${className}`}
      >
        {/* Top Packaging Edge / Foil Crimp / Box Lid */}
        {packagingType === 'pack' ? (
          // Metallic Top Foil Crimp
          <div className="flex items-center justify-between border-b border-white/20 pb-1 z-10">
            <div className="flex space-x-0.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-1.5 h-1 bg-gradient-to-b from-white/40 to-white/10 rounded-t-sm" />
              ))}
            </div>
            <span className="text-[8px] font-mono font-black text-amber-300 tracking-wider">
              PLAY BOOSTER
            </span>
            <div className="w-4 h-4 rounded bg-black/40 flex items-center justify-center p-0.5 border border-white/10">
              <SetSymbolIcon setCode={setCode} size="xs" />
            </div>
          </div>
        ) : packagingType === 'box' ? (
          // Display Box Header Fold-Out Flap
          <div className="flex items-center justify-between z-10 pb-1 border-b border-indigo-400/30">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[9px] font-mono font-black tracking-tight text-indigo-200">
                36-PACK DISPLAY
              </span>
            </div>
            <div className="w-5 h-5 rounded-md bg-indigo-900/80 backdrop-blur-sm flex items-center justify-center p-0.5 border border-indigo-500/40">
              <SetSymbolIcon setCode={setCode} size="xs" />
            </div>
          </div>
        ) : (
          // Standard / Bundle / Prerelease Ribbon
          <div className="flex items-center justify-between gap-1 z-10">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-tight border flex items-center gap-1 ${theme.badgeBg}`}>
              <Icon className="w-2.5 h-2.5" />
              {theme.label}
            </span>
            <div className="w-5 h-5 rounded-md bg-white/10 backdrop-blur-sm flex items-center justify-center p-0.5 border border-white/20">
              <SetSymbolIcon setCode={setCode} size="xs" />
            </div>
          </div>
        )}

        {/* Center 3D Packaging Body with MTG Set Logo */}
        <div className="my-auto text-center space-y-1.5 z-10 flex flex-col items-center py-1">
          {/* Logo Frame with Holographic Backdrop */}
          <div className="relative p-2 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-md shadow-inner group-hover:scale-110 transition-transform duration-300 flex items-center justify-center">
            <SetSymbolIcon setCode={setCode} size={size === 'hero' ? 'lg' : size === 'lg' ? 'md' : 'sm'} />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500/10 via-transparent to-indigo-500/10 pointer-events-none" />
          </div>

          <div className="space-y-0.5">
            <div className="font-black text-white text-[12px] leading-tight tracking-tight drop-shadow-md">
              {setCode.toUpperCase()}
            </div>
            <div className="text-[9px] text-slate-300 font-medium truncate max-w-[120px]">
              {setName || displayName}
            </div>
          </div>
        </div>

        {/* Bottom Sealed / Collation Footer */}
        {packagingType === 'pack' ? (
          // Bottom Foil Crimp
          <div className="z-10 pt-1 border-t border-white/20 flex items-center justify-between text-[8px] font-mono text-slate-300">
            <span className="font-bold text-amber-300">14 CARDS</span>
            <span className="opacity-70 font-semibold">1-4 RARES</span>
          </div>
        ) : (
          <div className="z-10 pt-1 border-t border-white/10 flex items-center justify-between text-[9px] font-mono text-slate-300">
            <span className="truncate font-semibold text-slate-200">{theme.sealText}</span>
            <span className="text-[8px] font-black text-amber-400 bg-amber-950/80 px-1 py-0.5 rounded border border-amber-500/30">
              SEALED
            </span>
          </div>
        )}

        {/* Shimmer & 3D Lighting Sheen Overlays */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none group-hover:via-white/20 transition-all" />
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />

        {/* Vertical center foil seam for booster packs */}
        {packagingType === 'pack' && (
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-white/20 via-transparent to-white/20 pointer-events-none opacity-40" />
        )}

        {/* Zoom cue on hover */}
        {allowZoom && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white z-20">
            <ZoomIn className="w-5 h-5 drop-shadow" />
          </div>
        )}
      </div>

      {/* Lightbox for Procedural Close-Up Inspection */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl relative space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <SetSymbolIcon setCode={setCode} size="sm" />
                <div>
                  <h3 className="text-base font-bold text-slate-100">{displayName}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {setName} ({setCode.toUpperCase()}) • {theme.label}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsZoomed(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rendered 3D Card in Full Size */}
            <div className="w-full h-80 bg-slate-950 rounded-2xl p-6 flex items-center justify-center border border-slate-800 relative overflow-hidden">
              <div className={`w-52 h-72 rounded-2xl p-4 bg-gradient-to-br ${theme.gradient} border-2 ${theme.accent} shadow-2xl flex flex-col justify-between relative`}>
                <div className="flex items-center justify-between border-b border-white/20 pb-2 z-10">
                  <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {theme.label}
                  </span>
                  <div className="p-1 rounded bg-black/40 border border-white/20">
                    <SetSymbolIcon setCode={setCode} size="sm" />
                  </div>
                </div>

                <div className="text-center my-auto space-y-3 z-10 flex flex-col items-center">
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/20 backdrop-blur-md shadow-xl">
                    <SetSymbolIcon setCode={setCode} size="lg" />
                  </div>
                  <div className="font-black text-xl text-white tracking-tight">
                    {setCode.toUpperCase()}
                  </div>
                  <div className="text-xs text-slate-300 font-medium max-w-xs">
                    {setName || displayName}
                  </div>
                </div>

                <div className="border-t border-white/20 pt-2 flex items-center justify-between text-xs font-mono z-10">
                  <span className="text-slate-300">{theme.sealText}</span>
                  <span className="text-amber-400 font-black bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
                    SEALED
                  </span>
                </div>

                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="font-mono text-amber-400">Procedural 3D Recreation</span>
              <span className="text-slate-300 font-medium">Scryfall Vector SVG Engine</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
