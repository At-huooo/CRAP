/* =========================================================
   main.js
   Starts the page: creates the shared store and stage,
   sets up both modes, the mode tabs and the server status.

   File map
     config.js             backend address
     api.js                requests to the backend
     params.js             every input, its limits and defaults
     store.js              shared input values, remembered locally
     form.js               builds forms from params.js
     plot.js               canvas drawing of the flight
     stage.js              plot + results area shared by the modes
     results.js            result cards under the plot
     format.js             number formatting
     theme-init.js         sets light/dark before the page draws
     theme.js              the light/dark toggle
     modes/trajectory.js   trajectory simulation mode
     modes/drop-height.js  drop height mode
     modes/shared.js       bits both modes use
   ========================================================= */

import { api } from "./api.js";
import { getApiBase, setApiBase, getDefaultApiBase } from "./config.js";
import { createStore } from "./store.js";
import { createStage } from "./stage.js";
import { createTrajectoryMode } from "./modes/trajectory.js";
import { createDropHeightMode } from "./modes/drop-height.js";
import { setupThemeToggle } from "./theme.js";

setupThemeToggle();

const server = createServerStatus();
const store = createStore();
const stage = createStage();

const modes = {
  trajectory: createTrajectoryMode({ store, stage, server }),
  "drop-height": createDropHeightMode({
    store,
    stage,
    server,
    // "Simulate this drop": copy the answer over and run it.
    openInTrajectory(dropHeight) {
      store.set("drop_height", dropHeight, { origin: "handoff" });
      switchMode("trajectory", { run: true });
    },
  }),
};

let currentMode = null;

/* ---------- Mode tabs ---------- */

const tabs = document.querySelectorAll(".mode-switch__tab");

function switchMode(name, options = {}) {
  if (!modes[name]) name = "trajectory";
  if (name === currentMode) return;

  modes[currentMode]?.deactivate();
  currentMode = name;

  for (const tab of tabs) {
    const selected = tab.dataset.mode === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const [key, mode] of Object.entries(modes)) {
    mode.section.hidden = key !== name;
  }

  // Keep the mode in the URL so it survives a reload and can be linked.
  history.replaceState(null, "", `#${name}`);
  modes[name].activate(options);
}

for (const tab of tabs) {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
}

// Arrow keys move between tabs, as expected for a tab list.
document.querySelector(".mode-switch").addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const list = [...tabs];
  const index = list.findIndex((t) => t.dataset.mode === currentMode);
  const next = list[(index + (event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
  next.focus();
  switchMode(next.dataset.mode);
});

window.addEventListener("hashchange", () => switchMode(location.hash.slice(1)));

switchMode(location.hash.slice(1) || "trajectory");

/* ---------- Server status pill and dialog ---------- */

function createServerStatus() {
  const pill = document.getElementById("server-status");
  const label = pill.querySelector(".server-status__label");
  const dialog = document.getElementById("server-dialog");
  const formEl = document.getElementById("server-form");
  const urlInput = document.getElementById("server-url");
  const status = document.getElementById("server-dialog-status");

  const LABELS = {
    checking: "Checking server…",
    online: "Server online",
    offline: "Server unreachable",
    blocked: "Server blocks this page",
    waking: "Waking server…",
  };

  let lastError = null;

  /**
   * Update the pill.
   * state: "checking" | "online" | "offline" | "blocked" | "waking"
   */
  function report(state, error = null) {
    lastError = error;
    pill.dataset.state = state;
    label.textContent = LABELS[state];
    pill.title = state === "waking"
      ? "A sleeping server on Render can take up to a minute to start."
      : error?.message ?? getApiBase();
  }

  async function check() {
    report("checking");
    try {
      await api.health();
      report("online");
      return true;
    } catch (error) {
      report(error.kind === "blocked" ? "blocked" : "offline", error);
      return false;
    }
  }

  pill.addEventListener("click", () => {
    urlInput.value = getApiBase();
    // Show why the last check failed, if it did.
    status.dataset.tone = lastError ? "error" : "";
    status.textContent = lastError?.message ?? "";
    dialog.showModal();
  });

  document.getElementById("server-reset").addEventListener("click", () => {
    urlInput.value = getDefaultApiBase();
  });

  formEl.addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "save") return;   // "Cancel" just closes
    event.preventDefault();
    if (!urlInput.reportValidity()) return;

    const url = urlInput.value.trim();
    setApiBase(url === getDefaultApiBase() ? null : url);

    status.dataset.tone = "";
    status.textContent = "Checking…";
    const ok = await check();
    if (ok) {
      status.dataset.tone = "ok";
      status.textContent = "Connected.";
      setTimeout(() => dialog.close(), 600);
    } else {
      status.dataset.tone = "error";
      status.textContent = lastError?.message ?? `No answer from ${getApiBase()}/health.`;
    }
  });

  check();
  return { report, check };
}
