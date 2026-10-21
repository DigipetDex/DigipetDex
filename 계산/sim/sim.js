// 측정 모델 시뮬레이터. 사용: node sim/sim.js
// 데미지: round((k*전투력 + c + q*전투력²/100) * (1 + dRel*상성) * 100/(100 + g*(방어자 체력-100))) ± spread (균등)
//        체력이 방어를 겸함. 마지막 타는 남은 HP로 잘림
// 명중: 원작 VB BE 비율식 기반 회귀 (hit% = h0 + h1 * 100 * att/(att+def) + hRel * 상성 + hMirror * 같은 종)
export const M = { k: 0.8748, c: -3.17, q: 0, dRel: 0.049, g: 0.05, spread: 4, h0: 32.75, h1: 0.87, hRel: 6.2, hMirror: -8.6 };

// 상성: 백신>바이러스>데이터>백신, 프리는 전부 중립, 불명은 백신·바이러스·데이터에 유리
const BEATS = { 백신: '바이러스', 바이러스: '데이터', 데이터: '백신' };
export function relation(a, d) {
  if (!a || !d || a === d || a === '프리' || d === '프리') return 0;
  if (a === '불명') return d === '불명' ? 0 : 1;
  if (d === '불명') return -1;
  if (BEATS[a] === d) return 1;
  if (BEATS[d] === a) return -1;
  return 0;
}

// 같은 종 여부: name이 둘 다 있고 같을 때만 적용
const mirror = (A, D) => (A.name && A.name === D.name ? 1 : 0);
export const hitP = (A, D, m = M) =>
  Math.min(100, Math.max(0, m.h0 + m.h1 * 100 * A.spd / (A.spd + D.spd) + m.hRel * relation(A.attr, D.attr) + m.hMirror * mirror(A, D))) / 100;

const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// 1회 전투. 승자 'A'|'B'. 속도 높은 쪽 선공, 동속이면 무작위.
export function fight(A, B, m = M) {
  let ha = A.hp, hb = B.hp;
  const aFirst = A.spd > B.spd || (A.spd === B.spd && Math.random() < 0.5);
  const pa = hitP(A, B, m), pb = hitP(B, A, m);
  const base = (X, Y) => Math.round((X.atk * m.k + m.c + (m.q ?? 0) * X.atk * X.atk / 100) * (1 + m.dRel * relation(X.attr, Y.attr)) * 100 / (100 + m.g * (Y.hp - 100)));
  const da = base(A, B), db = base(B, A);
  for (let t = 0; t < 500; t++) {
    for (const side of aFirst ? 'AB' : 'BA') {
      if (side === 'A') { if (Math.random() < pa) hb -= Math.max(1, da + rint(-m.spread, m.spread)); if (hb <= 0) return 'A'; }
      else { if (Math.random() < pb) ha -= Math.max(1, db + rint(-m.spread, m.spread)); if (ha <= 0) return 'B'; }
    }
  }
  return 'D';
}

export function winRate(A, B, n = 20000, m = M) {
  let w = 0;
  for (let i = 0; i < n; i++) if (fight(A, B, m) === 'A') w++;
  return 100 * w / n;
}

if (process.argv[1]?.endsWith('sim.js')) {
  const T = [
    ['시리우스몬', { name: 'S', hp: 550, atk: 135, spd: 110 }, { name: 'S', hp: 300, atk: 135, spd: 210 }, 74.8],
    ['쿠즈하몬', { name: 'K', hp: 540, atk: 120, spd: 140 }, { name: 'K', hp: 280, atk: 120, spd: 240 }, 72.0],
    ['알포스브이드라몬', { name: 'A', hp: 515, atk: 100, spd: 160 }, { name: 'A', hp: 265, atk: 100, spd: 260 }, 86.9],
  ];
  console.log('매치업 | 영자 A승률 | 모델 A승률');
  for (const [n, A, B, obs] of T) console.log(n, obs, winRate(A, B).toFixed(1));
}
