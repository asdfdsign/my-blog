// 빌드 엔트리. content/ 의 마크다운을 읽어 dist/ 에 정적 사이트를 굽는다.
//
// 읽기·검증·렌더링을 전부 메모리에서 끝낸 뒤에야 dist/ 를 건드린다.
// 중간에 실패했을 때 반쯤 만들어진 사이트가 남지 않게 하기 위해서다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import site from '../site.config.mjs';
import { renderMarkdown, escapeHtml } from './markdown.mjs';
import { indexPage, postPage, staticPage } from './template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const STATIC = path.join(ROOT, 'static');
const DIST = path.join(ROOT, 'dist');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// --drafts: 초안까지 포함해 빌드한다. 글을 쓰는 중에 화면을 확인하려고 프런트매터를
// 고쳤다 되돌리는 일을 없애려는 것이다. 이 산출물은 배포용이 아니다.
const { values: flags } = parseArgs({ options: { drafts: { type: 'boolean', default: false } } });

function fail(message) {
  console.error(`\n빌드 실패: ${message}\n`);
  process.exit(1);
}

function readMarkdownDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({
      file: path.join(dir, name),
      slug: path.basename(name, '.md'),
      raw: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

// YAML 파서를 만들지 않는다. '---' 블록 안에서 첫 번째 ':' 기준으로만 나눈다.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!match) return { data: {}, body: raw };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["'](.*)["']$/, '$1');
    data[key] = value;
  }

  return { data, body: raw.slice(match[0].length) };
}

function loadPosts() {
  const posts = [];

  for (const { file, slug, raw } of readMarkdownDir(path.join(CONTENT, 'posts'))) {
    const { data, body } = parseFrontmatter(raw);
    const where = path.relative(ROOT, file);

    const isDraft = data.draft === 'true';
    if (isDraft && !flags.drafts) continue;

    if (!data.title) fail(`${where} — 프런트매터에 'title'이 없습니다.`);
    if (!data.date) fail(`${where} — 프런트매터에 'date'가 없습니다.`);
    if (!DATE_RE.test(data.date)) {
      fail(`${where} — 'date'는 YYYY-MM-DD 형식이어야 합니다 (받은 값: ${data.date}).`);
    }

    posts.push({
      slug,
      draft: isDraft,
      title: data.title,
      date: data.date,
      description: data.description || '',
      tags: data.tags ? data.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      html: renderMarkdown(body),
    });
  }

  const seen = new Set();
  for (const post of posts) {
    if (seen.has(post.slug)) fail(`slug가 중복됩니다: ${post.slug}`);
    seen.add(post.slug);
  }

  // 최신 글이 위로. 같은 날짜면 slug로 안정 정렬해 빌드를 결정적으로 유지한다.
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date < a.date ? -1 : 1));
}

function loadPages() {
  return readMarkdownDir(path.join(CONTENT, 'pages')).map(({ file, slug, raw }) => {
    const { data, body } = parseFrontmatter(raw);
    if (!data.title) fail(`${path.relative(ROOT, file)} — 프런트매터에 'title'이 없습니다.`);
    return {
      slug,
      title: data.title,
      description: data.description || '',
      html: renderMarkdown(body),
    };
  });
}

function renderRss(posts) {
  const items = posts
    .map(
      (post) => `  <item>
    <title>${escapeHtml(post.title)}</title>
    <link>${site.url}/posts/${post.slug}/</link>
    <guid isPermaLink="true">${site.url}/posts/${post.slug}/</guid>
    <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
    <description>${escapeHtml(post.description || post.title)}</description>
  </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(site.title)}</title>
  <link>${site.url}/</link>
  <description>${escapeHtml(site.description)}</description>
  <language>${site.lang}</language>
  <atom:link href="${site.url}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;
}

function renderSitemap(posts, pages) {
  const urls = [
    { loc: `${site.url}/`, lastmod: posts[0]?.date },
    ...posts.map((p) => ({ loc: `${site.url}/posts/${p.slug}/`, lastmod: p.date })),
    ...pages.map((p) => ({ loc: `${site.url}/${p.slug}/` })),
  ];

  const body = urls
    .map(({ loc, lastmod }) =>
      `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function write(relativePath, contents) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

function build() {
  const posts = loadPosts();
  const pages = loadPages();

  // 여기서부터가 실제 쓰기. 위에서 하나라도 실패했으면 도달하지 않는다.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  write('index.html', indexPage(posts));
  for (const post of posts) write(path.join('posts', post.slug, 'index.html'), postPage(post));
  for (const page of pages) write(path.join(page.slug, 'index.html'), staticPage(page));

  if (fs.existsSync(STATIC)) fs.cpSync(STATIC, DIST, { recursive: true });

  // 피드와 사이트맵에는 초안을 넣지 않는다. --drafts는 화면 확인용이지
  // 발행이 아니고, 실수로 이 산출물을 올리더라도 초안이 새어 나가면 안 된다.
  const published = posts.filter((post) => !post.draft);
  write('rss.xml', renderRss(published));
  write('sitemap.xml', renderSitemap(published, pages));

  const drafts = posts.length - published.length;
  console.log(
    `빌드 완료 — 글 ${published.length}개, 페이지 ${pages.length}개 → ${path.relative(ROOT, DIST)}/`,
  );
  if (drafts > 0) {
    console.log(`초안 ${drafts}개를 함께 넣었습니다. 이 산출물은 배포용이 아닙니다.`);
  }
}

build();
