// Runs in <head> before first paint: flags JS/reduced-motion and keeps the shoji
// doors closed when we arrived through a page transition (main.js opens them).
(function () {
  var html = document.documentElement;
  html.classList.remove('no-js');
  html.classList.add('js');
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) html.classList.add('reduced');
  try {
    if (sessionStorage.getItem('th-shoji') === '1') {
      html.classList.add('shoji-in');
      sessionStorage.removeItem('th-shoji');
    }
  } catch (e) { /* storage blocked */ }
})();
