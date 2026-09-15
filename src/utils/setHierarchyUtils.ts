/**
 * setHierarchyUtils.ts
 *
 * Authoritative mapping and resolution for MTG Set hierarchies powered by Scryfall API data.
 * Captures all relationships: Main Sets, Commander sets, Masterpieces, Promos,
 * Tokens, Art Series, and Scene Boxes (e.g. FIN -> FCA, FIC, AFIC, PFIN, TFIN, RFIN, TFIC).
 */

export interface ScryfallChildSetSummary {
  code: string;
  name: string;
  setType?: string;
  cardCount: number;
  iconSvgUri?: string;
}

export interface ScryfallSetHierarchyNode {
  code: string;
  name: string;
  parentCode: string | null;
  rootCode: string;
  setType?: string;
  cardCount: number;
  releaseDate?: string;
  iconSvgUri?: string;
  isRoot: boolean;
  childSets: ScryfallChildSetSummary[];
  allDescendantCodes: string[];
}

// Global in-memory dynamic cache loaded from /data/scryfall_set_hierarchy.json
let SCRYFALL_HIERARCHY_CACHE: Record<string, ScryfallSetHierarchyNode> = {};
let isHierarchyLoaded = false;

// Fallback baseline mappings so synchronous calls before fetch resolve immediately
const FALLBACK_PARENT_MAP: Record<string, string> = {
  // Final Fantasy
  FCA: 'FIN',
  FIC: 'FIN',
  AFIC: 'FIN', // Root is FIN (parent FIC)
  PFIN: 'FIN',
  TFIN: 'FIN',
  RFIN: 'FIN',
  TFIC: 'FIN',
  AFIN: 'FIN',
  PSS5: 'FIN',
  WFIN: 'FIN',

  // Modern Horizons 3
  M3C: 'MH3',
  TM3C: 'MH3',
  AMH3: 'MH3',
  PMH3: 'MH3',
  TMH3: 'MH3',
  SMH3: 'MH3',
  H2R: 'MH3',

  // Bloomburrow
  BLC: 'BLB',
  TBLC: 'BLB',
  ABLB: 'BLB',
  PBLB: 'BLB',
  TBLB: 'BLB',
  YBLB: 'BLB',

  // Outlaws of Thunder Junction
  OTC: 'OTJ',
  OTP: 'OTJ',
  BIG: 'OTJ',
  TOTC: 'OTJ',
  TOTP: 'OTJ',
  TBIG: 'OTJ',
  AOTJ: 'OTJ',
  POTJ: 'OTJ',
  TOTJ: 'OTJ',

  // Foundations
  FDC: 'FDN',
  J25: 'FDN',
  AFDN: 'FDN',
  PFDN: 'FDN',
  TFDN: 'FDN',

  // Duskmourn
  DSC: 'DSK',
  TDSC: 'DSK',
  ADSK: 'DSK',
  PDSK: 'DSK',
  TDSK: 'DSK',

  // Wilds of Eldraine
  WOC: 'WOE',
  WOT: 'WOE',
  TWOC: 'WOE',
  AWOE: 'WOE',
  PWOE: 'WOE',
  TWOE: 'WOE',

  // The Lost Caverns of Ixalan
  LCC: 'LCI',
  REX: 'LCI',
  TLCC: 'LCI',
  ALCI: 'LCI',
  PLCI: 'LCI',
  TLCI: 'LCI',

  // Lord of the Rings
  LTC: 'LTR',
  TLTC: 'LTR',
  ALTR: 'LTR',
  PLTR: 'LTR',
  TLTR: 'LTR',

  // Tarkir Dragonstorm
  TDC: 'TDM',

  // Aetherdrift
  DRC: 'DFT',

  // Edge of Eternities
  EOC: 'EOE',

  // Spider-Man / Marvel
  MSC: 'MSH',

  // Star Trek
  TRK: 'TRK',
};

/**
 * Loads and registers the complete Scryfall hierarchy map (1,049+ sets).
 */
export function initScryfallHierarchy(data: Record<string, ScryfallSetHierarchyNode>) {
  if (data && typeof data === 'object') {
    SCRYFALL_HIERARCHY_CACHE = data;
    isHierarchyLoaded = true;
  }
}

/**
 * Fetches the Scryfall hierarchy from /data/scryfall_set_hierarchy.json if not yet loaded.
 */
export async function loadScryfallHierarchy(): Promise<Record<string, ScryfallSetHierarchyNode>> {
  if (isHierarchyLoaded && Object.keys(SCRYFALL_HIERARCHY_CACHE).length > 0) {
    return SCRYFALL_HIERARCHY_CACHE;
  }

  try {
    const res = await fetch('/data/scryfall_set_hierarchy.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      initScryfallHierarchy(data);
      return data;
    }
  } catch (err) {
    console.warn('Could not load /data/scryfall_set_hierarchy.json, using fallback dictionary:', err);
  }
  return SCRYFALL_HIERARCHY_CACHE;
}

/**
 * Returns the Scryfall hierarchy node for a given set code.
 */
export function getScryfallNode(setCode?: string | null): ScryfallSetHierarchyNode | null {
  if (!setCode) return null;
  const upper = setCode.toUpperCase();
  return SCRYFALL_HIERARCHY_CACHE[upper] || null;
}

/**
 * Resolves any set code (e.g. FCA, FIC, AFIC, PFIN, M3C, OTC, OTP) to its authoritative
 * Main Expansion/Core set code (e.g. FIN, MH3, OTJ).
 */
export function resolveToMainSetCode(setCode?: string | null): string {
  if (!setCode) return 'DFT';
  const upper = setCode.toUpperCase();
  
  const node = SCRYFALL_HIERARCHY_CACHE[upper];
  if (node && node.rootCode) {
    return node.rootCode.toUpperCase();
  }

  if (FALLBACK_PARENT_MAP[upper]) {
    return FALLBACK_PARENT_MAP[upper];
  }

  return upper;
}

/**
 * Resolves the direct parent set code for a subset.
 * Returns null if the set is a top-level root set.
 */
export function getParentSetCode(setCode?: string | null): string | null {
  if (!setCode) return null;
  const upper = setCode.toUpperCase();
  
  const node = SCRYFALL_HIERARCHY_CACHE[upper];
  if (node) {
    return node.parentCode ? node.parentCode.toUpperCase() : null;
  }

  return FALLBACK_PARENT_MAP[upper] || null;
}

/**
 * Returns true if the set is a subset (has a parent set in Scryfall or fallback map).
 */
export function isSubSet(setCode?: string | null): boolean {
  if (!setCode) return false;
  const upper = setCode.toUpperCase();
  
  const node = SCRYFALL_HIERARCHY_CACHE[upper];
  if (node) {
    return !node.isRoot || Boolean(node.parentCode);
  }

  return Boolean(FALLBACK_PARENT_MAP[upper]);
}

/**
 * Returns true if the set is specifically a Commander sub-set.
 */
export function isCommanderSubSet(setCode?: string | null): boolean {
  if (!setCode) return false;
  const upper = setCode.toUpperCase();
  
  const node = SCRYFALL_HIERARCHY_CACHE[upper];
  if (node) {
    return node.setType === 'commander' || (node.name || '').toLowerCase().includes('commander');
  }

  return upper.endsWith('C') && Boolean(FALLBACK_PARENT_MAP[upper]);
}

/**
 * Gets all child Commander set codes that belong to this parent set.
 */
export function getChildCommanderSetCodes(parentSetCode?: string | null): string[] {
  if (!parentSetCode) return [];
  const upper = parentSetCode.toUpperCase();
  
  const node = SCRYFALL_HIERARCHY_CACHE[upper];
  if (node && Array.isArray(node.childSets)) {
    const cmdChildren = node.childSets
      .filter((c) => c.setType === 'commander' || (c.name || '').toLowerCase().includes('commander'))
      .map((c) => c.code.toUpperCase());
    if (cmdChildren.length > 0) return cmdChildren;
  }

  // Fallback map search
  const found: string[] = [];
  Object.entries(FALLBACK_PARENT_MAP).forEach(([child, parent]) => {
    if (parent === upper && child.endsWith('C')) {
      found.push(child);
    }
  });
  return found;
}

/**
 * Returns all direct child sets for a parent set (with name, setType, cardCount, icon).
 */
export function getChildSets(parentSetCode?: string | null): ScryfallChildSetSummary[] {
  if (!parentSetCode) return [];
  const upper = parentSetCode.toUpperCase();

  const node = SCRYFALL_HIERARCHY_CACHE[upper];
  if (node && Array.isArray(node.childSets) && node.childSets.length > 0) {
    return node.childSets;
  }

  // Fallback list
  const results: ScryfallChildSetSummary[] = [];
  Object.entries(FALLBACK_PARENT_MAP).forEach(([child, parent]) => {
    if (parent === upper) {
      results.push({
        code: child,
        name: `${upper} ${child}`,
        cardCount: 0,
      });
    }
  });
  return results;
}

/**
 * Returns an array of ALL set codes that should be considered part of this set's scope
 * for sealed product and deck aggregation, including all recursive descendants from Scryfall.
 * e.g. for 'FIN' -> ['FIN', 'FCA', 'FIC', 'AFIC', 'PFIN', 'TFIN', 'RFIN', 'TFIC', 'AFIN', 'PSS5', 'WFIN']
 *      for 'MH3' -> ['MH3', 'M3C', 'TM3C', 'AMH3', 'PMH3', 'SMH3', 'TMH3', 'H2R']
 */
export function getAllRelatedSetCodes(setCode?: string | null): string[] {
  if (!setCode) return [];
  const root = resolveToMainSetCode(setCode);
  
  const node = SCRYFALL_HIERARCHY_CACHE[root];
  if (node && Array.isArray(node.allDescendantCodes) && node.allDescendantCodes.length > 0) {
    return Array.from(new Set([root, ...node.allDescendantCodes.map((c) => c.toUpperCase())]));
  }

  // Fallback: search all fallback entries with this root
  const related = [root];
  Object.entries(FALLBACK_PARENT_MAP).forEach(([child, parent]) => {
    if (parent === root) {
      related.push(child);
    }
  });
  return Array.from(new Set(related));
}
