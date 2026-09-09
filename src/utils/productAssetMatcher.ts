import { CatalogPackProduct, ProductPackagingType, ECOMMERCE_CATALOG_PACKS } from '../ecommerceBoosterData';

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

// Known WPN / MTG asset naming tokens and their heuristic product types based on user translation key:
// Bstr = booster, Clctr = collector, Smpl = sample, Bx = box, Dsp = Display (box of boosters),
// Cmndr = commander, Bndl = Bundle, Prrls = Prerelease, StrtrKt = Starter Kit, HldyCmndr = Holiday/Collector Edition Commander
export const MATCHING_RULES = [
  {
    pattern: /(smpl_bstr|sample_pack|sample)/i,
    targetType: 'sample_pack' as ProductPackagingType,
    label: 'Sample Booster Pack',
    description: 'Matches "smpl_bstr", "sample"',
  },
  {
    pattern: /(clctr_bstr|collector_booster_pack|collector_pack|clctr.*pack)/i,
    targetType: 'pack' as ProductPackagingType,
    isCollector: true,
    label: 'Collector Booster Pack',
    description: 'Matches "clctr_bstr", "collector_pack"',
  },
  {
    pattern: /(play_bstr|play_booster_pack|play_pack|bstr_0|bstr(?!\w*dsp))/i,
    targetType: 'pack' as ProductPackagingType,
    isCollector: false,
    label: 'Play Booster Pack',
    description: 'Matches "bstr", "play_bstr", "play_pack"',
  },
  {
    pattern: /(dspbx_clctr|clctr_dspbx|collector_booster_box|collector_box|clctr.*box)/i,
    targetType: 'box' as ProductPackagingType,
    isCollector: true,
    label: 'Collector Booster Box',
    description: 'Matches "dspbx_clctr", "collector_box"',
  },
  {
    pattern: /(play_dspbx|play_booster_box|play_box|dspbx|dsp_bx|bx)/i,
    targetType: 'box' as ProductPackagingType,
    isCollector: false,
    label: 'Booster Display Box',
    description: 'Matches "dspbx", "dsp", "box", "bx"',
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
    pattern: /(hldycmndr|collector_cmdr|holiday_commander)/i,
    targetType: 'starter_deck' as ProductPackagingType,
    isCollector: true,
    label: 'Collector Edition Commander Deck',
    description: 'Matches "hldycmndr"',
  },
  {
    pattern: /(cmdr_deck|commander_deck|cmdr|precon|deck_)/i,
    targetType: 'starter_deck' as ProductPackagingType,
    label: 'Commander Deck',
    description: 'Matches "cmdr", "commander", "deck"',
  },
  {
    pattern: /(starter|beginner|strt_kit|strtrkt)/i,
    targetType: 'starter_deck' as ProductPackagingType,
    label: 'Starter Kit',
    description: 'Matches "strtrkt", "starter"',
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
  // Final Fantasy & other set WPN asset filenames
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_01_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_01_02.png',
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_01_03.png',
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_02_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_03_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_04_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Cmndr_All.png',
  'products/fin/MTGFIN_EN_OtrBx_HldyCmndr_01_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Prrls_01_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Scene_01_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Scene_02_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Scene_03_01.png',
  'products/fin/MTGFIN_EN_OtrBx_Scene_04_01.png',
  'products/fin/MTGFIN_EN_OtrBx_StrtrKt_01_01.png',
  'products/fin/MTGFIN_Prrls_Spndwn_BLK.png',
  'products/fin/MTGFIN_Prrls_Spndwn_BLU.png',
  'products/fin/MTGFIN_Prrls_Spndwn_GRN.png',
  'products/fin/MTGFIN_Prrls_Spndwn_RED.png',
  'products/fin/MTGFIN_Prrls_Spndwn_YLW.png',
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
    // Check if set is universal or mismatch with other known set codes
    const otherSetCodes = ['mh3', 'woe', 'blb', 'dsk', 'fdn', 'otj', 'lci', 'mkm', 'ltr', 'hob', 'fin', 'fic', 'acr'].filter((c) => c !== setCode);
    const matchesOtherSet = otherSetCodes.some((c) => baseName.startsWith(`${c}-`) || baseName.includes(`mtg${c}_`) || baseName.includes(`_${c}_`));
    if (matchesOtherSet) {
      return {
        filename: baseName,
        url: filename.startsWith('/') ? filename : `/products/${baseName}`,
        score: 0,
        reason: 'Belongs to different set code',
        variationIndex: 99,
      };
    }
  }

  // 2. Extract product index (e.g. _01_, _02_, _03_, _04_) and variation index
  const isAllVariant = /_all\./i.test(baseName);
  const matchTwoNums = baseName.match(/_0?([1-9])_0?([1-9])\.(png|webp|jpg)$/i);
  let fileProductIndex = matchTwoNums ? parseInt(matchTwoNums[1], 10) : null;
  let variationIndex = matchTwoNums ? parseInt(matchTwoNums[2], 10) : 1;

  if (!matchTwoNums) {
    const singleNum = baseName.match(/_0?([1-9])\.(png|webp|jpg)$/i);
    variationIndex = singleNum ? parseInt(singleNum[1], 10) : 1;
  }

  // 3. Match against product type features
  const isCollectorProduct = displayName.includes('collector');
  const isGiftProduct = displayName.includes('gift');
  const isSceneProduct = displayName.includes('scene');
  const isPrereleaseProduct = displayName.includes('prerelease') || packagingType === 'prerelease';
  const isDraftNightProduct = displayName.includes('draft night') || displayName.includes('draft_night');
  const isBundleProduct = (displayName.includes('bundle') || packagingType === 'bundle') && !isGiftProduct && !isSceneProduct;
  const isBoxProduct = displayName.includes('box') || displayName.includes('display') || packagingType === 'box';
  const isPackProduct = (displayName.includes('pack') || displayName.includes('booster')) && !isCollectorProduct;
  const isStarterProduct = packagingType === 'starter_deck' || displayName.includes('commander') || displayName.includes('starter');

  const fileIsCollector = baseName.includes('clctr') || baseName.includes('collector') || baseName.includes('hldycmndr');
  const fileIsGift = baseName.includes('gftbndl') || (baseName.includes('gift') && baseName.includes('bundle'));
  const fileIsScene = baseName.includes('scene');
  const fileIsPrerelease = baseName.includes('prrls') || baseName.includes('prerelease');
  const fileIsBundle = baseName.includes('bndl') || baseName.includes('bundle');
  const fileIsBox = baseName.includes('dspbx') || baseName.includes('box') || baseName.includes('display') || baseName.includes('_bx');
  const fileIsPack = baseName.includes('bstr') || baseName.includes('pack');
  const fileIsCommander = baseName.includes('cmndr') || baseName.includes('commander');
  const fileIsStarter = baseName.includes('strtrkt') || baseName.includes('starter');

  // Collector check
  if (isCollectorProduct) {
    if (fileIsCollector) {
      score += 30;
      reasons.push('Collector tier match');
    } else {
      score -= 25;
    }
  } else if (fileIsCollector && !isStarterProduct) {
    score -= 30;
  }

  // Gift check
  if (isGiftProduct) {
    if (fileIsGift) {
      score += 40;
      reasons.push('Gift Bundle match ("gftbndl")');
    }
  } else if (fileIsGift) {
    score -= 30;
  }

  // Scene check
  if (isSceneProduct) {
    if (fileIsScene) {
      score += 40;
      reasons.push('Scene Box match');
    }
  } else if (fileIsScene) {
    score -= 30;
  }

  // Prerelease check
  if (isPrereleaseProduct) {
    if (fileIsPrerelease) {
      score += 40;
      reasons.push('Prerelease Pack match ("prrls")');
    }
  } else if (fileIsPrerelease) {
    score -= 25;
  }

  // Commander / Starter check
  if (isStarterProduct) {
    if (fileIsCommander || fileIsStarter) {
      score += 40;
      reasons.push('Commander/Starter Deck match ("cmndr")');
    }
  } else if (fileIsCommander) {
    score -= 30;
  }

  // Box vs Pack vs Bundle check
  if (isBoxProduct && !isPackProduct) {
    if (fileIsBox && !fileIsPack) {
      score += 35;
      reasons.push('Display Box match ("dspbx"/"box")');
    }
  } else if (isPackProduct && !isBoxProduct) {
    if (fileIsPack && !fileIsBox) {
      score += 35;
      reasons.push('Booster Pack match ("bstr"/"pack")');
    }
  } else if (isBundleProduct) {
    if (fileIsBundle && !fileIsGift) {
      score += 35;
      reasons.push('Bundle match ("bndl")');
    }
  }

  // 4. Index-based disambiguation for ambiguous multi-product families (e.g. Commander decks 01-04, Scene boxes 01-04)
  if (isAllVariant) {
    if (displayName.includes('set of') || displayName.includes('case')) {
      score += 60;
      reasons.push('Set of 4 / Master Case variant match ("_All")');
    }
  } else if (fileProductIndex !== null && (isStarterProduct || isSceneProduct)) {
    // Find all sibling products of the same category in the set
    const setProducts = ECOMMERCE_CATALOG_PACKS.filter(
      (p) => p.setCode.toUpperCase() === product.setCode.toUpperCase() && p.packagingType === product.packagingType && !p.id.includes('set-of') && !p.id.includes('case')
    ).sort((a, b) => a.id.localeCompare(b.id));

    const productRank = setProducts.findIndex((p) => p.id === product.id) + 1;
    if (productRank > 0) {
      if (fileProductIndex === productRank) {
        score += 70;
        reasons.push(`Exact WPN product index match (#${productRank})`);
      } else {
        score -= 50; // Belongs to a different numbered deck/box in the set
      }
    }
  }

  // 5. Exact slug match bonus
  const fullSlug = `${setCode}-${displayName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  if (baseName.replace(/\.(png|webp|jpg)$/i, '') === fullSlug) {
    score += 50;
    reasons.push('Exact canonical product slug match');
  }

  // Variation 1 primary bonus
  if (variationIndex === 1) {
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
    .filter((res) => res.score >= 15);

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

