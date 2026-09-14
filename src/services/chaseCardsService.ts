import { ChaseCard, PreconstructedDeckDetail, DeckCardItem } from '../types';
import { CatalogPackProduct } from '../ecommerceBoosterData';
import { dataService } from './dataService';
import { findMatchingPreconDeck } from '../utils/productUtils';

/**
 * Construct canonical card image URL with high-fidelity Scryfall fallbacks.
 * Ensures the exact collector number and card version are resolved accurately.
 */
export function getCardImageUrl(
  card: { imageUrl?: string; scryfallId?: string; setCode?: string; number?: string },
  version: 'normal' | 'large' = 'normal'
): string {
  if (card.imageUrl && card.imageUrl.startsWith('http')) return card.imageUrl;
  if (card.scryfallId && card.scryfallId.length > 2) {
    return `https://cards.scryfall.io/${version}/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg`;
  }
  if (card.setCode && card.number) {
    return `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image&version=${version}`;
  }
  return '';
}

/**
 * Curated Pre-compiled Chase Cards for Top Sets and Products
 * Ensures immediate display with zero latency and high-resolution Scryfall artwork.
 */
export const CURATED_CHASE_CARDS: Record<string, ChaseCard[]> = {
  MH3: [
    {
      uuid: 'mh3-ulamog',
      name: 'Ulamog, the Defiler',
      scryfallId: '4d9f1bb8-c91b-40cd-a416-abbff0d65306',
      setCode: 'MH3',
      rarity: 'mythic',
      number: '13',
      priceNormal: 48.5,
      priceFoil: 62.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/4/d/4d9f1bb8-c91b-40cd-a416-abbff0d65306.jpg',
      cardType: 'Legendary Creature — Eldrazi',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot (~1 in 48 packs)',
    },
    {
      uuid: 'mh3-emrakul',
      name: 'Emrakul, the World Anew',
      scryfallId: 'b914bfd9-5be3-4459-a68a-9b3ea2747bbc',
      setCode: 'MH3',
      rarity: 'mythic',
      number: '6',
      priceNormal: 36.2,
      priceFoil: 49.5,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/b/9/b914bfd9-5be3-4459-a68a-9b3ea2747bbc.jpg',
      cardType: 'Legendary Creature — Eldrazi',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot (~1 in 48 packs)',
    },
    {
      uuid: 'mh3-ocelot',
      name: 'Ocelot Pride',
      scryfallId: '89cf6f57-230f-497e-a14e-ad1e8737fd42',
      setCode: 'MH3',
      rarity: 'mythic',
      number: '38',
      priceNormal: 41.4,
      priceFoil: 54.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/8/9/89cf6f57-230f-497e-a14e-ad1e8737fd42.jpg',
      cardType: 'Creature — Cat',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
    {
      uuid: 'mh3-phlage',
      name: "Phlage, Titan of Fire's Fury",
      scryfallId: 'e419cd0b-2449-4cc5-9ead-b9e45e271700',
      setCode: 'MH3',
      rarity: 'mythic',
      number: '197',
      priceNormal: 28.5,
      priceFoil: 38.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/e/4/e419cd0b-2449-4cc5-9ead-b9e45e271700.jpg',
      cardType: 'Legendary Creature — Elder Giant',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
    {
      uuid: 'mh3-flare-denial',
      name: 'Flare of Denial',
      scryfallId: '71a98efb-9b0a-496b-ac21-8d70527ea544',
      setCode: 'MH3',
      rarity: 'rare',
      number: '62',
      priceNormal: 14.8,
      priceFoil: 21.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/7/1/71a98efb-9b0a-496b-ac21-8d70527ea544.jpg',
      cardType: 'Instant',
      productType: 'all',
      pullOddsDesc: 'Rare Slot',
    },
    {
      uuid: 'mh3-polluted-delta',
      name: 'Polluted Delta',
      scryfallId: '6e288374-2b71-4ace-b1d2-a19fee6cb4af',
      setCode: 'MH3',
      rarity: 'rare',
      number: '224',
      priceNormal: 15.2,
      priceFoil: 22.5,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/6/e/6e288374-2b71-4ace-b1d2-a19fee6cb4af.jpg',
      cardType: 'Land',
      productType: 'all',
      pullOddsDesc: 'Rare Fetchland Slot',
    },
    {
      uuid: 'mh3-bloodstained-mire',
      name: 'Bloodstained Mire',
      scryfallId: '579743fe-f71e-4cb2-8629-d6b02ed1591d',
      setCode: 'MH3',
      rarity: 'rare',
      number: '216',
      priceNormal: 14.9,
      priceFoil: 20.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/5/7/579743fe-f71e-4cb2-8629-d6b02ed1591d.jpg',
      cardType: 'Land',
      productType: 'all',
      pullOddsDesc: 'Rare Fetchland Slot',
    },
    {
      uuid: 'mh3-wooded-foothills',
      name: 'Wooded Foothills',
      scryfallId: '4e11ea8a-f895-438d-a3b7-f070238e4161',
      setCode: 'MH3',
      rarity: 'rare',
      number: '236',
      priceNormal: 14.5,
      priceFoil: 19.5,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/4/e/4e11ea8a-f895-438d-a3b7-f070238e4161.jpg',
      cardType: 'Land',
      productType: 'all',
      pullOddsDesc: 'Rare Fetchland Slot',
    },
    {
      uuid: 'mh3-flooded-strand',
      name: 'Flooded Strand',
      scryfallId: '8f85e12c-196b-4459-b81f-0c9c854e9f57',
      setCode: 'MH3',
      rarity: 'rare',
      number: '220',
      priceNormal: 14.7,
      priceFoil: 21.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/8/f/8f85e12c-196b-4459-b81f-0c9c854e9f57.jpg',
      cardType: 'Land',
      productType: 'all',
      pullOddsDesc: 'Rare Fetchland Slot',
    },
    {
      uuid: 'mh3-spg-solitude',
      name: 'Solitude (Special Guests SPG)',
      scryfallId: 'b7522502-0e98-4cf5-8178-04fb36b044d0',
      setCode: 'SPG',
      rarity: 'mythic',
      number: '44',
      priceNormal: 42.0,
      priceFoil: 88.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/b/7/b7522502-0e98-4cf5-8178-04fb36b044d0.jpg?1717013531',
      cardType: 'Creature — Elemental Incarnation',
      productType: 'collector',
      pullOddsDesc: 'Special Guest Slot (Option 1 ~1 in 64 packs)',
    },
    {
      uuid: 'mh3-spg-subtlety',
      name: 'Subtlety (Special Guests SPG)',
      scryfallId: '04a60156-f288-4395-8ba9-c715975eb62a',
      setCode: 'SPG',
      rarity: 'mythic',
      number: '45',
      priceNormal: 24.5,
      priceFoil: 52.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/0/4/04a60156-f288-4395-8ba9-c715975eb62a.jpg?1717013539',
      cardType: 'Creature — Elemental Incarnation',
      productType: 'collector',
      pullOddsDesc: 'Special Guest Slot (Option 1)',
    },
  ],

  BLB: [
    {
      uuid: 'blb-lumra',
      name: 'Lumra, Bellow of the Woods',
      scryfallId: 'ae4f3aaf-3960-48cd-b34b-32e4ae5ae088',
      setCode: 'BLB',
      rarity: 'mythic',
      number: '183',
      priceNormal: 26.5,
      priceFoil: 38.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/a/e/ae4f3aaf-3960-48cd-b34b-32e4ae5ae088.jpg?1721426861',
      cardType: 'Legendary Creature — Elemental Bear',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot (~1 in 40 packs)',
    },
    {
      uuid: 'blb-three-tree-city',
      name: 'Three Tree City',
      scryfallId: '56f88a48-cced-4a9d-8c19-e4f105f0d8a2',
      setCode: 'BLB',
      rarity: 'rare',
      number: '260',
      priceNormal: 24.2,
      priceFoil: 35.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/5/6/56f88a48-cced-4a9d-8c19-e4f105f0d8a2.jpg?1721427357',
      cardType: 'Legendary Land',
      productType: 'all',
      pullOddsDesc: 'Rare Slot',
    },
    {
      uuid: 'blb-innkeeper',
      name: "Innkeeper's Talent",
      scryfallId: '941b0afc-0e8f-45f2-ae7f-07595e164611',
      setCode: 'BLB',
      rarity: 'rare',
      number: '180',
      priceNormal: 21.0,
      priceFoil: 30.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/9/4/941b0afc-0e8f-45f2-ae7f-07595e164611.jpg?1721426837',
      cardType: 'Enchantment — Class',
      productType: 'all',
      pullOddsDesc: 'Rare Slot',
    },
    {
      uuid: 'blb-ygra',
      name: 'Ygra, Eater of All',
      scryfallId: 'b9ac7673-eae8-4c4b-889e-5025213a6151',
      setCode: 'BLB',
      rarity: 'mythic',
      number: '241',
      priceNormal: 19.5,
      priceFoil: 28.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/b/9/b9ac7673-eae8-4c4b-889e-5025213a6151.jpg?1721427242',
      cardType: 'Legendary Creature — Elemental Cat',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
    {
      uuid: 'blb-maha',
      name: 'Maha, Its Feathers Night',
      scryfallId: 'cf3320ec-c4e8-405a-982d-e009c58c9e21',
      setCode: 'BLB',
      rarity: 'mythic',
      number: '100',
      priceNormal: 18.0,
      priceFoil: 25.5,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/c/f/cf3320ec-c4e8-405a-982d-e009c58c9e21.jpg?1721426453',
      cardType: 'Legendary Creature — Bird Skeleton',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
    {
      uuid: 'blb-bria',
      name: 'Bria, Riptide Rogue',
      scryfallId: 'b9745da7-3b2e-40ec-9442-f8c679b8a071',
      setCode: 'BLB',
      rarity: 'mythic',
      number: '379',
      priceNormal: 16.5,
      priceFoil: 26.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/b/9/b9745da7-3b2e-40ec-9442-f8c679b8a071.jpg?1721428135',
      cardType: 'Legendary Creature — Otter Rogue',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
    {
      uuid: 'blb-spg-sword',
      name: 'Sword of Fire and Ice (Special Guests)',
      scryfallId: '46e6a1a6-a19b-4b19-b5a8-ef6a32d189eb',
      setCode: 'SPG',
      rarity: 'mythic',
      number: '49',
      priceNormal: 68.0,
      priceFoil: 145.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/4/6/46e6a1a6-a19b-4b19-b5a8-ef6a32d189eb.jpg?1721428383',
      cardType: 'Artifact — Equipment',
      productType: 'collector',
      pullOddsDesc: 'Special Guest Bonus Slot',
    },
  ],

  OTJ: [
    {
      uuid: 'otj-spg-mana-drain',
      name: 'Mana Drain (Special Guests)',
      scryfallId: '2b43b677-62bd-4ea4-86a0-e83cb49a4e40',
      setCode: 'SPG',
      rarity: 'mythic',
      number: '17',
      priceNormal: 49.0,
      priceFoil: 110.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/2/b/2b43b677-62bd-4ea4-86a0-e83cb49a4e40.jpg?1712353782',
      cardType: 'Instant',
      productType: 'collector',
      pullOddsDesc: 'Special Guest Slot (Option 1)',
    },
    {
      uuid: 'otj-terror-peaks',
      name: 'Terror of the Peaks',
      scryfallId: '904ff94a-4db4-44a6-8593-89c32905b3fc',
      setCode: 'OTJ',
      rarity: 'mythic',
      number: '149',
      priceNormal: 24.5,
      priceFoil: 34.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/9/0/904ff94a-4db4-44a6-8593-89c32905b3fc.jpg?1712355855',
      cardType: 'Creature — Dragon',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
    {
      uuid: 'otj-slickshot',
      name: 'Slickshot Show-Off',
      scryfallId: 'f93d8357-83bd-4157-a389-68e4aa4985c8',
      setCode: 'OTJ',
      rarity: 'rare',
      number: '145',
      priceNormal: 18.2,
      priceFoil: 25.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/f/9/f93d8357-83bd-4157-a389-68e4aa4985c8.jpg',
      cardType: 'Creature — Bird Wizard',
      productType: 'all',
      pullOddsDesc: 'Rare Slot',
    },
    {
      uuid: 'otj-vaultborn',
      name: 'Vaultborn Tyrant (The Big Score)',
      scryfallId: '62b3f570-265e-41a4-9275-34351656c071',
      setCode: 'BIG',
      rarity: 'mythic',
      number: '20',
      priceNormal: 32.0,
      priceFoil: 46.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/6/2/62b3f570-265e-41a4-9275-34351656c071.jpg?1712353361',
      cardType: 'Creature — Dinosaur',
      productType: 'all',
      pullOddsDesc: 'The Big Score Slot',
    },
  ],

  MOM: [
    {
      uuid: 'mom-ragavan',
      name: 'Ragavan, Nimble Pilferer (Multiverse Legends)',
      scryfallId: 'a1638644-8898-466c-941a-ec4fd709cb34',
      setCode: 'MUL',
      rarity: 'mythic',
      number: '86',
      priceNormal: 44.0,
      priceFoil: 68.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/a/1/a1638644-8898-466c-941a-ec4fd709cb34.jpg?1682207399',
      cardType: 'Legendary Creature — Monkey Pirate',
      productType: 'all',
      pullOddsDesc: 'Guaranteed MUL Slot (~1 in 36 packs)',
    },
    {
      uuid: 'mom-atraxa',
      name: 'Atraxa, Grand Unifier',
      scryfallId: '4a1f905f-1d55-4d02-9d24-e58070793d3f',
      setCode: 'MUL',
      rarity: 'mythic',
      number: '124',
      priceNormal: 28.5,
      priceFoil: 42.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/4/a/4a1f905f-1d55-4d02-9d24-e58070793d3f.jpg?1682207559',
      cardType: 'Legendary Creature — Phyrexian Angel',
      productType: 'all',
      pullOddsDesc: 'MUL Slot',
    },
    {
      uuid: 'mom-sheoldred',
      name: 'Sheoldred // The True Scriptures',
      scryfallId: 'bf2249e6-af74-4b88-8eb7-144ce8fa7f6b',
      setCode: 'MOM',
      rarity: 'mythic',
      number: '125',
      priceNormal: 19.5,
      priceFoil: 29.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/b/f/bf2249e6-af74-4b88-8eb7-144ce8fa7f6b.jpg?1682204018',
      cardType: 'Legendary Creature — Phyrexian Praetor',
      productType: 'all',
      pullOddsDesc: 'Rare/Mythic Slot',
    },
  ],

  // Specific Preconstructed Deck Chase Lists
  'DECK-MH3-ELDRAZI': [
    {
      uuid: 'deck-ulalek',
      name: 'Ulalek, Fused Atrocity (Foil Display Commander)',
      scryfallId: '8fad3d0a-6e54-4f05-8914-1e0e9ec024c0',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '4',
      priceNormal: 14.5,
      priceFoil: 22.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/8/f/8fad3d0a-6e54-4f05-8914-1e0e9ec024c0.jpg?1717013898',
      cardType: 'Legendary Creature — Eldrazi',
      productType: 'deck',
      deckName: 'Eldrazi Incursion',
      pullOddsDesc: 'Guaranteed 1x Face Commander',
    },
    {
      uuid: 'deck-eldrazi-conscription',
      name: 'Eldrazi Conscription',
      scryfallId: 'c390984a-d72e-4817-9244-63327ac2234b',
      setCode: 'M3C',
      rarity: 'rare',
      number: '123',
      priceNormal: 12.8,
      priceFoil: 18.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/c/3/c390984a-d72e-4817-9244-63327ac2234b.jpg?1717013854',
      cardType: 'Tribal Enchantment — Eldrazi Aura',
      productType: 'deck',
      deckName: 'Eldrazi Incursion',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
    {
      uuid: 'deck-all-is-dust',
      name: 'All Is Dust',
      scryfallId: '4210c54e-89fd-4971-ab6a-ca8f4e7fe97a',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '120',
      priceNormal: 10.5,
      priceFoil: 15.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/4/2/4210c54e-89fd-4971-ab6a-ca8f4e7fe97a.jpg?1717013840',
      cardType: 'Tribal Sorcery — Eldrazi',
      productType: 'deck',
      deckName: 'Eldrazi Incursion',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
    {
      uuid: 'deck-forsaken-monument',
      name: 'Forsaken Monument',
      scryfallId: '644843e0-21fb-4758-a343-419fce60401b',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '280',
      priceNormal: 9.8,
      priceFoil: 14.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/6/4/644843e0-21fb-4758-a343-419fce60401b.jpg?1717014022',
      cardType: 'Legendary Artifact',
      productType: 'deck',
      deckName: 'Eldrazi Incursion',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
    {
      uuid: 'deck-morophon',
      name: 'Morophon, the Boundless',
      scryfallId: '84238335-e08c-421c-b80e-47646429eb67',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '285',
      priceNormal: 11.2,
      priceFoil: 16.5,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/8/4/84238335-e08c-421c-b80e-47646429eb67.jpg?1717014041',
      cardType: 'Legendary Creature — Shapeshifter',
      productType: 'deck',
      deckName: 'Eldrazi Incursion',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
  ],

  'DECK-MH3-TRICKY': [
    {
      uuid: 'deck-omo',
      name: 'Omo, Queen of Vesuva (Foil Display Commander)',
      scryfallId: 'e5d1c814-4c22-4917-95ae-dffaff499324',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '2',
      priceNormal: 8.5,
      priceFoil: 14.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/e/5/e5d1c814-4c22-4917-95ae-dffaff499324.jpg?1717013880',
      cardType: 'Legendary Creature — Shapeshifter Noble',
      productType: 'deck',
      deckName: 'Tricky Terrain',
      pullOddsDesc: 'Guaranteed 1x Face Commander',
    },
    {
      uuid: 'deck-talon-gates',
      name: 'Talon Gates of Madara',
      scryfallId: 'de92facf-762b-4a23-8d5e-bb673b05be92',
      setCode: 'M3C',
      rarity: 'rare',
      number: '84',
      priceNormal: 28.14,
      priceFoil: 39.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/d/e/de92facf-762b-4a23-8d5e-bb673b05be92.jpg?1717013149',
      cardType: 'Land — Gate',
      productType: 'deck',
      deckName: 'Tricky Terrain',
      pullOddsDesc: 'Guaranteed 1x in Deck (Highest Value Card)',
    },
    {
      uuid: 'deck-vesuva',
      name: 'Vesuva',
      scryfallId: '0726f70a-502f-41b1-a442-1e7a46ab80b7',
      setCode: 'M3C',
      rarity: 'rare',
      number: '380',
      priceNormal: 9.5,
      priceFoil: 15.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/0/7/0726f70a-502f-41b1-a442-1e7a46ab80b7.jpg?1717014210',
      cardType: 'Land',
      productType: 'deck',
      deckName: 'Tricky Terrain',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
    {
      uuid: 'deck-dark-depths',
      name: 'Dark Depths',
      scryfallId: '3a345995-1f9e-4ff6-8344-934d4001968d',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '340',
      priceNormal: 8.8,
      priceFoil: 14.5,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/3/a/3a345995-1f9e-4ff6-8344-934d4001968d.jpg?1717014152',
      cardType: 'Legendary Snow Land',
      productType: 'deck',
      deckName: 'Tricky Terrain',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
  ],

  'DECK-MH3-GRAVEYARD': [
    {
      uuid: 'deck-disa',
      name: 'Disa the Restless (Foil Display Commander)',
      scryfallId: 'c93b6164-ec7d-4171-aa3b-827027c4a165',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '1',
      priceNormal: 6.5,
      priceFoil: 11.5,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/c/9/c93b6164-ec7d-4171-aa3b-827027c4a165.jpg?1717013870',
      cardType: 'Legendary Creature — Human Scout',
      productType: 'deck',
      deckName: 'Graveyard Overdrive',
      pullOddsDesc: 'Guaranteed 1x Face Commander',
    },
    {
      uuid: 'deck-barrowgoyf',
      name: 'Barrowgoyf',
      scryfallId: 'f979fc86-2c7e-49b3-965e-607a203cbfb1',
      setCode: 'M3C',
      rarity: 'rare',
      number: '43',
      priceNormal: 14.12,
      priceFoil: 22.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/f/9/f979fc86-2c7e-49b3-965e-607a203cbfb1.jpg?1717012012',
      cardType: 'Creature — Lhurgoyf',
      productType: 'deck',
      deckName: 'Graveyard Overdrive',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
    {
      uuid: 'deck-pyrogoyf',
      name: 'Pyrogoyf',
      scryfallId: '417b1b36-bf4d-4e94-81dd-3221976a4df8',
      setCode: 'M3C',
      rarity: 'rare',
      number: '55',
      priceNormal: 9.8,
      priceFoil: 16.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/4/1/417b1b36-bf4d-4e94-81dd-3221976a4df8.jpg?1717012210',
      cardType: 'Creature — Lhurgoyf',
      productType: 'deck',
      deckName: 'Graveyard Overdrive',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
  ],

  'DECK-MH3-CREATIVE': [
    {
      uuid: 'deck-satya',
      name: 'Satya, Aetherflux Genius (Foil Display Commander)',
      scryfallId: '3b964bbe-54cc-425c-9cc6-c877f82af7ba',
      setCode: 'M3C',
      rarity: 'mythic',
      number: '3',
      priceNormal: 7.2,
      priceFoil: 13.0,
      finish: 'foil',
      imageUrl: 'https://cards.scryfall.io/normal/front/3/b/3b964bbe-54cc-425c-9cc6-c877f82af7ba.jpg?1717013890',
      cardType: 'Legendary Creature — Human Artificer',
      productType: 'deck',
      deckName: 'Creative Energy',
      pullOddsDesc: 'Guaranteed 1x Face Commander',
    },
    {
      uuid: 'deck-reaver-cleaver',
      name: 'The Reaver Cleaver',
      scryfallId: '5f15e130-9b4e-4b47-8a43-0f1107c1341c',
      setCode: 'M3C',
      rarity: 'rare',
      number: '214',
      priceNormal: 27.28,
      priceFoil: 38.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/5/f/5f15e130-9b4e-4b47-8a43-0f1107c1341c.jpg?1717013955',
      cardType: 'Legendary Artifact — Equipment',
      productType: 'deck',
      deckName: 'Creative Energy',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
    {
      uuid: 'deck-akromas-will',
      name: "Akroma's Will",
      scryfallId: 'c64a51e6-3490-482a-9e67-d86f9a0c64b5',
      setCode: 'M3C',
      rarity: 'rare',
      number: '142',
      priceNormal: 17.19,
      priceFoil: 25.0,
      finish: 'nonfoil',
      imageUrl: 'https://cards.scryfall.io/normal/front/c/6/c64a51e6-3490-482a-9e67-d86f9a0c64b5.jpg?1717013910',
      cardType: 'Instant',
      productType: 'deck',
      deckName: 'Creative Energy',
      pullOddsDesc: 'Guaranteed 1x in Deck',
    },
  ],
};

/**
 * Preconstructed Deck Catalog Details
 * Provides structured 100-card content, face commanders, and key cards for precon decks
 */
export const PRECON_DECK_DETAILS: Record<string, PreconstructedDeckDetail> = {
  'deck-mh3-eldrazi-incursion': {
    deckName: 'Modern Horizons 3 Commander: Eldrazi Incursion',
    setCode: 'M3C',
    commander: {
      name: 'Ulalek, Fused Atrocity',
      manaCost: '{C}{C}{C}{C}{C}',
      type: 'Legendary Creature — Eldrazi',
      text: 'Whenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control.',
      imageUrl: 'https://cards.scryfall.io/normal/front/8/f/8fad3d0a-6e54-4f05-8914-1e0e9ec024c0.jpg?1717013898',
      scryfallId: '8fad3d0a-6e54-4f05-8914-1e0e9ec024c0',
      price: 14.5,
    },
    cardCount: 100,
    colors: ['W', 'U', 'B', 'R', 'G'],
    theme: '5-Color Eldrazi Ramp, Spawn Production & Spell Duplication',
    contentsSummary: {
      creatures: 32,
      instantsAndSorceries: 16,
      artifactsAndEnchantments: 14,
      planeswalkers: 1,
      lands: 37,
    },
    keyCards: [
      { name: 'Ulalek, Fused Atrocity', count: 1, rarity: 'mythic', type: 'Creature', price: 14.5, foil: true, isCommander: true },
      { name: 'Eldrazi Conscription', count: 1, rarity: 'rare', type: 'Enchantment', price: 12.8 },
      { name: 'Morophon, the Boundless', count: 1, rarity: 'mythic', type: 'Creature', price: 11.2 },
      { name: 'All Is Dust', count: 1, rarity: 'mythic', type: 'Sorcery', price: 10.5 },
      { name: 'Forsaken Monument', count: 1, rarity: 'mythic', type: 'Artifact', price: 9.8 },
      { name: 'Sire of Stagnation', count: 1, rarity: 'mythic', type: 'Creature', price: 8.5 },
      { name: 'Eldrazi Monument', count: 1, rarity: 'mythic', type: 'Artifact', price: 7.9 },
      { name: 'Snapping Voidcraw', count: 1, rarity: 'rare', type: 'Creature', price: 4.5 },
      { name: 'Benthic Anomaly', count: 1, rarity: 'rare', type: 'Creature', price: 3.8 },
      { name: 'Eldrazi Temple', count: 1, rarity: 'uncommon', type: 'Land', price: 5.2 },
      { name: 'Sol Ring', count: 1, rarity: 'uncommon', type: 'Artifact', price: 1.5 },
      { name: 'Arcane Signet', count: 1, rarity: 'common', type: 'Artifact', price: 0.8 },
    ],
  },
  'deck-mh3-tricky-terrain': {
    deckName: 'Modern Horizons 3 Commander: Tricky Terrain',
    setCode: 'M3C',
    commander: {
      name: 'Omo, Queen of Vesuva',
      manaCost: '{1}{G}{U}',
      type: 'Legendary Creature — Shapeshifter Noble',
      text: 'Whenever Omo enters the battlefield or attacks, put an everything counter on each of up to one target land and up to one target creature. Lands with everything counters have every land type.',
      imageUrl: 'https://cards.scryfall.io/normal/front/e/5/e5d1c814-4c22-4917-95ae-dffaff499324.jpg?1717013880',
      scryfallId: 'e5d1c814-4c22-4917-95ae-dffaff499324',
      price: 8.5,
    },
    cardCount: 100,
    colors: ['G', 'U'],
    theme: 'Simic Land Ramp, "Everything" Counters & Utility Lands',
    contentsSummary: {
      creatures: 26,
      instantsAndSorceries: 20,
      artifactsAndEnchantments: 12,
      planeswalkers: 1,
      lands: 41,
    },
    keyCards: [
      { name: 'Talon Gates of Madara', count: 1, rarity: 'rare', type: 'Land', price: 28.14 },
      { name: 'Vesuva', count: 1, rarity: 'rare', type: 'Land', price: 9.5 },
      { name: 'Dark Depths', count: 1, rarity: 'mythic', type: 'Land', price: 8.8 },
      { name: 'Omo, Queen of Vesuva', count: 1, rarity: 'mythic', type: 'Creature', price: 8.5, foil: true, isCommander: true },
      { name: 'Copy Land', count: 1, rarity: 'rare', type: 'Land', price: 7.2 },
      { name: 'Deserted Temple', count: 1, rarity: 'rare', type: 'Land', price: 6.8 },
      { name: 'Thespian Stage', count: 1, rarity: 'rare', type: 'Land', price: 3.5 },
      { name: 'Yavimaya Coast', count: 1, rarity: 'rare', type: 'Land', price: 1.2 },
      { name: 'Mirage Mirror', count: 1, rarity: 'rare', type: 'Artifact', price: 4.5 },
      { name: 'Scapeshift', count: 1, rarity: 'mythic', type: 'Sorcery', price: 6.5 },
    ],
  },
  'deck-mh3-graveyard-overdrive': {
    deckName: 'Modern Horizons 3 Commander: Graveyard Overdrive',
    setCode: 'M3C',
    commander: {
      name: 'Disa the Restless',
      manaCost: '{2}{B}{R}{G}',
      type: 'Legendary Creature — Human Scout',
      text: 'Whenever one or more creature cards are put into your graveyard from your library, put a Tarmogoyf creature token onto the battlefield.',
      imageUrl: 'https://cards.scryfall.io/normal/front/c/9/c93b6164-ec7d-4171-aa3b-827027c4a165.jpg?1717013870',
      scryfallId: 'c93b6164-ec7d-4171-aa3b-827027c4a165',
      price: 6.5,
    },
    cardCount: 100,
    colors: ['B', 'R', 'G'],
    theme: 'Jund Lhurgoyf Tribal, Self-Mill & Graveyard Aggro',
    contentsSummary: {
      creatures: 30,
      instantsAndSorceries: 19,
      artifactsAndEnchantments: 14,
      planeswalkers: 1,
      lands: 36,
    },
    keyCards: [
      { name: 'Barrowgoyf', count: 1, rarity: 'rare', type: 'Creature', price: 14.12 },
      { name: 'Pyrogoyf', count: 1, rarity: 'rare', type: 'Creature', price: 9.8 },
      { name: 'Disa the Restless', count: 1, rarity: 'mythic', type: 'Creature', price: 6.5, foil: true, isCommander: true },
      { name: 'Tarmogoyf', count: 1, rarity: 'mythic', type: 'Creature', price: 7.5 },
      { name: 'Nethergoyf', count: 1, rarity: 'rare', type: 'Creature', price: 5.2 },
      { name: 'Anger', count: 1, rarity: 'uncommon', type: 'Creature', price: 3.5 },
      { name: 'Living Death', count: 1, rarity: 'rare', type: 'Sorcery', price: 4.2 },
      { name: 'Ignoble Hierarch', count: 1, rarity: 'rare', type: 'Creature', price: 3.0 },
    ],
  },
  'deck-mh3-creative-energy': {
    deckName: 'Modern Horizons 3 Commander: Creative Energy',
    setCode: 'M3C',
    commander: {
      name: 'Satya, Aetherflux Genius',
      manaCost: '{1}{U}{R}{W}',
      type: 'Legendary Creature — Human Artificer',
      text: 'Menace, haste. Whenever Satya attacks, create a tapped and attacking token that is a copy of up to one other target creature you control. You get {E}{E}. At end of combat, sacrifice that token unless you pay energy equal to its mana value.',
      imageUrl: 'https://cards.scryfall.io/normal/front/3/b/3b964bbe-54cc-425c-9cc6-c877f82af7ba.jpg?1717013890',
      scryfallId: '3b964bbe-54cc-425c-9cc6-c877f82af7ba',
      price: 7.2,
    },
    cardCount: 100,
    colors: ['U', 'R', 'W'],
    theme: 'Jeskai Energy Counters, Token Duplication & Artifact Synergy',
    contentsSummary: {
      creatures: 28,
      instantsAndSorceries: 20,
      artifactsAndEnchantments: 15,
      planeswalkers: 1,
      lands: 36,
    },
    keyCards: [
      { name: 'The Reaver Cleaver', count: 1, rarity: 'rare', type: 'Artifact', price: 27.28 },
      { name: "Akroma's Will", count: 1, rarity: 'rare', type: 'Instant', price: 17.19 },
      { name: 'Satya, Aetherflux Genius', count: 1, rarity: 'mythic', type: 'Creature', price: 7.2, foil: true, isCommander: true },
      { name: 'Aetherworks Marvel', count: 1, rarity: 'mythic', type: 'Artifact', price: 4.5 },
      { name: 'Goldspan Dragon', count: 1, rarity: 'mythic', type: 'Creature', price: 9.8 },
      { name: 'Sphinx of the Revelation', count: 1, rarity: 'rare', type: 'Creature', price: 3.2 },
      { name: 'Gonti’s Aether Heart', count: 1, rarity: 'mythic', type: 'Artifact', price: 3.5 },
      { name: 'Whirler Rogue', count: 1, rarity: 'uncommon', type: 'Creature', price: 0.5 },
    ],
  },
};

/**
 * Helper to construct a clean source text describing where in the selected product a card is located
 */
function getBoosterSourceText(product: CatalogPackProduct): string {
  const contents = (product as any)?.contents;
  if (contents?.pack && Array.isArray(contents.pack) && contents.pack.length > 0) {
    const pack = contents.pack[0];
    const cnt = pack.count || product.packsCount || 1;
    const name = pack.name || pack.code || 'Booster Pack';
    return `In ${cnt}x ${name}`;
  }
  if (product.packsCount && product.packsCount > 0) {
    return `In ${product.packsCount}x ${product.boosterName || 'Booster Pack'}`;
  }
  return `In ${product.displayName || 'Booster Pack'}`;
}

/**
 * Recursively find all guaranteed card inclusions inside sealed product contents,
 * such as Secret Lair Drops inside a Secret Lair Bundle, Preconstructed Decks, or direct Promos.
 */
function findContainedCards(
  contentsOrProduct: any,
  parentName: string,
  isFoil: boolean,
  preconDecksParam?: Record<string, any> | null,
  sealedProductsParam?: any[] | null
): ChaseCard[] {
  const cards: ChaseCard[] = [];
  if (!contentsOrProduct) return cards;
  const contents = contentsOrProduct.contents || contentsOrProduct.rawContents || contentsOrProduct;
  if (!contents) return cards;

  // Helper to determine card finish
  const resolveFinish = (c: any, defaultFoil: boolean): 'nonfoil' | 'foil' | 'etched' => {
    const finishes = Array.isArray(c.finishes) ? c.finishes.map((f: string) => f.toLowerCase()) : [];
    const promoTypes = Array.isArray(c.promoTypes) ? c.promoTypes.map((p: string) => p.toLowerCase()) : [];
    const cName = (c.name || '').toLowerCase();
    const pName = (parentName || '').toLowerCase();
    if (finishes.includes('etched') || promoTypes.includes('etched') || cName.includes('etched') || pName.includes('etched')) {
      return 'etched';
    }
    if (defaultFoil || c.foil || c.isFoil || finishes.includes('foil') || pName.includes('foil')) {
      return 'foil';
    }
    return 'nonfoil';
  };

  // 1. If it contains individual cards directly
  if (contents.card && Array.isArray(contents.card)) {
    contents.card.forEach((c: any, idx: number) => {
      const finish = resolveFinish(c, isFoil);
      const isCardFoil = finish === 'foil' || finish === 'etched';
      const pNorm = c.price || c.priceNormal || 0;
      const pFoil = isCardFoil ? c.priceFoil : undefined;
      const scryId = c.scryfallId || '';
      const setC = (c.set || 'SLD').toUpperCase();
      const num = c.number || String(idx + 1);
      const imgUrl = c.imageUrl || getCardImageUrl({ imageUrl: c.imageUrl, scryfallId: scryId, setCode: setC, number: num });

      cards.push({
        uuid: c.uuid || `contained-card-${idx}-${c.name}`,
        name: c.name,
        scryfallId: scryId,
        setCode: setC,
        rarity: (c.rarity as any) || 'rare',
        number: num,
        priceNormal: pNorm,
        priceFoil: pFoil,
        price: finish === 'foil' || finish === 'etched' ? (pFoil || pNorm) : pNorm,
        finish,
        imageUrl: imgUrl,
        cardType: c.type || 'Guaranteed Single',
        productType: 'card',
        pullOddsDesc: `Guaranteed in ${parentName}`,
      });
    });
  }

  // 2. If it contains a precon deck or a Secret Lair Drop (which is listed as a precon deck)
  if (contents.deck && Array.isArray(contents.deck)) {
    const preconDecksSync = preconDecksParam || dataService.getPreconDecksSync();
    contents.deck.forEach((d: any) => {
      const dName = d.name;
      if (dName && preconDecksSync) {
        // Look up deck using findMatchingPreconDeck and key lookups
        const matchedDeck =
          findMatchingPreconDeck(preconDecksSync, dName, d.set || 'sld', d.uuid) ||
          preconDecksSync[dName] ||
          preconDecksSync[dName.toLowerCase().trim()] ||
          preconDecksSync[dName.toLowerCase().replace(/[^a-z0-9]/g, '')] ||
          Object.values(preconDecksSync).find((e: any) => {
            const en = (e.deckName || e.name || '').toLowerCase().trim();
            const es = en.replace(/[^a-z0-9]/g, '');
            const target = dName.toLowerCase().trim();
            const ts = target.replace(/[^a-z0-9]/g, '');
            return en === target || es === ts || target.includes(en) || en.includes(target);
          });

        if (matchedDeck) {
          const rawCards = matchedDeck.keyCards || matchedDeck.cards;
          const deckIsFoil = isFoil || (dName || '').toLowerCase().includes('foil') || Boolean(matchedDeck.isFoil);
          if (Array.isArray(rawCards)) {
            rawCards.forEach((c: any, idx: number) => {
              const finish = resolveFinish(c, deckIsFoil);
              const isCardFoil = finish === 'foil' || finish === 'etched';
              const pNorm = c.price || c.priceNormal || 0;
              const pFoil = isCardFoil ? c.priceFoil : undefined;
              const scryId = c.scryfallId || '';
              const setC = (c.set || matchedDeck.setCode || 'SLD').toUpperCase();
              const num = c.number || String(idx + 1);
              const imgUrl = c.imageUrl || getCardImageUrl({ imageUrl: c.imageUrl, scryfallId: scryId, setCode: setC, number: num });

              cards.push({
                uuid: c.uuid || `precon-${idx}-${c.name}`,
                name: c.name,
                scryfallId: scryId,
                setCode: setC,
                rarity: (c.rarity as any) || 'rare',
                number: num,
                priceNormal: pNorm,
                priceFoil: pFoil,
                price: finish === 'foil' || finish === 'etched' ? (pFoil || pNorm) : pNorm,
                finish,
                imageUrl: imgUrl,
                cardType: c.type || 'Single',
                productType: 'deck',
                deckName: matchedDeck.deckName || matchedDeck.name || dName,
                pullOddsDesc: `Guaranteed in ${matchedDeck.deckName || matchedDeck.name || dName}`,
              });
            });
          }
        }
      }
    });
  }

  // 3. If it contains variable configurations (some Secret Lairs have bonus card slots!)
  if (contents.variable && Array.isArray(contents.variable)) {
    contents.variable.forEach((v: any) => {
      if (v.configs && Array.isArray(v.configs)) {
        v.configs.forEach((config: any) => {
          if (config.card && Array.isArray(config.card)) {
            config.card.forEach((c: any, idx: number) => {
              const finish = resolveFinish(c, isFoil);
              const isCardFoil = finish === 'foil' || finish === 'etched';
              const pNorm = c.price || c.priceNormal || 0;
              const pFoil = isCardFoil ? c.priceFoil : undefined;
              const scryId = c.scryfallId || '';
              const setC = (c.set || 'SLD').toUpperCase();
              const num = c.number || String(idx + 1);
              const imgUrl = c.imageUrl || getCardImageUrl({ imageUrl: c.imageUrl, scryfallId: scryId, setCode: setC, number: num });

              cards.push({
                uuid: `var-card-${idx}-${c.name}`,
                name: c.name,
                scryfallId: scryId,
                setCode: setC,
                rarity: (c.rarity as any) || 'rare',
                number: num,
                priceNormal: pNorm,
                priceFoil: pFoil,
                price: finish === 'foil' || finish === 'etched' ? (pFoil || pNorm) : pNorm,
                finish,
                imageUrl: imgUrl,
                cardType: c.type || 'Bonus Card Opportunity',
                productType: 'card',
                pullOddsDesc: `Chance for Bonus Card in ${parentName}`,
              });
            });
          }
        });
      }
    });
  }

  // 4. Recursively process nested sealed items (like bundles containing drops)
  if (contents.sealed && Array.isArray(contents.sealed)) {
    const sealedProductsSync = sealedProductsParam || dataService.getSealedProductsSync();
    const preconDecksSync = preconDecksParam || dataService.getPreconDecksSync();

    contents.sealed.forEach((s: any) => {
      // Find sub product in sealed products
      const matchedProd = sealedProductsSync
        ? sealedProductsSync.find(
            (p) =>
              (p.id || p.uuid) === s.uuid ||
              (p.displayName || '').toLowerCase().trim() === (s.name || '').toLowerCase().trim() ||
              (p.name || '').toLowerCase().trim() === (s.name || '').toLowerCase().trim()
          )
        : null;

      if (matchedProd) {
        const subContents = matchedProd.contents || matchedProd.rawContents;
        if (subContents) {
          const subIsFoil =
            isFoil ||
            (matchedProd.displayName || matchedProd.name || s.name || '').toLowerCase().includes('foil');
          const subCards = findContainedCards(
            subContents,
            matchedProd.displayName || matchedProd.name || s.name,
            subIsFoil,
            preconDecksParam || preconDecksSync,
            sealedProductsSync
          );
          cards.push(...subCards);
          return;
        }
      }

      // Direct fallback: If sub-sealed item isn't in sealedProducts or sealedProducts is still loading,
      // check if s.name matches a deck directly in preconDecksSync
      if (preconDecksSync) {
        const sTarget = (s.name || '').toLowerCase().trim();
        const sStripped = sTarget.replace(/[^a-z0-9]/g, '');
        const matchedDeck =
          findMatchingPreconDeck(preconDecksSync, s.name, s.set || 'sld', s.uuid) ||
          preconDecksSync[s.name] ||
          preconDecksSync[sTarget] ||
          preconDecksSync[sStripped] ||
          Object.values(preconDecksSync).find((e: any) => {
            const en = (e.deckName || e.name || '').toLowerCase().trim();
            const es = en.replace(/[^a-z0-9]/g, '');
            return (
              (en && (sTarget.includes(en) || en.includes(sTarget))) ||
              (es && (sStripped.includes(es) || es.includes(sStripped)))
            );
          });

        if (matchedDeck) {
          const subIsFoil = isFoil || sTarget.includes('foil') || Boolean(matchedDeck.isFoil);
          const rawCards = matchedDeck.keyCards || matchedDeck.cards;
          if (Array.isArray(rawCards)) {
            rawCards.forEach((c: any, idx: number) => {
              const finish = resolveFinish(c, subIsFoil);
              const isCardFoil = finish === 'foil' || finish === 'etched';
              const pNorm = c.price || c.priceNormal || 0;
              const pFoil = isCardFoil ? c.priceFoil : undefined;
              const scryId = c.scryfallId || '';
              const setC = (c.set || matchedDeck.setCode || 'SLD').toUpperCase();
              const num = c.number || String(idx + 1);
              const imgUrl = c.imageUrl || getCardImageUrl({ imageUrl: c.imageUrl, scryfallId: scryId, setCode: setC, number: num });

              cards.push({
                uuid: c.uuid || `drop-${idx}-${c.name}`,
                name: c.name,
                scryfallId: scryId,
                setCode: setC,
                rarity: (c.rarity as any) || 'rare',
                number: num,
                priceNormal: pNorm,
                priceFoil: pFoil,
                price: finish === 'foil' || finish === 'etched' ? (pFoil || pNorm) : pNorm,
                finish,
                imageUrl: imgUrl,
                cardType: c.type || 'Single',
                productType: 'deck',
                deckName: matchedDeck.deckName || matchedDeck.name || s.name,
                pullOddsDesc: `Guaranteed in ${matchedDeck.deckName || matchedDeck.name || s.name}`,
              });
            });
          }
        }
      }
    });
  }

  return cards;
}

/**
 * Utility to apply MTGJSON prices strictly to an array of ChaseCards.
 * Protects specific card versions (collector numbers, custom Scryfall IDs) from being overwritten.
 */
export function applyMtgJsonPricesToCards(
  cards: ChaseCard[],
  singlePrices: any,
  setCode: string,
  priceMode: 'direct' | 'cheapest_reprint',
  vendor: string
) {
  if (!singlePrices) return;
  const upperCode = (setCode || '').toLowerCase().trim();

  cards.forEach((c) => {
    const cardKey = (c.name || '').toLowerCase().trim();
    const uuidKey = c.uuid || c.scryfallId || '';
    const nameSetKey = `${cardKey}_${upperCode}`;

    const priceRec =
      singlePrices.byUuid?.[uuidKey] ||
      singlePrices.byNameSet?.[nameSetKey] ||
      singlePrices.byName?.[cardKey];

    if (priceRec) {
      const vendorKey = vendor === 'all' ? 'all_cheapest' : vendor;
      const pNorm = priceMode === 'cheapest_reprint'
        ? priceRec.prices?.all_cheapest ?? priceRec.prices?.all ?? 0
        : priceRec.prices?.[vendorKey] ?? (vendorKey === 'tcgplayer' ? priceRec.tcgplayerPrice : undefined) ?? 0;
      const pFoil = priceMode === 'cheapest_reprint'
        ? priceRec.prices?.all_cheapestFoil ?? priceRec.priceFoil
        : priceRec.foilTcgplayerPrice ?? priceRec.foilPrice ?? priceRec.prices?.tcgplayerFoil ?? priceRec.priceFoil;

      if (typeof pNorm === 'number' && pNorm > 0) {
        c.priceNormal = pNorm;
      }
      if (typeof pFoil === 'number' && pFoil > 0) {
        c.priceFoil = pFoil;
      }
      c.price =
        c.finish === 'foil' || c.finish === 'etched'
          ? (c.priceFoil || c.priceNormal || 0)
          : (c.priceNormal || c.priceFoil || 0);

      // Only adopt scryfallId and imageUrl if the card doesn't already have its own version defined
      if (!c.scryfallId && priceRec.scryfallId) {
        c.scryfallId = priceRec.scryfallId;
      }
      if (!c.imageUrl) {
        if (priceRec.imageUrl) {
          c.imageUrl = priceRec.imageUrl;
        } else if (c.scryfallId) {
          c.imageUrl = `https://cards.scryfall.io/normal/front/${c.scryfallId[0]}/${c.scryfallId[1]}/${c.scryfallId}.jpg`;
        }
      }
    } else if (c.scryfallId && !c.imageUrl) {
      c.imageUrl = `https://cards.scryfall.io/normal/front/${c.scryfallId[0]}/${c.scryfallId[1]}/${c.scryfallId}.jpg`;
    }
  });
}

/**
 * Determine which product categories in the set contain a given chase card
 */
export function getCardProductAvailability(card: ChaseCard, currentProduct?: CatalogPackProduct): {
  collectorBooster: boolean;
  playBooster: boolean;
  bundle: boolean;
  preconDeck: boolean;
  availableProductsList: string[];
} {
  const isCollectorOnly = card.productType === 'collector' || card.pullOddsDesc?.includes('Collector Exclusive') || card.pullOddsDesc?.includes('Serialized');
  const isDeckCard = card.productType === 'deck' || card.pullOddsDesc?.includes('Commander') || card.pullOddsDesc?.includes('Deck');
  const isPromo = card.productType === 'card' || card.pullOddsDesc?.includes('Included Single/Promo');

  const availableProductsList: string[] = [];

  let collectorBooster = true;
  let playBooster = !isCollectorOnly && !isDeckCard;
  let bundle = !isCollectorOnly && !isDeckCard;
  let preconDeck = isDeckCard;

  if (isDeckCard) {
    availableProductsList.push(card.deckName ? `${card.deckName} Deck` : 'Preconstructed Deck');
    collectorBooster = false;
  } else if (isPromo) {
    availableProductsList.push('Guaranteed Included Promo');
  } else {
    if (collectorBooster) availableProductsList.push('Collector Booster Box / Pack');
    if (playBooster) availableProductsList.push('Play Booster Box / Pack');
    if (bundle) availableProductsList.push('Bundle / Gift Edition');
  }

  return {
    collectorBooster,
    playBooster,
    bundle,
    preconDeck,
    availableProductsList,
  };
}
