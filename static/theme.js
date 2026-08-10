// 테마 토글. system → light → dark 순환.
//
// 첫 페인트 전에 data-theme을 다는 일은 여기가 아니라 <head>의 인라인 스크립트가 한다
// (template.mjs 참고). 이 파일은 defer라 이미 늦었고, 버튼 동작과 라벨만 담당한다.

(function () {
  var KEY = 'theme';
  var ORDER = ['system', 'light', 'dark'];
  var LABEL = { system: '시스템', light: '라이트', dark: '다크' };
  var ICON = { system: '◐', light: '☀', dark: '☾' };

  var button = document.getElementById('theme-toggle');
  if (!button) return;

  var icon = button.querySelector('.theme-icon');
  var label = button.querySelector('.theme-label');

  // 사생활 보호 모드 등에서 localStorage 접근이 던질 수 있다. 실패하면 조용히 system.
  function read() {
    try {
      var saved = localStorage.getItem(KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function save(mode) {
    try {
      if (mode === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch (e) {
      /* 저장에 실패해도 이번 페이지에서는 테마가 적용된다 */
    }
  }

  // 라벨에는 '고른 모드'만 넣는다. system일 때 실제로 적용된 색까지 라벨에 박으면,
  // OS 설정이 바뀌었는데 change 이벤트를 못 받은 경우 라벨만 낡은 값으로 남는다.
  // 실제 색 전환은 CSS의 prefers-color-scheme이 알아서 처리한다.
  function apply(mode) {
    // system일 때는 속성을 지워서 CSS의 prefers-color-scheme 규칙이 다시 살아나게 한다.
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);

    icon.textContent = ICON[mode];
    label.textContent = LABEL[mode];
    button.setAttribute('aria-label', '테마 설정: ' + LABEL[mode] + ' — 눌러서 전환');
    button.setAttribute('title', '테마 설정: ' + LABEL[mode]);
  }

  var current = read();
  apply(current);

  button.addEventListener('click', function () {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    save(current);
    apply(current);
  });
})();
