import React from 'react';
import { SetSymbolIcon } from './SetSymbolIcon';
import { Sparkles } from 'lucide-react';
import { INITIAL_SETS } from '../data';

export type FoilPackLayoutVariant = 'standard' | 'collector' | 'auto';

export function cleanPureSetName(name?: string, code?: string): string {
  // If code is provided and matches known set, check if provided name is generic or full product name
  const matchedSet = code ? INITIAL_SETS.find((s) => s.code.toLowerCase() === code.toLowerCase()) : undefined;

  let cleaned = name || matchedSet?.name || code?.toUpperCase() || 'MAGIC';

  // Remove parenthetical details like (MH3) or (12 Packs)
  cleaned = cleaned.replace(/\s*\([^)]*\)/gi, '');

  // Strip packaging suffixes to extract pure set title
  cleaned = cleaned.replace(
    /\s*(collector|play|draft|set|jumpstart|special|prerelease|theme)\s*(booster\s*(pack|box|display)?|pack|box|display|bundle|case)?/gi,
    ''
  );
  cleaned = cleaned.replace(/\s*(booster\s*(pack|box|display)?|display\s*box|bundle|pack|box|case)/gi, '');

  cleaned = cleaned.trim();

  // If after stripping it became empty (rare), fallback to matched set name or code
  return cleaned || matchedSet?.name || (code ? code.toUpperCase() : 'MAGIC');
}

interface BoosterFoilPackMockupProps {
  setCode: string;
  setName?: string;
  packType?: string;
  cardCount?: number;
  layoutVariant?: FoilPackLayoutVariant;
  themeColor?: 'emerald' | 'navy' | 'crimson' | 'gold' | 'purple' | 'slate';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero' | 'full';
  className?: string;
  onClick?: () => void;
}

export const BoosterFoilPackMockup: React.FC<BoosterFoilPackMockupProps> = ({
  setCode,
  setName,
  packType = 'PLAY BOOSTER',
  cardCount,
  layoutVariant = 'auto',
  themeColor,
  size = 'md',
  className = '',
  onClick,
}) => {
  const cleanCode = (setCode || 'MTG').toUpperCase();
  const displaySetName = cleanPureSetName(setName, cleanCode);
  const displayPackType = (packType || 'PLAY BOOSTER').toUpperCase();

  // Inferred collector state
  const isCollector =
    layoutVariant === 'collector' ||
    (layoutVariant === 'auto' && displayPackType.includes('COLLECTOR'));

  const resolvedCardCount = cardCount ?? (isCollector ? 15 : 14);

  const resolvedThemeColor =
    themeColor || (isCollector ? 'purple' : 'emerald');

  // Dynamic ribbon color presets matching official MTG booster packaging archetypes
  const ribbonStyles = {
    emerald: {
      bg: 'bg-emerald-800',
      gradient: 'from-emerald-950 via-emerald-800 to-teal-950',
      text: 'text-emerald-100',
      border: 'border-emerald-600',
      shadow: 'shadow-emerald-950/40',
      spine: 'from-emerald-800 via-emerald-700 to-emerald-900 border-l border-emerald-500/60',
      spineCrimp: 'from-emerald-900 via-emerald-800 to-emerald-950',
    },
    navy: {
      bg: 'bg-blue-900',
      gradient: 'from-blue-950 via-blue-800 to-indigo-950',
      text: 'text-blue-100',
      border: 'border-blue-600',
      shadow: 'shadow-blue-950/40',
      spine: 'from-blue-800 via-blue-700 to-indigo-900 border-l border-blue-500/60',
      spineCrimp: 'from-blue-900 via-blue-800 to-indigo-950',
    },
    crimson: {
      bg: 'bg-red-900',
      gradient: 'from-red-950 via-red-800 to-rose-950',
      text: 'text-red-100',
      border: 'border-red-600',
      shadow: 'shadow-red-950/40',
      spine: 'from-red-800 via-red-700 to-rose-900 border-l border-red-500/60',
      spineCrimp: 'from-red-900 via-red-800 to-rose-950',
    },
    gold: {
      bg: 'bg-amber-800',
      gradient: 'from-amber-950 via-amber-800 to-yellow-950',
      text: 'text-amber-100',
      border: 'border-amber-600',
      shadow: 'shadow-amber-950/40',
      spine: 'from-amber-700 via-amber-600 to-yellow-800 border-l border-amber-400/60',
      spineCrimp: 'from-amber-900 via-amber-800 to-yellow-950',
    },
    purple: {
      bg: 'bg-purple-800',
      gradient: 'from-purple-950 via-purple-800 to-fuchsia-950',
      text: 'text-purple-100',
      border: 'border-purple-600',
      shadow: 'shadow-purple-950/40',
      spine: 'from-purple-800 via-purple-700 to-fuchsia-900 border-l border-purple-400/70',
      spineCrimp: 'from-purple-950 via-purple-800 to-indigo-950',
    },
    slate: {
      bg: 'bg-slate-900',
      gradient: 'from-slate-950 via-slate-800 to-zinc-950',
      text: 'text-slate-100',
      border: 'border-slate-600',
      shadow: 'shadow-slate-950/40',
      spine: 'from-slate-800 via-slate-700 to-zinc-900 border-l border-slate-500/60',
      spineCrimp: 'from-slate-950 via-slate-800 to-zinc-950',
    },
  };

  const style = ribbonStyles[resolvedThemeColor] || ribbonStyles.purple;

  // Scale configurations
  const dimensions = {
    xs: {
      wrapper: 'w-11',
      crimpHeight: 'h-1.5',
      bodyHeight: 'h-[70px]',
      headerPadding: 'pt-0.5 px-1',
      logoScale: 'scale-[0.4] -my-1',
      fontSizeCards: 'text-[5px]',
      fontSize13: 'text-[5px] w-2.5 h-2.5',
      setNameText: 'text-[5px] leading-tight px-0.5 pb-0.5',
      bannerPadding: 'py-0.5 px-0.5',
      bannerText: 'text-[5px] leading-tight',
      centerMaxHeight: 'max-h-8',
      sideSpineWidth: 'w-2',
      sideSpineText: 'text-[4px] tracking-widest',
    },
    sm: {
      wrapper: 'w-20',
      crimpHeight: 'h-2.5',
      bodyHeight: 'h-32',
      headerPadding: 'pt-1 px-1.5',
      logoScale: 'scale-[0.55] -my-1',
      fontSizeCards: 'text-[7px]',
      fontSize13: 'text-[6px] w-3 h-3',
      setNameText: 'text-[7px] leading-tight px-1 pb-0.5',
      bannerPadding: 'py-1 px-1',
      bannerText: 'text-[6.5px] leading-tight',
      centerMaxHeight: 'max-h-16',
      sideSpineWidth: 'w-4',
      sideSpineText: 'text-[5.5px] tracking-widest',
    },
    md: {
      wrapper: 'w-32',
      crimpHeight: 'h-4',
      bodyHeight: 'h-52',
      headerPadding: 'pt-2 px-2',
      logoScale: 'scale-75 -my-0.5',
      fontSizeCards: 'text-[9px]',
      fontSize13: 'text-[8px] w-4 h-4',
      setNameText: 'text-[9px] font-bold leading-tight px-1.5 pb-1',
      bannerPadding: 'py-1.5 px-1.5',
      bannerText: 'text-[8.5px] leading-tight',
      centerMaxHeight: 'max-h-28',
      sideSpineWidth: 'w-6',
      sideSpineText: 'text-[7.5px] tracking-widest',
    },
    lg: {
      wrapper: 'w-44',
      crimpHeight: 'h-5',
      bodyHeight: 'h-72',
      headerPadding: 'pt-3 px-3',
      logoScale: 'scale-100 my-0.5',
      fontSizeCards: 'text-[11px]',
      fontSize13: 'text-[10px] w-5 h-5',
      setNameText: 'text-xs font-black leading-snug px-2 pb-1.5',
      bannerPadding: 'py-2 px-2',
      bannerText: 'text-[10.5px] leading-snug',
      centerMaxHeight: 'max-h-40',
      sideSpineWidth: 'w-8',
      sideSpineText: 'text-[9.5px] tracking-widest',
    },
    hero: {
      wrapper: 'w-64',
      crimpHeight: 'h-6',
      bodyHeight: 'h-[410px]',
      headerPadding: 'pt-4 px-4',
      logoScale: 'scale-125 my-1.5',
      fontSizeCards: 'text-xs',
      fontSize13: 'text-xs w-6 h-6',
      setNameText: 'text-sm font-black leading-snug px-3 pb-2',
      bannerPadding: 'py-2.5 px-3',
      bannerText: 'text-xs font-black tracking-widest leading-snug',
      centerMaxHeight: 'max-h-56',
      sideSpineWidth: 'w-11',
      sideSpineText: 'text-[11.5px] tracking-widest',
    },
    full: {
      wrapper: 'w-full max-w-[240px]',
      crimpHeight: 'h-5',
      bodyHeight: 'h-72',
      headerPadding: 'pt-3 px-3',
      logoScale: 'scale-100 my-0.5',
      fontSizeCards: 'text-[11px]',
      fontSize13: 'text-[10px] w-5 h-5',
      setNameText: 'text-xs font-black leading-snug px-2 pb-1.5',
      bannerPadding: 'py-2 px-2',
      bannerText: 'text-[10.5px] leading-snug',
      centerMaxHeight: 'max-h-40',
      sideSpineWidth: 'w-8',
      sideSpineText: 'text-[9.5px] tracking-widest',
    },
  };

  const dim = dimensions[size] || dimensions.full || dimensions.hero;

  return (
    <div
      onClick={onClick}
      className={`relative select-none flex flex-col items-center group transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:scale-105 hover:-translate-y-1' : ''
      } ${dim.wrapper} ${className}`}
    >
      {/* 3D Drop Shadow Behind Pack */}
      <div className="absolute -inset-1 bg-black/25 blur-md rounded-xl pointer-events-none -z-10" />

      {/* ============================================================ */}
      {/* 1. TOP FLUTED METALLIC FOIL CRIMP SEAL                       */}
      {/* ============================================================ */}
      <div
        className={`w-full ${dim.crimpHeight} relative overflow-hidden rounded-t-[3px] bg-gradient-to-r from-slate-300 via-slate-100 to-slate-300 border-t border-x border-slate-300 shadow-sm flex items-center justify-between`}
      >
        {/* Ribbed crimp texture lines */}
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #64748b 0px, #64748b 1px, transparent 1px, transparent 4px)',
          }}
        />
        {/* Metallic sheen overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-black/15 pointer-events-none" />

        {/* If Collector variant, extend colored spine texture to the right top crimp */}
        {isCollector && (
          <div
            className={`absolute top-0 right-0 bottom-0 ${dim.sideSpineWidth} bg-gradient-to-b ${style.spineCrimp} opacity-90 border-l border-purple-400/40`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-white/30" />
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 2. MAIN PACK FOIL WRAPPER BODY                              */}
      {/* ============================================================ */}
      <div
        className={`w-full ${dim.bodyHeight} bg-white border-x border-slate-200 shadow-xl relative flex overflow-hidden`}
      >
        {/* BASE 3D LIGHTING & SPECULAR HIGHLIGHTS */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-200/50 via-white to-slate-200/50 pointer-events-none z-0" />
        <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/15 to-transparent pointer-events-none z-10" />

        {/* ============================================================ */}
        {/* SHINY FOIL & HOLOGRAPHIC PRISMATIC LAYER (SPECIAL COLLECTOR)  */}
        {/* ============================================================ */}
        {isCollector ? (
          <>
            {/* Prismatic Rainbow Holographic Sheen (Authentic Collector Foil) */}
            <div
              className="absolute -inset-full opacity-40 group-hover:opacity-75 transition-opacity duration-700 pointer-events-none z-20"
              style={{
                background:
                  'linear-gradient(135deg, transparent 20%, rgba(236,72,153,0.25) 35%, rgba(245,158,11,0.3) 45%, rgba(16,185,129,0.3) 55%, rgba(6,182,212,0.3) 65%, rgba(168,85,247,0.35) 75%, transparent 90%)',
                transform: 'rotate(-25deg)',
              }}
            />

            {/* Specular Diagonal Light Beams (Gleam Effect) */}
            <div className="absolute -inset-full bg-gradient-to-tr from-transparent via-white/50 to-transparent rotate-35 pointer-events-none z-20 opacity-80 group-hover:translate-x-12 transition-transform duration-1000" />
            
            {/* Shimmer Glints */}
            <div className="absolute top-3 left-4 pointer-events-none z-30 opacity-80 animate-pulse">
              <Sparkles className="w-3 h-3 text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.9)]" />
            </div>
            <div className="absolute bottom-10 right-8 pointer-events-none z-30 opacity-70">
              <Sparkles className="w-2.5 h-2.5 text-purple-300 drop-shadow-[0_0_4px_rgba(192,132,252,0.8)]" />
            </div>

            {/* Pearlescent Metallic Finish Layer */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-purple-100/20 to-indigo-100/30 mix-blend-color-dodge pointer-events-none z-10" />
          </>
        ) : (
          <>
            {/* Standard Foil Light Reflex */}
            <div className="absolute -inset-full bg-gradient-to-tr from-transparent via-white/40 to-transparent rotate-45 pointer-events-none z-10 opacity-70 group-hover:opacity-100 transition-opacity" />
          </>
        )}

        {/* ============================================================ */}
        {/* MAIN BODY CONTENT (LEFT / CENTER AREA)                       */}
        {/* ============================================================ */}
        <div className="flex-1 flex flex-col justify-between relative z-20">
          {/* TOP HEADER SECTION */}
          <div className={`flex flex-col items-center ${dim.headerPadding}`}>
            {/* Card Count & 13+ Badges */}
            <div className="w-full flex items-center justify-between text-slate-800 font-bold font-sans">
              <span
                className={`${dim.fontSizeCards} tracking-wider font-extrabold text-slate-700 uppercase`}
              >
                {resolvedCardCount} CARDS
              </span>
              <div
                className={`${dim.fontSize13} rounded-full border border-slate-700 bg-slate-900 text-white font-extrabold flex items-center justify-center shadow-xs`}
              >
                13+
              </div>
            </div>

            {/* MTG Planeswalker Emblem + Classic Logo */}
            <div
              className={`flex flex-col items-center transform ${dim.logoScale} origin-top`}
            >
              {/* Planeswalker 5-Prong Flame Icon */}
              <svg
                viewBox="0 0 100 70"
                className={`w-10 h-7 ${
                  isCollector
                    ? 'text-orange-500 filter drop-shadow-[0_1px_3px_rgba(249,115,22,0.6)]'
                    : 'text-amber-600 drop-shadow-sm'
                } fill-current`}
              >
                <path d="M50 0 L55 24 L63 20 L58 42 L66 40 L50 70 L34 40 L42 42 L37 20 L45 24 Z" />
                <path
                  d="M22 22 L31 34 L20 40 L28 48 L10 60 L24 38 L16 34 Z"
                  opacity="0.95"
                />
                <path
                  d="M78 22 L69 34 L80 40 L72 48 L90 60 L76 38 L84 34 Z"
                  opacity="0.95"
                />
              </svg>
              <div className="font-serif tracking-widest font-black text-[9px] text-slate-900 uppercase -mt-1 scale-y-110">
                MAGIC
              </div>
              <div className="font-sans font-bold text-[5.5px] tracking-wider text-slate-600 uppercase -mt-0.5">
                THE GATHERING
              </div>
            </div>
          </div>

          {/* CENTER CANVAS: EXPANDED VECTOR SET SYMBOL (5% SIDE MARGINS) */}
          <div className="flex-1 w-full flex items-center justify-center my-auto px-[5%] py-1 overflow-hidden">
            <div
              className={`w-full ${dim.centerMaxHeight} flex items-center justify-center group-hover:scale-105 transition-transform duration-300`}
            >
              <SetSymbolIcon
                setCode={cleanCode}
                size="full"
                className="w-full h-full object-contain drop-shadow-md"
              />
            </div>
          </div>

          {/* LOWER SECTION */}
          {isCollector ? (
            /* COLLECTOR BOOSTER: SET NAME AT BOTTOM ON PEARL CANVAS (NO HORIZONTAL BOX) */
            <div className={`w-full text-center pb-2 px-1`}>
              <span className={`font-serif font-black text-slate-900 tracking-tight uppercase line-clamp-2 drop-shadow-xs ${dim.setNameText}`}>
                {displaySetName}
              </span>
            </div>
          ) : (
            /* STANDARD / PLAY BOOSTER: SET NAME (ABOVE BOX) + PRODUCT TYPE (ON BOTTOM COLORED BOX) */
            <div className="w-full flex flex-col items-center">
              <div className={`w-full text-center ${dim.setNameText}`}>
                <span className="font-serif font-black text-slate-900 tracking-tight uppercase line-clamp-2 drop-shadow-xs">
                  {displaySetName}
                </span>
              </div>

              <div
                className={`w-full bg-gradient-to-r ${style.gradient} border-t ${style.border} text-center shadow-inner flex items-center justify-center ${dim.bannerPadding}`}
              >
                <span
                  className={`font-sans font-black uppercase text-white drop-shadow-md text-center line-clamp-1 px-1 ${dim.bannerText}`}
                >
                  {displayPackType}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* 3. VERTICAL COLORED RIGHT SPINE (FOR COLLECTOR BOOSTER)      */}
        {/* ============================================================ */}
        {isCollector && (
          <div
            className={`${dim.sideSpineWidth} bg-gradient-to-b ${style.spine} flex flex-col items-center justify-center relative overflow-hidden shadow-lg z-20`}
          >
            {/* Metallic foil shine along vertical spine */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/25 via-transparent to-black/25 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none" />

            {/* Vertical Typography: COLLECTOR BOOSTER */}
            <span
              className={`font-sans font-black uppercase text-white tracking-widest -rotate-90 origin-center whitespace-nowrap select-none drop-shadow-md ${dim.sideSpineText}`}
            >
              {displayPackType}
            </span>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. BOTTOM FLUTED METALLIC FOIL CRIMP SEAL                    */}
      {/* ============================================================ */}
      <div
        className={`w-full ${dim.crimpHeight} relative overflow-hidden rounded-b-[3px] bg-gradient-to-r from-slate-300 via-slate-100 to-slate-300 border-b border-x border-slate-300 shadow-md flex items-center justify-between`}
      >
        {/* Ribbed crimp texture lines */}
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #64748b 0px, #64748b 1px, transparent 1px, transparent 4px)',
          }}
        />
        {/* Metallic bottom shadow */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/40 pointer-events-none" />

        {/* If Collector variant, extend colored spine texture to the right bottom crimp */}
        {isCollector && (
          <div
            className={`absolute top-0 right-0 bottom-0 ${dim.sideSpineWidth} bg-gradient-to-t ${style.spineCrimp} opacity-90 border-l border-purple-400/40`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-white/30" />
          </div>
        )}
      </div>
    </div>
  );
};
