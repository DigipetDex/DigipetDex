// 현재 추정 전투 모델 (계산/sim/sim.js의 M과 같은 값. 그쪽을 다시 맞추면 여기도 갱신)
// 데미지: round((k*전투력 + c) * (1 + dRel*상성) * 100/(100 + g*(방어자 체력-100))) ± spread
// 명중: h0 + h1 * 100 * 내속/(내속+상대속) + hRel * 상성 + hMirror * 같은 종
export const M = { k: 0.8748, c: -3.17, dRel: 0.049, g: 0.05, spread: 4, h0: 32.75, h1: 0.87, hRel: 6.2, hMirror: -8.6 };

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

// A, D: { name, attr, hp, atk, spd } (숫자)
export const hitP = (A, D, m = M) =>
  Math.min(100, Math.max(0, m.h0 + m.h1 * 100 * A.spd / (A.spd + D.spd) + m.hRel * relation(A.attr, D.attr)
    + m.hMirror * (A.name && A.name === D.name ? 1 : 0))) / 100;

export const baseDmg = (A, D, m = M) =>
  Math.max(1, Math.round((m.k * A.atk + m.c) * (1 + m.dRel * relation(A.attr, D.attr)) * 100 / (100 + m.g * (D.hp - 100))));
