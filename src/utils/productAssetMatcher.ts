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

/**
 * Strict WPN Naming Convention & Folder Structure:
 * public/products/<set_code>/MTG<setcode>_EN_<product type>_<additional type>_0X_0X.png
 * 
 * Translation Key for WPN Tokens:
 * - Bstr = Booster Pack
 * - Clctr = Collector
 * - Smpl = Sample
 * - Bx = Box
 * - Dsp = Display (Display Box / Booster Box)
 * - Cmndr = Commander Deck
 * - Bndl = Bundle
 * - Prrls = Prerelease Pack
 * - StrtrKt = Starter Kit
 * - Scene = Scene Box
 * - HldyCmndr = Collector Edition Commander
 */

export const KNOWN_SYSTEM_ASSET_FILES: string[] = [
  // Final Fantasy (fin) - Strict WPN Convention
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

  // The Hobbit (hob) - Strict WPN Convention
  'products/hob/MTGHOB_EN_Play_Bstr_01_01.png',
  'products/hob/MTGHOB_EN_Play_Bstr_01_02.png',
  'products/hob/MTGHOB_EN_Play_DspBx_01_01.png',
  'products/hob/MTGHOB_EN_Clctr_Bstr_01_01.png',
  'products/hob/MTGHOB_EN_Clctr_Bstr_01_02.png',
  'products/hob/MTGHOB_EN_Clctr_Bstr_01_03.png',
  'products/hob/MTGHOB_EN_DspBx_Clctr_01_01.png',
  'products/hob/MTGHOB_EN_DspBx_Clctr_01_02.png',
  'products/hob/MTGHOB_EN_DspBx_Clctr_01_03.png',
  'products/hob/MTGHOB_EN_DspBx_Clctr_02_01.png',
  'products/hob/MTGHOB_EN_DspBx_Clctr_02_02.png',
  'products/hob/MTGHOB_EN_DspBx_Clctr_02_03.png',
  'products/hob/MTGHOB_EN_Bndl_OtrBx_01_01.png',
  'products/hob/MTGHOB_EN_GftBndl_OtrBx_01_01.png',
  'products/hob/MTGHOB_EN_Prrls_OtrBx_01_01.png',
  'products/hob/MTGHOB_EN_DrftNght_OtrBx_01_01.png',
  'products/hob/MTGHOB_EN_Scene_OtrBx_01_01.png',
  'products/hob/MTGHOB_EN_Scene_OtrBx_02_01.png',
];

export interface GuessMatchResult {
  filename: string;
  url: string;
  score: number;
  reason: string;
  variationIndex: number;
}

/**
 * Strict WPN Convention Matcher (No Fuzzy Guesses)
 * Matches strictly on:
 * 1. Set code folder and prefix (e.g. products/fin/MTGFIN_...)
 * 2. WPN Token Category (Cmndr, Bstr, DspBx, Clctr, Prrls, Scene, Bndl, etc.)
 * 3. Exact numeric product index (_01_, _02_, _03_, _04_) mapped to set products.
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
  const cleanPath = filename.toLowerCase().replace(/\\/g, '/');
  const baseName = cleanPath.split('/').pop() || '';
  const setCode = product.setCode.toLowerCase();
  const displayName = product.displayName.toLowerCase();
  const packagingType = product.packagingType.toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  // 1. Enforce Set Code Directory & Prefix
  const setFolderMatch = cleanPath.includes(`products/${setCode}/`) || cleanPath.startsWith(`${setCode}-`) || baseName.includes(setCode);
  if (!setFolderMatch) {
    return {
      filename: baseName,
      url: filename.startsWith('/') ? filename : `/${filename}`,
      score: 0,
      reason: 'Outside set directory',
      variationIndex: 99,
    };
  }

  score += 40;
  reasons.push(`Set folder [${product.setCode.toUpperCase()}]`);

  // 2. Parse Numeric Product Index & Art Variation Index (_0X_0X)
  const isAllVariant = /_all\./i.test(baseName);
  const matchIndices = baseName.match(/_0?([1-9])_0?([1-9])\.(png|webp|jpg)$/i);
  let fileProductIndex = matchIndices ? parseInt(matchIndices[1], 10) : null;
  let variationIndex = matchIndices ? parseInt(matchIndices[2], 10) : 1;

  if (!matchIndices) {
    const singleNum = baseName.match(/_0?([1-9])\.(png|webp|jpg)$/i);
    variationIndex = singleNum ? parseInt(singleNum[1], 10) : 1;
  }

  // 3. WPN Token Category Classification
  const isCollectorFile = baseName.includes('clctr') || baseName.includes('collector') || baseName.includes('hldycmndr');
  const isGiftFile = baseName.includes('gftbndl');
  const isSceneFile = baseName.includes('scene');
  const isPrereleaseFile = baseName.includes('prrls') || baseName.includes('prerelease');
  const isBundleFile = baseName.includes('bndl') && !isGiftFile;
  const isBoxFile = baseName.includes('dspbx') || baseName.includes('box');
  const isPackFile = baseName.includes('bstr') || baseName.includes('pack');
  const isCommanderFile = baseName.includes('cmndr') || baseName.includes('commander');
  const isStarterFile = baseName.includes('strtrkt') || baseName.includes('starter');

  const isCollectorProd = displayName.includes('collector');
  const isGiftProd = displayName.includes('gift');
  const isSceneProd = displayName.includes('scene');
  const isPrereleaseProd = packagingType === 'prerelease' || displayName.includes('prerelease');
  const isBundleProd = packagingType === 'bundle' && !isGiftProd && !isSceneProd;
  const isBoxProd = packagingType === 'box' || displayName.includes('box') || displayName.includes('display');
  const isPackProd = packagingType === 'pack' && !isCollectorProd;
  const isCommanderProd = packagingType === 'starter_deck' || displayName.includes('commander') || displayName.includes('starter');

  // Category matching
  if (isCollectorProd && isCollectorFile) {
    score += 40;
    reasons.push('Collector WPN token match');
  } else if (!isCollectorProd && isCollectorFile) {
    return { filename: baseName, url: filename.startsWith('/') ? filename : `/${filename}`, score: 0, reason: 'Collector tier mismatch', variationIndex };
  }

  if (isGiftProd && isGiftFile) {
    score += 50;
    reasons.push('Gift Bundle WPN match ("GftBndl")');
  } else if (isSceneProd && isSceneFile) {
    score += 50;
    reasons.push('Scene Box WPN match ("Scene")');
  } else if (isPrereleaseProd && isPrereleaseFile) {
    score += 50;
    reasons.push('Prerelease WPN match ("Prrls")');
  } else if (isCommanderProd && (isCommanderFile || isStarterFile)) {
    score += 50;
    reasons.push('Commander / Starter WPN match ("Cmndr")');
  } else if (isBoxProd && isBoxFile && !isPackFile) {
    score += 45;
    reasons.push('Display Box WPN match ("DspBx")');
  } else if (isPackProd && isPackFile && !isBoxFile) {
    score += 45;
    reasons.push('Booster Pack WPN match ("Bstr")');
  } else if (isBundleProd && isBundleFile) {
    score += 45;
    reasons.push('Bundle WPN match ("Bndl")');
  }

  // 4. Index-based Mapping for Multi-Product families (e.g. Commander decks 01-04, Scene boxes 01-04)
  if (isAllVariant) {
    if (displayName.includes('set of') || displayName.includes('case')) {
      score += 60;
      reasons.push('Set of 4 / Master Case variant ("_All")');
    }
  } else if (fileProductIndex !== null && (isCommanderProd || isSceneProd)) {
    const setProducts = ECOMMERCE_CATALOG_PACKS.filter(
      (p) => p.setCode.toUpperCase() === product.setCode.toUpperCase() && p.packagingType === product.packagingType && !p.id.includes('set-of') && !p.id.includes('case')
    ).sort((a, b) => a.id.localeCompare(b.id));

    const productRank = setProducts.findIndex((p) => p.id === product.id) + 1;
    if (productRank > 0) {
      if (fileProductIndex === productRank) {
        score += 80;
        reasons.push(`Exact WPN Product Index match (#${productRank})`);
      } else {
        return { filename: baseName, url: filename.startsWith('/') ? filename : `/${filename}`, score: 0, reason: `Index #${fileProductIndex} belongs to another product`, variationIndex };
      }
    }
  }

  const normalizedUrl = filename.startsWith('/') ? filename : `/${filename}`;

  return {
    filename: baseName,
    url: normalizedUrl,
    score: Math.max(0, score),
    reason: reasons.join(' • '),
    variationIndex,
  };
}

/**
 * Runs strict convention asset matching for a product.
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
    .filter((res) => res.score >= 40);

  const seenUrls = new Set<string>();
  const uniqueScored: GuessMatchResult[] = [];
  for (const item of scored) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueScored.push(item);
    }
  }

  uniqueScored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.variationIndex - b.variationIndex;
  });

  return uniqueScored.slice(0, maxSlots);
}

export const MATCHING_RULES: any[] = [];
const STORAGE_KEY = 'product_packaging_asset_mappings_v2';

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

export function saveAssetMappings(mappings: Record<string, ProductAssetMapping>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch (e) {
    console.error('Failed to save product asset mappings:', e);
  }
}

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

  if (guesses.length > 0) {
    return {
      slots: guesses.map((g) => g.url),
      isManual: false,
      guesses,
    };
  }

  const cleanCode = product.setCode.toLowerCase();
  const cleanType = product.packagingType.toLowerCase();
  return {
    slots: [`/products/${cleanCode}/${cleanCode}-${cleanType}.png`],
    isManual: false,
    guesses: [],
  };
}

