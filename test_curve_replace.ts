const allCurveDataStr = `
  const allCurveData = useMemo(() => {
    const points: Array<{
      percentile: string;
      percentileNum: number;
      all: number;
      all_average: number;
      tcgplayer: number;
      cardmarket: number;
      cardkingdom: number;
      manapool: number;
    }> = [];

    // Map to hold simulated 100-bucket quantiles per vendor
    const vendorSimulations: Record<string, number[]> = {};
    const vendorsToSim = ['all', 'all_average', 'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'];

    if (!isPreconstructed) {
      vendorsToSim.forEach((v) => {
        const fallbackRatios: Record<string, number> = {
          tcgplayer: 1.0,
          cardkingdom: 1.15,
          cardmarket: 0.88,
          manapool: 0.98,
          all: 0.94,
          all_average: 1.0
        };
        const fallbackRatio = fallbackRatios[v] || 1.0;

        let simItems: Array<{count: number, quantiles?: number[], evAverage?: number}> = [];
        
        if (effectivePackItems.length > 0) {
          effectivePackItems.forEach((item) => {
            const count = item.count || 1;
            const setCode = item.set || activeBooster?.setCode || '';
            const code = item.code || item.packName || activeBooster?.boosterName || '';
            let rec: BoosterEVRecord | undefined;
            if (boosterEvMap) {
              rec = findBoosterEv(boosterEvMap, setCode, code, priceMode as any, v as any);
            } else if (allSetBoosters && allSetBoosters.length > 0) {
              rec = allSetBoosters.find(b => 
                (b.boosterName || '').toLowerCase() === code.toLowerCase() &&
                (b.priceMode || 'direct') === priceMode &&
                normalizeVendor(b.vendor) === normalizeVendor(v)
              );
            }
            if (!rec && (activeBooster?.boosterName || '').toLowerCase() === (code || '').toLowerCase()) {
              rec = vendorRecords[v] || activeBooster;
            }

            const modeMult = (priceMode === 'cheapest_reprint' && rec && rec.priceMode !== 'cheapest_reprint') ? 0.82 : 1.0;
            
            let itemQuantiles = rec?.quantiles;
            if (!itemQuantiles || itemQuantiles.length < 100) {
              if (activeBooster?.quantiles && activeBooster.quantiles.length >= 100) {
                itemQuantiles = activeBooster.quantiles.map(q => q * fallbackRatio);
              }
            }

            let itemAvg = rec?.evAverage;
            if (itemAvg == null && activeBooster) {
              itemAvg = activeBooster.evAverage * fallbackRatio;
            }

            if (itemQuantiles && modeMult !== 1.0) {
              itemQuantiles = itemQuantiles.map(q => q * modeMult);
            }
            if (itemAvg != null && modeMult !== 1.0) {
              itemAvg *= modeMult;
            }

            simItems.push({ count, quantiles: itemQuantiles, evAverage: itemAvg });
          });
        } else {
          // Single booster fallback (when packItems is empty)
          const rec = vendorRecords[v] || (v === 'all' ? vendorRecords['all_cheapest'] : undefined);
          const modeMult = (priceMode === 'cheapest_reprint' && rec && rec.priceMode !== 'cheapest_reprint') ? 0.82 : 1.0;
          let itemQuantiles = rec?.quantiles;
          if (!itemQuantiles || itemQuantiles.length < 100) {
             if (activeBooster?.quantiles && activeBooster.quantiles.length >= 100) {
                itemQuantiles = activeBooster.quantiles.map(q => q * fallbackRatio);
             }
          }
          if (itemQuantiles && modeMult !== 1.0) {
             itemQuantiles = itemQuantiles.map(q => q * modeMult);
          }
          simItems.push({ count: scale, quantiles: itemQuantiles, evAverage: (rec?.evAverage || activeBooster?.evAverage || 0) * modeMult });
        }

        // Add baseOffset as a constant offset (count: 1)
        if (baseOffset > 0) {
          simItems.push({ count: 1, evAverage: baseOffset });
        }

        vendorSimulations[v] = simulateCompositeQuantiles(simItems, 5000) || [];
      });
    }

    for (let p = 1; p <= 100; p += 1) {
      if (isPreconstructed) {
        points.push({
          percentile: \`\${p}%\`,
          percentileNum: p,
          all: fixedDeckEv,
          all_average: fixedDeckEv,
          tcgplayer: fixedDeckEv,
          cardmarket: fixedDeckEv,
          cardkingdom: fixedDeckEv,
          manapool: fixedDeckEv,
        });
        continue;
      }
      
      const qIdx = p - 1;
      const getSimVal = (v: string) => {
        const simData = vendorSimulations[v];
        if (simData && simData.length >= 100) {
           return Number(simData[qIdx].toFixed(2));
        }
        return baseOffset;
      };

      const tcgVal = getSimVal('tcgplayer');
      const ckVal = getSimVal('cardkingdom');
      const cmVal = getSimVal('cardmarket');
      const mpVal = getSimVal('manapool');
      const allVal = vendorSimulations['all']?.length >= 100 ? getSimVal('all') : Math.min(tcgVal, ckVal, cmVal, mpVal);
      const allAvgVal = vendorSimulations['all_average']?.length >= 100 ? getSimVal('all_average') : Number(((tcgVal + ckVal + cmVal + mpVal) / 4).toFixed(2));

      points.push({
        percentile: \`\${p}%\`,
        percentileNum: p,
        all: allVal,
        all_average: allAvgVal,
        tcgplayer: tcgVal,
        cardmarket: cmVal,
        cardkingdom: ckVal,
        manapool: mpVal,
      });
    }
    return points;
  }, [
    activeBooster,
    effectivePackItems,
    vendorRecords,
    allSetBoosters,
    boosterEvMap,
    priceMode,
    isPreconstructed,
    fixedDeckEv,
    baseOffset,
    scale,
  ]);
`;
console.log("Ready");
