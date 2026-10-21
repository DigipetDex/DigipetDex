// 승률 계산 / 훈련 배분 최적화 CLI
//
// 승률:  node calc.js win "체550 전135 속110 백신" "체300 전135 속210 데이터"
//   앞에 이름을 붙이면("제스몬 체410 ...") 같은 종끼리일 때 명중 보정(-8%p)을 적용
// 최적화: node calc.js opt --base "체290 전140 속110 데이터" --n 30 --great 1 --vs "체485 전285 속170 백신" [--vs ...]
//   --base  종족값(훈련 전) + 속성
//   --n     훈련 횟수 (실패는 0으로 보고 성공한 횟수만 넣어도 됨)
//   --great 성공 중 대성공 비율 0~1 (기본 1 = 전부 대성공). 기대값으로 계산
//   --plus  플러그인 등 추가 스탯 "체25 전10 속10" (선택)
//   --vs    상대 (여러 개 가능, 평균 승률로 최적화)
import { winRate, M } from './sim.js';

// 파라미터 불확실성: 체력 감산 g의 그럴듯한 범위에서 승률이 얼마나 흔들리는지 표시
const VARIANTS = [{ g: 0.04 }, { g: 0.06 }, { g: 0.07, k: 0.8844, c: -3.33 }];

// 훈련 1회당 증가량 (대성공, 성공)
const GAIN = { hp: [25, 15], atk: [10, 5], spd: [10, 5] };
const ATTRS = ['백신', '바이러스', '데이터', '프리', '불명'];

function parse(s) {
  const num = (re) => Number(s.match(re)?.[1] ?? 0);
  return {
    hp: num(/체(?:력)?\s*(\d+)/), atk: num(/전(?:투력)?\s*(\d+)/), spd: num(/속(?:도)?\s*(\d+)/),
    attr: ATTRS.find((a) => s.includes(a)) ?? '',
    // 첫 단어가 스탯/속성이 아니면 디지몬 이름 (같은 종 명중 보정용)
    name: (/^\s*([^\s\d]+)/.exec(s)?.[1] ?? '').replace(/^(체|전|속).*|^(백신|바이러스|데이터|프리|불명)$/, ''),
  };
}
const fmt = (d) => `${d.name ? d.name + ' ' : ''}체${Math.round(d.hp)} 전${Math.round(d.atk)} 속${Math.round(d.spd)}${d.attr ? ' ' + d.attr : ''}`;

function args(argv) {
  const o = { vs: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (k === 'vs') o.vs.push(argv[++i]); else o[k] = argv[++i];
  }
  return o;
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'win') {
  const A = parse(rest[0]), B = parse(rest[1]);
  console.log(`${fmt(A)}  vs  ${fmt(B)}`);
  const w = winRate(A, B, 100000);
  const alt = VARIANTS.map((v) => winRate(A, B, 30000, { ...M, ...v }));
  console.log(`A 승률 ${w.toFixed(1)}%  (불확실성 범위 ${Math.min(w, ...alt).toFixed(1)}~${Math.max(w, ...alt).toFixed(1)}%)`);
  if (Math.max(w, ...alt) - Math.min(w, ...alt) > 10) console.log('주의: 타수 경계에 걸린 조합이라 결과가 파라미터에 민감함');
} else if (cmd === 'opt') {
  const o = args(rest);
  const base = parse(o.base), plus = parse(o.plus ?? ''), n = Number(o.n ?? 30), g = Number(o.great ?? 1);
  const foes = o.vs.map(parse);
  if (!foes.length) throw new Error('--vs 상대를 1개 이상 넣어야 함');
  const per = (k) => g * GAIN[k][0] + (1 - g) * GAIN[k][1];
  const build = (h, a, s) => ({
    hp: base.hp + plus.hp + h * per('hp'), atk: base.atk + plus.atk + a * per('atk'),
    spd: base.spd + plus.spd + s * per('spd'), attr: base.attr, name: base.name,
  });
  const score = (d, sims) => foes.reduce((t, f) => t + winRate(d, f, sims), 0) / foes.length;

  // 1차: 전 조합을 적은 표본으로 훑고, 2차: 상위 10개를 큰 표본으로 재평가
  const rows = [];
  for (let h = 0; h <= n; h++) for (let a = 0; a <= n - h; a++) {
    const s = n - h - a, d = build(h, a, s);
    rows.push({ h, a, s, d, w: score(d, 1500) });
  }
  rows.sort((x, y) => y.w - x.w);
  const top = rows.slice(0, 10).map((r) => ({ ...r, w: score(r.d, 30000) })).sort((x, y) => y.w - x.w);

  console.log(`기본 ${fmt(base)}, 훈련 ${n}회, 대성공 비율 ${g}`);
  console.log(`상대: ${foes.map(fmt).join(' / ')}`);
  console.log('순위 | 체/전/속 훈련 횟수 | 최종 스탯 | 평균 승률');
  top.forEach((r, i) => console.log(`${i + 1} | ${r.h}/${r.a}/${r.s} | ${fmt(r.d)} | ${r.w.toFixed(1)}%`));
} else {
  console.log('사용법:\n  node calc.js win "<A>" "<B>"\n  node calc.js opt --base "<종족값 속성>" --n 30 [--great 1] [--plus "<추가>"] --vs "<상대>" [--vs ...]');
}
