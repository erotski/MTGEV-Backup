import React, { useState } from 'react';
import { cleanPureSetName } from './BoosterFoilPackMockup';

export interface BoosterDisplayBoxMockupProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero' | 'full';
  className?: string;
  onClick?: () => void;
  setCode?: string;
  setName?: string;
  productType?: string;
  themeColor?: 'emerald' | 'navy' | 'crimson' | 'gold' | 'purple' | 'slate';
  packCount?: number;
  artUrl?: string;
}

export const BoosterDisplayBoxMockup: React.FC<BoosterDisplayBoxMockupProps> = ({
  size = 'md',
  className = '',
  onClick,
  setCode = 'MH3',
  setName = 'Modern Horizons 3',
  productType = 'play',
  themeColor,
}) => {
  const [imgError, setImgError] = useState(false);
  const cleanCode = (setCode || 'MH3').toUpperCase();
  const displaySetName = cleanPureSetName(setName, cleanCode);
  const scryfallSymbolUrl = `https://svgs.scryfall.io/sets/${cleanCode.toLowerCase()}.svg`;

  // Scale constants for 200 mm (W) x 130 mm (D) x 50 mm (H) ratios
  const scale = {
    xs: 0.45,
    sm: 0.75,
    md: 1.0,
    lg: 1.3,
    hero: 1.7,
  }[size] || 1.0;

  // Geometric calculations:
  // Flat display box with front-facing angle
  const H = 46 * scale;
  const ribbonH = H * 0.28; // Bottom ribbon proportion matching booster foil pack
  const whiteH = H - ribbonH;

  // Origin is Front-Left vertical edge at bottom
  const ox = 48 * scale;
  const oy = 88 * scale;

  // Vector for Front Face (wide, facing front with gentle slant)
  const fx = 168 * scale;
  const fy = -10 * scale;

  // Vector for Left Side Depth
  const dx = -38 * scale;
  const dy = -24 * scale;

  // Vertical height vector
  const hz = -H;
  const rz = -ribbonH;

  // Determine theme / ribbon color presets matching BoosterFoilPackMockup exactly:
  // Play Booster defaults to emerald (like modern MTG Play packs: emerald-950 via emerald-800 to teal-950)
  // Draft Booster -> navy
  // Collector Booster -> purple
  // Set Booster -> gold
  // Jumpstart -> emerald
  const isCollector = (productType || '').toLowerCase().includes('collector');
  const isDraft = (productType || '').toLowerCase().includes('draft');
  const isSet = (productType || '').toLowerCase().includes('set');
  const isJumpstart = (productType || '').toLowerCase().includes('jumpstart');

  const resolvedColorKey = (() => {
    if (themeColor) return themeColor;
    if (isCollector) return 'purple';
    if (isDraft) return 'navy';
    if (isSet) return 'gold';
    if (isJumpstart) return 'emerald';
    return 'emerald'; // Default for Play Boosters
  })();

  // Exact color definitions matching foil pack themes from BoosterFoilPackMockup:
  const themeGradients = {
    emerald: {
      from: '#022c22', // from-emerald-950
      via: '#065f46',  // via-emerald-800
      to: '#042f2e',   // to-teal-950
      sideFrom: '#064e3b',
      sideTo: '#022c22',
      text: '#ffffff',
      border: '#059669', // border-emerald-600
    },
    navy: {
      from: '#172554', // from-blue-950
      via: '#1e40af',  // via-blue-800
      to: '#1e1b4b',   // to-indigo-950
      sideFrom: '#1e3a8a',
      sideTo: '#0f172a',
      text: '#ffffff',
      border: '#2563eb', // border-blue-600
    },
    crimson: {
      from: '#450a0a', // from-red-950
      via: '#991b1b',  // via-red-800
      to: '#4c0519',   // to-rose-950
      sideFrom: '#7f1d1d',
      sideTo: '#450a0a',
      text: '#ffffff',
      border: '#dc2626', // border-red-600
    },
    gold: {
      from: '#451a03', // from-amber-950
      via: '#92400e',  // via-amber-800
      to: '#713f12',   // to-yellow-950
      sideFrom: '#78350f',
      sideTo: '#451a03',
      text: '#ffffff',
      border: '#d97706', // border-amber-600
    },
    purple: {
      from: '#3b0764', // from-purple-950
      via: '#6b21a8',  // via-purple-800
      to: '#4a044e',   // to-fuchsia-950
      sideFrom: '#581c87',
      sideTo: '#2e1065',
      text: '#ffffff',
      border: '#9333ea', // border-purple-600
    },
    slate: {
      from: '#09090b', // from-slate-950
      via: '#27272a',  // via-slate-800
      to: '#18181b',   // to-zinc-950
      sideFrom: '#18181b',
      sideTo: '#09090b',
      text: '#ffffff',
      border: '#52525b', // border-slate-600
    },
  }[resolvedColorKey] || {
    from: '#022c22',
    via: '#065f46',
    to: '#042f2e',
    sideFrom: '#064e3b',
    sideTo: '#022c22',
    text: '#ffffff',
    border: '#059669',
  };

  // Normalized booster label reflecting what content the box contains
  const normalizedType = (() => {
    const t = (productType || '').toLowerCase();
    if (t.includes('draft')) return 'DRAFT BOOSTERS';
    if (t.includes('set')) return 'SET BOOSTERS';
    if (t.includes('collector')) return 'COLLECTOR BOOSTERS';
    if (t.includes('jumpstart')) return 'JUMPSTART BOOSTERS';
    return 'PLAY BOOSTERS';
  })();

  // SVG overall dimensions
  const svgW = ox + fx + 16 * scale;
  const svgH = oy + 16 * scale;

  // Front Face polygon coordinates
  const pFrontBottomLeft = `${ox},${oy}`;
  const pFrontBottomRight = `${ox + fx},${oy + fy}`;
  const pFrontRibbonRight = `${ox + fx},${oy + fy + rz}`;
  const pFrontRibbonLeft = `${ox},${oy + rz}`;
  const pFrontTopLeft = `${ox},${oy + hz}`;
  const pFrontTopRight = `${ox + fx},${oy + fy + hz}`;

  // Left Side Face polygon coordinates
  const pSideBottomBack = `${ox + dx},${oy + dy}`;
  const pSideRibbonBack = `${ox + dx},${oy + dy + rz}`;
  const pSideTopBack = `${ox + dx},${oy + dy + hz}`;

  // Top Lid Face polygon coordinates
  const pTopBackCorner = `${ox + fx + dx},${oy + fy + hz + dy}`;

  // Front Face Math for Text Alignment:
  const frontAngle = Math.atan2(fy, fx) * (180 / Math.PI);
  const frontSkew = -Math.atan2(fy, fx) * 0.5;

  const frontTextCenterX = ox + fx / 2;
  const frontTextCenterY = oy + fy / 2 + hz + (whiteH / 2) + 2 * scale;

  const ribbonTextCenterX = ox + fx / 2;
  const ribbonTextCenterY = oy + fy / 2 + rz / 2 + 1.2 * scale;

  // Top Face Center for Logo:
  const topCenterX = ox + (fx + dx) / 2;
  const topCenterY = oy + hz + (fy + dy) / 2;

  // Gradient ID Unique key
  const gradKey = `playbox-${cleanCode}-${resolvedColorKey}`;

  return (
    <div
      onClick={onClick}
      className={`relative select-none inline-flex items-center justify-center group transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:scale-105' : ''
      } ${className}`}
      style={{
        width: `${svgW}px`,
        height: `${svgH * 0.9}px`,
      }}
    >
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-full overflow-visible drop-shadow-md"
      >
        <defs>
          {/* Subtle cardstock white lighting gradients */}
          <linearGradient id={`box-front-white-${gradKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fdfdfd" />
            <stop offset="100%" stopColor="#f4f4f5" />
          </linearGradient>
          <linearGradient id={`box-side-white-${gradKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>
          <linearGradient id={`box-top-white-${gradKey}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8f8fa" />
          </linearGradient>

          {/* Foil Pack Ribbon 3-Stop Gradient Replica (from-via-to) */}
          <linearGradient id={`ribbon-front-${gradKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={themeGradients.from} />
            <stop offset="50%" stopColor={themeGradients.via} />
            <stop offset="100%" stopColor={themeGradients.to} />
          </linearGradient>
          <linearGradient id={`ribbon-side-${gradKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={themeGradients.sideFrom} />
            <stop offset="100%" stopColor={themeGradients.sideTo} />
          </linearGradient>
          {/* Subtle inner shadow on ribbon */}
          <linearGradient id={`ribbon-inner-shadow-${gradKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.3)" />
            <stop offset="25%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
          </linearGradient>
        </defs>

        {/* ---------------------------------------------------- */}
        {/* 1. LEFT SIDE FACE (White Upper + Ribbon Lower)       */}
        {/* ---------------------------------------------------- */}
        {/* Upper White Cardstock */}
        <polygon
          points={`${pFrontRibbonLeft} ${pSideRibbonBack} ${pSideTopBack} ${pFrontTopLeft}`}
          fill={`url(#box-side-white-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Lower Left Ribbon */}
        <polygon
          points={`${pFrontBottomLeft} ${pSideBottomBack} ${pSideRibbonBack} ${pFrontRibbonLeft}`}
          fill={`url(#ribbon-side-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* ---------------------------------------------------- */}
        {/* 2. TOP LID FACE (White Cardstock + Centered Set Logo)*/}
        {/* ---------------------------------------------------- */}
        <polygon
          points={`${pFrontTopLeft} ${pFrontTopRight} ${pTopBackCorner} ${pSideTopBack}`}
          fill={`url(#box-top-white-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* TOP FACE: SET LOGO */}
        <g
          transform={`translate(${topCenterX}, ${topCenterY}) skewX(22) rotate(4) scale(1, 0.52)`}
        >
          {!imgError ? (
            <image
              href={scryfallSymbolUrl}
              x={-19 * scale}
              y={-19 * scale}
              width={38 * scale}
              height={38 * scale}
              onError={() => setImgError(true)}
              style={{ filter: 'brightness(0)' }}
            />
          ) : (
            <g transform="translate(0, 0)">
              <path
                d="M0 -10 L2.5 -2.5 L10 0 L2.5 2.5 L0 10 L-2.5 2.5 L-10 0 L-2.5 -2.5 Z"
                fill="#171717"
                transform={`scale(${1.2 * scale})`}
              />
              <text
                x="0"
                y={14 * scale}
                textAnchor="middle"
                fill="#171717"
                fontFamily="monospace"
                fontWeight="900"
                fontSize={`${8 * scale}px`}
              >
                {cleanCode}
              </text>
            </g>
          )}
        </g>

        {/* ---------------------------------------------------- */}
        {/* 3. FRONT FACE: UPPER WHITE AREA + SET NAME           */}
        {/* ---------------------------------------------------- */}
        <polygon
          points={`${pFrontRibbonLeft} ${pFrontRibbonRight} ${pFrontTopRight} ${pFrontTopLeft}`}
          fill={`url(#box-front-white-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* FRONT FACE SET NAME (Serif black uppercase) */}
        <g
          transform={`translate(${frontTextCenterX}, ${frontTextCenterY}) rotate(${frontAngle}) skewY(${frontSkew})`}
        >
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#0a0a0a"
            fontFamily="serif"
            fontWeight="900"
            fontSize={
              displaySetName.length > 20
                ? `${10 * scale}px`
                : displaySetName.length > 14
                ? `${12 * scale}px`
                : `${14 * scale}px`
            }
            letterSpacing="0.04em"
            style={{
              textTransform: 'uppercase',
              filter: 'drop-shadow(0px 0px 0.5px rgba(0,0,0,0.5))',
            }}
          >
            {displaySetName}
          </text>
        </g>

        {/* ---------------------------------------------------- */}
        {/* 4. FRONT FACE: FOIL PACK REPLICA BOTTOM RIBBON       */}
        {/* ---------------------------------------------------- */}
        {/* Main Ribbon Polygon */}
        <polygon
          points={`${pFrontBottomLeft} ${pFrontBottomRight} ${pFrontRibbonRight} ${pFrontRibbonLeft}`}
          fill={`url(#ribbon-front-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* Inner shadow overlay matching pack shadow */}
        <polygon
          points={`${pFrontBottomLeft} ${pFrontBottomRight} ${pFrontRibbonRight} ${pFrontRibbonLeft}`}
          fill={`url(#ribbon-inner-shadow-${gradKey})`}
          pointerEvents="none"
        />

        {/* Foil Pack Accent Top Border Line (e.g. border-emerald-600) */}
        <line
          x1={ox}
          y1={oy + rz}
          x2={ox + fx}
          y2={oy + fy + rz}
          stroke={themeGradients.border}
          strokeWidth="1.2"
        />

        {/* FRONT RIBBON TEXT: e.g. "PLAY BOOSTER" (Matching font & text shadow from pack) */}
        <g
          transform={`translate(${ribbonTextCenterX}, ${ribbonTextCenterY}) rotate(${frontAngle}) skewY(${frontSkew})`}
        >
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="central"
            fill={themeGradients.text}
            fontFamily="sans-serif"
            fontWeight="900"
            fontSize={`${8 * scale}px`}
            letterSpacing="0.1em"
            style={{
              textTransform: 'uppercase',
              filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.8))',
            }}
          >
            {normalizedType}
          </text>
        </g>

        {/* ---------------------------------------------------- */}
        {/* 5. DARK GRAY THIN SEAM LINES (#404040)               */}
        {/* ---------------------------------------------------- */}
        <line
          x1={ox}
          y1={oy}
          x2={ox}
          y2={oy + hz}
          stroke="#404040"
          strokeWidth="1"
        />
        <line
          x1={ox + fx}
          y1={oy + fy}
          x2={ox + fx}
          y2={oy + fy + hz}
          stroke="#404040"
          strokeWidth="1"
        />
        <line
          x1={ox}
          y1={oy + rz}
          x2={ox + dx}
          y2={oy + dy + rz}
          stroke="#404040"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
