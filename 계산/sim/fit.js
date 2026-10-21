import { winRate } from './sim.js';
const T = [
  [{ hp: 550, atk: 135, spd: 110 }, { hp: 300, atk: 135, spd: 210 }, 74.8],
  [{ hp: 540, atk: 120, spd: 140 }, { hp: 280, atk: 120, spd: 240 }, 72.0],
  [{ hp: 515, atk: 100, spd: 160 }, { hp: 265, atk: 100, spd: 260 }, 86.9],
];
const base = { k: 0.76, spread: 4, b0: -0.289, bAtt: -0.223, bDef: 0.084 };
const rows = [];
for (const k of [0.6, 0.7, 0.76, 0.85, 1.0])
  for (const s of [0.5, 1, 1.5, 2]) {
    const m = { ...base, k, bAtt: base.bAtt * s, bDef: base.bDef * s };
    const r = T.map(([A, B]) => winRate(A, B, 4000, m));
    const err = r.reduce((a, x, i) => a + Math.abs(x - T[i][2]), 0) / 3;
    rows.push({ k, s, r: r.map(x => x.toFixed(1)).join(' / '), err: err.toFixed(1) });
  }
rows.sort((a, b) => a.err - b.err);
console.log('관측: 74.8 / 72.0 / 86.9');
console.table(rows.slice(0, 8));
