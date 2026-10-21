// logs/*.csv를 읽어 조건(양측 이름·스탯)별 통계를 만든다.
// 타마다 그 판의 스탯으로 모델 예측(model.js)을 계산해 실측과 나란히 합산한다.
import fs from 'node:fs';
import { hitP, baseDmg } from './model.js';

const read = (p) => {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').replace(/^﻿/, '').trim().split('\n').slice(1).filter(Boolean).map((l) => l.split(','));
};

// 조건 키: 모드 | 1팀 이름 체/전/속 | 2팀 이름 체/전/속
// 탐험의 야생 적은 스탯이 매번 랜덤이라 상대를 '야생' 하나로 묶음
// 문장이 있으면 스탯 뒤에 [문장]을 붙여 따로 집계 (문장 없던 예전 기록은 키 그대로)
const CREST_KO = { courage: '용기', friendship: '우정', love: '사랑', purity: '순수', innocence: '순수', knowledge: '지식',
  sincerity: '순수', reliability: '성실', hope: '희망', light: '빛', kindness: '친절', miracle: '기적', miracles: '기적' };
export const crestName = c => (c ? CREST_KO[c] ?? c : '');
const st = f => `${f.hp}/${f.atk}/${f.spd}${f.crest ? `[${crestName(f.crest)}]` : ''}`;
export const condKey = (mode, n1, f1, n2, f2) => mode === 'explore'
  ? `explore|${n1} ${st(f1)}|야생`
  : `${mode || 'regular'}|${n1} ${st(f1)}|${n2} ${st(f2)}`;

const newSide = () => ({ n: 0, hit: 0, p: 0, v: 0, dmg: [], pd: [] });
function add(s, hit, p, dmg, pd) {
  s.n++; s.p += p; s.v += p * (1 - p);
  if (hit) { s.hit++; if (dmg != null) { s.dmg.push(dmg); s.pd.push(pd); } }
}

export function collect(dir = 'logs') {
  const bat = read(`${dir}/battles.csv`), ev = read(`${dir}/events.csv`);
  const byB = new Map();
  for (const e of ev) { if (!byB.has(e[0])) byB.set(e[0], []); byB.get(e[0]).push(e); }
  const conds = new Map();
  for (const b of bat) {
    const mode = b[2] || 'regular', explore = mode === 'explore';
    const S = [
      { name: b[3], attr: b[4], hp: +b[6], atk: +b[7], spd: +b[8], owner: b[17] },
      { name: b[9], attr: b[10], hp: +b[12], atk: +b[13], spd: +b[14], owner: b[18] || (explore ? '야생' : '') },
    ];
    const key = condKey(mode, b[3], { hp: b[6], atk: b[7], spd: b[8], crest: b[20] }, b[9], { hp: b[12], atk: b[13], spd: b[14], crest: b[21] });
    if (!conds.has(key)) conds.set(key, { key, battles: 0, wins: {}, att: {}, list: [], last: b[1] });
    const c = conds.get(key);
    c.battles++; c.last = b[1];
    c.wins[b[16] || '?'] = (c.wins[b[16] || '?'] ?? 0) + 1;

    const P = [hitP(S[0], S[1]), hitP(S[1], S[0])], D = [baseDmg(S[0], S[1]), baseDmg(S[1], S[0])];
    const rows = byB.get(b[0]) ?? [];
    const kill = rows.filter((r) => r[4] === 'hit').at(-1); // 마지막 타는 남은 HP로 잘려서 데미지 평균에서 제외
    // 공격자 -> 1팀(0)/2팀(1). 주인 칸이 없던 예전 기록은 이름, 그래도 모르면 첫 공격자를 빠른 쪽으로 봄
    const sideOf = new Map();
    const side = (r) => {
      const id = `${r[2]}|${r[3]}`;
      if (sideOf.has(id)) return sideOf.get(id);
      let k;
      if (explore) k = r[2] === '야생' ? 1 : 0;
      else if (S[0].owner && r[2] === S[0].owner && S[0].owner !== S[1].owner) k = 0;
      else if (S[1].owner && r[2] === S[1].owner && S[0].owner !== S[1].owner) k = 1;
      else if (S[0].name !== S[1].name && r[3] === S[0].name) k = 0;
      else if (S[0].name !== S[1].name && r[3] === S[1].name) k = 1;
      else k = sideOf.size ? 1 - [...sideOf.values()][0] : (S[0].spd >= S[1].spd ? 0 : 1);
      sideOf.set(id, k);
      return k;
    };
    const one = [newSide(), newSide()];
    const who = ['', ''];
    for (const r of rows) {
      const k = side(r), hit = r[4] === 'hit';
      who[k] = explore && k === 1 ? '야생' : `${r[2]}의 ${r[3]}`;
      const dmg = hit && r !== kill ? Number(r[5]) : null;
      add(one[k], hit, P[k], dmg, D[k]);
      const a = (c.att[who[k]] ??= newSide());
      add(a, hit, P[k], dmg, D[k]);
    }
    c.list.push({ no: b[0], t: b[1], S, P, D, one, winner: b[16] });
  }
  return conds;
}

const pct = (x, n) => (n ? `${((100 * x) / n).toFixed(1)}%` : '-');
const avg = (a) => (a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : '-');
const ci = (x, n) => (n ? `±${(196 * Math.sqrt((x / n) * (1 - x / n) / n)).toFixed(1)}` : '');

// 실측 - 예측 명중률 차이(%p)와 우연이라면 나올 범위(95%)
export const hitGap = (s) => s.n ? { d: 100 * (s.hit - s.p) / s.n, r: 196 * Math.sqrt(s.v) / s.n } : null;
export const fmtGap = (s) => { const g = hitGap(s); return g ? `${g.d >= 0 ? '+' : ''}${g.d.toFixed(1)} (±${g.r.toFixed(1)})` : '-'; };
export const sideStats = (s) => ({
  hit: pct(s.hit, s.n), ci: ci(s.hit, s.n), pred: pct(s.p, s.n), gap: fmtGap(s),
  dmg: avg(s.dmg), pdmg: avg(s.pd), range: s.dmg.length ? `${Math.min(...s.dmg)}~${Math.max(...s.dmg)}` : '-',
});

export function formatCond(c) {
  const [mode, a, b] = c.key.split('|');
  const lines = [`${mode === 'explore' ? '[탐험] ' : ''}${a} vs ${b} — ${c.battles}전`];
  lines.push(`승리: ${Object.entries(c.wins).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const [who, s] of Object.entries(c.att)) {
    const x = sideStats(s);
    lines.push(`${who}: 명중 ${x.hit} ${x.ci} (${s.n}타, 예측 ${x.pred}, 차이 ${x.gap}) / 평균 데미지 ${x.dmg} [${x.range}] (예측 ${x.pdmg})`);
  }
  return lines.join('\n');
}

export function summary(dir = 'logs', limit = 10) {
  const conds = [...collect(dir).values()];
  const total = conds.reduce((s, c) => s + c.battles, 0);
  const attacks = conds.reduce((s, c) => s + Object.values(c.att).reduce((t, a) => t + a.n, 0), 0);
  const head = `전체 ${total}전, 공격 ${attacks}타, 조건 ${conds.length}개`;
  const body = conds.sort((x, y) => y.battles - x.battles).slice(0, limit).map(formatCond);
  return [head, ...body];
}
