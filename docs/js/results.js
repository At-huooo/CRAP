/* =========================================================
   results.js
   Builds the result area under the plot. Each mode passes
   a description of what to show; this file turns it into
   elements. Nothing here talks to the backend.

     renderResults(container, {
       message: { tone: "error"|"warn"|"info", title, text },
       answer:  { label, value, unit, action: { label, onClick } },
       stats:   [{ label, value, unit }],
     })

   The answer and the stats share one dark band; a message
   sits above it in an outlined box.
   ========================================================= */

export function renderResults(container, { answer, message, stats } = {}) {
  container.replaceChildren();

  if (message) container.append(buildMessage(message));

  if (answer || stats?.length) {
    const band = el("div", "result-band");
    if (answer) band.append(buildAnswer(answer));
    if (stats?.length) band.append(buildStats(stats));
    container.append(band);
  }
}

function buildAnswer({ label, value, unit, action }) {
  const root = el("div", "answer");

  const text = el("div");
  text.append(el("p", "answer__label", label));
  const valueEl = el("p", "answer__value", value);
  if (unit) valueEl.append(el("span", "answer__unit", unit));
  text.append(valueEl);
  root.append(text);

  if (action) {
    const button = el("button", "button", action.label);
    button.type = "button";
    button.addEventListener("click", action.onClick);
    root.append(button);
  }
  return root;
}

function buildMessage({ tone = "info", title, text }) {
  const root = el("div", "message");
  root.dataset.tone = tone;
  root.setAttribute("role", tone === "error" ? "alert" : "status");
  if (title) root.append(el("p", "message__title", title));
  if (text) root.append(el("p", "", text));
  return root;
}

function buildStats(stats) {
  const list = el("ul", "stats");
  for (const { label, value, unit } of stats) {
    const item = el("li", "stat");
    item.append(el("span", "stat__label", label));
    const valueEl = el("span", "stat__value", value);
    if (unit) valueEl.append(el("span", "stat__unit", unit));
    item.append(valueEl);
    list.append(item);
  }
  return list;
}

/** Create an element with a class and optional text. */
function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
