import { ProductPackagingType } from '../ecommerceBoosterData';
import { ProductCategory } from '../types';

export type ProductCategoryIcon =
  | 'all'
  | 'pack'
  | 'box'
  | 'case'
  | 'bundle'
  | 'deck'
  | 'box_set'
  | 'kit'
  | 'other';

export interface ProductCategoryDefinition {
  id: Exclude<ProductCategory, 'all'>;
  label: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: ProductCategoryIcon;
  iconClassName: string;
  rawCategories: readonly string[];
  requiredTags: readonly string[];
  packagingTypes: readonly ProductPackagingType[];
  catchAll?: boolean;
  enabled: boolean;
}

// This is the only category registry used by both product views. Set enabled to
// false to remove a small standalone category; unmatched products flow to Other.
export const PRODUCT_CATEGORY_DEFINITIONS: readonly ProductCategoryDefinition[] = [
  { id: 'booster_pack', label: 'Single Booster Packs', title: 'Booster Packs', subtitle: 'Individual sealed booster packs & blister packs', badge: 'Booster Packs', icon: 'pack', iconClassName: 'text-emerald-500', rawCategories: ['booster_pack', 'draft_pack'], requiredTags: ['booster_pack'], packagingTypes: ['pack', 'sample_pack'], enabled: true },
  { id: 'booster_box', label: 'Booster Boxes (24-36 Packs)', title: 'Booster Boxes', subtitle: 'Factory-sealed booster display boxes', badge: 'Booster Boxes', icon: 'box', iconClassName: 'text-amber-500', rawCategories: ['booster_box'], requiredTags: ['booster_box'], packagingTypes: ['box'], enabled: true },
  { id: 'case', label: 'Cases', title: 'Cases', subtitle: 'Cases containing sealed display products', badge: 'Cases', icon: 'case', iconClassName: 'text-indigo-500', rawCategories: ['booster_case', 'bundle_case', 'case'], requiredTags: ['booster_case', 'bundle_case'], packagingTypes: ['case', 'bundle_case'], enabled: true },
  { id: 'bundle', label: 'Bundles', title: 'Bundles', subtitle: 'Bundles, gift bundles, and fat packs', badge: 'Bundles', icon: 'bundle', iconClassName: 'text-rose-500', rawCategories: ['bundle'], requiredTags: ['bundle'], packagingTypes: ['bundle'], enabled: true },
  { id: 'prerelease', label: 'Prerelease', title: 'Prerelease', subtitle: 'Prerelease packs and limited-play kits', badge: 'Prerelease', icon: 'kit', iconClassName: 'text-emerald-500', rawCategories: ['prerelease', 'prerelease_pack'], requiredTags: ['prerelease'], packagingTypes: ['prerelease'], enabled: true },
  { id: 'sample_promo_topper', label: 'Sample / Promo / Box Toppers', title: 'Sample, Promo & Box Toppers', subtitle: 'Sample boosters, promotional packs, and box toppers', badge: 'Sample / Promo', icon: 'pack', iconClassName: 'text-sky-500', rawCategories: [], requiredTags: ['sample_promo_topper'], packagingTypes: [], enabled: true },
  { id: 'commander_deck', label: 'Commander Decks', title: 'Commander Decks', subtitle: 'Commander-format preconstructed decks and collections', badge: 'Commander', icon: 'deck', iconClassName: 'text-violet-500', rawCategories: ['commander_deck'], requiredTags: ['commander_deck'], packagingTypes: [], enabled: true },
  { id: 'preconstructed_deck', label: 'Other Preconstructed Decks', title: 'Other Preconstructed Decks', subtitle: 'Starter, theme, intro, duel, and other fixed decks', badge: 'Preconstructed', icon: 'deck', iconClassName: 'text-violet-500', rawCategories: ['starter_deck'], requiredTags: ['preconstructed_deck'], packagingTypes: [], enabled: true },
  { id: 'secret_lair', label: 'Secret Lair', title: 'Secret Lair', subtitle: 'Secret Lair drops, bundles, and superdrops', badge: 'Secret Lair', icon: 'box_set', iconClassName: 'text-amber-500', rawCategories: ['secret_lair'], requiredTags: ['secret_lair'], packagingTypes: [], enabled: true },
  { id: 'special_collection', label: 'Special Sets & Collections', title: 'Special Sets & Collections', subtitle: 'Curated box sets and specialty sealed collections', badge: 'Special Collection', icon: 'box_set', iconClassName: 'text-amber-500', rawCategories: [], requiredTags: ['special_collection'], packagingTypes: [], enabled: true },
  { id: 'other', label: 'Other', title: 'Other Products', subtitle: 'Specialty and ancillary sealed products', badge: 'Other Products', icon: 'other', iconClassName: 'text-slate-400', rawCategories: [], requiredTags: ['other'], packagingTypes: ['other'], catchAll: true, enabled: true },
];

export interface ProductOverviewCategoryFilter {
  id: ProductCategory;
  label: string;
  icon: ProductCategoryIcon;
  iconClassName: string;
  rawCategories: readonly string[];
  requiredTags: readonly string[];
  catchAll?: boolean;
}

export const PRODUCT_OVERVIEW_CATEGORY_FILTERS: readonly ProductOverviewCategoryFilter[] = [
  { id: 'all', label: 'All Sealed Formats', icon: 'all', iconClassName: '', rawCategories: [], requiredTags: [] },
  ...PRODUCT_CATEGORY_DEFINITIONS.filter((definition) => definition.enabled),
];

const normalizedTagSet = (categoryTags: readonly string[] | undefined, rawCategory?: string) => new Set(
  (categoryTags?.length ? categoryTags : [rawCategory || ''])
    .map((tag) => String(tag).toLowerCase())
    .filter(Boolean)
);

const matchesOverviewFilter = (filter: ProductOverviewCategoryFilter, tags: Set<string>, rawCategory: string, hasCanonicalTags: boolean) => (
  filter.requiredTags.some((tag) => tags.has(tag)) || (!hasCanonicalTags && filter.rawCategories.includes(rawCategory))
);

export function matchesProductOverviewCategory(
  rawCategory: string | undefined,
  selectedCategory: ProductCategory,
  categoryTags?: readonly string[]
): boolean {
  if (selectedCategory === 'all') return true;

  const normalizedCategory = String(rawCategory || '').toLowerCase();
  const hasCanonicalTags = Boolean(categoryTags?.length);
  const tags = normalizedTagSet(categoryTags, normalizedCategory);
  const selectedFilter = PRODUCT_OVERVIEW_CATEGORY_FILTERS.find((filter) => filter.id === selectedCategory);
  if (!selectedFilter) return true;
  if (!selectedFilter.catchAll) return matchesOverviewFilter(selectedFilter, tags, normalizedCategory, hasCanonicalTags);

  return !PRODUCT_OVERVIEW_CATEGORY_FILTERS.some(
    (filter) => !filter.catchAll && filter.id !== 'all' && matchesOverviewFilter(filter, tags, normalizedCategory, hasCanonicalTags)
  );
}

export type ProductDetailCategoryGroup = ProductCategoryDefinition;

export const PRODUCT_DETAIL_CATEGORY_GROUPS: readonly ProductDetailCategoryGroup[] =
  PRODUCT_CATEGORY_DEFINITIONS.filter((definition) => definition.enabled);

const BOOSTER_SUBTYPE_ALIASES: Record<string, string> = {
  default: 'classic',
  set_booster: 'set',
};

const BOOSTER_SUBTYPE_LABELS: Record<string, string> = {
  classic: 'Classic Booster',
  collector: 'Collector',
  collector_sample: 'Collector Sample',
  draft: 'Draft',
  jumpstart: 'Jumpstart',
  play: 'Play',
  premium: 'Premium',
  promotional: 'Promotional',
  set: 'Set',
  six_card: 'Six-Card',
  theme: 'Theme',
  topper: 'Box Topper',
};

export function normalizeBoosterSubtype(value: string | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return BOOSTER_SUBTYPE_ALIASES[normalized] || normalized || 'unspecified';
}

export function getProductBoosterSubtype(product: {
  rawSubtype?: string;
  subtype?: string;
  boosterName?: string;
}): string {
  return normalizeBoosterSubtype(product.rawSubtype || product.subtype || product.boosterName);
}

export function formatBoosterSubtypeLabel(subtype: string): string {
  return BOOSTER_SUBTYPE_LABELS[subtype] || subtype
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function matchesProductDetailCategory(product: {
  rawCategory?: string;
  packagingType: ProductPackagingType;
  categoryTags?: readonly string[];
}, categoryId: string): boolean {
  const config = PRODUCT_DETAIL_CATEGORY_GROUPS.find((group) => group.id === categoryId);
  if (!config) return false;

  const rawCategory = String(product.rawCategory || '').toLowerCase();
  const hasCanonicalTags = Boolean(product.categoryTags?.length);
  const tags = normalizedTagSet(product.categoryTags, rawCategory);
  const directMatch = config.requiredTags.some((tag) => tags.has(tag)) || (!hasCanonicalTags && (
    config.rawCategories.includes(rawCategory) || config.packagingTypes.includes(product.packagingType)
  ));
  if (categoryId !== 'other') return directMatch;

  return !PRODUCT_DETAIL_CATEGORY_GROUPS.some((group) => group.id !== 'other' && (
    group.requiredTags.some((tag) => tags.has(tag)) || (!hasCanonicalTags && (
      group.rawCategories.includes(rawCategory) || group.packagingTypes.includes(product.packagingType)
    ))
  ));
}
