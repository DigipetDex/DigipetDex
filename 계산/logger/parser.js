import fs from 'node:fs';

const HEADS = {
  events: 'battle_no,turn,owner,digimon,result,dmg,hp1_after,hp2_after',
  battles: 'battle_no,t,mode,name1,attr1,stage1,hp1,atk1,spd1,name2,attr2,stage2,hp2,atk2,spd2,relation,winner,owner1,owner2,invoker,crest1,crest2',
  status: 't,name,attr,stage,vital,friend,full,pp,hp,atk,spd,battles,winrate,training,crest',
};

const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// ISO(UTC) -> 'YYYY-MM-DD HH:MM:SS' (KST)
const kst = t => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const num = (s, re) => { const m = s?.match(re); return m ? Number(m[1]) : ''; };
const field = (e, pred) => (e.fields || []).find(f => pred(f.name));

// "[3턴] 코퍼의 아구몬의 공격! (⚔️27)" / "[3턴] 코퍼의 아구몬의 공격이 빗나갔다..."
// 탐험의 적 공격 줄은 주인 없이 나올 수 있어서 행위자 전체를 잡은 뒤 첫 "의 "로 나눔
const LOG_RE = /^\[(\d+)턴\] (.+)의 공격(?:! \(.*?(\d+)\)|이 빗나갔다)/u;
// 문장: 상태/팀 설명 줄의 커스텀 이모지 <:crest_love:123> 또는 :crest_love: 에서 love만 뽑음
const crestOf = s => s?.match(/:crest_([a-z]+)/i)?.[1]?.toLowerCase() ?? '';
const splitActor = a => { const i = a.indexOf('의 '); return i < 0 ? ['야생', a] : [a.slice(0, i), a.slice(i + 2)]; };

function teamInfo(v) {
  const l = v.split('\n');
  const [attr, stage] = (l[0] || '').split(' / ');
  return { attr, stage, crest: crestOf(l[0]), hp: num(v, /체력: (\d+)/), atk: num(v, /전투력: (\d+)/), spd: num(v, /속도: (\d+)/) };
}

// dir마다 독립된 CSV와 상태를 가진 파서를 만든다 (채널별 기록용)
export function createParser(dir = 'logs') {
  fs.mkdirSync(dir, { recursive: true });
  const path = k => `${dir}/${k}.csv`;
  for (const k of Object.keys(HEADS)) {
    if (!fs.existsSync(path(k))) { fs.writeFileSync(path(k), '﻿' + HEADS[k] + '\n'); continue; }
    // 예전 헤더면 새 컬럼이 붙은 헤더로 교체 (기존 행은 뒤 컬럼이 빈 값)
    const txt = fs.readFileSync(path(k), 'utf8');
    const nl = txt.indexOf('\n');
    if (txt.slice(0, nl).replace(/^﻿/, '') !== HEADS[k]) fs.writeFileSync(path(k), '﻿' + HEADS[k] + txt.slice(nl));
  }
  const write = (k, row) => fs.appendFileSync(path(k), row.map(q).join(',') + '\n');

  // 재시작해도 battle_no가 겹치지 않게 기존 CSV의 최대값에서 이어감
  let battleSeq = 0;
  for (const k of ['battles', 'events']) {
    for (const l of fs.readFileSync(path(k), 'utf8').split('\n').slice(1)) battleSeq = Math.max(battleSeq, parseInt(l, 10) || 0);
  }
  // msg id -> { lastLog, battleNo, info, lastStatus }
  const state = new Map();
  const st = id => { if (!state.has(id)) state.set(id, {}); return state.get(id); };

  // invoker: 이 메시지를 만든 슬래시 명령(/배틀, /탐험)을 쓴 사용자 이름
  function handle({ id, t, embeds, invoker }) {
    const e = embeds?.[0];
    if (!e) return;
    const s = st(id);

    // 전투 임베드: 모의전(제목 "A VS B", 1팀/2팀) 또는 탐험(내 정보/상대 정보)
    const logF = field(e, n => n.includes('배틀 로그'));
    const explore = !!field(e, n => n.includes('내 정보'));
    if (logF && (/ VS /.test(e.title || '') || explore)) {
      const fresh = !s.battleNo || s.done;
      if (logF.value.startsWith('전투를 시작합니다') || (fresh && /^\[1턴\]/m.test(logF.value) && s.lastLog !== logF.value)) {
        s.battleNo = ++battleSeq; s.done = false;
        const [n1, n2] = explore ? ['', '야생'] : e.title.split(' VS ');
        const f1 = teamInfo(field(e, n => n.includes('1팀') || n.includes('내 정보'))?.value || '');
        const f2 = teamInfo(field(e, n => n.includes('2팀') || n.includes('상대 정보'))?.value || '');
        // 체력 칸 "코퍼의 즈바몬 HP" 줄이 1팀, 2팀 순서라 팀별 주인을 알 수 있음 (탐험은 "내 HP"/"상대 HP")
        const owners = [...(field(e, n => n === '체력')?.value || '').matchAll(/^(.+?)의 .+ HP$/gm)].map(m => m[1]);
        s.info = { t, n1, n2, f1, f2, rel: (e.description || '').match(/상성: (\S+)/)?.[1] ?? '', mode: explore ? 'explore' : 'regular', area: explore ? e.title : '',
          owner1: owners[0] ?? '', owner2: owners[1] ?? (explore ? '야생' : ''), invoker: invoker ?? '' };
      }
      if (s.battleNo && !s.done && logF.value !== s.lastLog) {
        s.lastLog = logF.value;
        const hp = [...(field(e, n => n === '체력')?.value || '').matchAll(/(\d+)\/\d+/g)].map(m => m[1]);
        s.hp = hp;
        for (const line of logF.value.split('\n')) {
          const m = line.match(LOG_RE);
          if (!m) continue;
          const [owner, digi] = splitActor(m[2]);
          if (explore && owner !== '야생' && !s.info.n1) { s.info.n1 = digi; s.info.me = owner; }
          // 적 줄은 "야생의 케루비몬(악)의 공격" 형식이라 적 이름을 얻을 수 있음
          if (explore && owner === '야생' && s.info.n2 === '야생') s.info.n2 = digi;
          write('events', [s.battleNo, m[1], owner, digi, m[3] ? 'hit' : 'miss', m[3] || 0, hp[0] ?? '', hp[1] ?? '']);
        }
      }
      // 결과 칸: 모의전 "정규전 결과", 탐험 승리 "전투 정리", 탐험 패배 "전투 여파"
      const res = field(e, n => n.includes('결과') || n.includes('전투 정리') || n.includes('전투 여파'));
      if (res && s.info && !s.done) {
        s.done = true;
        const { t: t0, n1, n2, f1, f2, rel, mode, me, owner1, owner2 } = s.info;
        const invokerName = s.info.invoker || invoker || '';
        // 탐험은 승자 문구가 없어서 내 HP로 판정
        const w = mode === 'explore' ? (Number(s.hp?.[0]) > 0 ? (me || 'me') : '야생') : res.value.match(/^(.+?)님의 승리/)?.[1] || '';
        write('battles', [s.battleNo, kst(t0), mode, n1, f1.attr, f1.stage, f1.hp, f1.atk, f1.spd, n2, f2.attr, f2.stage, f2.hp, f2.atk, f2.spd, rel, w, mode === 'explore' ? (me || owner1) : owner1, owner2, invokerName, f1.crest, f2.crest]);
        return { battleNo: s.battleNo, mode, n1, n2, f1, f2, winner: w };
      }
      return;
    }

    // 상태 임베드
    const raise = field(e, n => n.includes('육성'));
    const fight = field(e, n => n.includes('전투'));
    if (raise && fight) {
      const etc = field(e, n => n === '기타')?.value || '';
      const [attr, stage] = (e.description || '').split(' / ');
      const row = [e.title, attr, stage, num(raise.value, /바이탈: (\d+)/), num(raise.value, /우호도: (\d+)/), num(raise.value, /포만도: (\d+)/), num(raise.value, /PP: (\d+)/),
        num(fight.value, /체력: (\d+)/), num(fight.value, /전투력: (\d+)/), num(fight.value, /속도: (\d+)/), num(fight.value, /배틀: (\d+)/), num(fight.value, /승률: (\d+)/), num(etc, /훈련: (\d+)/), crestOf(e.description)];
      const key = row.join('|');
      if (key !== s.lastStatus) { s.lastStatus = key; write('status', [kst(t), ...row]); }
    }
  }

  return { dir, handle };
}
