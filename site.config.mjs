// 사이트 전역 설정. 배포 전에 고쳐야 하는 파일은 여기 하나뿐이다.

// RSS·사이트맵·og:url이 절대 경로를 요구한다. 배포 도메인으로 바꿀 것.
// 끝에 슬래시를 넣지 않는다.
const url = 'https://asdfdsign.github.io/my-blog';

// 사이트가 도메인 루트가 아니라 하위 경로에 놓일 때 모든 내부 링크 앞에 붙는 값.
// url에서 뽑아 쓰는 이유: 배포 주소를 고칠 자리를 두 군데로 늘리면 반드시 한쪽만
// 고치는 날이 온다. 루트 배포면 자연히 빈 문자열이 된다.
const base = new URL(url).pathname.replace(/\/+$/, '');

export default {
  title: '나의 블로그',
  description: '마크다운으로 쓰고 정적 사이트로 굽는 개인 블로그.',
  author: '나성은',
  lang: 'ko',
  url,
  base,
};
