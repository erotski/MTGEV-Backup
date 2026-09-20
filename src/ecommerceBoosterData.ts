export interface SheetConfig {
  sheetName: string;
  sheetCode: string;
  sheetPicks: number;
  description: string;
  category: 'common' | 'uncommon' | 'rare_mythic' | 'wildcard' | 'foil' | 'special_bonus' | 'land' | 'ancillary';
  rareOdds?: number;
  foilChance?: number;
  isSpecialSheet?: boolean;
}

export interface BoosterVariation {
  boosterIndex: number;
  boosterWeight: number;
  name: string;
  description: string;
  sheets: SheetConfig[];
}

export type ProductPackagingType =
  | 'pack'
  | 'bundle'
  | 'bundle_case'
  | 'box'
  | 'case'
  | 'prerelease'
  | 'starter_deck'
  | 'sample_pack'
  | 'limited_aid_tool'
  | 'box_set'
  | 'kit'
  | 'other';

export interface ProductIdentifiers {
  tcgplayerProductId?: string;
  cardKingdomId?: string;
  cardtraderId?: string;
  mcmId?: string;
  csiId?: string;
  scgId?: string;
  hareruyaId?: string;
  abuId?: string;
  miniaturemarketId?: string;
}

export interface ProductContainmentItem {
  productId: string;
  name: string;
  packagingType: ProductPackagingType;
  quantity: number;
  unitDescription: string;
  marketPrice: number;
  estimatedEv: number;
  savingsPct?: number;
  bonusAccessories?: string[];
  uuid?: string;
}

export interface CatalogPackProduct {
  id: string;
  dbId?: string;
  uuid?: string;
  rawCategory?: string;
  rawSubtype?: string;
  primaryCategory?: string;
  categoryTags?: string[];
  setCode: string;
  setName: string;
  releaseDate: string;
  block: string;
  packagingType: ProductPackagingType;
  boosterName: 'play' | 'draft' | 'set' | 'collector' | 'jumpstart' | 'starter' | 'box-topper' | 'topper' | string;
  displayName: string;
  marketPrice: number;
  estimatedEv: number;
  cardCount?: number;
  packsCount: number;
  imageUrl?: string;
  badge?: string;
  variations?: BoosterVariation[];
  specialFeatures: string[];
  identifiers?: ProductIdentifiers;
  tcgplayerLink?: string;
  contains?: ProductContainmentItem[];
  containedIn?: ProductContainmentItem[];
  bonusAccessories?: string[];
  rawContents?: any;
  contents?: any;
  category?: string;
  subtype?: string;
  metadataSource?: 'curated' | 'pipeline' | 'inferred';
  totalEvAvg?: number;
  totalEvMid90?: number;
  totalEvMin5?: number;
  totalEvMax5?: number;
  totalEvMin?: number;
  totalEvMax?: number;
  evScore?: number;
  breakevenPercentile?: number;
  archetype?: string;
  quantiles?: number[];
  quantilesByVendor?: Record<string, number[]>;
}

export const ECOMMERCE_CATALOG_PACKS: CatalogPackProduct[] = [];

