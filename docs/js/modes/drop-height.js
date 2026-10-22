/* =========================================================
   modes/drop-height.js
   Drop height mode: the reverse question. Given a target
   distance, where on the ramp should the ball be released?

   1. GET /drop_height searches for the release height.
   2. GET /trajectory then simulates the flight at the
      resulting launch speed, so the answer can be plotted
      against the target flag.
   ========================================================= */

import { api, withSlowNotice } from "../api.js";
import { buildForm } from "../form.js";
import { readValues, BALL_PARAMS } from "../params.js";
import { formatInput, formatNumber, formatLength } from "../format.js";
import { BALL_GROUP, solverGroup, setBusy, errorMessage } from "./shared.js";

const GROUPS = [
  {
    title: "Target",
    params: ["target_range", "angle_deg", "launch_height"],
  },
  {
    title: "Ramp",
    params: ["ramp_height", "slip_coeff", "rolling_res", "max_drop_height"],
  },
  BALL_GROUP,
  solverGroup(["tol", "dt"]),
];

/** Everything /drop_height needs. */
const SEARCH_PARAMS = [
  "target_range", "angle_deg", "launch_height",
  "ramp_height", "slip_coeff", "rolling_res", "max_drop_height",
  ...BALL_PARAMS, "tol", "dt",
];

/**
 * @param {object} app  { store, stage, server, openInTrajectory }
 */
export function createDropHeightMode({ store, stage, server, openInTrajectory }) {
  const section = document.getElementById("mode-drop-height");
  const formEl = section.querySelector("form");
  const submitButton = formEl.querySelector('[type="submit"]');
  const form = buildForm(formEl, GROUPS, store, "drop");

  let view = {
    title: "Flight path",
    scene: null,
    emptyText: "Enter a target distance and calculate to find where to release the ball.",
  };
  let lastPoints = null;

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    calculate();
  });

  async function calculate() {
    form.clearErrors();
    const { values, errors } = readValues(SEARCH_PARAMS, store.all());
    if (Object.keys(errors).length > 0) {
      form.showErrors(errors);
      return;
    }

    setBusy(submitButton, true, "Searching…");
    try {
      const slow = () => server.report("waking");
      const answer = await withSlowNotice(api.dropHeight(values), slow);
      server.report("online");

      if (answer.reachable) {
        const flight = await api.trajectory(flightParams(values, answer.launch_speed));
        view = foundView(values, answer, flight, lastPoints);
        lastPoints = flight.points;
      } else {
        view = await notFoundView(values, answer);
      }
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

  /** Query parameters for simulating the flight at a given launch speed. */
  function flightParams(values, launchSpeed) {
    return {
      v0: launchSpeed,
      angle_deg: values.angle_deg,
      launch_height: values.launch_height,
      radius: values.radius,
      mass: values.mass,
      drag_coeff: values.drag_coeff,
      air_density: values.air_density,
      dt: values.dt,
    };
  }

  /* ---------- Views ---------- */

  function foundView(values, answer, flight, ghost) {
    const h = answer.drop_height;
    return {
      title: "Flight path to the target",
      scene: {
        points: flight.points,
        peakHeight: flight.max_height,
        radius: values.radius,
        launchHeight: values.launch_height,
        targetX: values.target_range,
        ghost,
      },
      results: {
        answer: {
          label: "Release the ball at",
          value: formatLength(h),
          unit: "m",
          action: {
            label: "Simulate this drop",
            onClick: () => openInTrajectory(formatInput(h, 5)),
          },
        },
        stats: [
          { label: "Above the ramp top", value: formatLength(h - values.ramp_height), unit: "m" },
          { label: "Launch speed", value: formatNumber(answer.launch_speed, 3), unit: "m/s" },
          { label: "Predicted distance", value: formatLength(flight.range), unit: "m" },
          { label: "Flight time", value: formatNumber(flight.flight_time, 3), unit: "s" },
        ],
      },
    };
  }

  /**
   * No release height works. If the ball already flies too far from
   * the ramp top, plot that flight so the overshoot is visible.
   */
  async function notFoundView(values, answer) {
    let scene = null;
    if (answer.range_at_ramp_top >= values.target_range) {
      try {
        const { launch_speed } = await api.launchVelocity({
          ramp_height: values.ramp_height,
          drop_height: values.ramp_height,
          slip_coeff: values.slip_coeff,
          rolling_res: values.rolling_res,
          radius: values.radius,
          mass: values.mass,
          air_density: values.air_density,
          drag_coeff: values.drag_coeff,
        });
        const flight = await api.trajectory(flightParams(values, launch_speed));
        scene = {
          points: flight.points,
          peakHeight: flight.max_height,
          radius: values.radius,
          launchHeight: values.launch_height,
          targetX: values.target_range,
        };
      } catch {
        // The plot is only a bonus here; the explanation below is what matters.
      }
    }

    return {
      title: scene ? "Released from the ramp top" : "Flight path",
      scene,
      emptyText: "No release height lands the ball on the target.",
      results: {
        message: {
          tone: "warn",
          title: "No drop height reaches the target",
          text: answer.reason,
        },
        stats: [
          { label: "Distance from the ramp top", value: formatLength(answer.range_at_ramp_top), unit: "m" },
          { label: "Target", value: formatLength(values.target_range), unit: "m" },
        ],
      },
    };
  }

  /* ---------- Mode switching (called from main.js) ---------- */

  function activate() {
    stage.show(view);
  }

  function deactivate() {}

  return { section, activate, deactivate };
}
