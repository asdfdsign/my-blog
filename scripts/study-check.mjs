// STUDY 회차 점검. Windows 예약 작업이 매일 오후에 부른다.
//
// **확인만 한다. 파일을 만들거나 고치지 않는다.**
// 오늘 회차가 있는지, 마지막 회차 이후 며칠이 비었는지 한 줄로 알려줄 뿐이다.
//
// 글을 쓰는 일은 대화로 한다. 스크립트가 빈 초안을 미리 깔아두면 며칠 자리를 비웠을 때
// 내용 없는 파일만 쌓이고, 그걸 다시 치우는 일이 생긴다.
//
// 사이트 빌드와는 무관하다. dist/에 아무것도 넣지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = path.join(ROOT, 'content', 'posts');
const PREFIX = 'claude-code-study';

const { values } = parseArgs({
  options: {
    // 테스트용. 오늘이 아닌 날짜로 동작을 확인할 때 쓴다.
    date: { type: 'string' },
  },
});

const today = values.date ?? localToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error(`날짜 형식이 잘못됐습니다: ${today}`);
  process.exit(1);
}

// 로컬 시간 기준. toISOString()은 UTC라 한국에서 자정 근처에 하루가 밀린다.
function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function yymmdd(date) {
  return date.slice(2).replace(/-/g, '');
}

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function readEntries() {
  if (!fs.existsSync(POSTS)) return [];
  return fs
    .readdirSync(POSTS)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith('.md'))
    .map((name) => {
      const raw = fs.readFileSync(path.join(POSTS, name), 'utf8');
      return {
        name,
        date: match(raw, /^date:\s*(\S+)\s*$/m),
        draft: match(raw, /^draft:\s*(\S+)\s*$/m) === 'true',
        number: Number(match(raw, /^##\s*STUDY(\d+)_/m) ?? 0),
      };
    })
    .filter((e) => e.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function match(text, re) {
  const m = text.match(re);
  return m ? m[1] : null;
}

const entries = readEntries();
const todayEntry = entries.find((e) => e.date === today);
const nextNumber = Math.max(0, ...entries.map((e) => e.number)) + 1;
const last = entries[entries.length - 1];

// 마지막 회차 다음 날부터 어제까지 중 글이 없는 날
const missing = [];
if (last && last.date < today) {
  const have = new Set(entries.map((e) => e.date));
  for (let i = 1; i < daysBetween(last.date, today); i += 1) {
    const d = new Date(Date.parse(`${last.date}T00:00:00Z`) + i * 86400000)
      .toISOString()
      .slice(0, 10);
    if (!have.has(d)) missing.push(d);
  }
}

const lines = [];

if (todayEntry && !todayEntry.draft) {
  lines.push(`오늘(${today}) STUDY${todayEntry.number} 작성 완료.`);
} else if (todayEntry) {
  lines.push(`오늘(${today}) STUDY${todayEntry.number} 초안이 비어 있습니다.`);
} else {
  lines.push(`오늘(${today}) STUDY${nextNumber}_${yymmdd(today)}를 아직 안 썼습니다.`);
}

if (missing.length > 0) {
  const shown = missing.slice(-5).join(', ');
  lines.push(`밀린 날 ${missing.length}일: ${shown}${missing.length > 5 ? ' …' : ''}`);
}

console.log(lines.join('\n'));

// 사람이 손댈 게 있으면 1, 다 되어 있으면 0.
// 예약 작업 래퍼가 이 값으로 알림을 띄울지 결정한다.
const needsAttention = !(todayEntry && !todayEntry.draft) || missing.length > 0;
process.exit(needsAttention ? 1 : 0);
