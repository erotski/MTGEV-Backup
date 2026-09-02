import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

interface DetectedAsset {
  originalPath: string;
  entryName: string;
  targetFilename: string;
  productType: string;
  confidence: number;
}

// Known Magic set codes & name mappings for auto-detection
const KNOWN_SETS: Record<string, string> = {
  mh3: 'Modern Horizons 3',
  otj: 'Outlaws of Thunder Junction',
  blb: 'Bloomburrow',
  dsk: 'Duskmourn: House of Horror',
  fdn: 'Foundations',
  mkm: 'Murders at Karlov Manor',
  lci: 'The Lost Caverns of Ixalan',
  woe: 'Wilds of Eldraine',
  ltr: 'The Lord of the Rings: Tales of Middle-earth',
  mom: 'March of the Machine',
  one: 'Phyrexia: All Will Be One',
  bro: 'The Brothers\' War',
  dmu: 'Dominaria United',
  snc: 'Streets of New Capenna',
  neo: 'Kamigawa: Neon Dynasty',
  vow: 'Innistrad: Crimson Vow',
  mid: 'Innistrad: Midnight Hunt',
  afr: 'Adventures in the Forgotten Realms',
  stx: 'Strixhaven: School of Mages',
  khm: 'Kaldheim',
  znr: 'Zendikar Rising',
};

const INCOMING_DIR = path.resolve(process.cwd(), 'incoming_zips');
const TARGET_PRODUCTS_DIR = path.resolve(process.cwd(), 'public', 'products');

function ensureDirectories() {
  if (!fs.existsSync(INCOMING_DIR)) {
    fs.mkdirSync(INCOMING_DIR, { recursive: true });
  }
  if (!fs.existsSync(TARGET_PRODUCTS_DIR)) {
    fs.mkdirSync(TARGET_PRODUCTS_DIR, { recursive: true });
  }
}

function detectSetCode(filename: string, zipEntries: string[], forcedCode?: string): string {
  if (forcedCode) {
    return forcedCode.toLowerCase().trim();
  }

  const cleanFilename = filename.toLowerCase();

  // Check known 3-character codes in filename
  for (const code of Object.keys(KNOWN_SETS)) {
    const regex = new RegExp(`\\b${code}\\b|[^a-z0-9]${code}[^a-z0-9]|^${code}[^a-z0-9]|_${code}_|-${code}-`, 'i');
    if (regex.test(cleanFilename)) {
      return code;
    }
  }

  // Check set full names in filename
  for (const [code, name] of Object.entries(KNOWN_SETS)) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileSlug = cleanFilename.replace(/[^a-z0-9]/g, '');
    if (fileSlug.includes(slug)) {
      return code;
    }
  }

  // Check inside paths in the zip
  for (const entry of zipEntries) {
    const cleanEntry = entry.toLowerCase();
    for (const code of Object.keys(KNOWN_SETS)) {
      if (cleanEntry.includes(`/${code}/`) || cleanEntry.includes(`_${code}_`) || cleanEntry.includes(`-${code}-`)) {
        return code;
      }
    }
  }

  // Default fallback: take first 3 alphanumeric characters of zip file name
  const match = cleanFilename.match(/^[a-z0-9]{3,4}/);
  return match ? match[0] : 'mtg';
}

function classifyPackagingType(entryPath: string): { type: string; confidence: number } | null {
  const p = entryPath.toLowerCase();
  const ext = path.extname(p);

  // Must be an image
  if (!['.png', '.webp', '.jpg', '.jpeg'].includes(ext)) {
    return null;
  }

  // Ignore tiny web banners, social tiles, logos, headers, thumbnails, and icons
  if (
    p.includes('social') ||
    p.includes('facebook') ||
    p.includes('instagram') ||
    p.includes('banner') ||
    p.includes('header') ||
    p.includes('logo') ||
    p.includes('symbol') ||
    p.includes('poster') ||
    p.includes('flyer')
  ) {
    return null;
  }

  // Prefer transparent 3D PNG renders
  const isPng = ext === '.png';
  const bonus = isPng ? 20 : 0;

  // 1. Bundle Box
  if (p.includes('bundle') || p.includes('gift_edition') || p.includes('fatpack')) {
    if (p.includes('3d') || p.includes('render') || p.includes('box')) {
      return { type: 'bundle', confidence: 90 + bonus };
    }
    return { type: 'bundle', confidence: 70 + bonus };
  }

  // 2. Prerelease Pack
  if (p.includes('prerelease') || p.includes('pre-release') || p.includes('pr_pack')) {
    return { type: 'prerelease', confidence: 85 + bonus };
  }

  // 3. Booster Box / Play Box / Display
  if (
    (p.includes('play') && p.includes('box')) ||
    (p.includes('booster') && p.includes('box')) ||
    (p.includes('play') && p.includes('display')) ||
    (p.includes('booster') && p.includes('display')) ||
    p.includes('box_3d') ||
    p.includes('display_3d')
  ) {
    return { type: 'box', confidence: 95 + bonus };
  }

  // 4. Single Booster Pack
  if (
    (p.includes('booster') && p.includes('pack')) ||
    (p.includes('play') && p.includes('pack')) ||
    p.includes('pack_front') ||
    p.includes('pack_3d') ||
    p.includes('foil_pack')
  ) {
    return { type: 'pack', confidence: 80 + bonus };
  }

  // 5. Sealed Case
  if (p.includes('case') || p.includes('master_case') || p.includes('shipping_box')) {
    return { type: 'case', confidence: 75 + bonus };
  }

  // Generic box or pack fallback
  if (p.includes('display') || p.includes('box')) {
    return { type: 'box', confidence: 60 + bonus };
  }
  if (p.includes('pack')) {
    return { type: 'pack', confidence: 55 + bonus };
  }

  return null;
}

export function processZipFile(zipFilePath: string, explicitSetCode?: string) {
  const filename = path.basename(zipFilePath);
  console.log(`\n📦 Processing archive: \x1b[36m${filename}\x1b[0m`);

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipFilePath);
  } catch (err) {
    console.error(`❌ Failed to read ZIP file ${filename}:`, err);
    return;
  }

  const entries = zip.getEntries();
  const entryNames = entries.map((e) => e.entryName);
  const setCode = detectSetCode(filename, entryNames, explicitSetCode);
  const setName = KNOWN_SETS[setCode] || setCode.toUpperCase();

  console.log(`🏷️  Detected Set: \x1b[32m${setName} (${setCode.toUpperCase()})\x1b[0m`);

  // Group candidate files by packaging type
  const bestCandidatesByType: Record<string, { entry: AdmZip.IZipEntry; confidence: number }> = {};

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const classification = classifyPackagingType(entry.entryName);
    if (!classification) continue;

    const currentBest = bestCandidatesByType[classification.type];
    if (!currentBest || classification.confidence > currentBest.confidence) {
      bestCandidatesByType[classification.type] = {
        entry,
        confidence: classification.confidence,
      };
    }
  }

  const detectedTypes = Object.keys(bestCandidatesByType);
  if (detectedTypes.length === 0) {
    console.log(`⚠️  No standard 3D packaging renders detected in this ZIP archive.`);
    console.log(`   (Checked ${entries.length} files. Ensure this is a DMA / Product Shots kit from WPN)`);
    return;
  }

  console.log(`✨ Found ${detectedTypes.length} packaging product render(s):`);

  for (const type of detectedTypes) {
    const candidate = bestCandidatesByType[type];
    const ext = path.extname(candidate.entry.entryName) || '.png';
    const targetFilename = `${setCode}-${type}${ext}`;
    const destinationPath = path.join(TARGET_PRODUCTS_DIR, targetFilename);

    try {
      const buffer = candidate.entry.getData();
      fs.writeFileSync(destinationPath, buffer);
      console.log(`   ✅ Saved \x1b[32m${targetFilename}\x1b[0m  (from "${path.basename(candidate.entry.entryName)}")`);
    } catch (err) {
      console.error(`   ❌ Failed to extract ${targetFilename}:`, err);
    }
  }
}

export function runIngestion(forcedSetCode?: string) {
  ensureDirectories();

  console.log(`\n========================================================`);
  console.log(`🧙 WPN Marketing Assets Ingestion Utility`);
  console.log(`========================================================`);
  console.log(`📁 Ingestion Folder: ${INCOMING_DIR}`);
  console.log(`🖼️  Destination:    ${TARGET_PRODUCTS_DIR}\n`);

  const files = fs.readdirSync(INCOMING_DIR);
  const zipFiles = files.filter((f) => f.toLowerCase().endsWith('.zip'));

  if (zipFiles.length === 0) {
    console.log(`ℹ️  No .zip files found in \x1b[33m/incoming_zips/\x1b[0m`);
    console.log(`\n📋 HOW TO USE:`);
    console.log(` 1. Download DMA .zip kits from https://wpn.wizards.com/en/marketing-materials`);
    console.log(` 2. Place or save the downloaded .zip file(s) into the \x1b[33m/incoming_zips/\x1b[0m folder.`);
    console.log(` 3. Run: \x1b[32mnpm run ingest-wpn\x1b[0m\n`);
    return;
  }

  console.log(`🔍 Found ${zipFiles.length} archive(s) ready for ingestion...`);
  for (const zipFile of zipFiles) {
    const fullPath = path.join(INCOMING_DIR, zipFile);
    processZipFile(fullPath, forcedSetCode);
  }

  console.log(`\n🎉 Ingestion complete! Check \x1b[32m/public/products/\x1b[0m for your images.\n`);
}

// CLI Execution
const args = process.argv.slice(2);
const explicitSetCode = args[0]; // e.g. "npm run ingest-wpn -- mh3"

runIngestion(explicitSetCode);
