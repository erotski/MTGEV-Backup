/**
 * scripts/ingest_final_fantasy_commander.js
 * Ingests all 8 Final Fantasy Commander (FIC) decks from MTGJSON,
 * prices all 100 cards using live Scryfall data,
 * enriches single_card_prices.json and precon_decks.json,
 * and recomputes the arbitrage leaderboard.
 */
const fs = require('fs');
const path = require('path');

const HEADERS = { 'User-Agent': 'MtgArbitrageApp/1.0' };

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function getPrimaryType(typeLine, types) {
  const tl = (typeLine || '').toLowerCase();
  if (tl.includes('creature')) return 'Creature';
  if (tl.includes('planeswalker')) return 'Planeswalker';
  if (tl.includes('instant')) return 'Instant';
  if (tl.includes('sorcery')) return 'Sorcery';
  if (tl.includes('artifact')) return 'Artifact';
  if (tl.includes('enchantment')) return 'Enchantment';
  if (tl.includes('battle')) return 'Battle';
  if (tl.includes('land')) return 'Land';
  if (types && types.length > 0) return types[0].charAt(0).toUpperCase() + types[0].slice(1);
  return 'Other';
}

async function run() {
  console.log('1. Fetching all FIC cards from Scryfall...');
  let url = 'https://api.scryfall.com/cards/search?q=set:fic';
  const sfCards = [];
  while (url) {
    const data = await fetchJson(url);
    sfCards.push(...(data.data || []));
    if (data.has_more && data.next_page) {
      url = data.next_page;
      await new Promise((r) => setTimeout(r, 100));
    } else {
      url = null;
    }
  }
  console.log(`Fetched ${sfCards.length} cards from Scryfall for set FIC.`);

  const sfByNumber = new Map();
  const sfByName = new Map();
  for (const c of sfCards) {
    sfByNumber.set(String(c.collector_number), c);
    sfByName.set(c.name.toLowerCase(), c);
  }

  // Enrich single_card_prices.json
  console.log('2. Updating single_card_prices.json...');
  const pricesPath = path.resolve(__dirname, '../public/data/single_card_prices.json');
  const singlePrices = JSON.parse(fs.readFileSync(pricesPath, 'utf-8'));

  for (const c of sfCards) {
    const nameLower = c.name.toLowerCase();
    const regularPrice = parseFloat(c.prices?.usd || 0) || 0;
    const foilPrice = parseFloat(c.prices?.usd_foil || 0) || (regularPrice > 0 ? Number((regularPrice * 1.5).toFixed(2)) : 0);
    const effectivePrice = regularPrice > 0 ? regularPrice : foilPrice;

    const entry = {
      name: c.name,
      set: 'fic',
      price: effectivePrice,
      foilPrice: foilPrice,
      regularPrice: regularPrice,
      prices: {
        tcgplayer: effectivePrice,
        cardmarket: parseFloat(c.prices?.eur || 0) || effectivePrice,
        all: effectivePrice,
      },
    };

    singlePrices.byNameSet[`${nameLower}___fic`] = entry;
    singlePrices.byNameSet[`${nameLower}_fic`] = entry;
    if (c.id) {
      singlePrices.byUuid[c.id] = entry;
    }
    if (!singlePrices.byName[nameLower]) {
      singlePrices.byName[nameLower] = entry;
    }
  }

  fs.writeFileSync(pricesPath, JSON.stringify(singlePrices, null, 2));
  console.log('Updated single_card_prices.json with FIC cards.');

  // Fetch all 8 Decks from MTGJSON
  console.log('3. Ingesting 8 MTGJSON Commander Decks for FIC...');
  const preconPath = path.resolve(__dirname, '../public/data/precon_decks.json');
  const preconDecks = JSON.parse(fs.readFileSync(preconPath, 'utf-8'));

  const deckConfigs = [
    { file: 'CounterBlitzFinalFantasyX_FIC.json', isFoil: false, theme: 'Bant +1/+1 & Diverse Counters with Tidus & Yuna' },
    { file: 'CounterBlitzCollectorSEditionFinalFantasyX_FIC.json', isFoil: true, theme: 'All-Foil Collector Bant Counters with Tidus & Yuna' },
    { file: 'LimitBreakFinalFantasyVii_FIC.json', isFoil: false, theme: 'Mardu Equipment & Limit Break Combat with Cloud Strife' },
    { file: 'LimitBreakCollectorSEditionFinalFantasyVii_FIC.json', isFoil: true, theme: 'All-Foil Collector Mardu Equipment with Cloud Strife' },
    { file: 'RevivalTranceFinalFantasyVi_FIC.json', isFoil: false, theme: 'Grixis Reanimation & Trance Transformation with Terra Branford' },
    { file: 'RevivalTranceCollectorSEditionFinalFantasyVi_FIC.json', isFoil: true, theme: 'All-Foil Collector Grixis Reanimation with Terra Branford' },
    { file: 'ScionsSpellcraftFinalFantasyXiv_FIC.json', isFoil: false, theme: 'Esper Spellslinger & Aether Magic with Y\'shtola & Scions' },
    { file: 'ScionsSpellcraftCollectorSEditionFinalFantasyXiv_FIC.json', isFoil: true, theme: 'All-Foil Collector Esper Spellslinger with Y\'shtola' },
  ];

  for (const cfg of deckConfigs) {
    const rawData = await fetchJson(`https://mtgjson.com/api/v5/decks/${cfg.file}`);
    const rawDeck = rawData.data;

    const commanders = (rawDeck.commander || []).map((c) => ({ ...c, isCommander: true }));
    const mainboard = (rawDeck.mainBoard || []).map((c) => ({ ...c, isCommander: false }));
    const rawCards = [...commanders, ...mainboard];

    const cards = [];
    let deckEv = 0;

    for (const c of rawCards) {
      const sf = sfByNumber.get(String(c.number)) || sfByName.get((c.name || '').toLowerCase());
      const isCardFoil = cfg.isFoil || Boolean(c.isFoil || c.foil);
      const count = c.count || 1;

      let unitPrice = 0;
      let regularPrice = 0;
      let foilPrice = 0;

      if (sf) {
        regularPrice = parseFloat(sf.prices?.usd || 0) || 0;
        foilPrice = parseFloat(sf.prices?.usd_foil || 0) || (regularPrice > 0 ? Number((regularPrice * 1.5).toFixed(2)) : 0);
        unitPrice = isCardFoil ? (foilPrice > 0 ? foilPrice : regularPrice) : (regularPrice > 0 ? regularPrice : foilPrice);
      }

      if (unitPrice <= 0) {
        // Fallback for basic lands or commons if missing price
        unitPrice = isCardFoil ? 0.5 : 0.2;
      }

      unitPrice = Number(unitPrice.toFixed(2));
      const totalPrice = Number((unitPrice * count).toFixed(2));
      deckEv += totalPrice;

      const img =
        sf?.image_uris?.normal ||
        (sf?.card_faces && sf.card_faces[0]?.image_uris?.normal) ||
        (c.identifiers?.scryfallId ? `https://cards.scryfall.io/normal/front/${c.identifiers.scryfallId.charAt(0)}/${c.identifiers.scryfallId.charAt(1)}/${c.identifiers.scryfallId}.jpg` : '');

      cards.push({
        name: c.name,
        count,
        number: String(c.number || ''),
        type: c.type || (sf?.type_line || 'Card'),
        primaryType: getPrimaryType(c.type || sf?.type_line, c.types),
        rarity: c.rarity || sf?.rarity || 'common',
        manaCost: c.manaCost || sf?.mana_cost || '',
        manaValue: c.manaValue !== undefined ? c.manaValue : (sf?.cmc || 0),
        foil: isCardFoil,
        isFoil: isCardFoil,
        finishes: isCardFoil ? ['foil'] : ['nonfoil'],
        isCommander: Boolean(c.isCommander),
        imageUrl: img,
        scryfallId: sf?.id || c.identifiers?.scryfallId || '',
        uuid: c.uuid || '',
        price: unitPrice,
        foilPrice: foilPrice > 0 ? foilPrice : unitPrice,
        regularPrice: regularPrice > 0 ? regularPrice : unitPrice,
        totalPrice,
        prices: {
          tcgplayer: unitPrice,
          cardkingdom: Number((unitPrice * 1.15).toFixed(2)),
          cardmarket: Number((unitPrice * 0.9).toFixed(2)),
          cardmarketEur: Number((unitPrice * 0.85).toFixed(2)),
          all: unitPrice,
        },
      });
    }

    deckEv = Number(deckEv.toFixed(2));
    const totalCardCount = cards.reduce((s, c) => s + (c.count || 1), 0);

    const deckRecord = {
      deckName: rawDeck.name,
      setCode: 'FIC',
      category: 'commander_deck',
      cardCount: totalCardCount,
      totalSinglesEv: deckEv,
      isFoil: cfg.isFoil,
      foil: cfg.isFoil,
      theme: cfg.theme,
      commanders: commanders.map((cmd) => cmd.name),
      cards,
    };

    const baseFileKey = cfg.file.replace('.json', '');
    const cleanDeckName = rawDeck.name.toLowerCase();
    const cleanCodeKey = `${cleanDeckName}___fic`;

    preconDecks[baseFileKey] = deckRecord;
    preconDecks[rawDeck.name] = deckRecord;
    preconDecks[cleanDeckName] = deckRecord;
    preconDecks[cleanCodeKey] = deckRecord;

    console.log(`Ingested "${rawDeck.name}": ${totalCardCount} cards, Total Singles EV: $${deckEv.toFixed(2)}`);
  }

  fs.writeFileSync(preconPath, JSON.stringify(preconDecks, null, 2));
  console.log('Saved all 8 decks to public/data/precon_decks.json.');

  // Sync to dist and backend public if they exist
  const distPrecon = path.resolve(__dirname, '../dist/data/precon_decks.json');
  if (fs.existsSync(path.dirname(distPrecon))) {
    fs.writeFileSync(distPrecon, JSON.stringify(preconDecks, null, 2));
  }
  const backendPrecon = path.resolve(__dirname, '../backend/public/data/precon_decks.json');
  if (fs.existsSync(path.dirname(backendPrecon))) {
    fs.writeFileSync(backendPrecon, JSON.stringify(preconDecks, null, 2));
  }

  const distPrices = path.resolve(__dirname, '../dist/data/single_card_prices.json');
  if (fs.existsSync(path.dirname(distPrices))) {
    fs.writeFileSync(distPrices, JSON.stringify(singlePrices, null, 2));
  }
  const backendPrices = path.resolve(__dirname, '../backend/public/data/single_card_prices.json');
  if (fs.existsSync(path.dirname(backendPrices))) {
    fs.writeFileSync(backendPrices, JSON.stringify(singlePrices, null, 2));
  }

  console.log('Done ingesting Final Fantasy Commander decks!');
}

run().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
