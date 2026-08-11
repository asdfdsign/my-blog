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

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`\n포트 번호가 잘못됐습니다: ${values.port}\n1~65535 사이의 정수를 넣으세요.\n`);
  process.exit(1);
}

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

// listen 실패는 'error' 이벤트로 온다. 잡지 않으면 Node가 스택 트레이스를 뱉는데,
// 실제 원인은 "포트가 이미 쓰이는 중" 같은 단순한 것이라 읽는 사람만 손해다.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n${port} 포트가 이미 사용 중입니다.\n\n` +
        `이미 미리보기 서버가 떠 있을 수 있습니다. 브라우저에서 먼저 확인해 보세요:\n` +
        `  http://localhost:${port}\n\n` +
        `다른 포트로 띄우려면:\n  node src/serve.mjs --port ${port + 1}\n`,
    );
  } else if (err.code === 'EACCES') {
    console.error(`\n${port} 포트를 열 권한이 없습니다. 1024보다 큰 번호를 쓰세요.\n`);
  } else {
    console.error(`\n서버를 시작하지 못했습니다: ${err.message}\n`);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`미리보기: http://localhost:${port}  (Ctrl+C로 종료)`);
});
