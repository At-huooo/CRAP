/* =========================================================
   theme-init.js
   Loaded as a plain (non-module) script in <head> so the
   right theme is set before anything is drawn; otherwise
   dark-mode users would see a white flash on every load.
   The toggle button itself is wired up in js/theme.js.
   ========================================================= */

(function () {
  var saved = null;
  try {
    saved = localStorage.getItem("crap.theme");
  } catch (e) {
    // Storage blocked: just follow the system setting.
  }
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
})();
