import 'dotenv/config';
import fs from 'node:fs';
import { Client, GatewayIntentBits, Partials, Events, SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createParser } from './parser.js';
import { collect, condKey, formatCond, summary } from './stats.js';
import { startWeb } from './web.js';

const TARGET = process.env.TARGET_BOT_ID;
const CHANNELS = (process.env.CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const RAW = process.env.RAW === '1'; // 1이면 원본 임베드 JSONL도 저장 (용량 큼)

fs.mkdirSync('logs', { recursive: true });

// 채널마다 logs/ch-<채널ID>/ 에 따로 기록. 폴더 안 channel.txt에 서버/채널 이름을 남김
const chDir = id => `logs/ch-${id}`;
const channels = new Map(); // 채널ID -> { parser, finished, lastDone, lastComp }
function chan(msgOrIt) {
  const id = msgOrIt.channelId;
  if (!channels.has(id)) {
    const dir = chDir(id);
    const parser = createParser(dir);
    const name = `${msgOrIt.guild?.name ?? 'DM'} / #${msgOrIt.channel?.name ?? id}`;
    fs.writeFileSync(`${dir}/channel.txt`, `${name}\n${id}\n`);
    channels.set(id, { dir, parser, finished: 0, lastDone: null, lastComp: new Map() });
  }
  return channels.get(id);
}

// 알림 설정은 /알림 명령으로 채널마다 바꾸고 logs/settings.json에 저장. 기본은 꺼짐, 간격 기본값은 .env의 NOTIFY_EVERY
const SETTINGS = 'logs/settings.json';
const envEvery = Number(process.env.NOTIFY_EVERY) || 10;
let settings = { default: { notify: false, every: envEvery }, channels: {} };
try {
  const saved = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  if (saved.channels) settings = { ...settings, ...saved };
} catch {}
const saveSettings = () => fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
const chSettings = id => ({ ...settings.default, ...(settings.channels[id] ?? {}) });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

// 버튼/선택 메뉴의 custom_id 기록. 메시지별로 구성이 바뀔 때만 한 줄 추가
function recordComponents(c, msg) {
  const comps = (msg.components ?? []).flatMap(row => (row.components ?? []).map(x => ({
    type: x.type, id: x.customId ?? x.data?.custom_id ?? null, label: x.label ?? x.placeholder ?? null,
    url: x.url ?? null, options: x.options?.map(o => ({ label: o.label, value: o.value })),
  })));
  if (!comps.length) return;
  const key = JSON.stringify(comps);
  if (c.lastComp.get(msg.id) === key) return;
  c.lastComp.set(msg.id, key);
  const title = msg.embeds?.[0]?.title ?? '';
  fs.appendFileSync(`${c.dir}/components.jsonl`, JSON.stringify({ t: new Date().toISOString(), id: msg.id, title, comps }) + '\n');
}

// Discord 메시지 2000자 제한에 맞춰 코드 블록으로 나눠 보냄
function chunks(parts, limit = 1900) {
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length + 2 > limit) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur) out.push(cur);
  return out.map(s => '```\n' + s + '\n```');
}

function notify(c, msg, done) {
  const key = condKey(done.mode, done.n1, done.f1, done.n2, done.f2);
  const cond = collect(c.dir).get(key);
  const head = `배틀 ${c.finished}회 기록됨 (battle_no ${done.battleNo})`;
  const body = cond ? formatCond(cond) : `${done.n1} vs ${done.n2}`;
  msg.channel.send(head + '\n```\n' + body + '\n```')
    .catch(err => console.error('notify failed (Send Messages 권한 확인):', err.message));
}

function record(kind, msg) {
  if (msg.author?.id !== TARGET) return;
  if (CHANNELS.length && !CHANNELS.includes(msg.channelId)) return;
  const c = chan(msg);
  try { recordComponents(c, msg); } catch (err) { console.error('component log error', err); }
  if (!msg.embeds?.length) return;
  // "○○ 님이 배틀(을)를 사용함": 메시지를 만든 슬래시 명령의 사용자
  // 전투 로그에 나오는 이름(서버 표시 이름)과 맞추기 위해 닉네임 → 전역 표시 이름 → 사용자명 순으로 씀
  const u = msg.interactionMetadata?.user ?? msg.interaction?.user;
  const invoker = u ? (msg.guild?.members.cache.get(u.id)?.displayName ?? u.globalName ?? u.username) : '';
  const row = { t: new Date().toISOString(), kind, id: msg.id, invoker, embeds: msg.embeds.map(e => e.toJSON()) };
  if (RAW) fs.appendFileSync(`${c.dir}/raw-${row.t.slice(0, 10)}.jsonl`, JSON.stringify(row) + '\n');
  let done;
  try { done = c.parser.handle(row); } catch (err) { console.error('parse error', err); }
  if (!done) return;
  c.finished++;
  c.lastDone = done;
  const s = chSettings(msg.channelId);
  if (s.notify && c.finished % s.every === 0) {
    try { notify(c, msg, done); } catch (err) { console.error('notify error', err); }
  }
}

// 슬래시 명령 (명령을 친 채널의 기록만 대상)
const commands = [
  new SlashCommandBuilder().setName('통계').setDescription('이 채널에 기록된 전투 통계')
    .addStringOption(o => o.setName('범위').setDescription('현재 조건 또는 전체').addChoices(
      { name: '현재 조건', value: 'current' }, { name: '전체', value: 'all' }))
    .addIntegerOption(o => o.setName('개수').setDescription('전체 보기에서 표시할 조건 수 (기본 10)').setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder().setName('알림').setDescription('이 채널의 N회마다 통계 알림 설정')
    .addStringOption(o => o.setName('상태').setDescription('켜기/끄기').setRequired(true).addChoices(
      { name: '켜기', value: 'on' }, { name: '끄기', value: 'off' }))
    .addIntegerOption(o => o.setName('간격').setDescription('몇 전마다 알릴지 (기본 10)').setMinValue(1).setMaxValue(500)),
].map(c => c.toJSON());

client.once(Events.ClientReady, async c => {
  console.log(`ready: ${c.user.tag}`);
  for (const g of c.guilds.cache.values()) {
    try { await g.commands.set(commands); console.log(`명령 등록: ${g.name}`); }
    catch (err) { console.error(`명령 등록 실패 (${g.name}): applications.commands 권한으로 다시 초대 필요 -`, err.message); }
  }
});

client.on(Events.InteractionCreate, async it => {
  if (!it.isChatInputCommand()) return;
  try {
    const id = it.channelId;
    if (it.commandName === '알림') {
      const cur = chSettings(id);
      const every = it.options.getInteger('간격');
      settings.channels[id] = { notify: it.options.getString('상태') === 'on', every: every ?? cur.every };
      saveSettings();
      const s = chSettings(id);
      await it.reply(`이 채널 알림 ${s.notify ? `켜짐 (${s.every}전마다)` : '꺼짐'}`);
    } else if (it.commandName === '통계') {
      const dir = chDir(id);
      if (!fs.existsSync(`${dir}/battles.csv`)) { await it.reply({ content: '이 채널에 기록된 전투가 없음', flags: MessageFlags.Ephemeral }); return; }
      const range = it.options.getString('범위') ?? 'current';
      let parts;
      if (range === 'all') parts = summary(dir, it.options.getInteger('개수') ?? 10);
      else {
        const conds = collect(dir);
        const last = channels.get(id)?.lastDone;
        const cond = last ? conds.get(condKey(last.mode, last.n1, last.f1, last.n2, last.f2))
          : [...conds.values()].sort((a, b) => (a.last < b.last ? 1 : -1))[0];
        parts = [cond ? formatCond(cond) : '기록 없음'];
      }
      const msgs = chunks(parts);
      await it.reply(msgs[0]);
      for (const m of msgs.slice(1)) await it.followUp(m);
    }
  } catch (err) {
    console.error('command error', err);
    const r = { content: `오류: ${err.message}`, flags: MessageFlags.Ephemeral };
    it.replied ? it.followUp(r).catch(() => {}) : it.reply(r).catch(() => {});
  }
});

client.on(Events.MessageCreate, m => record('create', m));
client.on(Events.MessageUpdate, async (_o, m) => {
  try { if (m.partial) m = await m.fetch(); } catch { return; }
  record('update', m);
});
if (process.env.WEB !== '0') startWeb(); // WEB=0이면 대시보드 끔
client.login(process.env.DISCORD_TOKEN);
