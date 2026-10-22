/* =========================================================
   store.js
   One shared set of input values for both modes. Typing the
   ramp height in one mode fills it in the other as well.
   Values are kept as the text the user typed (so "0." stays
   "0." while typing) and remembered in this browser.
   ========================================================= */

import { defaultValues } from "./params.js";

const STORAGE_KEY = "crap.inputs.v1";

/**
 * Create the store.
 * Listeners are called as listener(name, value, meta), where
 * meta.origin says who made the change ("user", "auto", ...)
 * and meta.source is the input element that typed it, if any.
 */
export function createStore() {
  const values = { ...defaultValues(), ...loadSaved() };
  const listeners = new Set();

  function get(name) {
    return values[name] ?? "";
  }

  function set(name, value, meta = { origin: "code" }) {
    if (values[name] === value) return;
    values[name] = value;
    save(values);
    for (const listener of listeners) listener(name, value, meta);
  }

  /** Put every value back to its default. */
  function reset(names) {
    const defaults = defaultValues();
    for (const name of names) set(name, defaults[name], { origin: "reset" });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, set, reset, subscribe, all: () => ({ ...values }) };
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

let saveTimer;
function save(values) {
  // Writing on every keystroke is wasteful; wait for a pause.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      // Storage blocked: inputs just won't be remembered.
    }
  }, 300);
}
