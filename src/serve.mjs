// dist/ 를 띄우는 로컬 미리보기 서버. 개발용이며 배포에는 쓰지 않는다.
// 외부 패키지를 쓰지 않는 이유는 CLAUDE.md의 "npm 패키지 0" 규칙 때문이다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const { values } = parseArgs({ options: { port: { type: 'string', short: 'p' } } });
const port = Number(values.port ?? 8080);

// 요청 경로를 dist/ 안의 실제 파일로 옮긴다. 디렉터리는 index.html로 떨어뜨려
// 확장자 없는 깔끔한 URL(/posts/foo/)이 동작하게 한다.
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }

  const target = path.resolve(DIST, `.${path.posix.normalize(decoded)}`);

  // dist/ 밖으로 나가는 경로는 거부한다.
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return null;

  const candidates = decoded.endsWith('/')
    ? [path.join(target, 'index.html')]
    : [target, path.join(target, 'index.html')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url ?? '/');

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    console.log(`404 ${req.url}`);
    return;
  }

  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    // 개발 중에는 캐시가 방해만 된다.
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

if (!fs.existsSync(DIST)) {
  console.error(`dist/ 가 없습니다. 먼저 빌드하세요:\n  node src/build.mjs\n`);
  process.exit(1);
}

server.listen(port, () => {
  console.log(`미리보기: http://localhost:${port}  (Ctrl+C로 종료)`);
});
