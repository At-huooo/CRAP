/* =========================================================
   modes/trajectory.js
   Trajectory simulation mode.

   - The user enters a launch (speed, angle, height) and the
     backend simulates the flight (GET /trajectory).
   - If all four ramp values are filled in, the launch speed
     is worked out from the ramp (GET /launch_velocity) and
     written into the launch speed field automatically.
     Typing a speed by hand still works; changing a ramp
     value afterwards recalculates it again.
   ========================================================= */

import { api, ApiError, withSlowNotice } from "../api.js";
import { buildForm } from "../form.js";
import { readValues, validate, RAMP_PARAMS, BALL_PARAMS } from "../params.js";
import { formatInput, formatNumber, formatLength } from "../format.js";
import { BALL_GROUP, solverGroup, setBusy, errorMessage } from "./shared.js";

const GROUPS = [
  {
    title: "Ramp",
    text: "Fill in all four and the launch speed is calculated for you.",
    params: RAMP_PARAMS,
  },
  {
    title: "Launch",
    params: ["v0", "angle_deg", "launch_height"],
  },
  BALL_GROUP,
  solverGroup(["dt", "sample_dt"]),
];

/** Everything /trajectory needs. */
const RUN_PARAMS = ["v0", "angle_deg", "launch_height", ...BALL_PARAMS, "dt", "sample_dt"];

/** Everything /launch_velocity needs. */
const SPEED_PARAMS = [...RAMP_PARAMS, ...BALL_PARAMS];

/** Remembers whether v0 came from the ramp ("ramp") or was typed ("user"). */
const V0_SOURCE_KEY = "_v0_source";

const AUTOFILL_DELAY_MS = 350;

/**
 * @param {object} app  { store, stage, server }
 */
export function createTrajectoryMode({ store, stage, server }) {
  const section = document.getElementById("mode-trajectory");
  const formEl = section.querySelector("form");
  const submitButton = formEl.querySelector('[type="submit"]');
  const form = buildForm(formEl, GROUPS, store, "trajectory");

  let active = false;
  let view = emptyView();
  let lastPoints = null;        // previous run, drawn dashed for comparison

  let autofillTimer = null;
  let autofillRequest = null;   // AbortController of the request in flight
  let autofillPending = null;   // promise of the running auto-fill
  let rampChangedWhileAway = false;

  /* ---------- Reacting to input ---------- */

  store.subscribe((name, value, meta) => {
    if (name === "v0" && meta.origin === "user") {
      // The user typed their own launch speed.
      store.set(V0_SOURCE_KEY, value.trim() ? "user" : "");
      form.setAuto("v0", false);
      form.setNote("v0", value.trim() ? "Entered by hand. Change a ramp value to calculate it again." : null);
      return;
    }

    if (SPEED_PARAMS.includes(name) && meta.origin !== "auto") {
      if (active) scheduleAutofill();
      else rampChangedWhileAway = true;
    }

    if (name === "drop_height" || name === "ramp_height") checkDropAboveRamp();
  });

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    run();
  });

  /* ---------- Auto-filling the launch speed ---------- */

  function scheduleAutofill() {
    clearTimeout(autofillTimer);
    autofillTimer = setTimeout(() => {
      autofillPending = autofill();
    }, AUTOFILL_DELAY_MS);
  }

  /** Ask the backend for the launch speed and put it in the v0 field. */
  async function autofill() {
    autofillRequest?.abort();

    const { values, errors, missing } = readValues(SPEED_PARAMS, store.all());
    const rampMissing = RAMP_PARAMS.filter((n) => missing.includes(n));

    if (rampMissing.length > 0) {
      // Not everything is filled in yet: nothing to calculate.
      if (store.get(V0_SOURCE_KEY) === "ramp") {
        form.setNote("v0", "Ramp values incomplete. Showing the last calculated speed.", "warn");
      }
      return;
    }
    if (Object.keys(errors).length > 0) {
      form.setNote("v0", "Fix the ramp values above to calculate the launch speed.", "warn");
      return;
    }

    autofillRequest = new AbortController();
    form.setNote("v0", "Calculating from the ramp…", "auto");

    try {
      const { launch_speed } = await withSlowNotice(
        api.launchVelocity(values, { signal: autofillRequest.signal }),
        () => server.report("waking"),
      );
      server.report("online");

      if (!Number.isFinite(launch_speed) || launch_speed <= 0) {
        throw new ApiError("no-energy", "server");
      }

      store.set("v0", formatInput(launch_speed, 4), { origin: "auto" });
      store.set(V0_SOURCE_KEY, "ramp");
      form.setAuto("v0", true);
      form.setNote("v0", `Calculated from the ramp: ${formatNumber(launch_speed, 3)} m/s`, "auto");
    } catch (error) {
      if (error.name === "AbortError") return;
      form.setAuto("v0", false);
      form.setNote("v0", await explainSpeedError(error), "error");
    }
  }

  /** A short note under the launch speed field explaining what went wrong. */
  async function explainSpeedError(error) {
    // The backend answers 422 with its own message when the ramp
    // values leave the ball too little energy to roll off.
    if (error.kind === "validation") return error.message;
    if (error.kind === "blocked") {
      server.report("blocked", error);
      return "The browser blocked the server's answer. Click the server button in the top bar for details.";
    }
    server.report("offline", error);
    return "Couldn't reach the server to calculate the launch speed.";
  }


  /** The model assumes the ball is released at or above the ramp top. */
  function checkDropAboveRamp() {
    const drop = validate("drop_height", store.get("drop_height")).value;
    const ramp = validate("ramp_height", store.get("ramp_height")).value;
    if (drop !== undefined && ramp !== undefined && drop < ramp) {
      form.setNote("drop_height", "Below the ramp top. The model assumes h ≥ h₀.", "warn");
    } else {
      form.setNote("drop_height", null);
    }
  }

  /* ---------- Running the simulation ---------- */

  async function run() {
    form.clearErrors();

    // Let a pending auto-fill finish first so we use the fresh speed.
    if (autofillTimer) {
      clearTimeout(autofillTimer);
      autofillTimer = null;
      autofillPending = autofill();
    }
    await autofillPending;

    const { values, errors } = readValues(RUN_PARAMS, store.all());
    if (errors.v0 === "Required") {
      errors.v0 = "Enter a launch speed, or fill in the ramp above";
    }
    if (Object.keys(errors).length > 0) {
      form.showErrors(errors);
      return;
    }

    setBusy(submitButton, true, "Simulating…");
    try {
      const data = await withSlowNotice(api.trajectory(values), () => server.report("waking"));
      server.report("online");

      view = resultView(data, values, lastPoints);
      lastPoints = data.points;
      stage.show(view, { fresh: true });
    } catch (error) {
      if (error.kind === "network" || error.kind === "blocked") {
        server.report(error.kind === "blocked" ? "blocked" : "offline", error);
      }
      view = { ...view, results: { message: errorMessage(error) } };
      stage.show(view);
    } finally {
      setBusy(submitButton, false);
    }
  }

  /* ---------- Views ---------- */

  function emptyView() {
    return {
      title: "Flight path",
      scene: null,
      emptyText: "Fill in the launch and run the simulation to see where the ball lands.",
    };
  }

  function resultView(data, values, ghost) {
    const answer = { label: "Lands at", value: formatLength(data.range), unit: "m" };
    const stats = [
      { label: "Launch speed", value: formatNumber(values.v0, 3), unit: "m/s" },
      { label: "Flight time", value: formatNumber(data.flight_time, 3), unit: "s" },
      { label: "Peak height", value: formatLength(data.max_height), unit: "m" },
      { label: "Impact speed", value: formatNumber(data.impact_speed, 2), unit: "m/s" },
    ];

    const message = data.landed
      ? null
      : {
          tone: "warn",
          title: "The ball never landed",
          text: "It was still in the air when the simulation stopped at 90 s. Check the launch speed and angle.",
        };

    return {
      title: "Flight path",
      scene: {
        points: data.points,
        peakHeight: data.max_height,
        radius: values.radius,
        launchHeight: values.launch_height,
        ghost,
      },
      results: { message, answer, stats },
    };
  }

  /* ---------- Mode switching (called from main.js) ---------- */

  function init() {
    // Restore how v0 was filled last time.
    if (store.get(V0_SOURCE_KEY) === "ramp" && store.get("v0")) {
      form.setAuto("v0", true);
      form.setNote("v0", "Calculated from the ramp", "auto");
    }
    checkDropAboveRamp();
    // Fill v0 on first load if the ramp is complete but no speed is set yet.
    if (!store.get("v0") || store.get(V0_SOURCE_KEY) === "ramp") {
      rampChangedWhileAway = true;
    }
  }

  /**
   * Show this mode.
   * @param {object} options  { run: true } to simulate right away
   */
  async function activate({ run: runNow = false } = {}) {
    active = true;
    stage.show(view);

    if (rampChangedWhileAway) {
      rampChangedWhileAway = false;
      autofillPending = autofill();
    }
    if (runNow) await run();
  }

  function deactivate() {
    active = false;
  }

  init();
  return { section, activate, deactivate };
}
