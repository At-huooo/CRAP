/* =========================================================
   theme.js
   The light/dark toggle in the top bar.

   - Without a saved choice the page follows the system
     setting, including when it changes while open.
   - Clicking the button saves the choice in this browser.
   - Other code (the plot) listens for the "themechange"
     event on window to redraw in the new colours.
   ========================================================= */

const STORAGE_KEY = "crap.theme";

export function setupThemeToggle() {
  const button = document.getElementById("theme-toggle");
  const label = button.querySelector(".theme-toggle__label");
  const system = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    button.setAttribute("aria-pressed", String(theme === "dark"));
    // The label names what a click switches to.
    label.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    window.dispatchEvent(new Event("themechange"));
  }

  button.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved, but still switches for this visit.
    }
    apply(next);
  });

  system.addEventListener("change", (event) => {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    if (!saved) apply(event.matches ? "dark" : "light");
  });

  apply(current());
}
