import React, { useState, useEffect } from 'react';

interface SetSymbolIconProps {
  setCode: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  alt?: string;
}

export const SetSymbolIcon: React.FC<SetSymbolIconProps> = ({
  setCode,
  className = '',
  size = 'sm',
  alt,
}) => {
  const [hasError, setHasError] = useState(false);
  const cleanCode = (setCode || '').trim().toLowerCase();

  useEffect(() => {
    setHasError(false);
  }, [cleanCode]);

  // Size mapping
  const sizeClasses = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-12 h-12',
    '2xl': 'w-16 h-16',
    '3xl': 'w-20 h-20',
    full: 'w-full h-full max-h-full',
  };

  const scryfallSvgUrl = `https://svgs.scryfall.io/sets/${cleanCode}.svg`;

  if (hasError || !cleanCode) {
    return (
      <span
        className={`inline-flex items-center justify-center font-mono font-black text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300 ${className}`}
      >
        {setCode.slice(0, 4)}
      </span>
    );
  }

  return (
    <img
      src={scryfallSvgUrl}
      alt={alt || `${setCode} set symbol`}
      onError={() => setHasError(true)}
      className={`inline-block object-contain filter drop-shadow-sm ${sizeClasses[size]} ${className}`}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
};
