/* =========================================================
   form.js
   Builds a mode's form from a list of groups, keeps every
   input in sync with the shared store, and offers small
   helpers to show errors and notes under fields.

   A group looks like:
     {
       title: "Ramp",
       text: "Optional help line",
       params: ["ramp_height", "drop_height"],
       collapsible: true,          // render as <details>
       open: false,                // start collapsed
       summary: (get) => "text",   // shown next to a collapsed title
       resettable: true,           // adds a "Reset to defaults" button
     }
   ========================================================= */

import { PARAMS, defaultValues } from "./params.js";

/**
 * @param {HTMLFormElement} form   a form containing a [data-groups] element
 * @param {object[]} groups        layout, see above
 * @param {object} store           from createStore()
 * @param {string} idPrefix        keeps element ids unique between modes
 */
export function buildForm(form, groups, store, idPrefix) {
  const container = form.querySelector("[data-groups]");
  const fields = new Map();      // param name → field parts
  const summaries = [];          // groups whose summary text needs updating

  for (const group of groups) {
    container.append(buildGroup(group));
  }

  /* ---------- Building ---------- */

  function buildGroup(group) {
    const collapsible = Boolean(group.collapsible);
    const root = document.createElement(collapsible ? "details" : "fieldset");
    root.className = "group";
    if (collapsible && group.open) root.open = true;

    const title = document.createElement(collapsible ? "summary" : "legend");
    title.className = "group__title";
    title.append(group.title);

    if (group.summary) {
      const summary = document.createElement("span");
      summary.className = "group__summary";
      title.append(summary);
      summaries.push({ group, element: summary });
    }
    root.append(title);

    if (group.text) {
      const text = document.createElement("p");
      text.className = "group__text";
      text.textContent = group.text;
      root.append(text);
    }

    const grid = document.createElement("div");
    grid.className = "group__fields";
    for (const name of group.params) {
      grid.append(buildField(name));
    }
    root.append(grid);

    if (group.resettable) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "button button--ghost group__reset";
      reset.textContent = "Reset to defaults";
      reset.addEventListener("click", () => store.reset(group.params));
      root.append(reset);
    }

    return root;
  }

  function buildField(name) {
    const def = PARAMS[name];
    const id = `${idPrefix}-${name}`;

    const root = document.createElement("div");
    root.className = "field" + (def.wide ? " field--wide" : "");
    root.dataset.param = name;

    const label = document.createElement("label");
    label.className = "field__label";
    label.htmlFor = id;
    label.append(def.label);
    if (def.symbol) {
      const symbol = document.createElement("span");
      symbol.className = "field__symbol";
      symbol.textContent = def.symbol;
      label.append(symbol);
    }

    const control = document.createElement("span");
    control.className = "field__control";

    const input = document.createElement("input");
    input.className = "field__input";
    input.id = id;
    input.name = name;
    input.type = "text";             // "number" inputs fight with typing "0." and commas
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = def.placeholder ?? "";
    input.value = store.get(name);
    control.append(input);

    if (def.unit) {
      const unit = document.createElement("span");
      unit.className = "field__unit";
      unit.textContent = def.unit;
      control.append(unit);
    }

    const note = document.createElement("p");
    note.className = "field__note";
    note.id = `${id}-note`;
    note.textContent = def.hint ?? "";
    input.setAttribute("aria-describedby", note.id);

    root.append(label, control, note);

    input.addEventListener("input", () => {
      clearError(name);
      store.set(name, input.value, { origin: "user", source: input });
    });

    fields.set(name, { root, input, note, hint: def.hint ?? "", custom: null, error: null });
    return root;
  }

  /* ---------- Keeping inputs in sync with the store ---------- */

  store.subscribe((name, value, meta) => {
    const field = fields.get(name);
    if (field && meta.source !== field.input) {
      field.input.value = value;
      clearError(name);
    }
    updateSummaries();
  });
  updateSummaries();

  function updateSummaries() {
    for (const { group, element } of summaries) {
      element.textContent = group.summary(store.get, defaultValues());
    }
  }

  /* ---------- Notes and errors under fields ---------- */

  function renderNote(field) {
    if (field.error) {
      field.note.textContent = field.error;
      field.note.dataset.tone = "error";
    } else if (field.custom) {
      field.note.textContent = field.custom.text;
      field.note.dataset.tone = field.custom.tone ?? "";
    } else {
      field.note.textContent = field.hint;
      delete field.note.dataset.tone;
    }
  }

  function clearError(name) {
    const field = fields.get(name);
    if (!field || !field.error) return;
    field.error = null;
    delete field.root.dataset.state;
    field.input.removeAttribute("aria-invalid");
    renderNote(field);
  }

  return {
    /** Show errors (name → message) and focus the first bad field. */
    showErrors(errors) {
      let first = null;
      for (const [name, message] of Object.entries(errors)) {
        const field = fields.get(name);
        if (!field) continue;
        field.error = message;
        field.root.dataset.state = "error";
        field.input.setAttribute("aria-invalid", "true");
        renderNote(field);
        first ??= field;
      }
      if (first) {
        // Open a collapsed group so the error is visible.
        first.root.closest("details")?.setAttribute("open", "");
        first.input.focus();
      }
    },

    clearErrors() {
      for (const name of fields.keys()) clearError(name);
    },

    /** Replace a field's hint with a note. Pass null text to restore the hint. */
    setNote(name, text, tone) {
      const field = fields.get(name);
      if (!field) return;
      field.custom = text ? { text, tone } : null;
      renderNote(field);
    },

    /** Mark a field as filled in automatically (styled differently). */
    setAuto(name, isAuto) {
      const field = fields.get(name);
      if (field) field.root.dataset.auto = String(isAuto);
    },
  };
}
