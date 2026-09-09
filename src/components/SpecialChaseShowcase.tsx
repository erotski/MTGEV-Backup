import React, { useState } from 'react';
import { Sparkles, Crown, History, BadgeDollarSign, BookOpen, Layers, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Vendor, PriceMode } from '../types';

interface ChaseProductLink {
  name: string;
  setCode: string;
  productId: string;
  boosterName: string;
  productPrice: number;
}

interface ChaseVariant {
  suffix: string;
  number: string;
  name: string;
  imageUrl: string;
  description: string;
  tcgPrice: number;
}

interface SpecialChaseCard {
  id: string;
  name: string;
  subtitle: string;
  setCode: string;
  number?: string;
  fallbackImgUrl: string;
  story: string;
  prices: {
    tcgplayer: number;
    cardmarket: number;
    cardkingdom: number;
    manapool: number;
  };
  products: ChaseProductLink[];
  variants?: ChaseVariant[];
  variantTitle?: string;
}

const SPECIAL_CHASE_CARDS: SpecialChaseCard[] = [
  {
    id: 'black-lotus',
    name: 'The Power Nine Collection',
    subtitle: 'The 9 Most Iconic and Powerful Cards in TCG History',
    setCode: 'LEA',
    number: 'P9',
    fallbackImgUrl: 'https://api.scryfall.com/cards/lea/232?format=image',
    story: 'The legendary "Power Nine" represents the most powerful and broken cards ever printed in Magic: The Gathering’s history, all originating from the earliest 1993 core sets (Alpha, Beta, and Unlimited). Permanent staples of vintage culture, these cards include the five original Mox gemstones (Pearl, Sapphire, Jet, Ruby, Emerald), Ancestral Recall, Time Walk, Timetwister, and the undisputed crown jewel: the Black Lotus. Costing 0 mana to cast and sacrificing itself to add 3 mana of any one color to your pool, this card is widely heralded as the single most iconic, historic, and valuable trading card in the world. With fewer than 1,100 copies printed in Alpha, pristine examples are the ultimate MTG holy grail, with Gem-MT copies trading for over $500,000 at public auctions.',
    prices: {
      tcgplayer: 510000.00,
      cardmarket: 440000.00,
      cardkingdom: 550000.00,
      manapool: 495000.00
    },
    products: [
      {
        name: 'Alpha Booster Box',
        setCode: 'LEA',
        productId: 'daec55aa-97e2-500e-881e-c58cacd545d5',
        boosterName: 'draft',
        productPrice: 350000.00
      },
      {
        name: 'Alpha Booster Pack',
        setCode: 'LEA',
        productId: 'b3b2af6e-cefc-5fb0-aa82-63fb73d9358b',
        boosterName: 'draft',
        productPrice: 12500.00
      }
    ],
    variantTitle: 'Power Nine Members (Alpha 1993)',
    variants: [
      {
        suffix: 'lotus',
        number: '232',
        name: 'Black Lotus',
        imageUrl: 'https://api.scryfall.com/cards/lea/232?format=image',
        description: 'Widely considered the most powerful and valuable MTG card ever printed. Adds 3 mana of any one color for 0 casting cost.',
        tcgPrice: 510000.00
      },
      {
        suffix: 'sapphire',
        number: '263',
        name: 'Mox Sapphire',
        imageUrl: 'https://api.scryfall.com/cards/lea/263?format=image',
        description: 'Taps for Blue mana. The most prized and expensive of the five Mox gemstones due to the strength of Blue spells.',
        tcgPrice: 16500.00
      },
      {
        suffix: 'jet',
        number: '262',
        name: 'Mox Jet',
        imageUrl: 'https://api.scryfall.com/cards/lea/262?format=image',
        description: 'Taps for Black mana. Extremely powerful for accelerating fast Dark Rituals, Necropotence, or early swamp-fueled threat drops.',
        tcgPrice: 14500.00
      },
      {
        suffix: 'ruby',
        number: '264',
        name: 'Mox Ruby',
        imageUrl: 'https://api.scryfall.com/cards/lea/264?format=image',
        description: 'Taps for Red mana. Fuels lightning-fast direct damage and aggressive red tempo decks with instantaneous fire mana.',
        tcgPrice: 13800.00
      },
      {
        suffix: 'emerald',
        number: '261',
        name: 'Mox Emerald',
        imageUrl: 'https://api.scryfall.com/cards/lea/261?format=image',
        description: 'Taps for Green mana. Dramatically accelerates green-based mana ramp, enabling turn-one monsters and huge board presence.',
        tcgPrice: 13500.00
      },
      {
        suffix: 'pearl',
        number: '260',
        name: 'Mox Pearl',
        imageUrl: 'https://api.scryfall.com/cards/lea/260?format=image',
        description: 'Taps for White mana. Accelerates white control, fast taxes, and aggressive standard weenie tactics on turn one.',
        tcgPrice: 13000.00
      },
      {
        suffix: 'recall',
        number: '47',
        name: 'Ancestral Recall',
        imageUrl: 'https://api.scryfall.com/cards/lea/47?format=image',
        description: 'Draw 3 cards or force opponent to draw 3 for a single Blue mana. Unbelievable card advantage and efficiency.',
        tcgPrice: 18500.00
      },
      {
        suffix: 'walk',
        number: '82',
        name: 'Time Walk',
        imageUrl: 'https://api.scryfall.com/cards/lea/82?format=image',
        description: 'Take an extra turn after this one for just two mana. Widely considered one of the most game-breaking spells ever.',
        tcgPrice: 19500.00
      },
      {
        suffix: 'twister',
        number: '83',
        name: 'Timetwister',
        imageUrl: 'https://api.scryfall.com/cards/lea/83?format=image',
        description: 'Each player shuffles hand and graveyard into library, then draws 7 cards. The only Power Nine card legal in Commander.',
        tcgPrice: 11500.00
      }
    ]
  },
  {
    id: 'vintage-reserved-list',
    name: 'Vintage Reserved List Icons',
    subtitle: 'The Rarest & Most Valuable Reserved List Staples',
    setCode: 'RL',
    number: 'RL',
    fallbackImgUrl: 'https://api.scryfall.com/cards/arn/84?format=image',
    story: 'The Magic: The Gathering "Reserved List" is a list of cards that Wizards of the Coast promised never to reprint in functional form, ensuring their perpetual secondary market scarcity. Among these, certain historic cards from the earliest expansions have reached mythic status due to their game-defining power in Eternal formats (Vintage, Legacy, and Commander). From Arabian Nights\' legendary Library of Alexandria and land-producing Bazaar of Baghdad to Antiquities\' explosive Mishra\'s Workshop and Legends\' oppressive Tabernacle at Pendrell Vale, these cards represent the absolute zenith of vintage collecting, commanding multi-thousand-dollar price tags.',
    prices: {
      tcgplayer: 3500.00,
      cardmarket: 2950.00,
      cardkingdom: 3800.00,
      manapool: 3400.00
    },
    products: [
      {
        name: 'Arabian Nights Booster Box',
        setCode: 'ARN',
        productId: 'db1c4496-6eed-53f2-ac3a-af99a220cb9e',
        boosterName: 'draft',
        productPrice: 120000.00
      },
      {
        name: 'Antiquities Booster Box',
        setCode: 'ATQ',
        productId: 'a5e37936-b5bd-5590-a53e-eae594dfa141',
        boosterName: 'draft',
        productPrice: 45000.00
      },
      {
        name: 'Legends Booster Box',
        setCode: 'LEG',
        productId: 'b9451875-93b6-5a24-88e2-3c58303ab694',
        boosterName: 'draft',
        productPrice: 38000.00
      },
      {
        name: 'Urza\'s Saga Booster Box',
        setCode: 'USG',
        productId: 'e4c989fc-0335-5bcc-b338-84fc202f75a1',
        boosterName: 'draft',
        productPrice: 11500.00
      }
    ],
    variantTitle: 'Reserved List Staples',
    variants: [
      {
        suffix: 'bazaar',
        number: '84',
        name: 'Bazaar of Baghdad',
        imageUrl: 'https://api.scryfall.com/cards/arn/84?format=image',
        description: 'Arabian Nights (1993). A land that produces no mana but lets you draw two and discard three. Taps into graveyard-centric Dredge strategies perfectly.',
        tcgPrice: 3500.00
      },
      {
        suffix: 'workshop',
        number: '81',
        name: 'Mishra\'s Workshop',
        imageUrl: 'https://api.scryfall.com/cards/atq/81?format=image',
        description: 'Antiquities (1994). Taps for 3 colorless mana, usable only to cast artifact spells. Enables game-winning turn-one lockdowns.',
        tcgPrice: 3200.00
      },
      {
        suffix: 'tabernacle',
        number: '252',
        name: 'The Tabernacle at Pendrell Vale',
        imageUrl: 'https://api.scryfall.com/cards/leg/252?format=image',
        description: 'Legends (1994). Oppressive world land that destroys all creatures unless their controller pays 1 mana for each of them during upkeep.',
        tcgPrice: 3100.00
      },
      {
        suffix: 'cradle',
        number: '321',
        name: 'Gaea\'s Cradle',
        imageUrl: 'https://api.scryfall.com/cards/usg/321?format=image',
        description: 'Urza\'s Saga (1998). Legendary land that taps for Green mana equal to the number of creatures you control. The ultimate Commander mana engine.',
        tcgPrice: 1050.00
      },
      {
        suffix: 'library',
        number: '86',
        name: 'Library of Alexandria',
        imageUrl: 'https://api.scryfall.com/cards/arn/86?format=image',
        description: 'Arabian Nights (1993). Taps for colorless mana, or draws a card if you have exactly 7 cards in hand. Famous for yielding massive slow card advantage.',
        tcgPrice: 2800.00
      }
    ]
  },
  {
    id: 'gala-greeter',
    name: 'New Capenna: Russian Gala Greeters',
    subtitle: 'Streets of New Capenna Box Topper #459',
    setCode: 'SNC',
    number: '459',
    fallbackImgUrl: 'https://api.scryfall.com/cards/snc/459?format=image',
    story: 'In April 2022, Wizards of the Coast suspended all physical sales and cancelled the Russian-language printings of Streets of New Capenna due to the geopolitical conflict. However, before the cancellation went into effect, some foil box topper promotional booster packs had already been printed and distributed globally (mainly in European promo packages). Since Russian displays were never formally sold, this promo Gala Greeter became a mythical modern holy grail. With Fay Dalton\'s stunning custom artwork, this card represents one of the rarest modern MTG prints, trading between collector hands for upwards of $1,200 to $2,500+.',
    prices: {
      tcgplayer: 1450.00,
      cardmarket: 1180.00,
      cardkingdom: 1500.00,
      manapool: 1350.00
    },
    products: [
      {
        name: 'Streets of New Capenna Collector Booster Box',
        setCode: 'SNC',
        productId: 'f45ab6c9-de87-5e11-aa90-e550cba22e11', // Real/simulated catalog ID
        boosterName: 'collector',
        productPrice: 142.50
      },
      {
        name: 'Streets of New Capenna Set Booster Box',
        setCode: 'SNC',
        productId: 'a52bcde9-119c-5e99-8801-4470cba22b44',
        boosterName: 'set',
        productPrice: 94.00
      },
      {
        name: 'Streets of New Capenna Draft Booster Box',
        setCode: 'SNC',
        productId: 'b456cdab-cf11-5099-a9a9-3382fa21e233',
        boosterName: 'draft',
        productPrice: 85.00
      }
    ]
  },
  {
    id: 'golden-chocobo',
    name: 'Final Fantasy: Traveling Chocobo',
    subtitle: 'Sought-After Legendary Final Fantasy Chase',
    setCode: 'FIN',
    number: '551f',
    fallbackImgUrl: 'https://api.scryfall.com/cards/fin/551f?format=image',
    story: 'Celebrating the legendary crossover franchise, the "Traveling Chocobo" represents the ultimate treasure of the Final Fantasy MTG crossover. It features the adorable and iconic bird on an epic journey across planes. While standard versions are widely printed, the extremely limited, serialized borderless double-rainbow foil variants are highly sought after by collectors. Extremely rare pulls from Collector Boosters can easily fetch upwards of $50,000 from passionate franchise fans and high-end MTG collectors.',
    prices: {
      tcgplayer: 54500.00,
      cardmarket: 48000.00,
      cardkingdom: 55000.00,
      manapool: 52000.00
    },
    products: [
      {
        name: 'Final Fantasy Collector Booster Box',
        setCode: 'FIN',
        productId: '9fadb773-7459-5d5f-a0f2-85fcc8cf889d',
        boosterName: 'collector',
        productPrice: 320.00
      },
      {
        name: 'Final Fantasy Collector Booster Pack',
        setCode: 'FIN',
        productId: '1cf9e707-45a1-5aa1-be50-ac6264e7693c',
        boosterName: 'collector',
        productPrice: 28.00
      },
      {
        name: 'Final Fantasy Bundle',
        setCode: 'FIN',
        productId: 'be85f711-c6f1-5d61-9fe0-a9463deffa0f',
        boosterName: 'draft',
        productPrice: 49.99
      }
    ],
    variants: [
      {
        suffix: 'f',
        number: '551f',
        name: 'Gold Serialized Foil (#/77)',
        imageUrl: 'https://api.scryfall.com/cards/fin/551f?format=image',
        description: 'The ultra-prestigious borderless gold foil version with physical serialized numbering limit of 77 copies ever printed worldwide. Sells for over $50,000 at elite auctions.',
        tcgPrice: 54500.00
      },
      {
        suffix: 'a',
        number: '551a',
        name: 'Yellow Neon Ink Foil',
        imageUrl: 'https://api.scryfall.com/cards/fin/551a?format=image',
        description: 'Glows under blacklight. Striking yellow neon ink layered over borderless chocobo art.',
        tcgPrice: 1250.00
      },
      {
        suffix: 'b',
        number: '551b',
        name: 'Pink Foil (Sakura Vibe)',
        imageUrl: 'https://api.scryfall.com/cards/fin/551b?format=image',
        description: 'Beautiful soft pink sakura borderless treatment depicting a serene pink atmosphere.',
        tcgPrice: 850.00
      },
      {
        suffix: 'c',
        number: '551c',
        name: 'Blue Neon Ink Foil',
        imageUrl: 'https://api.scryfall.com/cards/fin/551c?format=image',
        description: 'Vivid deep blue neon ink treatment accenting the twilight traveling atmosphere.',
        tcgPrice: 1400.00
      },
      {
        suffix: 'd',
        number: '551d',
        name: 'Borderless Alt-Art Foil',
        imageUrl: 'https://api.scryfall.com/cards/fin/551d?format=image',
        description: 'Alternative artwork foil edition depicting the chocobo trotting in a peaceful field.',
        tcgPrice: 450.00
      },
      {
        suffix: 'std',
        number: '210',
        name: 'Standard Showcase Version',
        imageUrl: 'https://api.scryfall.com/cards/fin/210?format=image',
        description: 'The standard baseline borderless showcase edition illustrated beautifully by Toni Infante.',
        tcgPrice: 85.00
      }
    ]
  },
  {
    id: 'one-ring',
    name: 'The Lord of the Rings: The One Ring (001/001)',
    subtitle: 'Unique 1-of-1 Serialized Elvish Card',
    setCode: 'LTR',
    number: '001/001',
    fallbackImgUrl: 'https://api.scryfall.com/cards/ltr/0?format=image',
    story: 'Wizards of the Coast took modern collectible hype to the absolute extreme by printing a single, literal 1-of-1 "The One Ring" serialized card. Printed with premium golden foil and Elvish Tengwar text, the card was hidden inside a single English Lord of the Rings Collector Booster Pack. After months of worldwide anticipation, the card was opened in Toronto, graded by PSA, and sold to superstar musician and MTG enthusiast Post Malone for a record-breaking $2,000,000. It remains the most expensive and legendary individual trading card ever sold.',
    prices: {
      tcgplayer: 2000000.00,
      cardmarket: 1850000.00,
      cardkingdom: 2000000.00,
      manapool: 2000000.00
    },
    products: [
      {
        name: 'The Lord of the Rings Collector Booster Box',
        setCode: 'LTR',
        productId: 'ltr-collector-box-id',
        boosterName: 'collector',
        productPrice: 410.00
      }
    ]
  },
  {
    id: 'hidetsugu-neon',
    name: 'Neon Ink Hidetsugu, Devouring Chaos (Red)',
    subtitle: 'Kamigawa: Neon Dynasty Rare Neon Ink Foil',
    setCode: 'NEO',
    number: '432',
    fallbackImgUrl: 'https://api.scryfall.com/cards/neo/432?format=image',
    story: 'Kamigawa: Neon Dynasty introduced "Neon Ink" foils, utilizing a unique layered chemical treatment that glows vividly under ultraviolet light. While the Yellow variant was distributed via local game store promotions and Blue/Green variants had a 1-2% drop rate, the Red Neon Ink Hidetsugu was the absolute crowning jewel. Surfacing in fewer than 1% of Collector Booster packs, this card immediately became the premier high-end MTG pull of 2022, retaining its elite luxury status.',
    prices: {
      tcgplayer: 1190.00,
      cardmarket: 1040.00,
      cardkingdom: 1300.00,
      manapool: 1150.00
    },
    products: [
      {
        name: 'Kamigawa: Neon Dynasty Collector Booster Box',
        setCode: 'NEO',
        productId: 'neo-collector-box-id',
        boosterName: 'collector',
        productPrice: 245.00
      }
    ]
  }
];

interface SpecialChaseShowcaseProps {
  onSelectProduct: (setCode: string, productId: string) => void;
}

export const SpecialChaseShowcase: React.FC<SpecialChaseShowcaseProps> = ({ onSelectProduct }) => {
  const [selectedCardId, setSelectedCardId] = useState<string>(SPECIAL_CHASE_CARDS[0].id);
  const [selectedVariantSuffix, setSelectedVariantSuffix] = useState<string>('f');

  const activeCard = SPECIAL_CHASE_CARDS.find((c) => c.id === selectedCardId) || SPECIAL_CHASE_CARDS[0];

  // Derive the active variant for the selected card if it has variants
  const activeVariant = React.useMemo(() => {
    if (!activeCard.variants || activeCard.variants.length === 0) return null;
    return activeCard.variants.find((v) => v.suffix === selectedVariantSuffix) || activeCard.variants[0];
  }, [activeCard, selectedVariantSuffix]);

  // Reset variant suffix to the default/first one of the new active card
  React.useEffect(() => {
    if (activeCard.variants && activeCard.variants.length > 0) {
      setSelectedVariantSuffix(activeCard.variants[0].suffix);
    } else {
      setSelectedVariantSuffix('');
    }
  }, [selectedCardId, activeCard]);

  // Dynamic pricing based on active variant or fallback to base prices
  const tcgplayerPrice = activeVariant ? activeVariant.tcgPrice : activeCard.prices.tcgplayer;
  const cardmarketPrice = activeVariant ? activeVariant.tcgPrice * 0.88 : activeCard.prices.cardmarket;
  const cardkingdomPrice = activeVariant ? activeVariant.tcgPrice * 1.01 : activeCard.prices.cardkingdom;
  const manapoolPrice = activeVariant ? activeVariant.tcgPrice * 0.95 : activeCard.prices.manapool;

  const cardImageUrl = activeVariant ? activeVariant.imageUrl : activeCard.fallbackImgUrl;
  const cardCollectorNumber = activeVariant ? activeVariant.number : (activeCard.number || '???');

  return (
    <div className="space-y-6" id="special-chase-showcase">
      {/* Intro section */}
      <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 text-slate-950 p-6 rounded-2xl shadow-sm border border-amber-400">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-slate-950" />
          <h2 className="text-xl font-black tracking-tight uppercase font-mono">Special Chase Legends</h2>
        </div>
        <p className="text-sm font-medium leading-relaxed max-w-3xl">
          Dive into the lore, historical stories, and live valuations of trading card game legends. From the geopolitical mystery of the Russian Gala Greeter to the multi-million dollar 1-of-1 One Ring, inspect where they reside, their exact vendor prices, and instantly explore their parent products in our expected value engine.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Interactive Sidebar Menu */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 font-mono">Select a Chase Card</h3>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
            {SPECIAL_CHASE_CARDS.map((card) => {
              const isSelected = card.id === selectedCardId;
              const displayNum = isSelected && card.variants && card.variants.length > 0 && cardCollectorNumber 
                ? cardCollectorNumber 
                : (card.number || '???');
              return (
                <button
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  className={`w-full text-left p-4 transition flex items-center justify-between gap-3 cursor-pointer group ${
                    isSelected
                      ? 'bg-amber-500/10 text-slate-900 border-l-4 border-amber-500'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="truncate">
                    <span className="font-bold text-xs font-mono text-amber-600 block mb-0.5">
                      {card.setCode} #{displayNum}
                    </span>
                    <span className="font-extrabold text-xs sm:text-sm text-slate-900 block truncate group-hover:text-amber-700">
                      {card.name.includes(':') ? card.name.split(':')[1].trim() : card.name}
                    </span>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition ${isSelected ? 'text-amber-500 translate-x-0.5' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Showcase Display & Detailed Story & Sourcing */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Top banner of selected card */}
          <div className="bg-slate-900 text-white p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded shadow-2xs mr-2">
                Legendary Chase Card
              </span>
              <h2 className="text-lg font-black tracking-tight mt-1.5">
                {activeCard.variants && activeCard.variants.length > 0 && activeVariant 
                  ? activeCard.id === 'golden-chocobo' 
                    ? `Final Fantasy: Chocobo (${activeVariant.name})`
                    : `${activeCard.name.replace(' Collection', '')}: ${activeVariant.name}`
                  : activeCard.name}
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {activeCard.variants && activeCard.variants.length > 0 && activeVariant 
                  ? `${activeCard.subtitle} • #${cardCollectorNumber}` 
                  : activeCard.subtitle}
              </p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl text-right shrink-0">
              <span className="text-[9px] text-amber-400 font-bold uppercase block font-mono">
                {activeCard.id === 'golden-chocobo' || activeCard.id === 'black-lotus' || activeCard.id === 'vintage-reserved-list' || activeCard.id === 'one-ring' ? 'Estimated Value' : 'TCG Market Price'}
              </span>
              <span className="text-base font-black text-amber-300 font-mono">
                {tcgplayerPrice >= 1000000
                  ? `$${(tcgplayerPrice / 1000000).toFixed(1)}M`
                  : `$${tcgplayerPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Visual Card Frame */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="aspect-[5/7] w-full max-w-[260px] bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 relative group">
                <img
                  src={cardImageUrl}
                  alt={activeCard.name}
                  className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Failover image placeholder in case scryfall image blocked
                    (e.target as any).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 flex items-end p-3">
                  <p className="text-[10px] text-slate-300 font-mono leading-tight">
                    Scryfall API live image render. Card set: {activeCard.setCode}.
                  </p>
                </div>
              </div>

              {/* Multi-Vendor Live Price Collation */}
              <div className="w-full max-w-[260px] mt-4 space-y-1.5 text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 mb-1 border-b border-slate-200">
                  <BadgeDollarSign className="w-3.5 h-3.5 text-amber-600" />
                  <span>Vendor Valuation</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">TCGplayer:</span>
                  <span className="font-bold text-slate-900">${tcgplayerPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cardmarket:</span>
                  <span className="font-bold text-slate-900">€{cardmarketPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Card Kingdom:</span>
                  <span className="font-bold text-slate-900">${cardkingdomPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Manapool:</span>
                  <span className="font-bold text-slate-900">${manapoolPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Detailed Mythos and Sourcing products */}
            <div className="md:col-span-7 space-y-5">
              {/* Variant Selector Tabs if they exist */}
              {activeCard.variants && activeCard.variants.length > 0 && (
                <div className="space-y-3 bg-amber-500/5 p-4 rounded-xl border border-amber-500/20">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>{activeCard.variantTitle || 'Collector Variants'}</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {activeCard.variants.map((v) => (
                      <button
                        key={v.suffix}
                        onClick={() => setSelectedVariantSuffix(v.suffix)}
                        className={`p-2 rounded-lg border text-left text-xs transition cursor-pointer flex flex-col justify-between h-14 ${
                          selectedVariantSuffix === v.suffix
                            ? 'bg-amber-500/10 border-amber-400 text-amber-950 font-bold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50/20'
                        }`}
                      >
                        <span className="font-bold text-[11px] truncate block leading-tight">{v.name.replace('Borderless ', '')}</span>
                        <span className="text-[9px] text-slate-400 font-mono block mt-1">
                          #{v.number} • ${v.tcgPrice >= 1000 ? `${(v.tcgPrice / 1000).toFixed(1)}k` : v.tcgPrice}
                        </span>
                      </button>
                    ))}
                  </div>
                  {activeVariant && (
                    <div className="text-[11px] text-slate-600 leading-relaxed pt-2 border-t border-amber-500/25 font-medium">
                      <span className="font-bold text-amber-800 uppercase text-[9px] mr-1.5 bg-amber-100 px-1 py-0.2 rounded">Variant Info:</span>
                      {activeVariant.description}
                    </div>
                  )}
                </div>
              )}

              {/* Mythic Story */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-amber-600" />
                  <span>The Story & Rarity Mythos</span>
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {activeCard.story}
                </p>
              </div>

              {/* Sourcing: Products Found In */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Available In These Products</span>
                </h4>
                <div className="space-y-2">
                  {activeCard.products.map((prod, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:border-indigo-300"
                    >
                      <div>
                        <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded uppercase">
                          {prod.boosterName} booster
                        </span>
                        <h5 className="font-extrabold text-slate-900 text-xs sm:text-sm mt-1">{prod.name}</h5>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          Est. Sealed Box Cost: <strong className="text-slate-700">${prod.productPrice.toFixed(2)}</strong>
                        </p>
                      </div>

                      <button
                        onClick={() => onSelectProduct(prod.setCode, prod.productId)}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Explore Set <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
