// 블로그 글에 실제로 필요한 문법만 지원하는 마크다운 파서.
// CommonMark 완전 준수가 목표가 아니다 — CLAUDE.md의 "마크다운 파서" 절 참고.
//
// 파싱은 두 단계다: 줄 단위로 블록을 소비한 뒤, 각 블록 안에서 인라인을 처리한다.
// 정규식 하나로 전부 처리하려 들면 코드 블록 안의 `**`가 굵게 변하는 식으로 무너진다.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

const FENCE_RE = /^(`{3,}|~{3,})\s*(\S*)\s*$/;
const HEADING_RE = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^\s*>\s?/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

// 인라인 코드를 잠시 빼두는 데 쓰는 자리표시자.
// '<'를 쓰는 이유: 자리표시자를 넣는 시점엔 이미 이스케이프가 끝나서 본문에 '<'가 남아 있을 수
// 없다. 따라서 어떤 입력으로도 이 토큰과 충돌할 수 없다.
const PH_RE = /<c(\d+)>/g;

// base: 사이트가 도메인 하위 경로에 배포될 때 본문의 루트 절대 경로('/images/x.png')
// 앞에 붙는 값. 글쓴이가 배포 위치를 신경 쓰지 않고 '/'로 시작하는 링크를 쓸 수 있게 한다.
export function renderMarkdown(source, { base = '' } = {}) {
  const ctx = { usedIds: new Map(), base };
  const lines = String(source)
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n');
  return renderBlocks(lines, ctx);
}

function renderBlocks(lines, ctx) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // 펜스 코드 블록을 가장 먼저 검사한다. 내부는 어떤 블록 규칙도 적용하지 않는다.
    const fence = line.match(FENCE_RE);
    if (fence) {
      const [, marker, lang] = fence;
      const body = [];
      i += 1;
      while (i < lines.length && !isClosingFence(lines[i], marker)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // 닫는 펜스 소비 (없이 파일이 끝나도 그냥 넘어간다)
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}\n</code></pre>`);
      continue;
    }

    if (HR_RE.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const inner = renderInline(heading[2], ctx);
      // h2/h3에만 id를 붙인다 — 딥링크가 의미 있는 건 이 레벨뿐이다.
      const id = level === 2 || level === 3 ? ` id="${uniqueId(heading[2], ctx)}"` : '';
      out.push(`<h${level}${id}>${inner}</h${level}>`);
      i += 1;
      continue;
    }

    // 인용문은 '>'로 시작하는 줄만 먹는다. 게으른 연속(lazy continuation)을 지원하면
    // 바로 뒤에 붙은 제목이나 목록까지 빨려 들어간다.
    if (QUOTE_RE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(lines[i].replace(QUOTE_RE, ''));
        i += 1;
      }
      out.push(`<blockquote>\n${renderBlocks(body, ctx)}\n</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = consumeTable(lines, i, ctx);
      out.push(table.html);
      i = table.next;
      continue;
    }

    if (LIST_RE.test(line)) {
      const list = consumeList(lines, i, ctx);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // 나머지는 문단. 빈 줄이나 새 블록이 시작될 때까지 모은다.
    // 줄 끝 공백은 남겨둔다 — 두 칸 이상이면 <br>이 된다.
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i)) {
      paragraph.push(lines[i].replace(/^\s+/, ''));
      i += 1;
    }
    if (paragraph.length > 0) {
      out.push(`<p>${renderInline(paragraph.join('\n'), ctx)}</p>`);
    }
  }

  return out.join('\n');
}

function isClosingFence(line, marker) {
  const m = line.match(FENCE_RE);
  return Boolean(m) && m[1][0] === marker[0] && m[1].length >= marker.length;
}

// 문단을 모으는 도중 새 블록이 시작됐는지 판단한다.
function startsBlock(lines, i) {
  const line = lines[i];
  return (
    FENCE_RE.test(line) ||
    HR_RE.test(line) ||
    HEADING_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_RE.test(line) ||
    isTableStart(lines, i)
  );
}

function isTableStart(lines, i) {
  const line = lines[i];
  const next = lines[i + 1];
  return (
    line.trim().startsWith('|') &&
    typeof next === 'string' &&
    next.includes('-') &&
    TABLE_SEP_RE.test(next)
  );
}

function consumeTable(lines, start, ctx) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });

  let i = start + 2;
  const rows = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }

  const cell = (tag, text, index) => {
    const align = aligns[index] ? ` style="text-align:${aligns[index]}"` : '';
    return `<${tag}${align}>${renderInline(text, ctx)}</${tag}>`;
  };

  const head = `<tr>${header.map((c, n) => cell('th', c, n)).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${row.map((c, n) => cell('td', c, n)).join('')}</tr>`)
    .join('\n');

  // 좁은 화면에서 페이지 전체가 가로로 밀리지 않도록 표는 자체 스크롤 컨테이너에 넣는다.
  const html =
    '<div class="table-wrap">\n<table>\n' +
    `<thead>\n${head}\n</thead>\n` +
    (body ? `<tbody>\n${body}\n</tbody>\n` : '') +
    '</table>\n</div>';

  return { html, next: i };
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function consumeList(lines, start, ctx) {
  const base = lines[start].match(LIST_RE);
  const baseIndent = base[1].length;
  const ordered = /^\d/.test(base[2]);

  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;

    const match = line.match(LIST_RE);
    const indent = line.match(/^\s*/)[0].length;

    if (match && indent === baseIndent) {
      if (/^\d/.test(match[2]) !== ordered) break; // 종류가 바뀌면 새 목록
      items.push([match[3]]);
      i += 1;
      continue;
    }

    // 더 깊게 들여쓴 줄은 직전 항목의 내용(중첩 목록·이어지는 문장)이다.
    if (indent > baseIndent && items.length > 0) {
      items[items.length - 1].push(line.slice(baseIndent + 2));
      i += 1;
      continue;
    }

    break;
  }

  const tag = ordered ? 'ol' : 'ul';
  const body = items
    .map(([first, ...rest]) => {
      let inner = renderInline(first, ctx);
      if (rest.length > 0) {
        const nested = renderBlocks(rest, ctx);
        if (nested) inner += `\n${nested}`;
      }
      return `<li>${inner}</li>`;
    })
    .join('\n');

  return { html: `<${tag}>\n${body}\n</${tag}>`, next: i };
}

export function renderInline(text, ctx) {
  const base = ctx?.base ?? '';

  // 이스케이프가 먼저다. 이후 규칙은 전부 이 결과 위에서 동작한다.
  let out = escapeHtml(text);

  // 인라인 코드를 자리표시자로 빼둔다. 이걸 먼저 안 하면 `**not bold**`가 굵어진다.
  const codes = [];
  out = out.replace(/(`+)([\s\S]+?)\1/g, (_, __, code) => {
    codes.push(code.replace(/^ | $/g, ''));
    return `<c${codes.length - 1}>`;
  });

  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src, title) => {
      const t = title ? ` title="${title}"` : '';
      return `<img src="${withBase(safeUrl(src), base)}" alt="${alt}"${t} loading="lazy" decoding="async">`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, href, title) => {
      const t = title ? ` title="${title}"` : '';
      const url = withBase(safeUrl(href), base);
      const external = /^https?:/i.test(url) ? ' rel="noopener noreferrer"' : '';
      return `<a href="${url}"${t}${external}>${label}</a>`;
    })
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/ {2,}\n/g, '<br>\n');

  return out.replace(PH_RE, (_, n) => `<code>${codes[Number(n)]}</code>`);
}

// javascript: 같은 스킴이 href로 들어가는 걸 막는다. 값은 이미 이스케이프된 상태다.
function safeUrl(url) {
  return /^\s*javascript:/i.test(url.replace(/&amp;/g, '&')) ? '#' : url;
}

// '/'로 시작하는 사이트 내부 경로에만 base를 붙인다.
// '//example.com'은 프로토콜 상대 URL이라 외부를 가리키므로 제외한다.
function withBase(url, base) {
  if (!base || !url.startsWith('/') || url.startsWith('//')) return url;
  return `${base}${url}`;
}

function uniqueId(rawText, ctx) {
  const base =
    rawText
      .replace(/`([^`]*)`/g, '$1')
      .replace(/[*_[\]()]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || 'section';

  const seen = ctx.usedIds.get(base) ?? 0;
  ctx.usedIds.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen}`;
}
