import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from './markdown.mjs';

test('HTML을 이스케이프한다', () => {
  const html = renderMarkdown('<script>alert("x") & done</script>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('코드 블록 내부는 인라인 변환을 하지 않는다', () => {
  const html = renderMarkdown('```js\nconst a = **b**; // <tag> `x`\n```');
  assert.ok(html.includes('<pre><code class="language-js">'));
  assert.ok(html.includes('**b**'));
  assert.ok(html.includes('&lt;tag&gt;'));
  assert.ok(!html.includes('<strong>'));
  assert.ok(!html.includes('<code>x</code>'));
});

test('인라인 코드 안의 별표는 굵어지지 않는다', () => {
  const html = renderMarkdown('보통 `**굵지 않음**` 이고 **이건 굵다**');
  assert.ok(html.includes('<code>**굵지 않음**</code>'));
  assert.ok(html.includes('<strong>이건 굵다</strong>'));
});

test('제목 레벨과 h2/h3 id', () => {
  const html = renderMarkdown('# 하나\n\n## 둘\n\n### 셋\n\n#### 넷');
  assert.ok(html.includes('<h1>하나</h1>'));
  assert.ok(html.includes('<h2 id="둘">둘</h2>'));
  assert.ok(html.includes('<h3 id="셋">셋</h3>'));
  assert.ok(html.includes('<h4>넷</h4>')); // h4에는 id를 붙이지 않는다
});

test('같은 제목이 반복되면 id가 겹치지 않는다', () => {
  const html = renderMarkdown('## 정리\n\n## 정리');
  assert.ok(html.includes('id="정리"'));
  assert.ok(html.includes('id="정리-1"'));
});

test('중첩 목록', () => {
  const html = renderMarkdown('- 하나\n  - 하나-하나\n  - 하나-둘\n- 둘');
  assert.equal((html.match(/<ul>/g) || []).length, 2);
  assert.equal((html.match(/<li>/g) || []).length, 4);
});

test('순서 있는 목록', () => {
  const html = renderMarkdown('1. 첫째\n2. 둘째');
  assert.ok(html.startsWith('<ol>'));
  assert.ok(html.includes('<li>첫째</li>'));
});

test('표를 스크롤 컨테이너로 감싼다', () => {
  const html = renderMarkdown('| 이름 | 값 |\n| --- | ---: |\n| a | 1 |');
  assert.ok(html.includes('<div class="table-wrap">'));
  assert.ok(html.includes('<th>이름</th>'));
  assert.ok(html.includes('<th style="text-align:right">값</th>'));
  assert.ok(html.includes('<td style="text-align:right">1</td>'));
});

test('링크와 이미지', () => {
  const html = renderMarkdown('[클릭](https://example.com) 그리고 ![대체문구](/img/a.png)');
  assert.ok(html.includes('<a href="https://example.com" rel="noopener noreferrer">클릭</a>'));
  assert.ok(html.includes('<img src="/img/a.png" alt="대체문구"'));
  assert.ok(html.includes('loading="lazy"'));
});

test('javascript: URL을 막는다', () => {
  const html = renderMarkdown('[위험](javascript:alert(1))');
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="#"'));
});

test('인용문 뒤에 붙은 제목을 빨아들이지 않는다', () => {
  const html = renderMarkdown('> 인용된 문장\n## 뒤따르는 제목');
  assert.ok(html.includes('<blockquote>'));
  assert.ok(html.includes('<p>인용된 문장</p>'));
  assert.ok(html.includes('<h2 id="뒤따르는-제목">'));
  assert.ok(html.indexOf('</blockquote>') < html.indexOf('<h2'));
});

test('수평선과 문단', () => {
  const html = renderMarkdown('첫 문단\n\n---\n\n둘째 문단');
  assert.ok(html.includes('<hr>'));
  assert.equal((html.match(/<p>/g) || []).length, 2);
});

test('원문 HTML은 통과시키지 않는다', () => {
  const html = renderMarkdown('<div class="raw">내용</div>');
  assert.ok(html.includes('&lt;div'));
  assert.ok(!html.includes('<div class="raw">'));
});

test('base가 주어지면 내부 절대 경로 앞에 붙는다', () => {
  const html = renderMarkdown('![그림](/images/a.png)\n\n[소개](/about/)', { base: '/my-blog' });
  assert.ok(html.includes('src="/my-blog/images/a.png"'));
  assert.ok(html.includes('href="/my-blog/about/"'));
});

test('base는 외부 링크와 상대 경로를 건드리지 않는다', () => {
  const html = renderMarkdown(
    '[밖](https://example.com/a)\n\n[옆](sibling/)\n\n[프로토콜상대](//cdn.example.com/x.png)',
    { base: '/my-blog' },
  );
  assert.ok(html.includes('href="https://example.com/a"'));
  assert.ok(html.includes('href="sibling/"'));
  assert.ok(html.includes('href="//cdn.example.com/x.png"'));
});

test('base가 없으면 경로가 그대로 남는다', () => {
  const html = renderMarkdown('[소개](/about/)');
  assert.ok(html.includes('href="/about/"'));
});
