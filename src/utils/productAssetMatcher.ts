import { CatalogPackProduct, ProductPackagingType } from '../ecommerceBoosterData';

export interface ImageSlot {
  url: string;
  label?: string;
  source?: 'manual' | 'guessed' | 'default';
  score?: number;
  matchReason?: string;
}

export interface ProductAssetMapping {
  productId: string;
  setCode: string;
  isManualOverride: boolean;
  slots: string[]; // Up to 10 image paths/URLs
  updatedAt?: string;
}

// Known WPN / MTG asset naming tokens and their heuristic product types
export const MATCHING_RULES = [
  {
    pattern: /(play_bstr|play_booster_pack|play_pack|bstr_0|bstr(?!\w*dsp))/i,
    targetType: 'pack' as ProductPackagingType,
    isCollector: false,
    label: 'Play Booster Pack',
    description: 'Matches "play_bstr", "bstr", "play_pack"',
  },
  {
    pattern: /(play_dspbx|play_booster_box|play_box|dspbx(?!.*clctr)|dsp_bx)/i,
    targetType: 'box' as ProductPackagingType,
    isCollector: false,
    label: 'Play Booster Box',
    description: 'Matches "play_dspbx", "play_box", "dspbx"',
  },
  {
    pattern: /(clctr_bstr|collector_booster_pack|collector_pack|clctr.*pack)/i,
    targetType: 'pack' as ProductPackagingType,
    isCollector: true,
    label: 'Collector Booster Pack',
    description: 'Matches "clctr_bstr", "collector_pack"',
  },
  {
    pattern: /(dspbx_clctr|clctr_dspbx|collector_booster_box|collector_box|clctr.*box)/i,
    targetType: 'box' as ProductPackagingType,
    isCollector: true,
    label: 'Collector Booster Box',
    description: 'Matches "dspbx_clctr", "clctr_dspbx", "collector_box"',
  },
  {
    pattern: /(gftbndl|gift_bundle|gift_bndl|gift_edition)/i,
    targetType: 'bundle' as ProductPackagingType,
    isGift: true,
    label: 'Gift Bundle',
    description: 'Matches "gftbndl", "gift_bundle"',
  },
  {
    pattern: /(bndl|bundle|fatpack|otrbx_bndl)/i,
    targetType: 'bundle' as ProductPackagingType,
    isGift: false,
    label: 'Bundle / Fat Pack',
    description: 'Matches "bndl", "bundle", "fatpack"',
  },
  {
    pattern: /(prrls|prerls|prerelease|pr_pack)/i,
    targetType: 'prerelease' as ProductPackagingType,
    label: 'Prerelease Pack',
    description: 'Matches "prrls", "prerelease"',
  },
  {
    pattern: /(drftnght|draft_night|draft_set)/i,
    targetType: 'prerelease' as ProductPackagingType,
    label: 'Draft Night',
    description: 'Matches "drftnght", "draft_night"',
  },
  {
    pattern: /(scene_otrbx|scene_box|scene)/i,
    targetType: 'bundle' as ProductPackagingType,
    isScene: true,
    label: 'Scene Box',
    description: 'Matches "scene_otrbx", "scene"',
  },
  {
    pattern: /(cmdr_deck|commander_deck|cmdr|precon|deck_)/i,
    targetType: 'starter_deck' as ProductPackagingType,
    label: 'Commander Deck',
    description: 'Matches "cmdr_deck", "commander", "deck"',
  },
  {
    pattern: /(starter|beginner|strt_kit)/i,
    targetType: 'starter_deck' as ProductPackagingType,
    label: 'Starter Kit',
    description: 'Matches "starter", "strt_kit"',
  },
  {
    pattern: /(case|booster_case)/i,
    targetType: 'case' as ProductPackagingType,
    label: 'Master Case',
    description: 'Matches "case", "booster_case"',
  },
];

// List of all bundled standard & known asset filenames in public/products/
export const KNOWN_SYSTEM_ASSET_FILES: string[] = [
  // HOB Hobbit files
  'hob-pack_01.png',
  'hob-pack_02.png',
  'hob-pack_03.png',
  'hob-pack.png',
  'hob-play_booster_pack.png',
  'hob-play_pack.png',
  'hob-box_01.png',
  'hob-box_02.png',
  'hob-box.png',
  'hob-play_booster_box.png',
  'hob-play_box.png',
  'hob-collector_pack_01.png',
  'hob-collector_pack.png',
  'hob-collector_booster_pack.png',
  'hob-collector_01.png',
  'hob-collector_02.png',
  'hob-collector_box.png',
  'hob-collector_booster_box.png',
  'hob-collector.png',
  'hob-bundle_01.png',
  'hob-bundle.png',
  'hob-the_hobbit_bundle.png',
  'hob-gift_bundle_01.png',
  'hob-gift_bundle.png',
  'hob-gift.png',
  'hob-the_hobbit_gift_bundle.png',
  'hob-prerelease_01.png',
  'hob-prerelease.png',
  'hob-the_hobbit_prerelease_pack.png',
  'hob-draft_night.png',
  'hob-the_hobbit_draft_night.png',
  'hob-scene_01.png',
  'hob-scene_02.png',
  'hob-the_hobbit_scene_box_crack_the_plates.png',
  'hob-the_hobbit_scene_box_treasures_of_smaug.png',
  // Original raw WPN marketing asset convention names
  'hob-mtghob_en_play_bstr_01.png',
  'hob-mtghob_en_play_bstr_02.png',
  'hob-mtghob_en_play_bstr_03.png',
  'hob-mtghob_en_play_dspbx_01.png',
  'hob-mtghob_en_play_dspbx_02.png',
  'hob-mtghob_en_clctr_bstr_01.png',
  'hob-mtghob_en_dspbx_clctr_01.png',
  'hob-mtghob_en_dspbx_clctr_02.png',
  'hob-mtghob_en_bndl_otrbx_01.png',
  'hob-mtghob_en_gftbndl_otrbx_01.png',
  'hob-mtghob_en_prrls_otrbx_01.png',
  'hob-mtghob_en_drftnght_otrbx_01.png',
  'hob-mtghob_en_scene_otrbx_01.png',
  'hob-mtghob_en_scene_otrbx_02.png',
];

export interface GuessMatchResult {
  filename: string;
  url: string;
  score: number;
  reason: string;
  variationIndex: number;
}

/**
 * Evaluates how well a given filename matches a specific catalog product.
 * Returns a score from 0 (no match) to 100+ (perfect match) and explanation.
 */
export function guessScoreForProduct(
  filename: string,
  product: {
    id: string;
    setCode: string;
    displayName: string;
    packagingType: ProductPackagingType;
  }
): GuessMatchResult {
  const cleanFilename = filename.toLowerCase().replace(/\\/g, '/');
  const baseName = cleanFilename.split('/').pop() || '';
  const setCode = product.setCode.toLowerCase();
  const displayName = product.displayName.toLowerCase();
  const packagingType = product.packagingType.toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  // 1. Set Code Verification
  const hasSetCodeInFile =
    baseName.includes(setCode) ||
    baseName.startsWith(`${setCode}-`) ||
    baseName.startsWith(`mtg${setCode}_`) ||
    baseName.includes(`_${setCode}_`);

  if (hasSetCodeInFile) {
    score += 35;
    reasons.push(`Matches set [${product.setCode.toUpperCase()}]`);
  } else {
    // Check if set is universal or mismatch
    const otherSetCodes = ['mh3', 'woe', 'blb', 'dsk', 'fdn', 'otj', 'lci', 'mkm', 'ltr', 'hob'].filter((c) => c !== setCode);
    const matchesOtherSet = otherSetCodes.some((c) => baseName.startsWith(`${c}-`) || baseName.includes(`mtg${c}_`));
    if (matchesOtherSet) {
      // Belongs to a different set!
      return {
        filename: baseName,
        url: filename.startsWith('/') ? filename : `/products/${baseName}`,
        score: 0,
        reason: 'Belongs to different set code',
        variationIndex: 99,
      };
    }
  }

  // 2. Specific product keywords matching
  const isCollectorProduct = displayName.includes('collector');
  const isGiftProduct = displayName.includes('gift');
  const isSceneProduct = displayName.includes('scene');
  const isPrereleaseProduct = displayName.includes('prerelease') || packagingType === 'prerelease';
  const isDraftNightProduct = displayName.includes('draft night') || displayName.includes('draft_night');
  const isBundleProduct = displayName.includes('bundle') || packagingType === 'bundle';
  const isBoxProduct = displayName.includes('box') || displayName.includes('display') || packagingType === 'box';
  const isPackProduct = displayName.includes('pack') || displayName.includes('booster') || packagingType === 'pack';

  // File flags
  const fileIsCollector = baseName.includes('clctr') || baseName.includes('collector');
  const fileIsGift = baseName.includes('gftbndl') || (baseName.includes('gift') && baseName.includes('bundle'));
  const fileIsScene = baseName.includes('scene');
  const fileIsDraftNight = baseName.includes('drftnght') || baseName.includes('draft_night');
  const fileIsPrerelease = baseName.includes('prrls') || baseName.includes('prerelease');
  const fileIsBundle = (baseName.includes('bndl') || baseName.includes('bundle')) && !fileIsGift;
  const fileIsBox = baseName.includes('dspbx') || baseName.includes('box') || baseName.includes('display');
  const fileIsPack = baseName.includes('bstr') || baseName.includes('pack') || baseName.includes('booster');

  // Strict collector check
  if (isCollectorProduct) {
    if (fileIsCollector) {
      score += 30;
      reasons.push('Collector product match');
    } else {
      score -= 25; // Wrong tier
    }
  } else {
    if (fileIsCollector) {
      score -= 30; // Standard product should not match collector file
    }
  }

  // Gift check
  if (isGiftProduct) {
    if (fileIsGift) {
      score += 40;
      reasons.push('Gift Bundle keyword match ("gftbndl")');
    }
  } else if (fileIsGift) {
    score -= 30;
  }

  // Scene check
  if (isSceneProduct) {
    if (fileIsScene) {
      score += 40;
      reasons.push('Scene box keyword match');
      // Sub-scene name matching if applicable
      const sceneTitleSlug = displayName.replace(/[^a-z0-9]+/g, '_');
      if (baseName.includes('crack_the_plates') && displayName.includes('crack')) {
        score += 25;
        reasons.push('Exact Scene Kit title match ("Crack the Plates")');
      } else if (baseName.includes('treasures_of_smaug') && displayName.includes('smaug')) {
        score += 25;
        reasons.push('Exact Scene Kit title match ("Treasures of Smaug")');
      }
    }
  } else if (fileIsScene) {
    score -= 30;
  }

  // Prerelease vs Draft Night check
  if (isDraftNightProduct) {
    if (fileIsDraftNight) {
      score += 45;
      reasons.push('Draft Night keyword match ("drftnght")');
    }
  } else if (isPrereleaseProduct) {
    if (fileIsPrerelease) {
      score += 40;
      reasons.push('Prerelease kit keyword match ("prrls")');
    }
  }

  // Box vs Pack vs Bundle check
  if (isBoxProduct && !isPackProduct) {
    if (fileIsBox && !fileIsPack) {
      score += 30;
      reasons.push('Display Box match ("dspbx" / "box")');
    } else if (fileIsPack) {
      score -= 20;
    }
  } else if (isPackProduct && !isBoxProduct) {
    if (fileIsPack && !fileIsBox) {
      score += 30;
      reasons.push('Booster Pack match ("bstr" / "pack")');
    } else if (fileIsBox) {
      score -= 20;
    }
  } else if (isBundleProduct && !isGiftProduct && !isSceneProduct) {
    if (fileIsBundle) {
      score += 30;
      reasons.push('Bundle match ("bndl" / "bundle")');
    }
  }

  // 3. Exact slug match bonus
  const fullSlug = `${setCode}-${displayName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  if (baseName.replace(/\.(png|webp|jpg)$/i, '') === fullSlug) {
    score += 50;
    reasons.push('Exact canonical product slug match');
  }

  // 4. Extract variation index (e.g. 01, 02, 03)
  const varMatch = baseName.match(/_0?([0-9]{1,2})\.(png|webp|jpg)$/i);
  const variationIndex = varMatch ? parseInt(varMatch[1], 10) : 1;

  // Bonus for primary cover (01)
  if (variationIndex === 1 || !varMatch) {
    score += 5;
  }

  return {
    filename: baseName,
    url: filename.startsWith('/') ? filename : `/products/${baseName}`,
    score: Math.max(0, score),
    reason: reasons.length > 0 ? reasons.join(' • ') : 'Partial heuristic candidate',
    variationIndex,
  };
}

/**
 * Runs the Guessing Game for a given product against a list of available filenames.
 * Returns up to maxSlots (default 10) ordered by relevance and art index.
 */
export function guessAssetSlotsForProduct(
  product: {
    id: string;
    setCode: string;
    displayName: string;
    packagingType: ProductPackagingType;
  },
  availableFiles: string[] = KNOWN_SYSTEM_ASSET_FILES,
  maxSlots: number = 10
): GuessMatchResult[] {
  const scored = availableFiles
    .map((file) => guessScoreForProduct(file, product))
    .filter((res) => res.score >= 20);

  // Group by unique URL
  const seenUrls = new Set<string>();
  const uniqueScored: GuessMatchResult[] = [];
  for (const item of scored) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueScored.push(item);
    }
  }

  // Sort: High score first, then ascending variation index (01, 02, 03)
  uniqueScored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.variationIndex - b.variationIndex;
  });

  return uniqueScored.slice(0, maxSlots);
}

// LocalStorage Persistence Key for Product Asset Mappings
const STORAGE_KEY = 'product_packaging_asset_mappings_v2';

/**
 * Loads all custom / manual product asset overrides from localStorage.
 */
export function loadSavedAssetMappings(): Record<string, ProductAssetMapping> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse saved product asset mappings:', e);
    return {};
  }
}

/**
 * Saves all product asset overrides to localStorage.
 */
export function saveAssetMappings(mappings: Record<string, ProductAssetMapping>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch (e) {
    console.error('Failed to save product asset mappings:', e);
  }
}

/**
 * Gets the active image slots for a product:
 * If a manual override is active, returns the user-configured slots (up to 10).
 * Otherwise, runs the Smart Guesser to return the automatically matched slots.
 */
export function getProductEffectiveAssetSlots(
  product: {
    id: string;
    setCode: string;
    displayName: string;
    packagingType: ProductPackagingType;
    imageUrl?: string;
  },
  savedMappings?: Record<string, ProductAssetMapping>,
  availableFiles: string[] = KNOWN_SYSTEM_ASSET_FILES
): { slots: string[]; isManual: boolean; guesses: GuessMatchResult[] } {
  const mappings = savedMappings || loadSavedAssetMappings();
  const saved = mappings[product.id];

  const guesses = guessAssetSlotsForProduct(product, availableFiles, 10);

  if (saved && saved.isManualOverride && Array.isArray(saved.slots) && saved.slots.length > 0) {
    const validSlots = saved.slots.filter((s) => s && s.trim().length > 0);
    if (validSlots.length > 0) {
      return {
        slots: validSlots.slice(0, 10),
        isManual: true,
        guesses,
      };
    }
  }

  // If explicit imageUrl in catalog product
  if (product.imageUrl && product.imageUrl.trim().length > 0) {
    const defaultUrl = product.imageUrl.trim();
    const otherGuesses = guesses.map((g) => g.url).filter((u) => u !== defaultUrl);
    return {
      slots: [defaultUrl, ...otherGuesses].slice(0, 10),
      isManual: false,
      guesses,
    };
  }

  // Fallback to top guesses
  if (guesses.length > 0) {
    return {
      slots: guesses.map((g) => g.url),
      isManual: false,
      guesses,
    };
  }

  // Standard fallback
  const cleanCode = product.setCode.toLowerCase();
  const cleanType = product.packagingType.toLowerCase();
  return {
    slots: [`/products/${cleanCode}-${cleanType}.png`],
    isManual: false,
    guesses: [],
  };
}
