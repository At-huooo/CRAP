/* =========================================================
   format.js
   Number formatting used across the page.
   ========================================================= */

/** Fixed number of decimals, e.g. formatNumber(1.23456, 3) → "1.235". */
export function formatNumber(value, decimals = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "–";
  }
  return value.toFixed(decimals);
}

/** A value to put back into an input: rounded, without trailing zeros. */
export function formatInput(value, decimals = 4) {
  return String(Number(value.toFixed(decimals)));
}

/** Pick sensible decimals for a length in metres, based on its size. */
export function formatLength(metres) {
  const size = Math.abs(metres);
  if (size >= 10) return formatNumber(metres, 2);
  if (size >= 1) return formatNumber(metres, 3);
  return formatNumber(metres, 4);
}
