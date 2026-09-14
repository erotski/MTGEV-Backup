export interface BoosterEVRecord {
  id: number;
  setCode: string;
  setName: string;
  boosterName: string;
  fullBoosterName: string;
  priceMode: 'direct' | 'cheapest_reprint';
  vendor: Vendor | string;
  evAverage: number;
  evMid90: number;
  evMin: number;
  evMax: number;
  evMin5: number;
  evMax5: number;
  quantiles?: number[];
  quantilesByVendor?: Record<string, number[]>;
  completeBoosterPct: number;
  exactMatchPct: number;
  differentFinishPct: number;
  differentVendorPct: number;
  failedBoosters: number;
  simulatedPacks: number;
  updatedAt: string;
}

export interface PricingReliability {
  vendor: string;
  priceMode: PriceMode;
  simulatedPacks: number;
  completeBoosterPct: number;
  directExactPct?: number;
  reprintResolvedPct?: number;
  differentFinishPct: number;
  differentVendorPct: number;
  nonExactPct?: number;
  unresolvedPct?: number;
  sourceRows: number;
}

export interface PipelineRunRecord {
  id?: string;
  timestamp?: string;
  status?: 'success' | 'failed' | string;
  durationSeconds?: number;
  stages?: Array<Record<string, any>>;
  errors?: Array<Record<string, any>>;
  schemaVersion?: number | string;
  pipelineRunId?: string;
  generatedAt?: string;
}

export interface SnapshotIntegrityReport {
  ok: boolean;
  warnings: string[];
  metadata: PipelineRunRecord | null;
}

export interface ProductContentsCard {
  foil?: boolean;
  name: string;
  number?: string;
  set?: string;
  uuid: string;
}

export interface ProductContentsDeck {
  name: string;
  set: string;
}

export interface ProductContentsVariableConfig {
  chance?: number;
  weight?: number;
}

export interface ProductContentsVariableOption {
  card?: ProductContentsCard[];
  deck?: ProductContentsDeck[];
  booster?: { count?: number; set?: string; type?: string }[];
  variable_config?: ProductContentsVariableConfig[];
}

export interface ProductContentsVariableSlot {
  configs: ProductContentsVariableOption[];
}

export interface ProductContents {
  deck?: ProductContentsDeck[];
  card?: ProductContentsCard[];
  pack?: { code?: string; count?: number; set?: string }[];
  booster?: { count?: number; set?: string; type?: string }[];
  sealed?: { count?: number; name?: string; set?: string; uuid?: string }[];
  variable?: ProductContentsVariableSlot[];
  other?: { name?: string }[];
  note?: string;
  foil_replaces_card?: boolean;
}

export interface BoxArbitrageRecord {
  productUuid: string;
  boxName: string;
  category: 'booster_box' | 'booster_pack' | 'booster_case' | 'bundle' | 'commander_deck' | 'other' | string;
  setCode: string;
  setName: string;
  boosterName: string;
  packCount: number;
  cardCount?: number;
  /** This product's own listed market price (regardless of whether it's a pack, box, case, or deck) */
  marketPrice: number;
  /** EV of a single contained unit (e.g. one pack) - not applicable/0 for leaf products */
  unitEvMin?: number;
  unitEvAvg: number;
  unitEvMid90: number;
  unitEvMax?: number;
  /** EV of this whole product (unitEv * quantity, or its own singles/contents EV) */
  totalEvMin?: number;
  totalEvMin5?: number;
  totalEvAvg: number;
  totalEvMid90: number;
  totalEvMax5?: number;
  totalEvMax?: number;
  effectiveEv?: number;
  evScore?: number;
  quantiles?: number[];
  quantilesByVendor?: Record<string, number[]>;
  breakevenPercentile?: number;
  archetype?: 'pure_precon' | 'pure_randomized' | 'mixed_composite' | string;
  profitUsd: number;
  roiPct: number;
  vendor: string;
  priceMode: string;
  completePct: number;
  contents?: ProductContents;
}

export interface ChaseCard {
  uuid: string;
  name: string;
  scryfallId: string;
  setCode: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special';
  number: string;
  priceNormal: number;
  priceFoil?: number;
  price?: number;
  finish: string;
  imageUrl?: string;
  cardType?: string;
  productType?: 'all' | 'collector' | 'play' | 'draft' | 'deck' | string;
  deckName?: string;
  pullOddsDesc?: string;
}

export interface DeckCardItem {
  name: string;
  count: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'land' | string;
  type: string;
  primaryType?: string;
  manaCost?: string;
  manaValue?: number;
  scryfallId?: string;
  imageUrl?: string;
  text?: string;
  price: number;
  totalPrice?: number;
  foil?: boolean;
  isCommander?: boolean;
  prices?: {
    tcgplayer?: number;
    cardkingdom?: number;
    cardmarket?: number;
    cardmarketEur?: number;
    manapool?: number;
    all?: number;
    all_cheapest?: number;
    all_average?: number;
  };
  priceProvenance?: Record<string, {
    status: 'exact' | 'vendor_fallback' | 'finish_fallback' | 'vendor_finish_fallback' | 'reprint' | 'unpriced' | 'ignored';
    requestedVendor?: string;
    resolvedVendor?: string;
    requestedFinish?: string;
    resolvedFinish?: string;
  }>;
}

export interface PreconstructedDeckDetail {
  deckName: string;
  name?: string;
  setCode: string;
  set?: string;
  theme: string;
  format?: string;
  cardCount: number;
  totalCards?: number;
  singlesEv?: number;
  totalSinglesEv?: number;
  estimatedEv?: number;
  isCommander?: boolean;
  isFoil?: boolean;
  foil?: boolean;
  treatment?: string;
  commander?: {
    name: string;
    manaCost: string;
    type: string;
    rarity?: string;
    text?: string;
    imageUrl?: string;
    scryfallId?: string;
    price: number;
  };
  colors?: string[];
  typeSummary?: Record<string, { count: number; ev: number }>;
  typesSummary?: Record<string, number>;
  cardsByType?: Record<string, DeckCardItem[]>;
  raritySummary?: Record<string, { count: number; ev: number }>;
  contentsSummary?: {
    creatures: number;
    instantsAndSorceries: number;
    artifactsAndEnchantments: number;
    planeswalkers: number;
    lands: number;
  };
  keyCards?: DeckCardItem[];
  topChases?: DeckCardItem[];
  cards?: DeckCardItem[];
  fullDecklist?: DeckCardItem[];
  sealedProductUuids?: string[];
  pricingReliability?: Record<string, {
    expectedCards: number;
    exactCards: number;
    fallbackCards: number;
    missingCards: number;
    coveragePct: number;
    status: 'exact' | 'fallback_used' | 'missing' | string;
  }>;
}

export interface CustomSlot {
  id: string;
  name: string;
  sheetCode?: string;
  type:
    | 'common'
    | 'uncommon'
    | 'rare_mythic'
    | 'foil_wildcard'
    | 'special_guest'
    | 'basic_land'
    | 'art_card'
    | 'token_ad'
    | 'showcase_slot'
    | 'list_slot';
  picks: number;
  rareOdds?: number; // e.g. 0.85 rare / 0.15 mythic
  foilChance?: number; // 0 to 1
  showcaseChance?: number; // 0 to 1
  boosterIndex?: number;
  sheetWeight?: number;
}

export type DuplicateLimitMode = 'singleton' | 'max_2' | 'max_4' | 'unlimited';

export interface AncillaryInclusions {
  includeBasicLands: boolean;
  includeArtCards: boolean;
  includeTokens: boolean;
  includeTheList: boolean;
  includeSpecialGuests: boolean;
  includeSerialized: boolean;
}

export type EraCategory =
  | 'Classic 3-Set Blocks (1995-2015)'
  | 'Two-Set Paradigm (2015-2018)'
  | 'Modern Standalone & Play Boosters (2018-Present)'
  | 'Masters & Horizons Power Cubes';

export type BoosterTypeCategory =
  | 'draft'
  | 'play'
  | 'set'
  | 'collector'
  | 'jumpstart'
  | 'tournament_deck';

export interface CustomCube {
  id: string;
  name: string;
  description: string;
  targetPacksPerPlayer: number;
  slots: CustomSlot[];
  cardPoolSize: number;
  duplicateLimit: DuplicateLimitMode;
  inclusions: AncillaryInclusions;
}

export interface ChildSetInfo {
  code: string;
  name: string;
  type: string;
  cardCount?: number;
  iconCode?: string;
  iconSvgUri?: string;
  parentCode?: string;
}

export interface SetOption {
  code: string;
  name: string;
  tokenSetCode?: string;
  releaseDate?: string;
  type?: string;
  totalSetSize?: number;
  regularCardCount?: number;
  languages?: string[];
  block?: string;
  childSets?: ChildSetInfo[];
  parentCode?: string;
  isCommanderSubSet?: boolean;
  boosterCount: number;
  boosters: string[];
}

export type PriceMode = 'direct' | 'cheapest_reprint';
export type EvBasis = 'min' | 'mid90' | 'avg' | 'max';
export type Vendor =
  | 'all'
  | 'all_cheapest'
  | 'all_average'
  | 'tcgplayer'
  | 'cardmarket'
  | 'cardkingdom'
  | 'manapool';
export type ProductCategory =
  | 'all'
  | 'booster_box'
  | 'booster_pack'
  | 'booster_case'
  | 'bundle'
  | 'deck'
  | 'commander_deck'
  | 'box_set'
  | 'other';

export interface DraftCartItem {
  cartItemId: string;
  productId: string;
  quantity: number;
  selectedBoosterIndex: number | 'weighted_auto';
  sheetPicksOverride: Record<string, number>;
  disabledSheets: string[];
}

export interface PodSimulationResult {
  totalPacks: number;
  totalCards: number;
  totalCostUsd: number;
  totalEvUsd: number;
  evRoiPct: number;
  raresAndMythicsCount: number;
  mythicCount: number;
  foilCount: number;
  specialSheetCount: number;
  packBreakdown: {
    packTitle: string;
    quantity: number;
    cardsPerPack: number;
    boosterIndexUsed: string;
    sheetsOpened: { sheetName: string; count: number; category: string }[];
  }[];
}

