export interface BoosterEVRecord {
  id: number;
  setCode: string;
  setName: string;
  boosterName: string;
  fullBoosterName: string;
  priceMode: 'direct' | 'cheapest_reprint';
  vendor: 'all' | 'tcgplayer' | 'cardmarket' | 'cardkingdom';
  evAverage: number;
  evMid90: number;
  evMin: number;
  evMax: number;
  evMin5: number;
  evMax5: number;
  completeBoosterPct: number;
  exactMatchPct: number;
  differentFinishPct: number;
  differentVendorPct: number;
  failedBoosters: number;
  simulatedPacks: number;
  updatedAt: string;
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
  boxMarketPrice: number;
  packEvAvg: number;
  packEvMid90: number;
  boxEvAvg: number;
  boxEvMid90: number;
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
  manaCost?: string;
  scryfallId?: string;
  imageUrl?: string;
  price: number;
  foil?: boolean;
  isCommander?: boolean;
}

export interface PreconstructedDeckDetail {
  deckName: string;
  setCode: string;
  commander: {
    name: string;
    manaCost: string;
    type: string;
    text?: string;
    imageUrl?: string;
    scryfallId?: string;
    price: number;
  };
  cardCount: number;
  colors: string[];
  theme: string;
  contentsSummary: {
    creatures: number;
    instantsAndSorceries: number;
    artifactsAndEnchantments: number;
    planeswalkers: number;
    lands: number;
  };
  keyCards: DeckCardItem[];
  fullDecklist?: DeckCardItem[];
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

export interface PackTemplate {
  id: string;
  name: string;
  category: 'per_set' | 'booster_type' | 'block';
  blockName?: string;
  boosterType: BoosterTypeCategory;
  setCode: string;
  setName: string;
  era: EraCategory;
  description: string;
  defaultSlots: CustomSlot[];
  defaultInclusions: AncillaryInclusions;
  defaultDuplicateLimit: DuplicateLimitMode;
  packCostEstimate: number;
}

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
  boosterCount: number;
  boosters: string[];
}

export type PriceMode = 'direct' | 'cheapest_reprint';
export type Vendor = 'all' | 'tcgplayer' | 'cardmarket' | 'cardkingdom';
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

