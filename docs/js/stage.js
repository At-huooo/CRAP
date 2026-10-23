/* =========================================================
   stage.js
   The right-hand side of the page: plot card, playback bar,
   legend and result area. Both modes share it; each mode
   hands over a "view" describing what it wants shown:

     {
       title:     "Flight path",
       scene:     { points, radius, launchHeight, ghost?, targetX? } | null,
       emptyText: "Shown when there is no scene",
       results:   see results.js,
     }
   ========================================================= */

import { TrajectoryPlot } from "./plot.js";
import { renderResults } from "./results.js";
import { formatNumber, formatLength } from "./format.js";

const SCRUB_STEPS = 1000;

export function createStage() {
  const plotEl = document.getElementById("plot");
  const titleEl = document.getElementById("plot-title");
  const emptyEl = document.getElementById("plot-empty");
  const legendEl = document.getElementById("plot-legend");
  const playButton = document.getElementById("replay");
  const scrubber = document.getElementById("scrubber");
  const playbackEl = document.getElementById("playback");
  const scaleToggle = document.getElementById("true-scale");
  const resultsEl = document.getElementById("results");
  const readout = Object.fromEntries(
    [...document.querySelectorAll("[data-readout]")].map((el) => [el.dataset.readout, el]),
  );

  const plot = new TrajectoryPlot(plotEl);
  let radius = 0;

  /* ---------- Playback bar ---------- */

  playButton.addEventListener("click", () => plot.togglePlay());
  scaleToggle.addEventListener("change", () => plot.setTrueScale(scaleToggle.checked));

  scrubber.addEventListener("input", () => {
    plot.setTime((scrubber.valueAsNumber / SCRUB_STEPS) * plot.flightTime());
  });

  plot.onPlayState = (playing) => {
    playButton.dataset.playing = String(playing);
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play flight");
  };

  // Keep the scrubber and the numbers next to it in step with the ball.
  plot.onTime = (t, state) => {
    const total = plot.flightTime();
    const fraction = total > 0 ? t / total : 0;
    scrubber.value = String(Math.round(fraction * SCRUB_STEPS));
    scrubber.parentElement.style.setProperty("--progress", `${fraction * 100}%`);
    scrubber.setAttribute("aria-valuetext", `${formatNumber(t, 3)} seconds`);

    if (!state) {
      for (const el of Object.values(readout)) el.textContent = "–";
      return;
    }
    readout.t.textContent = `${formatNumber(t, 3)} s`;
    readout.x.textContent = `${formatLength(state.x)} m`;
    readout.y.textContent = `${formatLength(state.y - radius)} m`;
    readout.v.textContent = `${formatNumber(Math.hypot(state.vx, state.vy), 2)} m/s`;
  };

  // Space bar plays and pauses while the plot or scrubber has focus.
  for (const el of [scrubber, plot.canvas]) {
    el.addEventListener("keydown", (event) => {
      if (event.key === " " && !scrubber.disabled) {
        event.preventDefault();
        plot.togglePlay();
      }
    });
  }

  /**
   * Show a view.
   * @param {object} view     see the top of this file
   * @param {boolean} fresh   true for a new result, false when switching modes
   */
  function show(view, { fresh = false } = {}) {
    titleEl.textContent = view.title ?? "Flight path";

    const scene = view.scene ?? null;
    radius = scene?.radius ?? 0;
    if (scene) {
      emptyEl.textContent = "";
      plot.show(scene);
    } else {
      emptyEl.textContent = view.emptyText ?? "";
      plot.clear();
    }

    playButton.disabled = !scene;
    scrubber.disabled = !scene;
    playbackEl.hidden = !scene;
    legendEl.hidden = !scene;
    legendEl.querySelector('[data-legend="ghost"]').hidden = !scene?.ghost;
    legendEl.querySelector('[data-legend="target"]').hidden = !scene?.targetX;

    renderResults(resultsEl, view.results);

    // On phones the plot sits below the form; bring a fresh result into view.
    if (fresh && window.matchMedia("(max-width: 900px)").matches) {
      plotEl.closest(".plot-card").scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  return { show };
}
