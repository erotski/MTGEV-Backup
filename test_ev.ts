import { calculateEvScore } from './src/utils/evScore';
import { resolveRecursiveProductAudit } from './src/utils/productUtils';
import * as fs from 'fs';

const sealed = JSON.parse(fs.readFileSync('./public/data/sealed_products.json', 'utf8'));
const boosterEv = JSON.parse(fs.readFileSync('./public/data/booster_ev.json', 'utf8'));

// Format boosterEvMap
const boosterEvMap: Record<string, any[]> = {};
boosterEv.forEach((b: any) => {
  const set = (b.setCode || '').toUpperCase();
  if (!boosterEvMap[set]) boosterEvMap[set] = [];
  boosterEvMap[set].push(b);
});

const draftNight = sealed.find((p: any) => p.id === '2e548fa4-96d9-51d8-b001-b1639450dabe');

const audit = resolveRecursiveProductAudit(
  draftNight,
  new Map(sealed.map((p: any) => [p.uuid || p.id, p])),
  {},
  boosterEvMap,
  [],
  {},
  'all_cheapest',
  'direct',
  1
);

console.log(JSON.stringify(audit, null, 2));

const score = calculateEvScore(
  draftNight.marketPrice,
  audit.totalEv,
  audit.totalMinEv,
  audit.totalMid90Ev,
  audit.totalMaxEv,
  false,
  []
);

console.log('Final Score:', score);
