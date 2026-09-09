import React, { useState } from 'react';
import { cleanPureSetName } from './BoosterFoilPackMockup';

export interface CollectorBoosterBoxMockupProps {
  setCode: string;
  setName?: string;
  packCount?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero' | 'full';
  className?: string;
  themeColor?: 'emerald' | 'navy' | 'crimson' | 'gold' | 'purple' | 'slate';
  artUrl?: string;
  onClick?: () => void;
}

export const CollectorBoosterBoxMockup: React.FC<CollectorBoosterBoxMockupProps> = ({
  setCode = 'MH3',
  setName = 'Modern Horizons 3',
  packCount = 12,
  size = 'md',
  className = '',
  themeColor = 'purple',
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);
  const cleanCode = (setCode || 'MH3').toUpperCase();
  const displaySetName = cleanPureSetName(setName, cleanCode);
  const scryfallSymbolUrl = `https://svgs.scryfall.io/sets/${cleanCode.toLowerCase()}.svg`;

  // Scale constants for upright collector box
  const scale = {
    xs: 0.45,
    sm: 0.75,
    md: 1.0,
    lg: 1.3,
    hero: 1.7,
  }[size] || 1.0;

  // Box dimensions
  const H = 96 * scale;

  // Origin (Front-Left bottom corner)
  const ox = 38 * scale;
  const oy = 108 * scale;

  // Geometric vectors for ROTATED MORE TOWARDS FRONT:
  // Front face has very gentle slant (fy = -8 instead of -22, angle ~ -3.0 deg)
  // Depth side is shallower (dx = -28, dy = -20)
  const fx = 152 * scale; // Front face total width vector (wider front panel)
  const fy = -8 * scale;  // Very gentle -3° front slant
  const dx = -28 * scale; // Left Side Depth vector X
  const dy = -20 * scale; // Left Side Depth vector Y
  const hz = -H;          // Vertical height

  // Theme color palette matching foil packs
  const themeGradients = {
    purple: {
      bandGrad: ['#581c87', '#4338ca', '#3b0764'],
      sideGrad: ['#3b0764', '#2e1065'],
      text: '#ffffff',
      border: '#c084fc',
    },
    emerald: {
      bandGrad: ['#065f46', '#047857', '#022c22'],
      sideGrad: ['#064e3b', '#022c22'],
      text: '#ffffff',
      border: '#34d399',
    },
    navy: {
      bandGrad: ['#1e40af', '#2563eb', '#0f172a'],
      sideGrad: ['#1e3a8a', '#0f172a'],
      text: '#ffffff',
      border: '#60a5fa',
    },
    crimson: {
      bandGrad: ['#991b1b', '#b91c1c', '#450a0a'],
      sideGrad: ['#7f1d1d', '#450a0a'],
      text: '#ffffff',
      border: '#f87171',
    },
    gold: {
      bandGrad: ['#92400e', '#b45309', '#451a03'],
      sideGrad: ['#78350f', '#451a03'],
      text: '#ffffff',
      border: '#fbbf24',
    },
    slate: {
      bandGrad: ['#27272a', '#3f3f46', '#09090b'],
      sideGrad: ['#18181b', '#09090b'],
      text: '#ffffff',
      border: '#a1a1aa',
    },
  }[themeColor || 'purple'];

  // Right colored box is 60% narrower: 15% width of front face (85% white area)
  const whiteRatio = 0.85;
  const splitFx = fx * whiteRatio;
  const splitFy = fy * whiteRatio;

  // Coordinates: White Front Area (85% width on left of front face)
  const pBottomLeft = `${ox},${oy}`;
  const pBottomSplit = `${ox + splitFx},${oy + splitFy}`;
  const pTopSplit = `${ox + splitFx},${oy + splitFy + hz}`;
  const pTopLeft = `${ox},${oy + hz}`;

  // Coordinates: Themed Right Band (15% width on right of front face)
  const pBottomRight = `${ox + fx},${oy + fy}`;
  const pTopRight = `${ox + fx},${oy + fy + hz}`;

  // Left Side Face (Slanted backwards-left)
  const pSideBottomBack = `${ox + dx},${oy + dy}`;
  const pSideTopBack = `${ox + dx},${oy + dy + hz}`;

  // Top Face (Split)
  const pTopBackSplit = `${ox + splitFx + dx},${oy + splitFy + hz + dy}`;
  const pTopBackRight = `${ox + fx + dx},${oy + fy + hz + dy}`;

  // Front rotation angle and skew for text alignment
  const frontAngle = Math.atan2(fy, fx) * (180 / Math.PI); // approx -3.0 degrees
  const frontSkew = -Math.atan2(fy, fx) * 0.5;

  // Center coordinates
  const whiteCenterX = ox + splitFx / 2;
  const whiteCenterY = oy + splitFy / 2 + hz / 2;

  const bandCenterX = ox + splitFx + (fx - splitFx) / 2;
  const bandCenterY = oy + splitFy + (fy - splitFy) / 2 + hz / 2;

  const svgW = ox + fx + 16 * scale;
  const svgH = oy + 16 * scale;

  const gradKey = `coll-${cleanCode}-${themeColor || 'purple'}`;

  return (
    <div
      onClick={onClick}
      className={`relative select-none inline-flex items-center justify-center group transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:scale-105' : ''
      } ${className}`}
      style={{
        width: `${svgW}px`,
        height: `${svgH * 0.95}px`,
      }}
    >
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-full overflow-visible drop-shadow-lg"
      >
        <defs>
          <linearGradient id={`coll-front-white-${gradKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8f8f8" />
          </linearGradient>
          <linearGradient id={`coll-band-${gradKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={themeGradients.bandGrad[0]} />
            <stop offset="50%" stopColor={themeGradients.bandGrad[1]} />
            <stop offset="100%" stopColor={themeGradients.bandGrad[2]} />
          </linearGradient>
          <linearGradient id={`coll-side-${gradKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>
        </defs>

        {/* ---------------------------------------------------- */}
        {/* 1. LEFT SIDE FACE (Clean White Cardstock)            */}
        {/* ---------------------------------------------------- */}
        <polygon
          points={`${pBottomLeft} ${pSideBottomBack} ${pSideTopBack} ${pTopLeft}`}
          fill={`url(#coll-side-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* ---------------------------------------------------- */}
        {/* 2. TOP LID FACE (Clean White + Themed Right Tip)     */}
        {/* ---------------------------------------------------- */}
        <polygon
          points={`${pTopLeft} ${pTopSplit} ${pTopBackSplit} ${pSideTopBack}`}
          fill="#ffffff"
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points={`${pTopSplit} ${pTopRight} ${pTopBackRight} ${pTopBackSplit}`}
          fill={themeGradients.bandGrad[2]}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* ---------------------------------------------------- */}
        {/* 3. FRONT FACE: LEFT WHITE MAIN AREA (85% Width)      */}
        {/* ---------------------------------------------------- */}
        <polygon
          points={`${pBottomLeft} ${pBottomSplit} ${pTopSplit} ${pTopLeft}`}
          fill={`url(#coll-front-white-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* 3a. Header text: "12-PACK DISPLAY" & "13+" */}
        <g
          transform={`translate(${whiteCenterX}, ${whiteCenterY + hz * 0.38}) rotate(${frontAngle}) skewY(${frontSkew})`}
        >
          <text
            x={-splitFx * 0.38}
            y="0"
            textAnchor="start"
            dominantBaseline="central"
            fill="#525252"
            fontFamily="monospace"
            fontWeight="bold"
            fontSize={`${7 * scale}px`}
            letterSpacing="0.06em"
          >
            {packCount}-PACK DISPLAY
          </text>
          <text
            x={splitFx * 0.38}
            y="0"
            textAnchor="end"
            dominantBaseline="central"
            fill="#171717"
            fontFamily="sans-serif"
            fontWeight="900"
            fontSize={`${6.5 * scale}px`}
          >
            13+
          </text>
        </g>

        {/* 3b. Center Set Logo with "MAGIC THE GATHERING" */}
        <g
          transform={`translate(${whiteCenterX}, ${whiteCenterY - 4 * scale}) rotate(${frontAngle}) skewY(${frontSkew})`}
        >
          <text
            x="0"
            y={-19 * scale}
            textAnchor="middle"
            fill="#171717"
            fontFamily="serif"
            fontWeight="900"
            fontSize={`${6 * scale}px`}
            letterSpacing="0.15em"
          >
            MAGIC
          </text>
          <text
            x="0"
            y={-14 * scale}
            textAnchor="middle"
            fill="#525252"
            fontFamily="sans-serif"
            fontWeight="bold"
            fontSize={`${3.8 * scale}px`}
            letterSpacing="0.18em"
          >
            THE GATHERING
          </text>

          {/* Scryfall Vector Set Logo */}
          {!imgError ? (
            <image
              href={scryfallSymbolUrl}
              x={-18 * scale}
              y={-10 * scale}
              width={36 * scale}
              height={36 * scale}
              onError={() => setImgError(true)}
              style={{ filter: 'brightness(0)' }}
            />
          ) : (
            <path
              d="M0 -10 L3 -2 L10 0 L3 2 L0 10 L-3 2 L-10 0 L-3 -2 Z"
              fill="#171717"
              transform={`scale(${1.2 * scale}) translate(0, 5)`}
            />
          )}
        </g>

        {/* 3c. Bottom Set Title in bold serif */}
        <g
          transform={`translate(${whiteCenterX}, ${whiteCenterY - hz * 0.36}) rotate(${frontAngle}) skewY(${frontSkew})`}
        >
          <line
            x1={-splitFx * 0.42}
            y1={-6 * scale}
            x2={splitFx * 0.42}
            y2={-6 * scale}
            stroke="#e5e5e5"
            strokeWidth="0.8"
          />
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
                ? `${9 * scale}px`
                : displaySetName.length > 14
                ? `${10.5 * scale}px`
                : `${12 * scale}px`
            }
            letterSpacing="0.04em"
            style={{
              textTransform: 'uppercase',
            }}
          >
            {displaySetName}
          </text>
        </g>

        {/* ---------------------------------------------------- */}
        {/* 4. FRONT FACE: RIGHT THEMED BAND (15% Width)         */}
        {/* ---------------------------------------------------- */}
        <polygon
          points={`${pBottomSplit} ${pBottomRight} ${pTopRight} ${pTopSplit}`}
          fill={`url(#coll-band-${gradKey})`}
          stroke="#404040"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* Thin accent border along the split */}
        <line
          x1={ox + splitFx}
          y1={oy + splitFy}
          x2={ox + splitFx}
          y2={oy + splitFy + hz}
          stroke={themeGradients.border}
          strokeWidth="0.8"
          opacity="0.8"
        />

        {/* 4a. Vertical Text: COLLECTOR BOOSTERS (Bottom to Top) */}
        <g
          transform={`translate(${bandCenterX}, ${bandCenterY}) rotate(${frontAngle}) skewY(${frontSkew})`}
        >
          <g transform="rotate(-90)">
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fill={themeGradients.text}
              fontFamily="sans-serif"
              fontWeight="900"
              fontSize={`${7 * scale}px`}
              letterSpacing="0.14em"
              style={{
                textTransform: 'uppercase',
                filter: 'drop-shadow(0px 0px 1px rgba(0,0,0,0.8))',
              }}
            >
              COLLECTOR BOOSTERS
            </text>
          </g>
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
      </svg>
    </div>
  );
};
