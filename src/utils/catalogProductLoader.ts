import { CatalogPackProduct, ProductPackagingType, ECOMMERCE_CATALOG_PACKS } from '../ecommerceBoosterData';

/**
 * Builds a unified catalog from the pipeline-generated sealed products snapshot.
 * Curated frontend catalog entries are intentionally not treated as a competing source of truth.
 */
function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => typeof entry === 'string');
}

export function buildUnifiedCatalogProducts(sealedRaw?: any[]): CatalogPackProduct[] {
  const result: CatalogPackProduct[] = [];
  const seenIds = new Set<string>();
  const seenUuids = new Set<string>();

  // The backend-generated public/data snapshot is authoritative.
  // Curated UI metadata is intentionally omitted to avoid overriding pipeline values.

  if (!Array.isArray(sealedRaw) || sealedRaw.length === 0) {
    return result;
  }

  for (const sp of sealedRaw) {
    const rawId = readString(sp.id) ?? readString(sp.uuid);
    const rawUuid = readString(sp.uuid) ?? '';
    const setCodeValue = readString(sp.setCode) ?? readString(sp.set_code);
    const displayNameValue = readString(sp.displayName) ?? readString(sp.name);
    if (!rawId || !setCodeValue || !displayNameValue) continue;
    if (rawId && seenIds.has(rawId.toLowerCase())) continue;
    if (rawUuid && seenUuids.has(rawUuid.toLowerCase())) continue;

    const setCode = setCodeValue.toUpperCase();
    const displayName = displayNameValue;
    const cat = (readString(sp.category) ?? '').toLowerCase();
    const sub = (readString(sp.subtype) ?? '').toLowerCase();
    const metadataSource: 'pipeline' | 'inferred' = 'pipeline';

    let packagingType: ProductPackagingType = 'other';
    if (cat === 'booster_box') {
      packagingType = 'box';
    } else if (cat === 'booster_pack' || cat === 'draft_pack') {
      packagingType = 'pack';
    } else if (cat === 'bundle') {
      packagingType = 'bundle';
    } else if (cat === 'bundle_case') {
      packagingType = 'bundle_case';
    } else if (cat === 'booster_case' || cat === 'case') {
      packagingType = 'case';
    } else if (cat === 'prerelease_pack' || cat === 'prerelease') {
      packagingType = 'prerelease';
    } else if (cat === 'deck' || cat === 'multiple_decks' || cat === 'deck_box' || cat === 'commander_deck') {
      packagingType = 'starter_deck';
    } else if (cat === 'box_set') {
      packagingType = 'box_set';
    } else if (cat === 'kit') {
      packagingType = 'kit';
    }

    const packsCount = readFiniteNumber(sp.packsCount) ?? 0;
    const marketPrice = readFiniteNumber(sp.marketPrice) ?? 0;
    const estimatedEv = readFiniteNumber(sp.totalEvAvg) ?? 0;
    const boosterName = readString(sp.boosterName) ?? '';
    const id = rawId;

    const setName = readString(sp.setName);
    const releaseDate = readString(sp.releaseDate) ?? '';
    const block = readString(sp.block) ?? '';
    const imageUrl = readString(sp.imageUrl) ?? readString(sp.image_url) ?? undefined;
    const cardCount = readFiniteNumber(sp.cardCount);
    const specialFeatures = readStringArray(sp.specialFeatures);
    const tcgplayerLink = readString(sp.purchaseUrl) ?? readString(sp.tcgplayerLink) ?? undefined;
    const contents = sp.contents;
    const category = readString(sp.category);
    const subtype = readString(sp.subtype);

    result.push({
      id,
      uuid: rawUuid || undefined,
      dbId: rawId,
      rawCategory: sp.category,
      rawSubtype: sp.subtype,
      primaryCategory: readString(sp.primaryCategory) ?? readString(sp.category) ?? 'other',
      categoryTags: readStringArray(sp.categoryTags),
      setCode,
      setName,
      releaseDate,
      block,
      packagingType,
      boosterName,
      displayName,
      marketPrice,
      estimatedEv,
      packsCount,
      imageUrl,
      cardCount,
      specialFeatures,
      tcgplayerLink,
      contents,
      category,
      subtype,
      metadataSource,
      totalEvAvg: sp.totalEvAvg,
      totalEvMid90: sp.totalEvMid90,
      totalEvMin5: sp.totalEvMin5,
      totalEvMax5: sp.totalEvMax5,
      totalEvMin: sp.totalEvMin,
      totalEvMax: sp.totalEvMax,
      evScore: sp.evScore,
      breakevenPercentile: sp.breakevenPercentile,
      archetype: sp.archetype,
      quantilesByVendor: sp.quantilesByVendor,
    });

    if (rawId) seenIds.add(rawId.toLowerCase());
    if (rawUuid) seenUuids.add(rawUuid.toLowerCase());
    seenIds.add(id.toLowerCase());
  }

  return result;
}

export interface CatalogSetSummary {
  code: string;
  name: string;
  count: number;
}

/**
 * Extracts a sorted list of unique sets with product counts from the unified catalog.
 */
export function extractAllCatalogSets(products: CatalogPackProduct[]): CatalogSetSummary[] {
  const setMap = new Map<string, { code: string; name: string; count: number }>();

  for (const p of products) {
    const code = (p.setCode || 'SET').toUpperCase();
    const existing = setMap.get(code);
    if (existing) {
      existing.count++;
      if (p.setName && p.setName !== code && existing.name === code) {
        existing.name = p.setName;
      }
    } else {
      setMap.set(code, {
        code,
        name: p.setName || code,
        count: 1,
      });
    }
  }

  return Array.from(setMap.values()).sort((a, b) => a.code.localeCompare(b.code));
}
