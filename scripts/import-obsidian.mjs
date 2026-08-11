// 옵시디언 볼트의 글을 블로그 글로 가져온다.
//
// 볼트는 **읽기만 한다.** 원본을 고치거나 옮기지 않는다.
//
//   node scripts/import-obsidian.mjs --list
//   node scripts/import-obsidian.mjs "마술에 관해" --slug about-magic --dry-run
//   node scripts/import-obsidian.mjs "마술에 관해" --slug about-magic
//
// 옵시디언 전용 표기를 블로그 마크다운으로 옮기는 게 일의 대부분이다.
// 파서가 원문 HTML도 위키링크도 모르기 때문에, 여기서 미리 걷어내지 않으면
// 글자 그대로 화면에 찍힌다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = path.join(ROOT, 'content', 'posts');

// 기본 볼트 경로. 다른 볼트를 쓰려면 --vault 로 넘긴다.
const DEFAULT_VAULT = path.join('D:', path.sep, 'Documents', 'Obsidian Vault', '블로그');

// 이 태그가 붙어 있으면 초안으로 가져온다. 본인이 "아직 정리 중"이라고
// 표시해 둔 글을 실수로 공개하지 않기 위해서다.
const DRAFT_TAGS = new Set(['정리중', 'draft', 'wip', '초안']);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    slug: { type: 'string' },
    date: { type: 'string' },
    description: { type: 'string' },
    draft: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    vault: { type: 'string' },
  },
});

const VAULT = values.vault ?? DEFAULT_VAULT;

function fail(message) {
  console.error(`\n가져오기 실패: ${message}\n`);
  process.exit(1);
}

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function listNotes() {
  if (!fs.existsSync(VAULT)) fail(`볼트 폴더가 없습니다: ${VAULT}`);
  return fs
    .readdirSync(VAULT)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

if (values.list) {
  const notes = listNotes();
  console.log(`볼트: ${VAULT}\n`);
  if (notes.length === 0) console.log('  (마크다운 파일 없음)');
  for (const name of notes) {
    const title = path.basename(name, '.md');
    console.log(`  ${title}`);
  }
  process.exit(0);
}

const noteName = positionals[0];
if (!noteName) {
  fail('가져올 글 제목을 넣으세요.\n  node scripts/import-obsidian.mjs --list  로 목록을 볼 수 있습니다.');
}

const source = path.join(VAULT, noteName.endsWith('.md') ? noteName : `${noteName}.md`);
if (!fs.existsSync(source)) {
  fail(`볼트에 그런 글이 없습니다: ${path.basename(source)}\n  --list 로 목록을 확인하세요.`);
}

const title = path.basename(source, '.md');

// slug가 곧 URL이다. 한글이 들어가면 주소가 퍼센트 인코딩으로 깨져 보이므로
// ASCII가 아닌 제목은 --slug를 반드시 받는다. 조용히 대충 만들지 않는다.
const slug = values.slug ?? (/^[a-z0-9-]+$/.test(title) ? title : null);
if (!slug) {
  fail(
    `제목 "${title}"은 그대로 주소로 쓸 수 없습니다.\n` +
      `  --slug 로 영문 주소를 지정하세요. 예: --slug about-magic`,
  );
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  fail(`--slug는 소문자, 숫자, 하이픈만 씁니다: ${slug}`);
}

const raw = fs.readFileSync(source, 'utf8').replace(/\r\n?/g, '\n');

// 옵시디언 쪽 프런트매터가 있으면 떼어내고 필요한 키만 챙긴다.
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
const existing = {};
let body = raw;
if (fmMatch) {
  for (const line of fmMatch[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    existing[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  body = raw.slice(fmMatch[0].length);
}

const warnings = [];
const tags = new Set();
if (existing.tags) {
  for (const t of existing.tags.split(',')) if (t.trim()) tags.add(t.trim().replace(/^#/, ''));
}

const lines = body.split('\n');
const kept = [];

for (const line of lines) {
  const trimmed = line.trim();

  // 태그만 있는 줄은 프런트매터로 올린다. 본문에 두면 그냥 글자로 찍힌다.
  if (trimmed !== '' && /^(#[^\s#]+)(\s+#[^\s#]+)*$/.test(trimmed)) {
    for (const t of trimmed.split(/\s+/)) tags.add(t.slice(1));
    continue;
  }

  // 공백만 있는 줄은 빈 줄로. 옵시디언이 문단 사이에 공백 두 칸을 남긴다.
  kept.push(trimmed === '' ? '' : line.replace(/\s+$/, ''));
}

let text = kept.join('\n');

// 위키링크는 블로그 파서가 모른다. [[대상|표시]] → 표시, [[대상]] → 대상
const wikiLinks = text.match(/(?<!!)\[\[[^\]]+\]\]/g) ?? [];
if (wikiLinks.length > 0) {
  warnings.push(`위키링크 ${wikiLinks.length}개를 일반 텍스트로 바꿨습니다: ${wikiLinks.slice(0, 3).join(', ')}`);
  text = text.replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? target);
}

// 이미지 임베드는 파일을 같이 옮겨야 해서 자동으로 처리하지 않는다.
const embeds = text.match(/!\[\[[^\]]+\]\]/g) ?? [];
if (embeds.length > 0) {
  warnings.push(
    `이미지 임베드 ${embeds.length}개는 그대로 뒀습니다. static/images/로 파일을 옮기고 ` +
      `![설명](/images/파일명) 형식으로 직접 고치세요: ${embeds.slice(0, 3).join(', ')}`,
  );
}

// 문장 중간에 섞인 태그는 손대지 않는다. 지우면 글이 바뀐다.
const inlineTags = text.match(/(?<=\S )#[^\s#]+/g) ?? [];
if (inlineTags.length > 0) {
  warnings.push(`문장 안의 태그 ${inlineTags.length}개는 그대로 뒀습니다: ${inlineTags.slice(0, 3).join(', ')}`);
}

text = text.replace(/\n{3,}/g, '\n\n').trim();

const isDraft = values.draft || [...tags].some((t) => DRAFT_TAGS.has(t.toLowerCase()));
const date = values.date ?? existing.date ?? localToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`날짜는 YYYY-MM-DD 형식이어야 합니다: ${date}`);

const description = values.description ?? '';
if (!description) {
  warnings.push('description이 비어 있습니다. 글 목록과 og:description에 쓰이니 채워 두는 게 좋습니다.');
}

const frontmatter = [
  '---',
  `title: ${existing.title ?? title}`,
  `date: ${date}`,
  tags.size > 0 ? `tags: ${[...tags].join(', ')}` : null,
  isDraft ? 'draft: true' : null,
  `description: ${description}`,
  '---',
].filter(Boolean);

const output = `${frontmatter.join('\n')}\n\n${text}\n`;
const target = path.join(POSTS, `${slug}.md`);

if (values['dry-run']) {
  console.log(`--- ${path.relative(ROOT, target)} (dry-run, 쓰지 않음) ---\n`);
  console.log(output);
} else {
  if (fs.existsSync(target) && !values.force) {
    fail(`이미 있는 글입니다: content/posts/${slug}.md\n  덮어쓰려면 --force 를 붙이세요.`);
  }
  fs.mkdirSync(POSTS, { recursive: true });
  fs.writeFileSync(target, output, 'utf8');
  console.log(`가져왔습니다: content/posts/${slug}.md  (${isDraft ? '초안' : '공개'})`);
}

const paragraphs = text.split(/\n{2,}/).filter(Boolean).length;
console.log(`  제목 ${existing.title ?? title} / 문단 ${paragraphs}개 / 태그 ${[...tags].join(', ') || '없음'}`);

for (const w of warnings) console.log(`  주의: ${w}`);

if (!values['dry-run']) console.log('\n빌드하면 반영됩니다: node src/build.mjs');
