import React from 'react';
import { ExternalLink, Image as ImageIcon, Box, Package, Sparkles, FolderDown, Globe, X } from 'lucide-react';
import { SetSymbolIcon } from './SetSymbolIcon';

interface PackagingStockAssetGuideProps {
  isOpen: boolean;
  onClose: () => void;
  currentSetCode?: string;
}

export const PackagingStockAssetGuide: React.FC<PackagingStockAssetGuideProps> = ({
  isOpen,
  onClose,
  currentSetCode = 'MH3',
}) => {
  if (!isOpen) return null;

  const currentCode = currentSetCode.toLowerCase();

  const assetSources = [
    {
      title: 'Digital Packaging Marketing Assets',
      badge: 'Official 300 DPI Renders & Transparent 3D Mockups',
      description:
        'Standard digital marketing kits released for each set contain isolated transparent PNGs of Booster Boxes, Bundles, Collector Displays, and Prerelease packs.',
      url: 'https://wpn.wizards.com/en/marketing-materials',
      features: ['Transparent 3D box renders', 'Print-ready high-res assets', 'Direct package photography'],
      tag: 'Best for 3D Boxes',
    },
    {
      title: 'MTGJSON Booster Packaging Image Repository',
      badge: 'Community Open Source CDN',
      description:
        'MTGJSON maintains an open-source GitHub repository indexing booster packs, boxes, and ancillary products across MTG history.',
      url: 'https://github.com/mtgjson/mtgjson-images',
      features: ['Booster pack front/back art', 'Display box mockups', 'Vector SVG set logos'],
      tag: 'Open-Source GitHub',
    },
    {
      title: 'Scryfall Official Set Symbols API',
      badge: 'Integrated Live in this App',
      description:
        'Scryfall provides direct vector SVGs for every Magic: The Gathering expansion, master, and special set code.',
      url: `https://svgs.scryfall.io/sets/${currentCode}.svg`,
      features: [`Direct SVG URL: https://svgs.scryfall.io/sets/{code}.svg`, 'Automatic scaling and dark/light mode compatibility'],
      tag: 'Integrated',
    },
    {
      title: 'TCGplayer Product Media CDN',
      badge: 'E-commerce Catalog Product Photos',
      description:
        'TCGplayer hosts standardized clean white-background stock product photography for every sealed SKU (Packs, Boxes, Bundles, Cases).',
      url: 'https://www.tcgplayer.com',
      features: ['Sealed SKU photography', 'Standardized catalog dimensions', 'Includes vintage and sealed collector items'],
      tag: 'E-Commerce Photos',
    },
    {
      title: 'MTG Fandom / Gamepedia Packaging Archive',
      badge: 'Historical Archive (1993 - Present)',
      description:
        'Comprehensive historical archive of vintage booster wraps, tournament starter boxes, and fat pack photographs.',
      url: 'https://mtg.fandom.com/wiki/Packaging',
      features: ['Vintage 1990s booster art scans', 'Fat pack booklets & packaging history'],
      tag: 'Vintage Archive',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  Physical Product Pictures & Stock Assets
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center gap-1">
                  <SetSymbolIcon setCode={currentSetCode} size="xs" /> {currentSetCode}
                </span>
              </div>
              <p className="text-xs text-slate-500">Official repositories and APIs for MTG packaging photography and renders</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Local Assets Integration Section */}
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderDown className="w-5 h-5 text-amber-700" />
              <h4 className="font-bold text-sm text-amber-950">Automated WPN ZIP Extractor & Local Directory</h4>
            </div>
            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-mono font-bold rounded">CLI Script Ready</span>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            Instead of manually renaming and unzipping files, drop downloaded WPN Marketing <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950">.zip</code> files into <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950">/incoming_zips/</code> and run:
          </p>
          <div className="bg-slate-900 text-slate-100 p-2.5 rounded-lg font-mono text-xs flex items-center justify-between border border-slate-800">
            <span>npm run ingest-wpn</span>
            <span className="text-[10px] text-amber-400 font-sans font-semibold">Auto-extracts & normalizes to /public/products/</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
            <div className="bg-white/80 p-2 rounded border border-amber-200 text-slate-800">
              <div className="font-bold text-amber-800">Booster Display Box</div>
              <code>{currentCode}-box.png</code>
            </div>
            <div className="bg-white/80 p-2 rounded border border-amber-200 text-slate-800">
              <div className="font-bold text-amber-800">Bundle Box</div>
              <code>{currentCode}-bundle.png</code>
            </div>
            <div className="bg-white/80 p-2 rounded border border-amber-200 text-slate-800">
              <div className="font-bold text-amber-800">Prerelease Pack</div>
              <code>{currentCode}-prerelease.png</code>
            </div>
            <div className="bg-white/80 p-2 rounded border border-amber-200 text-slate-800">
              <div className="font-bold text-amber-800">Single Booster Pack</div>
              <code>{currentCode}-pack.png</code>
            </div>
          </div>
        </div>

        {/* Live Set Symbol Demonstration Banner */}
        <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center p-2 border border-white/20">
              <SetSymbolIcon setCode={currentSetCode} size="lg" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-400 font-mono uppercase">Active Set Vector Logo</div>
              <div className="text-sm font-bold text-white">Scryfall SVG Endpoint Active</div>
              <code className="text-[11px] text-slate-300 font-mono">
                https://svgs.scryfall.io/sets/{currentCode}.svg
              </code>
            </div>
          </div>
          <a
            href={`https://svgs.scryfall.io/sets/${currentCode}.svg`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0"
          >
            View SVG <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Resource Cards */}
        <div className="space-y-3">
          {assetSources.map((source, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{source.title}</span>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200">
                      {source.tag}
                    </span>
                  </div>
                  <div className="text-xs text-amber-800 font-medium mt-0.5">{source.badge}</div>
                </div>

                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  Visit <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{source.description}</p>

              <div className="flex flex-wrap gap-2 pt-1">
                {source.features.map((feat, fIdx) => (
                  <span
                    key={fIdx}
                    className="px-2 py-0.5 bg-white text-slate-600 text-[10px] font-mono rounded border border-slate-200"
                  >
                    • {feat}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
          <span>We render real-time vector symbols and high-contrast packaging cards across the app.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
