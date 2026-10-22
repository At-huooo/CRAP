/* =========================================================
   api.js
   Thin wrappers around the FastAPI endpoints in
   backend/main.py. Each function takes a plain object of
   query parameters and returns the parsed JSON.
   ========================================================= */

import { getApiBase } from "./config.js";

/** An error with a message that is safe to show to the user. */
export class ApiError extends Error {
  /**
   * @param {string} message  shown in the UI
   * @param {"network"|"blocked"|"validation"|"server"} kind
   */
  constructor(message, kind) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
  }
}

/** Send a GET request to `path` with `params` as the query string. */
async function get(path, params = {}, { signal } = {}) {
  const base = getApiBase();
  const url = new URL(path, base + "/");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw await explainFetchFailure(url, base);
  }

  if (response.ok) {
    return response.json();
  }

  // FastAPI reports bad inputs as 422 with a list of problems.
  if (response.status === 422) {
    const body = await response.json().catch(() => null);
    throw new ApiError(describeValidationError(body), "validation");
  }

  throw new ApiError(`The server answered with error ${response.status}.`, "server");
}

/**
 * fetch() gives the same vague error whether the server is down or the
 * browser blocked its answer (CORS). Tell them apart: a "no-cors" request
 * still succeeds if the server is up, it just hides the response from us.
 */
async function explainFetchFailure(url, base) {
  const serverAnswered = await fetch(url, { mode: "no-cors" }).then(() => true, () => false);

  if (serverAnswered) {
    return new ApiError(
      `The server at ${base} is running, but the browser blocked its answer. ` +
        `Either this page's address (${window.location.origin}) is not in the backend's ` +
        `allowed origins (CORS), or the server crashed on this request; its terminal will show which.`,
      "blocked",
    );
  }
  return new ApiError(`No response from the server at ${base}.`, "network");
}

/** Turn FastAPI's 422 body into one readable sentence. */
function describeValidationError(body) {
  // Our own HTTPException(422, detail="...") sends a plain string.
  if (typeof body?.detail === "string") return body.detail;

  const problems = Array.isArray(body?.detail) ? body.detail : [];
  if (problems.length === 0) {
    return "The server rejected one of the values.";
  }
  return problems
    .map((p) => `${p.loc?.at(-1) ?? "value"}: ${p.msg}`)
    .join("; ");
}

/* ---------- Endpoints ---------- */

export const api = {
  /** GET /health → { status: "ok" } */
  health: (options) => get("health", {}, options),

  /** GET /trajectory → { landed, range, flight_time, max_height, impact_speed, points[] } */
  trajectory: (params, options) => get("trajectory", params, options),

  /** GET /launch_velocity → { launch_speed } */
  launchVelocity: (params, options) => get("launch_velocity", params, options),

  /** GET /drop_height → { drop_height, launch_speed, reachable, reason, range_at_ramp_top } */
  dropHeight: (params, options) => get("drop_height", params, options),
};

/**
 * Run `promise`, and call `onSlow()` if it takes longer than `ms`.
 * Used to explain the wait when a sleeping Render server wakes up.
 */
export async function withSlowNotice(promise, onSlow, ms = 4000) {
  const timer = setTimeout(onSlow, ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}
