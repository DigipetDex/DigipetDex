// 기록 열람용 웹 대시보드 (같은 와이파이 또는 Tailscale로 접속)
// /            채널 목록
// /ch/<id>     조건별 통계, 최근 전투, CSV 다운로드
// /ch/<id>/<battles|events|status>.csv  원본 CSV
import fs from 'node:fs';
import http from 'node:http';
import { collect, sideStats } from './stats.js';
import { relation } from './model.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FILES = ['battles', 'events', 'status'];

const css = `
:root{--bg:#f6f7f9;--card:#fff;--fg:#1d2128;--mute:#6b7380;--line:#e3e6eb;--acc:#2f6fdf}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--card:#1d2026;--fg:#e6e8eb;--mute:#9098a4;--line:#2c3038;--acc:#6ea0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 12px}h2{font-size:16px;margin:24px 0 8px}
a{color:var(--acc);text-decoration:none}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0}
.mute{color:var(--mute);font-size:13px}.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
th{color:var(--mute);font-weight:500}.tag{display:inline-block;font-size:12px;padding:1px 6px;border-radius:6px;background:var(--line);margin-right:4px}
details{margin-top:8px}summary{cursor:pointer;color:var(--acc);font-size:14px}
.btns a{display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card)}`;

const page = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${css}</style></head><body><main>${body}</main></body></html>`;

const channelIds = () => fs.existsSync('logs')
  ? fs.readdirSync('logs').filter(d => d.startsWith('ch-')).map(d => d.slice(3)) : [];
const channelName = id => { try { return fs.readFileSync(`logs/ch-${id}/channel.txt`, 'utf8').split('\n')[0]; } catch { return id; } };


const REL = { 1: '유리', '-1': '불리', 0: '중립' };
const fighter = f => `${esc(f.name)} <span class="mute">${esc(f.attr)} ${f.hp}/${f.atk}/${f.spd}</span>`;
const sideCell = s => {
  const x = sideStats(s);
  return `<td>${s.hit}/${s.n} <span class="mute">(${x.pred})</span></td><td>${x.dmg} <span class="mute">(${x.pdmg})</span></td>`;
};

// 자세히 보기: 판마다 양쪽 스탯과 실측/예측
function detail(c, explore) {
  const rows = [...c.list].reverse().map(g => `<tr><td>${esc(g.no)}</td><td>${esc(g.t?.slice(5, 16))}</td>
<td>${explore ? '' : fighter(g.S[0]) + '<br>'}${fighter(g.S[1])}</td><td>${REL[relation(g.S[0].attr, g.S[1].attr)]}</td>
${sideCell(g.one[0])}${sideCell(g.one[1])}<td>${esc(g.winner)}</td></tr>`).join('');
  const [h1, h2] = explore ? ['나', '적'] : ['1팀', '2팀'];
  return `<details><summary>자세히 보기 (${c.list.length}전)</summary><div class="wrap"><table>
<tr><th>#</th><th>시각</th><th>${explore ? '적 (속성 체/전/속)' : '대진'}</th><th>상성</th><th>${h1} 명중 (예측)</th><th>${h1} 데미지 (예측)</th>
<th>${h2} 명중 (예측)</th><th>${h2} 데미지 (예측)</th><th>승자</th></tr>${rows}</table></div></details>`;
}

function condCard(c) {
  const [mode, a, b] = c.key.split('|');
  const explore = mode === 'explore';
  const wins = Object.entries(c.wins).map(([k, v]) => `${esc(k)} ${v}`).join(', ');
  const rows = Object.entries(c.att).map(([who, s]) => {
    const x = sideStats(s);
    return `<tr><td>${esc(who)}</td><td>${x.hit} <span class="mute">${x.ci}</span></td><td>${x.pred}</td><td>${x.gap}</td><td>${s.n}</td>
<td>${x.dmg}</td><td>${x.pdmg}</td><td>${x.range}</td></tr>`;
  }).join('');
  return `<div class="card">${explore ? '<span class="tag">탐험</span>' : ''}<b>${esc(a)}</b> vs <b>${esc(b)}</b>
<div class="mute">${c.battles}전 · 승리: ${wins} · 마지막 ${esc(c.last)}</div>
<div class="wrap"><table><tr><th>공격자</th><th>명중 (오차)</th><th>예측</th><th>차이 (우연 범위)</th><th>타수</th><th>평균 데미지</th><th>예측</th><th>범위</th></tr>${rows}</table></div>
${detail(c, explore)}</div>`;
}

function recent(id, n = 50) {
  const p = `logs/ch-${id}/battles.csv`;
  if (!fs.existsSync(p)) return '';
  const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').trim().split('\n').slice(1).filter(Boolean).slice(-n).reverse();
  const rows = lines.map(l => l.split(',')).map(b => `<tr><td>${esc(b[0])}</td><td>${esc(b[1]?.slice(5, 16))}</td><td>${b[2] === 'explore' ? '탐험' : '정규'}</td>
<td>${esc(b[3])} ${esc(b[6])}/${esc(b[7])}/${esc(b[8])}</td><td>${esc(b[9])} ${esc(b[12])}/${esc(b[13])}/${esc(b[14])}</td><td>${esc(b[15])}</td><td>${esc(b[16])}</td></tr>`).join('');
  return `<div class="card wrap"><table><tr><th>#</th><th>시각</th><th>모드</th><th>1팀/나 (체/전/속)</th><th>2팀/상대</th><th>상성</th><th>승자</th></tr>${rows}</table></div>`;
}

function channelPage(id) {
  const dir = `logs/ch-${id}`;
  const conds = [...collect(dir).values()].sort((x, y) => (x.last < y.last ? 1 : -1));
  const total = conds.reduce((s, c) => s + c.battles, 0);
  const btns = FILES.filter(f => fs.existsSync(`${dir}/${f}.csv`)).map(f => `<a href="/ch/${id}/${f}.csv">${f}.csv</a>`).join('');
  return page(channelName(id), `<a href="/">← 채널 목록</a><h1>${esc(channelName(id))}</h1>
<div class="mute">전체 ${total}전 · 조건 ${conds.length}개</div><div class="btns">${btns}</div>
<h2>조건별 통계 (최근 순)</h2>
<p class="mute">예측: 그 판 스탯으로 계산한 현재 모델 값. 차이: 실측 − 예측(%p), 괄호는 모델이 맞을 때 우연으로 나올 범위(95%). 차이가 이 범위를 넘으면 모델과 어긋남.
탐험은 야생 적 스탯이 매번 달라서 상대를 '야생'으로 묶음. 데미지 평균은 마지막 일격 제외.</p>${conds.map(condCard).join('') || '<p class="mute">기록 없음</p>'}
<h2>최근 전투 50개</h2>${recent(id)}`);
}

function indexPage() {
  const items = channelIds().map(id => {
    let n = 0;
    try { n = fs.readFileSync(`logs/ch-${id}/battles.csv`, 'utf8').trim().split('\n').length - 1; } catch {}
    return `<div class="card"><a href="/ch/${id}"><b>${esc(channelName(id))}</b></a><div class="mute">${n}전 · ${id}</div></div>`;
  }).join('');
  return page('DIGIPET 기록', `<h1>DIGIPET 기록</h1>${items || '<p class="mute">기록된 채널 없음</p>'}`);
}

export function startWeb(port = Number(process.env.WEB_PORT) || 8787) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const m = url.pathname.match(/^\/ch\/(\d+)(?:\/(\w+)\.csv)?\/?$/);
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(indexPage());
      } else if (m && !m[2] && fs.existsSync(`logs/ch-${m[1]}`)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(channelPage(m[1]));
      } else if (m && FILES.includes(m[2]) && fs.existsSync(`logs/ch-${m[1]}/${m[2]}.csv`)) {
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${m[2]}-${m[1]}.csv"` });
        fs.createReadStream(`logs/ch-${m[1]}/${m[2]}.csv`).pipe(res);
      } else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('없음');
      }
    } catch (err) {
      console.error('web error', err);
      res.writeHead(500).end();
    }
  });
  server.on('error', err => console.error(`웹 대시보드 시작 실패 (포트 ${port}):`, err.message));
  server.listen(port, '0.0.0.0', () => console.log(`웹 대시보드: http://<기기 IP>:${port}/`));
}
