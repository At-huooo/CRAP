/* =========================================================
   plot.js
   Draws the flight on a <canvas>: grid, floor, the end of
   the ramp, the path, the ball with its shadow, peak and
   landing labels, an optional target and a dashed
   "previous run" for comparison. Hovering a point shows its
   values and the ball's velocity as an arrow.

   Time: the ball sits at `time` seconds into the flight.
   play() runs it along the path at half real speed,
   setTime() moves it directly (used by the scrubber), and
   onTime(t, point) is called whenever it moves.

   Coordinates: x is horizontal distance from the ramp exit,
   y is height above the floor, both in metres. The backend's
   points are the ball's centre; heights shown as numbers are
   for the bottom of the ball, matching max_height.
   ========================================================= */

import { formatNumber, formatLength } from "./format.js";

const MARGIN = { top: 38, right: 24, bottom: 44, left: 56 };
const FAMILY = '"Inter Tight", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
const FONT = `400 12px ${FAMILY}`;
const FONT_STRONG = `600 12.5px ${FAMILY}`;

export class TrajectoryPlot {
  /**
   * @param {HTMLElement} container  element holding the canvas and tooltip
   */
  constructor(container) {
    this.container = container;
    this.canvas = container.querySelector("canvas");
    this.tooltip = container.querySelector(".plot__tooltip");
    this.ctx = this.canvas.getContext("2d");

    this.scene = null;        // what to draw, see show()
    this.trueScale = true;    // same metres-per-pixel on both axes
    this.time = 0;            // where the ball is drawn, in seconds of flight
    this.hoverIndex = null;   // index of the hovered point
    this.frame = null;
    this.playing = false;

    // Hooks for the playback bar (set by stage.js)
    this.onTime = () => {};
    this.onPlayState = () => {};

    this.readColors();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    // Redraw once the web fonts arrive so labels use them,
    // and in the new colours when light/dark mode changes.
    document.fonts?.ready.then(() => this.draw());
    window.addEventListener("themechange", () => { this.readColors(); this.draw(); });

    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerleave", () => this.onPointerLeave());
  }

  /* ---------- Public API ---------- */

  /**
   * Show a flight, complete, with the ball where it landed.
   * @param {object} scene
   *   points        [{ t, x, y, vx, vy }] from /trajectory
   *   radius        ball radius (m)
   *   launchHeight  height of the ramp exit (m)
   *   ghost         optional points of a previous run
   *   targetX       optional target distance to mark (m)
   *   peakHeight    optional exact peak height for the label (m)
   */
  show(scene) {
    this.stop();
    this.scene = scene;
    this.hoverIndex = null;
    this.hideTooltip();
    this.computeBounds();
    this.setTime(this.flightTime());
  }

  clear() {
    this.stop();
    this.scene = null;
    this.hideTooltip();
    this.draw();
    this.onTime(0, null);
  }

  /** Play from where the ball is (or from the start if it has landed); pause if playing. */
  togglePlay() {
    if (this.playing) this.stop();
    else this.play();
  }

  play() {
    if (!this.scene) return;
    this.stop();

    const total = this.flightTime();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.setTime(total);
      return;
    }

    if (this.time >= total - 1e-9) this.time = 0;
    // Real flights last well under a second; show them at half speed.
    const speed = 0.5;
    const startTime = this.time;
    const start = performance.now();
    this.setPlaying(true);

    const tick = (now) => {
      const t = Math.min(total, startTime + ((now - start) / 1000) * speed);
      this.setTime(t, { keepPlaying: true });
      if (t < total) this.frame = requestAnimationFrame(tick);
      else this.setPlaying(false);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.setPlaying(false);
  }

  /** Put the ball at time t (seconds). */
  setTime(t, { keepPlaying = false } = {}) {
    if (!keepPlaying) this.stop();
    if (!this.scene) return;
    this.time = Math.max(0, Math.min(this.flightTime(), t));
    this.draw();
    this.onTime(this.time, this.stateAt(this.time));
  }

  setTrueScale(on) {
    this.trueScale = on;
    this.computeBounds();
    this.draw();
  }

  flightTime() {
    return this.scene?.points.at(-1).t ?? 0;
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    this.onPlayState(playing);
  }

  /* ---------- Sizing and scales ---------- */

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.computeBounds();
    this.draw();
  }

  /** Work out the visible data range and the metres → pixels mapping. */
  computeBounds() {
    if (!this.width) return;
    const plotW = this.width - MARGIN.left - MARGIN.right;
    const plotH = this.height - MARGIN.top - MARGIN.bottom;

    // Data extents, including the previous run and the target.
    let maxX = 1;
    let maxY = 0.5;
    if (this.scene) {
      const all = [...this.scene.points, ...(this.scene.ghost ?? [])];
      maxX = Math.max(...all.map((p) => p.x), this.scene.targetX ?? 0);
      maxY = Math.max(...all.map((p) => p.y + this.scene.radius));
    }

    let xMin = -0.1 * maxX;
    let xMax = maxX * 1.06;
    let yMin = 0;
    let yMax = maxY * 1.18;

    if (this.trueScale) {
      // Same scale on both axes: stretch whichever axis has room to spare.
      const scale = Math.min(plotW / (xMax - xMin), plotH / (yMax - yMin));
      xMax = xMin + plotW / scale;
      yMax = yMin + plotH / scale;
    }

    this.bounds = { xMin, xMax, yMin, yMax, plotW, plotH };
  }

  toPx(x, y) {
    const b = this.bounds;
    return [
      MARGIN.left + ((x - b.xMin) / (b.xMax - b.xMin)) * b.plotW,
      MARGIN.top + (1 - (y - b.yMin) / (b.yMax - b.yMin)) * b.plotH,
    ];
  }

  pxPerMetre() {
    return this.bounds.plotW / (this.bounds.xMax - this.bounds.xMin);
  }

  pxPerMetreY() {
    return this.bounds.plotH / (this.bounds.yMax - this.bounds.yMin);
  }

  /** Ball radius on screen: true size, but never smaller than 5 px. */
  ballRadiusPx() {
    return Math.max(5, this.scene.radius * this.pxPerMetre());
  }

  readColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    this.colors = {
      ink: v("--ink"),
      grey: v("--grey"),
      greySoft: v("--grey-soft"),
      rule: v("--rule-strong"),
      grid: v("--plot-grid"),
      bg: v("--plot-bg"),
      ball: v("--plot-ball"),
      stand: v("--plot-stand"),
      rust: v("--rust"),
      rustInk: v("--rust-ink"),
      slate: v("--slate"),
    };
  }

  /* ---------- Drawing ---------- */

  draw() {
    if (!this.width || !this.bounds) return;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawGrid();
    if (this.scene) this.drawLaunchStand();
    this.drawGround();
    if (!this.scene) return;

    if (this.scene.ghost) this.drawGhost(this.scene.ghost);
    if (this.scene.targetX) this.drawTarget(this.scene.targetX);
    this.drawPath(this.scene.points);

    const finished = this.time >= this.flightTime();
    if (finished) this.drawMarkers();
    this.drawBall(this.stateAt(this.time));
    if (this.hoverIndex !== null) this.drawHover(this.scene.points[this.hoverIndex]);
  }

  drawGrid() {
    const { ctx, colors } = this;
    const b = this.bounds;
    const xStep = niceStep((b.xMax - b.xMin) / Math.max(2, b.plotW / 110));
    const yStep = niceStep((b.yMax - b.yMin) / Math.max(2, b.plotH / 70));

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = FONT;
    ctx.fillStyle = colors.greySoft;
    ctx.strokeStyle = colors.grid;

    // Vertical lines + x labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = Math.ceil(b.xMin / xStep) * xStep; x <= b.xMax; x += xStep) {
      const [px] = this.toPx(x, 0);
      line(ctx, crisp(px), MARGIN.top, crisp(px), MARGIN.top + b.plotH);
      ctx.fillText(tickLabel(x, xStep), px, MARGIN.top + b.plotH + 10);
    }

    // Horizontal lines + y labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = yStep; y <= b.yMax; y += yStep) {
      const [, py] = this.toPx(0, y);
      line(ctx, MARGIN.left, crisp(py), MARGIN.left + b.plotW, crisp(py));
      ctx.fillText(tickLabel(y, yStep), MARGIN.left - 10, py);
    }

    // Axis titles
    ctx.fillStyle = colors.grey;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("Distance (m)", MARGIN.left + b.plotW, this.height - 6);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Height (m)", 14, 10);
    ctx.restore();
  }

  drawGround() {
    const { ctx, colors } = this;
    const [, py] = this.toPx(0, 0);
    ctx.save();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.25;
    line(ctx, MARGIN.left, crisp(py), MARGIN.left + this.bounds.plotW, crisp(py));
    ctx.restore();
  }

  /**
   * The end of the ramp: a support down to the floor and the
   * last bit of track, leaving the exit at the launch angle.
   */
  drawLaunchStand() {
    const { ctx, colors, scene } = this;
    const h = scene.launchHeight;
    const first = scene.points[0];
    const angle = Math.atan2(first.vy, first.vx);      // launch angle, from the velocity
    const r = this.ballRadiusPx();

    // Exit point: where the bottom of the ball leaves the track.
    const [ex, ey] = this.toPx(0, h);
    const [, ground] = this.toPx(0, 0);
    // Long enough to read as track, short enough to fit left of the exit.
    const lip = Math.max(14, Math.min(Math.max(22, r * 3), (ex - MARGIN.left) / 1.9));
    // Curve back from the exit: along the launch direction, then flattening out.
    const c1x = ex - lip * Math.cos(angle);
    const c1y = ey + lip * Math.sin(angle);
    const sx = c1x - lip * 0.9;
    const sy = c1y;

    const track = new Path2D();
    track.moveTo(sx, sy);
    track.quadraticCurveTo(c1x, c1y, ex, ey);

    ctx.save();
    // Keep the ramp inside the plot area
    ctx.beginPath();
    ctx.rect(MARGIN.left, 0, this.width, ground + 1);
    ctx.clip();

    // Support: everything under the track, down to the floor
    const body = new Path2D(track);
    body.lineTo(ex, ground);
    body.lineTo(sx, ground);
    body.closePath();
    ctx.fillStyle = colors.stand;
    ctx.fill(body);

    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke(track);
    ctx.restore();
  }

  /** The flight: solid where the ball has been, faint ahead of it. */
  drawPath(points) {
    const { ctx, colors } = this;
    const toPx = (p) => this.toPx(p.x, p.y);
    const done = this.time >= this.flightTime();

    ctx.save();
    ctx.strokeStyle = colors.rust;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (done) {
      strokePoints(ctx, points, toPx);
    } else {
      const now = this.stateAt(this.time);
      const past = [...points.filter((p) => p.t <= this.time), now];
      const ahead = [now, ...points.filter((p) => p.t > this.time)];
      ctx.globalAlpha = 0.25;
      strokePoints(ctx, ahead, toPx);
      ctx.globalAlpha = 1;
      strokePoints(ctx, past, toPx);
    }
    ctx.restore();
  }

  drawGhost(points) {
    const { ctx, colors } = this;
    ctx.save();
    ctx.strokeStyle = colors.greySoft;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    strokePoints(ctx, points, (p) => this.toPx(p.x, p.y));
    ctx.restore();
  }

  drawTarget(targetX) {
    const { ctx, colors } = this;
    const [px, ground] = this.toPx(targetX, 0);
    const top = MARGIN.top + 22;

    ctx.save();
    ctx.strokeStyle = colors.slate;
    ctx.fillStyle = colors.slate;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 4]);
    line(ctx, crisp(px), top, crisp(px), ground);
    ctx.setLineDash([]);

    // Flag
    ctx.beginPath();
    ctx.moveTo(crisp(px), top - 12);
    ctx.lineTo(crisp(px) + 11, top - 7);
    ctx.lineTo(crisp(px), top - 2);
    ctx.closePath();
    ctx.fill();
    line(ctx, crisp(px), top - 12, crisp(px), top);

    // Ground mark
    ctx.lineWidth = 2;
    line(ctx, px - 6, ground, px + 6, ground);

    ctx.font = FONT_STRONG;
    const right = px > this.width - 150;
    ctx.textAlign = right ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`Target ${formatLength(targetX)} m`, px + (right ? -8 : 16), top - 7);
    ctx.restore();
  }

  /** Peak height and landing distance labels, once the ball has landed. */
  drawMarkers() {
    const { ctx, colors, scene } = this;
    const points = scene.points;
    const peak = points.reduce((a, b) => (b.y > a.y ? b : a));
    const last = points.at(-1);
    const [, ground] = this.toPx(0, 0);

    ctx.save();
    ctx.font = FONT_STRONG;
    ctx.lineWidth = 1;

    // Peak: only worth a label if the ball actually rose.
    if (peak.y > points[0].y + 0.002) {
      const [px, py] = this.toPx(peak.x, peak.y);
      ctx.strokeStyle = colors.rule;
      ctx.setLineDash([2, 4]);
      line(ctx, crisp(px), py + 6, crisp(px), ground);
      ctx.setLineDash([]);
      ctx.fillStyle = colors.bg;
      ctx.strokeStyle = colors.rust;
      ctx.lineWidth = 2;
      ring(ctx, px, py, 3.5);
      ctx.fillStyle = colors.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const peakHeight = scene.peakHeight ?? peak.y - scene.radius;
      ctx.fillText(`Peak ${formatLength(peakHeight)} m`, px, py - 10);
    }

    // Landing distance, beside the ball on the side away from the path
    const r = this.ballRadiusPx();
    const [lx] = this.toPx(last.x, 0);
    const nearRightEdge = lx + r + 80 > MARGIN.left + this.bounds.plotW;
    ctx.fillStyle = colors.rustInk;
    ctx.textBaseline = "middle";
    if (nearRightEdge) {
      ctx.textAlign = "right";
      ctx.fillText(`${formatLength(last.x)} m`, lx - r - 8, ground - Math.max(r, 8));
    } else {
      ctx.textAlign = "left";
      ctx.fillText(`${formatLength(last.x)} m`, lx + r + 8, ground - Math.max(r, 8));
    }
    ctx.restore();
  }

  /** The ball, with a soft shadow on the floor that fades with height. */
  drawBall(p) {
    const { ctx, colors } = this;
    const [px, py] = this.toPx(p.x, p.y);
    const [, ground] = this.toPx(0, 0);
    const r = this.ballRadiusPx();

    ctx.save();
    const lift = Math.min(1, (ground - py - r) / (this.bounds.plotH * 0.6));
    ctx.globalAlpha = 0.22 * (1 - lift);
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.ellipse(px, ground, r * (1.1 - lift * 0.4), Math.max(1.5, r * 0.22), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = colors.ball;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ring(ctx, px, py, r);
    ctx.fillStyle = colors.rust;
    dot(ctx, px, py, 2);
    ctx.restore();
  }

  /** Hovered point: a ring on the path plus the velocity arrow. */
  drawHover(p) {
    const { ctx, colors } = this;
    const [px, py] = this.toPx(p.x, p.y);

    // Arrow length grows with speed: 0.06 s of travel, at least 24 px.
    let dx = p.vx * 0.06 * this.pxPerMetre();
    let dy = -p.vy * 0.06 * this.pxPerMetreY();
    const length = Math.hypot(dx, dy);
    if (length < 24) {
      dx *= 24 / (length || 1);
      dy *= 24 / (length || 1);
    }

    ctx.save();
    ctx.strokeStyle = colors.slate;
    ctx.fillStyle = colors.slate;
    ctx.lineWidth = 1.75;
    ctx.lineCap = "round";
    const tipX = px + dx;
    const tipY = py + dy;
    const angle = Math.atan2(dy, dx);
    line(ctx, px, py, tipX - 5 * Math.cos(angle), tipY - 5 * Math.sin(angle));
    arrowHead(ctx, tipX, tipY, angle);

    ctx.fillStyle = colors.bg;
    ctx.strokeStyle = colors.rust;
    ctx.lineWidth = 2;
    ring(ctx, px, py, 4.5);
    ctx.restore();
  }

  /** Ball position and velocity at time t, interpolated between sampled points. */
  stateAt(t) {
    const pts = this.scene.points;
    if (t <= 0) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].t >= t) {
        const a = pts[i - 1];
        const b = pts[i];
        const f = (t - a.t) / (b.t - a.t || 1);
        const mix = (k) => a[k] + f * (b[k] - a[k]);
        return { t, x: mix("x"), y: mix("y"), vx: mix("vx"), vy: mix("vy") };
      }
    }
    return pts.at(-1);
  }

  /* ---------- Hover tooltip ---------- */

  onPointerMove(event) {
    if (!this.scene || event.pointerType === "touch") return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    // Nearest point on screen
    let best = null;
    let bestDist = Infinity;
    this.scene.points.forEach((p, i) => {
      const [px, py] = this.toPx(p.x, p.y);
      const d = (px - mx) ** 2 + (py - my) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    });

    if (bestDist > 60 ** 2) {
      this.onPointerLeave();
      return;
    }

    this.hoverIndex = best;
    this.draw();
    this.showTooltip(this.scene.points[best]);
  }

  onPointerLeave() {
    if (this.hoverIndex === null) return;
    this.hoverIndex = null;
    this.hideTooltip();
    this.draw();
  }

  showTooltip(p) {
    const speed = Math.hypot(p.vx, p.vy);
    const rows = [
      ["Time", `${formatNumber(p.t, 3)} s`],
      ["Distance", `${formatLength(p.x)} m`],
      ["Height", `${formatLength(p.y - this.scene.radius)} m`],
      ["Speed", `${formatNumber(speed, 2)} m/s`],
    ];
    this.tooltip.innerHTML = `<dl style="display:contents">${rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join("")}</dl>`;
    this.tooltip.hidden = false;

    // Place it on the side away from the velocity arrow, then keep it inside.
    const [px, py] = this.toPx(p.x, p.y);
    const { offsetWidth: w, offsetHeight: h } = this.tooltip;
    let left = p.vx > 0 ? px - 20 - w : px + 20;
    if (left < 8) left = px + 20;
    if (left + w > this.width - 8) left = px - 20 - w;
    const top = Math.min(Math.max(8, p.vy < 0 ? py - 16 - h : py + 16), this.height - h - 8);
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    this.tooltip.hidden = true;
  }
}

/* ---------- Small drawing helpers ---------- */

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A filled circle with an outline (uses the current fill and stroke). */
function ring(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function arrowHead(ctx, x, y, angle, size = 8) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.42), y - size * Math.sin(angle - 0.42));
  ctx.lineTo(x - size * Math.cos(angle + 0.42), y - size * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
}

function strokePoints(ctx, points, toPx) {
  if (points.length < 2) return;
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = toPx(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** Snap a coordinate to the pixel grid so 1px lines stay sharp. */
function crisp(v) {
  return Math.round(v) + 0.5;
}

/** A "round" grid step (1, 2 or 5 × a power of ten) close to `raw`. */
function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  if (fraction < 1.5) return power;
  if (fraction < 3.5) return 2 * power;
  if (fraction < 7.5) return 5 * power;
  return 10 * power;
}

/** Tick label with only as many decimals as the step needs. */
function tickLabel(value, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Math.abs(value) < step / 1e6 ? "0" : value.toFixed(decimals);
}
