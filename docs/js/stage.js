/* =========================================================
   stage.js
   The right-hand side of the page: plot card, legend and
   result area. Both modes share it; each mode hands over a
   "view" describing what it wants shown:

     {
       title:     "Flight path",
       scene:     { points, radius, launchHeight, ghost?, targetX? } | null,
       emptyText: "Shown when there is no scene",
       results:   see results.js,
     }
   ========================================================= */

import { TrajectoryPlot } from "./plot.js";
import { renderResults } from "./results.js";

export function createStage() {
  const plotEl = document.getElementById("plot");
  const titleEl = document.getElementById("plot-title");
  const emptyEl = document.getElementById("plot-empty");
  const legendEl = document.getElementById("plot-legend");
  const replayButton = document.getElementById("replay");
  const scaleToggle = document.getElementById("true-scale");
  const resultsEl = document.getElementById("results");

  const plot = new TrajectoryPlot(plotEl);

  replayButton.addEventListener("click", () => plot.replay());
  scaleToggle.addEventListener("change", () => plot.setTrueScale(scaleToggle.checked));

  /**
   * Show a view.
   * @param {object} view     see the top of this file
   * @param {boolean} fresh   true for a new result, false when switching modes
   */
  function show(view, { fresh = false } = {}) {
    titleEl.textContent = view.title ?? "Flight path";

    const scene = view.scene ?? null;
    if (scene) {
      emptyEl.textContent = "";
      plot.show(scene);
    } else {
      emptyEl.textContent = view.emptyText ?? "";
      plot.clear();
    }

    replayButton.disabled = !scene;
    legendEl.hidden = !scene;
    legendEl.querySelector('[data-legend="ghost"]').hidden = !scene?.ghost;
    legendEl.querySelector('[data-legend="target"]').hidden = !scene?.targetX;

    renderResults(resultsEl, view.results);

    // On phones the plot sits below the form; bring a fresh result into view.
    if (fresh && window.matchMedia("(max-width: 900px)").matches) {
      plotEl.closest(".plot-card").scrollIntoView({ block: "start" });
    }
  }

  return { show };
}
