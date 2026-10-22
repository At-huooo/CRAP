/* =========================================================
   modes/shared.js
   Form groups and small helpers used by both modes.
   ========================================================= */

import { BALL_PARAMS } from "../params.js";
import { ApiError } from "../api.js";

/** Collapsible "Ball and air" group: the same in both modes. */
export const BALL_GROUP = {
  title: "Ball and air",
  params: BALL_PARAMS,
  collapsible: true,
  resettable: true,
  summary: (get, defaults) => (isDefault(BALL_PARAMS, get, defaults) ? "Golf ball" : "Custom"),
};

/** Collapsible solver settings; each mode chooses which ones it needs. */
export function solverGroup(params) {
  return {
    title: "Solver",
    params,
    collapsible: true,
    resettable: true,
    summary: (get, defaults) => (isDefault(params, get, defaults) ? "Defaults" : "Custom"),
  };
}

function isDefault(names, get, defaults) {
  return names.every((name) => get(name) === defaults[name]);
}

/** Put a submit button into its "working" state and back. */
export function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.idleText ??= button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.idleText) {
    button.textContent = button.dataset.idleText;
  }
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

/** Turn any error into a message for the result area. */
export function errorMessage(error) {
  if (error instanceof ApiError && error.kind === "blocked") {
    return {
      tone: "error",
      title: "The browser blocked the server's answer",
      text: error.message,
    };
  }
  if (error instanceof ApiError && error.kind === "network") {
    return {
      tone: "error",
      title: "Couldn't reach the server",
      text: `${error.message} Check that the backend is running, or change the address from the server button in the top bar.`,
    };
  }
  return {
    tone: "error",
    title: "The calculation failed",
    text: error.message,
  };
}
