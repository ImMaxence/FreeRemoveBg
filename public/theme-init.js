// Runs before Angular boots (no flash of the wrong theme or language).
document.documentElement.classList.add('js');

// Forced light/dark theme.
try {
  var mode = localStorage.getItem('frb-theme');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
} catch (e) {
  // Storage unavailable: the OS preference (prefers-color-scheme) applies.
}

// Public pages exist in English (at the root) and in French (/fr/…). A visitor landing on an
// English page while preferring French is sent to that version.
(function () {
  var path = location.pathname;
  if (!/^\/(changelog|legal|privacy|terms|accessibility)?\/?$/.test(path)) return;
  // Same list as src/app/core/languages.ts.
  var langs = ['en', 'fr'];
  var lang = null;
  try {
    lang = localStorage.getItem('frb-lang');
  } catch (e) {
    // ignore
  }
  if (langs.indexOf(lang) < 0) {
    lang = null;
    var browser = navigator.languages || [navigator.language];
    for (var i = 0; i < browser.length && !lang; i++) {
      var base = String(browser[i]).toLowerCase().split(/[-_]/)[0];
      if (langs.indexOf(base) >= 0) lang = base;
    }
  }
  if (lang && lang !== 'en') location.replace('/' + lang + (path === '/' ? '' : path.replace(/\/$/, '')) + location.search + location.hash);
})();
