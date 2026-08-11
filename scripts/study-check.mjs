// STUDY 회차 점검. Windows 예약 작업이 매일 오후에 부른다.
//
// 하는 일은 두 가지뿐이다.
//   1. 오늘 회차가 없으면 draft 초안을 만든다 (내용은 사람이 쓴다)
//   2. 마지막 회차 이후 며칠이 비었는지 한 줄로 알려준다
//
// 사이트 빌드와는 무관하다. dist/에 아무것도 넣지 않는다.
// 초안은 draft: true라서 내용을 채우기 전까지 블로그에 나오지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = path.join(ROOT, 'content', 'posts');
const PREFIX = 'claude-code-study';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
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

function stub(number, date) {
  return `---
title: 클로드 코드 STUDY
date: ${date}
tags: 학습
draft: true
description:
---

## STUDY${number}_${yymmdd(date)}

여기에 오늘 배운 것을 적습니다.

다 쓰고 나면 위쪽 \`draft: true\` 줄을 지워야 블로그에 올라갑니다.
`;
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
  const file = nextNumber === 1 ? `${PREFIX}.md` : `${PREFIX}-${nextNumber}.md`;
  const target = path.join(POSTS, file);
  if (values['dry-run']) {
    lines.push(`[dry-run] 만들 파일: content/posts/${file} — STUDY${nextNumber}_${yymmdd(today)}`);
  } else {
    fs.writeFileSync(target, stub(nextNumber, today), 'utf8');
    lines.push(`오늘 STUDY${nextNumber}_${yymmdd(today)} 초안을 만들었습니다.`);
  }
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
