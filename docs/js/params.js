/* =========================================================
   params.js
   Every input the backend understands, described once.
   The forms are built from this list (see form.js), and the
   limits match the Query(...) rules in backend/main.py so
   mistakes are caught before a request is sent.

   Field options:
     label, symbol, unit   what the user sees
     default               pre-filled value ("" = left empty)
     placeholder           example shown in an empty field
     hint                  short help line under the field
     gt / lt / ge          limits: greater than, less than, at least
     wide                  take the full width of the form
   ========================================================= */

export const PARAMS = {
  /* ---------- Launch ---------- */
  v0: {
    label: "Launch speed",
    symbol: "v₀",
    unit: "m/s",
    placeholder: "e.g. 2.40",
    gt: 0,
    wide: true,
  },
  angle_deg: {
    label: "Launch angle",
    symbol: "β",
    unit: "°",
    placeholder: "e.g. 30",
    hint: "Above horizontal",
    gt: 0,
    lt: 90,
  },
  launch_height: {
    label: "Launch height",
    symbol: "hₗ",
    unit: "m",
    default: "0",
    hint: "Ramp exit above the floor",
    ge: 0,
  },

  /* ---------- Ramp ---------- */
  ramp_height: {
    label: "Ramp height",
    symbol: "h₀",
    unit: "m",
    placeholder: "e.g. 0.30",
    gt: 0,
  },
  drop_height: {
    label: "Drop height",
    symbol: "h",
    unit: "m",
    placeholder: "e.g. 0.40",
    hint: "Where you let go, measured like h₀",
    gt: 0,
  },
  slip_coeff: {
    label: "Slip coefficient",
    symbol: "η",
    unit: "",
    placeholder: "e.g. 0.10",
    hint: "Between 0 and 1",
    gt: 0,
    lt: 1,
  },
  rolling_res: {
    label: "Rolling resistance",
    symbol: "Cᵣᵣ",
    unit: "",
    placeholder: "e.g. 0.01",
    gt: 0,
  },
  max_drop_height: {
    label: "Highest drop to try",
    symbol: "",
    unit: "m",
    default: "3",
    hint: "The search gives up above this",
    gt: 0,
  },

  /* ---------- Target ---------- */
  target_range: {
    label: "Target distance",
    symbol: "R",
    unit: "m",
    placeholder: "e.g. 1.20",
    hint: "Horizontal, from the ramp exit",
    gt: 0,
    wide: true,
  },

  /* ---------- Ball and air (golf ball defaults) ---------- */
  radius: {
    label: "Ball radius",
    symbol: "r",
    unit: "m",
    default: "0.048",
    gt: 0,
  },
  mass: {
    label: "Ball mass",
    symbol: "m",
    unit: "kg",
    default: "0.04593",
    gt: 0,
  },
  drag_coeff: {
    label: "Drag coefficient",
    symbol: "Cd",
    unit: "",
    default: "0.47",
    gt: 0,
  },
  air_density: {
    label: "Air density",
    symbol: "ρ",
    unit: "kg/m³",
    default: "1.293",
    gt: 0,
  },

  /* ---------- Solver ---------- */
  dt: {
    label: "Time step",
    symbol: "Δt",
    unit: "s",
    default: "0.001",
    hint: "Smaller is more precise",
    gt: 0,
    lt: 0.01,
  },
  sample_dt: {
    label: "Plot spacing",
    symbol: "",
    unit: "s",
    default: "0.01",
    hint: "Time between plotted points",
    gt: 0,
    lt: 1,
  },
  tol: {
    label: "Precision",
    symbol: "",
    unit: "m",
    default: "0.000001",
    hint: "How close the answer must be",
    gt: 0,
  },
};

/** Parameters that describe the ball and air, shared by every endpoint. */
export const BALL_PARAMS = ["radius", "mass", "drag_coeff", "air_density"];

/** Parameters needed to work out the launch speed from the ramp. */
export const RAMP_PARAMS = ["ramp_height", "drop_height", "slip_coeff", "rolling_res"];

/** Default value of every parameter, as the text shown in the input. */
export function defaultValues() {
  return Object.fromEntries(
    Object.entries(PARAMS).map(([name, def]) => [name, def.default ?? ""]),
  );
}

/**
 * Check one raw input value against its limits.
 * Returns { value } on success, { empty: true } when blank,
 * or { error } with a message for the user.
 */
export function validate(name, raw) {
  const def = PARAMS[name];
  const text = String(raw ?? "").trim().replace(",", ".");

  if (text === "") {
    return { empty: true, error: "Required" };
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { error: "Enter a number" };
  }
  if (def.gt !== undefined && !(value > def.gt)) {
    return { error: `Must be more than ${def.gt}` };
  }
  if (def.ge !== undefined && !(value >= def.ge)) {
    return { error: `Must be ${def.ge} or more` };
  }
  if (def.lt !== undefined && !(value < def.lt)) {
    return { error: `Must be less than ${def.lt}` };
  }
  return { value };
}

/**
 * Validate a list of parameters at once.
 * Returns { values, errors, missing } where `errors` maps names
 * to messages and `missing` lists the blank ones.
 */
export function readValues(names, rawValues) {
  const values = {};
  const errors = {};
  const missing = [];

  for (const name of names) {
    const result = validate(name, rawValues[name]);
    if (result.empty) missing.push(name);
    if (result.error) errors[name] = result.error;
    else values[name] = result.value;
  }

  return { values, errors, missing };
}
