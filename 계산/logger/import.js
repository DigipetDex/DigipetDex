// 기존 jsonl 재처리: node import.js <출력 폴더> <jsonl...>
//   예: node import.js logs/ch-1553606065940070410 old/battle-2026-10-20.jsonl
import fs from 'node:fs';
import { createParser } from './parser.js';
const [dir, ...files] = process.argv.slice(2);
const { handle } = createParser(dir);
for (const p of files)
  for (const l of fs.readFileSync(p, 'utf8').trim().split('\n')) handle(JSON.parse(l));
