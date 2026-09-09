import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

// Dynamically load sharp if available (for image resizing & optimization)
let sharp = null;
try {
  const sharpModule = await import('sharp');
  sharp = sharpModule.default || sharpModule;
} catch (e) {
  // sharp not installed locally; will extract without downscaling
}

// Known Magic set codes & name mappings for auto-detection
const KNOWN_SETS = {
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
  bro: "The Brothers' War",
  dmu: 'Dominaria United',
  snc: 'Streets of New Capenna',
  neo: 'Kamigawa: Neon Dynasty',
  vow: 'Innistrad: Crimson Vow',
  mid: 'Innistrad: Midnight Hunt',
  afr: 'Adventures in the Forgotten Realms',
  stx: 'Strixhaven: School of Mages',
  khm: 'Kaldheim',
  znr: 'Zendikar Rising',
  hob: 'The Hobbit',
};

const INCOMING_DIR = path.resolve(process.cwd(), 'incoming_zips');
const TARGET_PRODUCTS_DIR = path.resolve(process.cwd(), 'public', 'products');
const MAX_DIMENSION = 800; // Max width/height in pixels for crisp web displays

function ensureDirectories() {
  if (!fs.existsSync(INCOMING_DIR)) {
    fs.mkdirSync(INCOMING_DIR, { recursive: true });
  }
  if (!fs.existsSync(TARGET_PRODUCTS_DIR)) {
    fs.mkdirSync(TARGET_PRODUCTS_DIR, { recursive: true });
  }
}

function detectSetCode(filename, zipEntries, forcedCode) {
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

function classifyPackagingType(entryPath) {
  const p = entryPath.toLowerCase();
  const baseName = path.basename(p);
  const ext = path.extname(p);

  // Must be an image
  if (!['.png', '.webp', '.jpg', '.jpeg'].includes(ext)) {
    return null;
  }

  // Ignore tiny web banners, social tiles, logos, headers, thumbnails, dielines, and posters
  if (
    p.includes('social') ||
    p.includes('facebook') ||
    p.includes('instagram') ||
    p.includes('banner') ||
    p.includes('header') ||
    p.includes('logo') ||
    p.includes('symbol') ||
    p.includes('poster') ||
    p.includes('flyer') ||
    p.includes('dieline') ||
    p.includes('diemap') ||
    p.includes('flat')
  ) {
    return null;
  }

  // Check for angle 01 vs alternative angles (02, 03, etc.)
  const isAngle01 =
    baseName.startsWith('01_') ||
    baseName.startsWith('01-') ||
    baseName.startsWith('01.') ||
    baseName.includes('_01_') ||
    baseName.includes('_01.') ||
    baseName.includes('-01-') ||
    baseName.includes('-01.') ||
    baseName.includes('angle01') ||
    baseName.includes('angle_1') ||
    baseName.includes('pos01') ||
    baseName.includes('pos_1');

  const isOtherAngle =
    baseName.startsWith('02_') ||
    baseName.startsWith('03_') ||
    baseName.startsWith('04_') ||
    baseName.startsWith('02-') ||
    baseName.startsWith('03-') ||
    baseName.includes('_02_') ||
    baseName.includes('_03_') ||
    baseName.includes('_04_') ||
    baseName.includes('angle02') ||
    baseName.includes('angle03');

  // Angle weighting: heavily favor 01 angle renders
  let angleBonus = 0;
  if (isAngle01) angleBonus = 60;
  else if (isOtherAngle) angleBonus = -80;

  // Prefer transparent 3D PNG renders
  const isPng = ext === '.png';
  const pngBonus = isPng ? 20 : 0;
  const totalBonus = angleBonus + pngBonus;

  // 1. Collector Display Box
  if (
    (p.includes('collector') && (p.includes('box') || p.includes('display'))) ||
    p.includes('collector_box') ||
    p.includes('collector_display')
  ) {
    return { type: 'collector', confidence: 100 + totalBonus, isAngle01 };
  }

  // 2. Bundle Box / Gift Bundle
  if (p.includes('bundle') || p.includes('gift_edition') || p.includes('fatpack')) {
    if (p.includes('3d') || p.includes('render') || p.includes('box')) {
      return { type: 'bundle', confidence: 90 + totalBonus, isAngle01 };
    }
    return { type: 'bundle', confidence: 70 + totalBonus, isAngle01 };
  }

  // 3. Prerelease Pack
  if (p.includes('prerelease') || p.includes('pre-release') || p.includes('pr_pack') || p.includes('prpack')) {
    return { type: 'prerelease', confidence: 85 + totalBonus, isAngle01 };
  }

  // 4. Booster Box / Play Box / Display
  if (
    (p.includes('play') && p.includes('box')) ||
    (p.includes('booster') && p.includes('box')) ||
    (p.includes('play') && p.includes('display')) ||
    (p.includes('booster') && p.includes('display')) ||
    p.includes('box_3d') ||
    p.includes('display_3d')
  ) {
    return { type: 'box', confidence: 95 + totalBonus, isAngle01 };
  }

  // 5. Single Booster Pack
  if (
    (p.includes('booster') && p.includes('pack')) ||
    (p.includes('play') && p.includes('pack')) ||
    p.includes('pack_front') ||
    p.includes('pack_3d') ||
    p.includes('foil_pack')
  ) {
    return { type: 'pack', confidence: 80 + totalBonus, isAngle01 };
  }

  // 6. Commander Deck / Precon Deck
  if (p.includes('commander') || p.includes('deck') || p.includes('precon')) {
    return { type: 'deck', confidence: 75 + totalBonus, isAngle01 };
  }

  // 7. Sealed Case
  if (p.includes('case') || p.includes('master_case') || p.includes('shipping_box')) {
    return { type: 'case', confidence: 70 + totalBonus, isAngle01 };
  }

  // Generic box or pack fallback
  if (p.includes('display') || p.includes('box')) {
    return { type: 'box', confidence: 60 + totalBonus, isAngle01 };
  }
  if (p.includes('pack')) {
    return { type: 'pack', confidence: 55 + totalBonus, isAngle01 };
  }

  return null;
}

async function optimizeAndSaveImage(inputBuffer, destinationPath) {
  const originalSize = inputBuffer.length;

  if (sharp) {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    // Resize bounding box to MAX_DIMENSION (preserving aspect ratio and transparent alpha channel)
    const resized = image.resize({
      width: metadata.width && metadata.width > MAX_DIMENSION ? MAX_DIMENSION : undefined,
      height: metadata.height && metadata.height > MAX_DIMENSION ? MAX_DIMENSION : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Export as high-quality optimized PNG with quantized palette for tiny file size (~50-90 KB)
    const outputPng = await resized
      .png({
        compressionLevel: 9,
        quality: 85,
        effort: 7,
        palette: true,
      })
      .toBuffer();

    fs.writeFileSync(destinationPath, outputPng);

    // Also write modern WebP counterpart for ultra-fast browser loading
    const webpDestination = destinationPath.replace(/\.png$/i, '.webp');
    const outputWebp = await resized.webp({ quality: 85, effort: 6 }).toBuffer();
    fs.writeFileSync(webpDestination, outputWebp);

    return {
      originalSize,
      optimizedSize: outputPng.length,
      width: metadata.width || 0,
      height: metadata.height || 0,
      hasSharp: true,
    };
  } else {
    // Fallback if sharp is not installed locally
    fs.writeFileSync(destinationPath, inputBuffer);
    return {
      originalSize,
      optimizedSize: originalSize,
      width: 0,
      height: 0,
      hasSharp: false,
    };
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function processZipFile(zipFilePath, explicitSetCode) {
  const filename = path.basename(zipFilePath);
  console.log(`\n📦 Processing archive: \x1b[36m${filename}\x1b[0m`);

  let zip;
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

  // Group candidate files by packaging type, filtering and prioritizing "01" angle renders
  const bestCandidatesByType = {};

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const classification = classifyPackagingType(entry.entryName);
    if (!classification) continue;

    const currentBest = bestCandidatesByType[classification.type];
    if (!currentBest || classification.confidence > currentBest.confidence) {
      bestCandidatesByType[classification.type] = {
        entry,
        confidence: classification.confidence,
        isAngle01: classification.isAngle01,
      };
    }
  }

  const detectedTypes = Object.keys(bestCandidatesByType);
  if (detectedTypes.length === 0) {
    console.log(`⚠️  No standard 3D packaging renders detected in this ZIP archive.`);
    console.log(`   (Checked ${entries.length} files. Ensure this is a DMA / Product Shots kit from WPN)`);
    return;
  }

  console.log(`✨ Found ${detectedTypes.length} packaging product render(s) (preferring angle 01):`);

  for (const type of detectedTypes) {
    const candidate = bestCandidatesByType[type];
    const targetFilename = `${setCode}-${type}.png`;
    const destinationPath = path.join(TARGET_PRODUCTS_DIR, targetFilename);

    try {
      const rawBuffer = candidate.entry.getData();
      const stats = await optimizeAndSaveImage(rawBuffer, destinationPath);

      const angleTag = candidate.isAngle01 ? '\x1b[35m[Angle 01]\x1b[0m ' : '';

      if (stats.hasSharp) {
        const ratio = (((stats.originalSize - stats.optimizedSize) / stats.originalSize) * 100).toFixed(1);
        console.log(
          `   ✅ ${angleTag}Saved \x1b[32m${targetFilename}\x1b[0m + \x1b[34m${targetFilename.replace('.png', '.webp')}\x1b[0m ` +
          `(${formatBytes(stats.originalSize)} ➔ \x1b[32m${formatBytes(stats.optimizedSize)}\x1b[0m, -${ratio}%)`
        );
      } else {
        console.log(
          `   ✅ ${angleTag}Saved \x1b[32m${targetFilename}\x1b[0m (${formatBytes(stats.originalSize)}) ` +
          `\x1b[33m[Tip: install sharp for automatic downscaling]\x1b[0m`
        );
      }
    } catch (err) {
      console.error(`   ❌ Failed to optimize and extract ${targetFilename}:`, err);
    }
  }
}

export async function runIngestion(forcedSetCode) {
  ensureDirectories();

  console.log(`\n========================================================`);
  console.log(`🧙 WPN Marketing Assets Optimizer & Ingestor`);
  console.log(`   • Filters for Angle 01 Renders`);
  console.log(`   • Scales down 4000px / 5MB originals to ~60KB web assets`);
  console.log(`========================================================`);
  console.log(`📁 Ingestion Folder: ${INCOMING_DIR}`);
  console.log(`🖼️  Destination:    ${TARGET_PRODUCTS_DIR}\n`);

  const files = fs.readdirSync(INCOMING_DIR);
  const zipFiles = files.filter((f) => f.toLowerCase().endsWith('.zip'));

  if (zipFiles.length === 0) {
    console.log(`ℹ️  No .zip files found in \x1b[33m/incoming_zips/\x1b[0m`);
    console.log(`\n📋 HOW TO USE:`);
    console.log(` 1. Download WPN DMA / Product Shots .zip kit (e.g. HOB, MH3, BLB).`);
    console.log(` 2. Drop the .zip file into \x1b[33m/incoming_zips/\x1b[0m.`);
    console.log(` 3. Run: \x1b[32mnpm run ingest-wpn\x1b[0m (or \x1b[32mnode scripts/ingest-wpn.js hob\x1b[0m)\n`);
    return;
  }

  console.log(`🔍 Found ${zipFiles.length} archive(s) ready for optimization...`);
  for (const zipFile of zipFiles) {
    const fullPath = path.join(INCOMING_DIR, zipFile);
    await processZipFile(fullPath, forcedSetCode);
  }

  console.log(`\n🎉 Optimization & Ingestion complete! Check \x1b[32m/public/products/\x1b[0m for your images.\n`);
}

// CLI Execution
const args = process.argv.slice(2);
const explicitSetCode = args[0]; // e.g. "node scripts/ingest-wpn.js hob"

runIngestion(explicitSetCode);
