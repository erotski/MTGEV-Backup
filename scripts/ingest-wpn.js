import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Dynamically load adm-zip with auto-install fallback
let AdmZip = null;
try {
  const admZipModule = await import('adm-zip');
  AdmZip = admZipModule.default || admZipModule;
} catch (e) {
  console.log('\x1b[33m📦 Installing required packaging helpers (adm-zip, sharp)...\x1b[0m');
  try {
    execSync('npm install adm-zip sharp --no-audit --no-fund', { stdio: 'inherit' });
    const admZipModule = await import('adm-zip');
    AdmZip = admZipModule.default || admZipModule;
  } catch (installErr) {
    console.error('\x1b[31m❌ Could not load or install adm-zip. Please run: npm install\x1b[0m');
  }
}

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

function getProductGroupKey(filename) {
  const base = path.basename(filename, path.extname(filename)).toLowerCase();
  return base
    .replace(/^(\d{1,2}[_\-\s]|angle\d{1,2}[_\-\s]|pos\d{1,2}[_\-\s])/i, '')
    .replace(/([_\-\s]\d{1,2}|[_\-\s]angle\d{1,2}|[_\-\s]pos\d{1,2})$/i, '')
    .replace(/[-_\s]+/g, '_')
    .trim();
}

function determineTargetFilenames(setCode, rawFilename) {
  const p = rawFilename.toLowerCase();
  const base = path.basename(p, path.extname(p));
  
  // Clean base without angle prefixes/suffixes
  const clean = base
    .replace(/^(\d{1,2}[_\-\s]|angle\d{1,2}[_\-\s]|pos\d{1,2}[_\-\s])/i, '')
    .replace(/([_\-\s]\d{1,2}|[_\-\s]angle\d{1,2}|[_\-\s]pos\d{1,2})$/i, '')
    .replace(/_3d$/i, '')
    .replace(/[-_\s]+/g, '_')
    .trim();

  const filenames = [];

  // Match specific product types
  if (p.includes('collector') && (p.includes('box') || p.includes('display'))) {
    filenames.push(`${setCode}-collector.png`);
    filenames.push(`${setCode}-collector_box.png`);
  } else if (p.includes('collector') && p.includes('pack')) {
    filenames.push(`${setCode}-collector_pack.png`);
  } else if (p.includes('collector') && p.includes('case')) {
    filenames.push(`${setCode}-collector_case.png`);
  } else if (p.includes('gift') && (p.includes('bundle') || p.includes('edition'))) {
    filenames.push(`${setCode}-gift_bundle.png`);
    filenames.push(`${setCode}-gift.png`);
  } else if (p.includes('bundle') || p.includes('fatpack')) {
    filenames.push(`${setCode}-bundle.png`);
  } else if (p.includes('prerelease') || p.includes('pre-release') || p.includes('pr_pack') || p.includes('prpack')) {
    filenames.push(`${setCode}-prerelease.png`);
  } else if (p.includes('jumpstart') && (p.includes('box') || p.includes('display'))) {
    filenames.push(`${setCode}-jumpstart_box.png`);
    filenames.push(`${setCode}-jumpstart.png`);
  } else if (p.includes('jumpstart') && p.includes('pack')) {
    filenames.push(`${setCode}-jumpstart_pack.png`);
  } else if (p.includes('starter') || p.includes('beginner')) {
    filenames.push(`${setCode}-starter_kit.png`);
    filenames.push(`${setCode}-starter.png`);
  } else if (p.includes('play') && (p.includes('box') || p.includes('display'))) {
    filenames.push(`${setCode}-box.png`);
    filenames.push(`${setCode}-play_box.png`);
  } else if (p.includes('draft') && (p.includes('box') || p.includes('display'))) {
    filenames.push(`${setCode}-draft_box.png`);
    if (!filenames.includes(`${setCode}-box.png`)) filenames.push(`${setCode}-box.png`);
  } else if (p.includes('set') && (p.includes('box') || p.includes('display')) && !p.includes('box_set')) {
    filenames.push(`${setCode}-set_box.png`);
    if (!filenames.includes(`${setCode}-box.png`)) filenames.push(`${setCode}-box.png`);
  } else if ((p.includes('play') || p.includes('draft') || p.includes('booster')) && p.includes('pack')) {
    filenames.push(`${setCode}-pack.png`);
    filenames.push(`${setCode}-play_pack.png`);
  } else if (p.includes('commander') || p.includes('deck') || p.includes('precon')) {
    // Generate slug from deck name, e.g. hob-commander_riders_of_rohan.png
    const deckSlug = clean.replace(/^(commander_deck_|commander_|deck_)/i, '');
    filenames.push(`${setCode}-commander_${deckSlug}.png`);
    filenames.push(`${setCode}-deck_${deckSlug}.png`);
  } else if (p.includes('scene')) {
    const sceneSlug = clean.replace(/^scene_box_/i, '');
    filenames.push(`${setCode}-scene_${sceneSlug}.png`);
  } else if (p.includes('case')) {
    filenames.push(`${setCode}-case.png`);
  } else if (p.includes('box') || p.includes('display')) {
    filenames.push(`${setCode}-box.png`);
  } else if (p.includes('pack')) {
    filenames.push(`${setCode}-pack.png`);
  }

  // Always include a cleaned descriptive filename based on the asset itself
  const genericCleanSlug = clean
    .replace(new RegExp(`^${setCode}_`, 'i'), '')
    .replace(new RegExp(`_${setCode}$`, 'i'), '');
  
  if (genericCleanSlug) {
    filenames.push(`${setCode}-${genericCleanSlug}.png`);
  }

  return Array.from(new Set(filenames));
}

function isImageFile(entryPath) {
  const p = entryPath.toLowerCase();
  const ext = path.extname(p);
  if (!['.png', '.webp', '.jpg', '.jpeg'].includes(ext)) {
    return false;
  }

  // Ignore marketing banners, logos, social media, flat dielines, etc.
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
    p.includes('flat') ||
    p.includes('wallpaper')
  ) {
    return false;
  }

  return true;
}

function checkIsAngle01(filename) {
  const baseName = path.basename(filename).toLowerCase();
  return (
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
    baseName.includes('pos_1')
  );
}

function checkIsOtherAngle(filename) {
  const baseName = path.basename(filename).toLowerCase();
  return (
    baseName.startsWith('02_') ||
    baseName.startsWith('03_') ||
    baseName.startsWith('04_') ||
    baseName.startsWith('02-') ||
    baseName.startsWith('03-') ||
    baseName.includes('_02_') ||
    baseName.includes('_03_') ||
    baseName.includes('_04_') ||
    baseName.includes('angle02') ||
    baseName.includes('angle03')
  );
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

  // Group candidates by distinct product base name, prioritizing angle 01
  const productGroups = {};

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!isImageFile(entry.entryName)) continue;

    const groupKey = getProductGroupKey(entry.entryName);
    const isAngle01 = checkIsAngle01(entry.entryName);
    const isOther = checkIsOtherAngle(entry.entryName);

    let score = 50;
    if (isAngle01) score = 100;
    else if (isOther) score = 10;

    if (!productGroups[groupKey] || score > productGroups[groupKey].score) {
      productGroups[groupKey] = {
        entry,
        isAngle01,
        score,
        groupKey,
      };
    }
  }

  const groupKeys = Object.keys(productGroups);
  if (groupKeys.length === 0) {
    console.log(`⚠️  No standard packaging renders detected in this ZIP archive.`);
    console.log(`   (Checked ${entries.length} files. Ensure this is a DMA / Product Shots kit from WPN)`);
    return;
  }

  console.log(`✨ Found \x1b[32m${groupKeys.length}\x1b[0m distinct product(s) in kit (preferring angle 01):`);

  let processedCount = 0;

  for (const groupKey of groupKeys) {
    const item = productGroups[groupKey];
    const targetFilenames = determineTargetFilenames(setCode, item.entry.entryName);

    if (targetFilenames.length === 0) continue;

    try {
      const rawBuffer = item.entry.getData();
      const primaryTarget = targetFilenames[0];
      const destinationPath = path.join(TARGET_PRODUCTS_DIR, primaryTarget);

      const stats = await optimizeAndSaveImage(rawBuffer, destinationPath);
      processedCount++;

      // Copy to alias target filenames if any
      for (let i = 1; i < targetFilenames.length; i++) {
        const aliasFilename = targetFilenames[i];
        const aliasPath = path.join(TARGET_PRODUCTS_DIR, aliasFilename);
        fs.copyFileSync(destinationPath, aliasPath);
        const webpSrc = destinationPath.replace(/\.png$/i, '.webp');
        const webpDest = aliasPath.replace(/\.png$/i, '.webp');
        if (fs.existsSync(webpSrc)) {
          fs.copyFileSync(webpSrc, webpDest);
        }
      }

      const angleTag = item.isAngle01 ? '\x1b[35m[01]\x1b[0m ' : '    ';
      const aliasTag = targetFilenames.length > 1 ? ` \x1b[90m(+${targetFilenames.length - 1} aliases)\x1b[0m` : '';

      if (stats.hasSharp) {
        const ratio = (((stats.originalSize - stats.optimizedSize) / stats.originalSize) * 100).toFixed(1);
        console.log(
          `   ✅ ${angleTag}\x1b[32m${primaryTarget}\x1b[0m${aliasTag} ` +
          `(${formatBytes(stats.originalSize)} ➔ \x1b[32m${formatBytes(stats.optimizedSize)}\x1b[0m, -${ratio}%)`
        );
      } else {
        console.log(`   ✅ ${angleTag}\x1b[32m${primaryTarget}\x1b[0m${aliasTag} (${formatBytes(stats.originalSize)})`);
      }
    } catch (err) {
      console.error(`   ❌ Failed to process ${groupKey}:`, err.message);
    }
  }

  console.log(`\n🎉 Extracted and optimized \x1b[32m${processedCount}\x1b[0m products for ${setCode.toUpperCase()}!`);
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

    if (shouldClean) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`   🗑️  Cleaned up original archive: ${zipFile}`);
      } catch (err) {
        console.warn(`   ⚠️ Could not delete ${zipFile}:`, err.message);
      }
    }
  }

  console.log(`\n🎉 Optimization & Ingestion complete! Check \x1b[32m/public/products/\x1b[0m for your images.\n`);
}

// CLI Execution
const args = process.argv.slice(2);
const shouldClean = args.includes('--clean') || args.includes('-c') || args.includes('--delete');
const explicitSetCode = args.find((a) => !a.startsWith('-')); // e.g. "node scripts/ingest-wpn.js hob --clean"

runIngestion(explicitSetCode);
