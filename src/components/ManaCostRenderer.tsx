import React from 'react';

interface ManaCostProps {
  manaCost?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Standard MTG Mana Symbol & Cost Renderer
 * Parses strings like "{2}{G}{U}", "{W/U}", "{C/W}", "{X}", "{10}"
 * Renders high-quality MTG mana symbols with Scryfall SVG and instant fallback badges.
 */
export const ManaCostRenderer: React.FC<ManaCostProps> = ({
  manaCost,
  className = '',
  size = 'sm',
}) => {
  if (!manaCost || !manaCost.trim()) {
    return <span className="text-slate-300 font-mono text-[11px]">—</span>;
  }

  // Extract individual symbol tokens e.g. ["2", "G", "U"] from "{2}{G}{U}"
  const rawTokens = manaCost.match(/\{([^}]+)\}/g);

  if (!rawTokens || rawTokens.length === 0) {
    // If format is like "2GU" or plain string without braces
    return <span className="font-mono text-xs text-slate-600">{manaCost}</span>;
  }

  const symbols = rawTokens.map((t) => t.replace(/[{}]/g, ''));

  const sizeClasses = {
    sm: 'w-4 h-4 text-[9px]',
    md: 'w-5 h-5 text-[11px]',
    lg: 'w-6 h-6 text-xs',
  };

  const imgSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <span className={`inline-flex items-center gap-0.5 flex-wrap ${className}`}>
      {symbols.map((sym, index) => {
        const cleanSym = sym.trim();
        const scryfallCode = cleanSym.replace('/', '');
        const scryfallUrl = `https://svgs.scryfall.io/card-symbols/${encodeURIComponent(scryfallCode)}.svg`;

        return (
          <span
            key={index}
            className="inline-flex items-center justify-center shrink-0"
            title={`{${cleanSym}}`}
          >
            {/* Scryfall SVG Icon with graceful CSS fallback */}
            <img
              src={scryfallUrl}
              alt={`{${cleanSym}}`}
              className={`${imgSizes[size]} inline-block shadow-2xs rounded-full`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // If Scryfall SVG fails, switch to CSS fallback badge
                const target = e.currentTarget;
                target.style.display = 'none';
                if (target.nextElementSibling) {
                  (target.nextElementSibling as HTMLElement).style.display = 'inline-flex';
                }
              }}
            />
            {/* Fallback CSS Circle */}
            <span
              style={{ display: 'none' }}
              className={`rounded-full items-center justify-center font-bold font-mono shadow-2xs ${
                sizeClasses[size]
              } ${getManaSymbolStyles(cleanSym)}`}
            >
              {cleanSym}
            </span>
          </span>
        );
      })}
    </span>
  );
};

// Fallback CSS styling for MTG mana symbols
function getManaSymbolStyles(sym: string): string {
  const upper = sym.toUpperCase();
  switch (upper) {
    case 'W':
      return 'bg-amber-100 text-amber-900 border border-amber-300';
    case 'U':
      return 'bg-sky-500 text-white border border-sky-600';
    case 'B':
      return 'bg-slate-900 text-slate-100 border border-slate-700';
    case 'R':
      return 'bg-red-500 text-white border border-red-600';
    case 'G':
      return 'bg-emerald-600 text-white border border-emerald-700';
    case 'C':
      return 'bg-slate-300 text-slate-800 border border-slate-400';
    case 'X':
      return 'bg-slate-400 text-white border border-slate-500';
    default:
      if (!isNaN(Number(upper))) {
        return 'bg-slate-300 text-slate-800 border border-slate-400';
      }
      if (upper.includes('/')) {
        return 'bg-gradient-to-r from-amber-200 to-indigo-200 text-slate-900 border border-slate-400 text-[8px]';
      }
      return 'bg-slate-200 text-slate-700 border border-slate-300';
  }
}
