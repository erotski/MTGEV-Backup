function simulateCompositeQuantiles(packItems, iterations = 5000) {
  if (!packItems || packItems.length === 0) return undefined;
  
  // packItems: Array<{ count: number; quantiles?: number[], evAverage?: number }>
  let hasAnyQuantiles = false;
  for (const item of packItems) {
    if (item.quantiles && item.quantiles.length >= 100) hasAnyQuantiles = true;
  }
  if (!hasAnyQuantiles) return undefined;

  const sums = new Float32Array(iterations);
  
  for (let i = 0; i < iterations; i++) {
    let iterationSum = 0;
    
    for (const item of packItems) {
      if (item.quantiles && item.quantiles.length >= 100) {
        const qLen = item.quantiles.length;
        for (let c = 0; c < item.count; c++) {
          const randomIndex = Math.floor(Math.random() * qLen);
          iterationSum += item.quantiles[randomIndex];
        }
      } else if (item.evAverage != null) {
        // Fallback to average for deterministic items
        iterationSum += (item.evAverage * item.count);
      }
    }
    
    sums[i] = iterationSum;
  }
  
  sums.sort();
  
  const compositeQuantiles = [];
  for (let p = 1; p <= 100; p++) {
    const idx = Math.max(0, Math.min(iterations - 1, Math.floor((p / 100) * iterations) - 1));
    compositeQuantiles.push(Number(sums[idx].toFixed(2)));
  }
  
  return compositeQuantiles;
}

const mockPacks = [
  { count: 12, quantiles: Array.from({length: 100}, (_, i) => i) },
  { count: 1, quantiles: Array.from({length: 100}, (_, i) => i * 10) }
];
console.log(simulateCompositeQuantiles(mockPacks, 5000).slice(0, 10));
