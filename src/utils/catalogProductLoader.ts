import { CatalogPackProduct, ProductPackagingType, ECOMMERCE_CATALOG_PACKS } from '../ecommerceBoosterData';

/**
 * Builds a unified, deduplicated list of all sealed products
 * combining ECOMMERCE_CATALOG_PACKS and the complete MTGJSON sealed products database.
 */
export function buildUnifiedCatalogProducts(sealedRaw?: any[]): CatalogPackProduct[] {
  const result: CatalogPackProduct[] = [...ECOMMERCE_CATALOG_PACKS];
  const seenIds = new Set<string>();
  const seenUuids = new Set<string>();

  // Index pre-curated catalog products
  for (const p of ECOMMERCE_CATALOG_PACKS) {
    if (p.id) seenIds.add(p.id.toLowerCase());
    if (p.uuid) seenUuids.add(p.uuid.toLowerCase());
  }

  if (!Array.isArray(sealedRaw) || sealedRaw.length === 0) {
    return result;
  }

  for (const sp of sealedRaw) {
    const rawId = String(sp.id || sp.uuid || '').trim();
    const rawUuid = String(sp.uuid || '').trim();
    if (rawId && seenIds.has(rawId.toLowerCase())) continue;
    if (rawUuid && seenUuids.has(rawUuid.toLowerCase())) continue;

    const setCode = String(sp.setCode || sp.set_code || 'SET').toUpperCase();
    const displayName = sp.displayName || sp.name || 'Sealed Product';
    const lowerName = displayName.toLowerCase();
    const cat = (sp.category || '').toLowerCase();
    const sub = (sp.subtype || '').toLowerCase();

    // Map packaging type accurately
    let packagingType: ProductPackagingType = 'box';
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
    } else {
      // Fallback based on product title
      if (lowerName.includes('booster pack') || lowerName.includes('draft pack') || lowerName.includes('play booster') || lowerName.includes('collector booster')) {
        packagingType = 'pack';
      } else if (lowerName.includes('bundle') || lowerName.includes('fat pack') || lowerName.includes('gift edition')) {
        packagingType = 'bundle';
      } else if (lowerName.includes('case')) {
        packagingType = 'case';
      } else if (lowerName.includes('prerelease') || lowerName.includes('pre-release')) {
        packagingType = 'prerelease';
      } else if (lowerName.includes('commander') || lowerName.includes('deck') || lowerName.includes('challenger')) {
        packagingType = 'starter_deck';
      } else if (lowerName.includes('box') || lowerName.includes('display')) {
        packagingType = 'box';
      }
    }

    const defaultPacks = packagingType === 'box' ? 36 : packagingType === 'bundle' ? 9 : packagingType === 'case' ? 216 : packagingType === 'prerelease' ? 6 : 1;
    const packsCount = Number(sp.packsCount || defaultPacks);
    const marketPrice = Number(sp.marketPrice || sp.price || sp.tcgplayer_price || 0);
    const estimatedEv = Number(sp.totalEvAvg || sp.estimatedEv || sp.ev || 0);
    const id = rawId || `${setCode}-${displayName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;

    result.push({
      id,
      uuid: rawUuid || id,
      dbId: rawId,
      rawCategory: sp.category,
      rawSubtype: sp.subtype,
      setCode,
      setName: sp.setName || setCode,
      releaseDate: sp.releaseDate || '2024-01-01',
      block: sp.block || 'Standard',
      packagingType,
      boosterName: sp.boosterName || sub || 'play',
      displayName,
      marketPrice,
      estimatedEv,
      packsCount,
      imageUrl: sp.imageUrl || sp.image_url || undefined,
      cardCount: sp.cardCount,
      specialFeatures: sp.specialFeatures || [],
      tcgplayerLink: sp.purchaseUrl || sp.tcgplayerLink,
      contents: sp.contents,
      category: sp.category,
      subtype: sp.subtype,
      totalEvAvg: sp.totalEvAvg,
      totalEvMid90: sp.totalEvMid90,
      totalEvMin5: sp.totalEvMin5,
      totalEvMax5: sp.totalEvMax5,
      totalEvMin: sp.totalEvMin,
      totalEvMax: sp.totalEvMax,
      evScore: sp.evScore,
      breakevenPercentile: sp.breakevenPercentile,
      archetype: sp.archetype,
      quantiles: sp.quantiles,
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
