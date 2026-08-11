// HTML 셸과 페이지 레이아웃. 문자열 템플릿만 쓰고 템플릿 엔진은 두지 않는다.

import site from '../site.config.mjs';
import { escapeHtml } from './markdown.mjs';

// 저장된 테마를 첫 페인트 '전에' <html>에 반영한다.
// 이 스크립트는 반드시 <head> 안에 인라인·동기로 있어야 한다. 외부 파일로 빼면
// 파일을 받아오기 전에 기본 테마로 한 프레임이 그려지면서 흰 화면이 번쩍인다(FOUC).
const THEME_BOOTSTRAP =
  `(function(){try{var t=localStorage.getItem('theme');` +
  `if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}` +
  `}catch(e){}})();`;

export function layout({ title, description, canonical, body }) {
  const pageTitle = title === site.title ? site.title : `${title} · ${site.title}`;
  const desc = description || site.description;
  const url = `${site.url}${canonical}`;

  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="author" content="${escapeHtml(site.author)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(site.title)}">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="/rss.xml">
<link rel="stylesheet" href="/styles.css">
<script>${THEME_BOOTSTRAP}</script>
</head>
<body>
<a class="skip-link" href="#main">본문으로 건너뛰기</a>
<header class="site-header">
  <div class="bar">
    <a class="site-name" href="/">${escapeHtml(site.title)}</a>
    <nav class="site-nav">
      <a href="/about/">소개</a>
      <a href="/rss.xml">RSS</a>
      <button id="theme-toggle" type="button" class="theme-toggle" aria-label="테마 전환">
        <span class="theme-icon" aria-hidden="true"></span>
        <span class="theme-label"></span>
      </button>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <p>© ${escapeHtml(site.author)}</p>
</footer>
<script src="/theme.js" defer></script>
</body>
</html>
`;
}

export function indexPage(posts) {
  const items = posts
    .map(
      (post) => `  <li class="post-item">
    <h2><a href="/posts/${post.slug}/">${escapeHtml(post.title)}</a></h2>
    <p class="meta">${dateEl(post.date)}${draftBadge(post)}${tagList(post.tags)}</p>
    ${post.description ? `<p class="excerpt">${escapeHtml(post.description)}</p>` : ''}
  </li>`,
    )
    .join('\n');

  const body = `<h1 class="page-title">${escapeHtml(site.title)}</h1>
<p class="page-lead">${escapeHtml(site.description)}</p>
${posts.length ? `<ul class="post-list">\n${items}\n</ul>` : '<p>아직 발행된 글이 없습니다.</p>'}`;

  return layout({ title: site.title, description: site.description, canonical: '/', body });
}

export function postPage(post) {
  const body = `<article class="post">
  <header class="post-header">
    ${post.draft ? '<p class="draft-notice">초안입니다. 공개되지 않은 글이며 배포본에는 들어가지 않습니다.</p>' : ''}
    <h1>${escapeHtml(post.title)}</h1>
    <p class="meta">${dateEl(post.date)}${draftBadge(post)}${tagList(post.tags)}</p>
  </header>
  ${post.html}
</article>
<p class="back"><a href="/">← 글 목록</a></p>`;

  return layout({
    title: post.title,
    description: post.description,
    canonical: `/posts/${post.slug}/`,
    body,
  });
}

export function staticPage(page) {
  const body = `<article class="post">
  <header class="post-header">
    <h1>${escapeHtml(page.title)}</h1>
  </header>
  ${page.html}
</article>`;

  return layout({
    title: page.title,
    description: page.description,
    canonical: `/${page.slug}/`,
    body,
  });
}

function dateEl(date) {
  return `<time datetime="${date}">${formatDate(date)}</time>`;
}

// --drafts로 빌드했을 때만 붙는다. 초안이 섞인 화면을 공개본으로 착각하지 않게 하는 표시다.
function draftBadge(post) {
  return post.draft ? '<span class="draft-badge">초안</span>' : '';
}

function tagList(tags) {
  if (!tags || tags.length === 0) return '';
  const items = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  return `<span class="tags">${items}</span>`;
}

// 로케일 API에 기대지 않는다. 빌드 환경이 달라져도 출력이 같아야 한다.
export function formatDate(date) {
  const [y, m, d] = date.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
