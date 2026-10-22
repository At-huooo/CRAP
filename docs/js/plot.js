/* =========================================================
   plot.js
   Draws the flight path on a <canvas>: grid, floor, launch
   stand, the path as a red dotted line, the ball, peak and
   landing markers, an optional target and a grey dotted
   "previous run" for comparison. Hovering a point shows its
   values and the ball's velocity as a blue dashed arrow.

   Nothing moves on its own. "Play flight" (replay()) runs
   the ball along the path in real proportions of time.

   Coordinates: x is horizontal distance from the ramp exit,
   y is height above the floor, both in metres. The backend's
   points are the ball's centre; heights shown as numbers are
   for the bottom of the ball, matching max_height.
   ========================================================= */

import { formatNumber, formatLength } from "./format.js";

const MARGIN = { top: 34, right: 32, bottom: 52, left: 68 };
const MONO = '400 12px "Geist Mono", ui-monospace, Menlo, monospace';
const MONO_STRONG = '500 13px "Geist Mono", ui-monospace, Menlo, monospace';

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
    cancelAnimationFrame(this.frame);
    this.scene = scene;
    this.hoverIndex = null;
    this.hideTooltip();
    this.computeBounds();
    this.time = this.flightTime();
    this.draw();
  }

  clear() {
    cancelAnimationFrame(this.frame);
    this.scene = null;
    this.hideTooltip();
    this.draw();
  }

  /** Run the ball along the path. Only happens when the user asks. */
  replay() {
    if (!this.scene) return;
    cancelAnimationFrame(this.frame);

    const total = this.flightTime();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.time = total;
      this.draw();
      return;
    }

    // Real flights last well under a second; show them at half speed.
    const duration = Math.max(800, total * 2000);
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      this.time = total * progress;   // linear: time on screen runs evenly
      this.draw();
      if (progress < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  setTrueScale(on) {
    this.trueScale = on;
    this.computeBounds();
    this.draw();
  }

  flightTime() {
    return this.scene?.points.at(-1).t ?? 0;
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
    let maxX = 0.5;
    let maxY = 0.2;
    if (this.scene) {
      const all = [...this.scene.points, ...(this.scene.ghost ?? [])];
      maxX = Math.max(...all.map((p) => p.x), this.scene.targetX ?? 0);
      maxY = Math.max(...all.map((p) => p.y + this.scene.radius));
    }

    let xMin = -0.06 * maxX;
    let xMax = maxX * 1.06;
    let yMin = 0;
    let yMax = maxY * 1.2;

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
      rule: v("--rule"),
      grid: v("--plot-grid"),
      ball: v("--plot-ball"),
      red: v("--red"),
      blue: v("--blue"),
      paper: v("--paper"),
    };
  }

  /* ---------- Drawing ---------- */

  draw() {
    if (!this.width || !this.bounds) return;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawGrid();
    this.drawGround();
    if (!this.scene) return;

    this.drawLaunchStand();
    if (this.scene.ghost) this.drawPath(this.scene.ghost, this.colors.grey);
    if (this.scene.targetX) this.drawTarget(this.scene.targetX);
    this.drawPath(this.scene.points, this.colors.red);

    const finished = this.time >= this.flightTime();
    if (finished) this.drawMarkers();
    this.drawBall(this.positionAt(this.time));
    if (this.hoverIndex !== null) this.drawHover(this.scene.points[this.hoverIndex]);
  }

  drawGrid() {
    const { ctx, colors } = this;
    const b = this.bounds;
    const xStep = niceStep((b.xMax - b.xMin) / Math.max(2, b.plotW / 100));
    const yStep = niceStep((b.yMax - b.yMin) / Math.max(2, b.plotH / 70));

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = MONO;
    ctx.fillStyle = colors.grey;
    ctx.strokeStyle = colors.grid;

    // Vertical lines + x labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = Math.ceil(b.xMin / xStep) * xStep; x <= b.xMax; x += xStep) {
      const [px] = this.toPx(x, 0);
      line(ctx, crisp(px), MARGIN.top, crisp(px), MARGIN.top + b.plotH);
      ctx.fillText(tickLabel(x, xStep), px, MARGIN.top + b.plotH + 12);
    }

    // Horizontal lines + y labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = yStep; y <= b.yMax; y += yStep) {
      const [, py] = this.toPx(0, y);
      line(ctx, MARGIN.left, crisp(py), MARGIN.left + b.plotW, crisp(py));
      ctx.fillText(tickLabel(y, yStep), MARGIN.left - 12, py);
    }

    // Axis titles
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("distance (m)", MARGIN.left + b.plotW, this.height - 8);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("height (m)", 12, 10);
    ctx.restore();
  }

  drawGround() {
    const { ctx, colors } = this;
    const [, py] = this.toPx(0, 0);
    ctx.save();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    line(ctx, MARGIN.left, crisp(py), MARGIN.left + this.bounds.plotW, crisp(py));
    ctx.restore();
  }

  /** The ramp exit: a post up to the launch height with a short lip. */
  drawLaunchStand() {
    const { ctx, colors } = this;
    const h = this.scene.launchHeight;
    const [px, ground] = this.toPx(0, 0);
    const [, top] = this.toPx(0, h);
    const r = this.ballRadiusPx();

    ctx.save();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    if (h > 0) line(ctx, px, ground, px, top);
    line(ctx, px - r * 2.4, top, px + r * 0.6, top);
    ctx.restore();
  }

  /** A dotted line through the points. */
  drawPath(points, color) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.setLineDash([0.1, 5]);   // round caps turn tiny dashes into dots
    strokePoints(ctx, points, (p) => this.toPx(p.x, p.y));
    ctx.restore();
  }

  drawTarget(targetX) {
    const { ctx, colors } = this;
    const [px, ground] = this.toPx(targetX, 0);
    const top = MARGIN.top + 18;

    ctx.save();
    ctx.strokeStyle = colors.blue;
    ctx.fillStyle = colors.blue;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    line(ctx, crisp(px), top, crisp(px), ground);
    ctx.setLineDash([]);
    dot(ctx, px, ground, 3);

    ctx.font = MONO;
    ctx.textAlign = px > this.width - 150 ? "right" : "left";
    ctx.textBaseline = "top";
    const offset = ctx.textAlign === "left" ? 6 : -6;
    ctx.fillText(`target ${formatLength(targetX)} m`, px + offset, top);
    ctx.restore();
  }

  /** Peak height and landing distance labels, once the ball has landed. */
  drawMarkers() {
    const { ctx, colors, scene } = this;
    const points = scene.points;
    const peak = points.reduce((a, b) => (b.y > a.y ? b : a));
    const last = points.at(-1);

    ctx.save();
    ctx.font = MONO_STRONG;
    ctx.fillStyle = colors.ink;
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;

    // Peak: only worth a label if the ball actually rose.
    if (peak.y > points[0].y + 0.002) {
      const [px, py] = this.toPx(peak.x, peak.y);
      ctx.setLineDash([2, 3]);
      line(ctx, crisp(px), py, crisp(px), this.toPx(0, 0)[1]);
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const peakHeight = scene.peakHeight ?? peak.y - scene.radius;
      ctx.fillText(`peak ${formatLength(peakHeight)} m`, px, py - 10);
    }

    // Landing distance, just above the ball so the ball doesn't cover it
    const r = this.ballRadiusPx();
    const [lx, ly] = this.toPx(last.x, 0);
    const nearRightEdge = lx > this.width - 170;
    ctx.fillStyle = colors.red;
    ctx.textAlign = nearRightEdge ? "right" : "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`landed ${formatLength(last.x)} m`, nearRightEdge ? lx + r : lx, ly - 2 * r - 8);
    ctx.restore();
  }

  /** The ball: a flat grey disc with a red centre point. */
  drawBall(p) {
    const { ctx, colors } = this;
    const [px, py] = this.toPx(p.x, p.y);
    ctx.save();
    ctx.fillStyle = colors.ball;
    dot(ctx, px, py, this.ballRadiusPx());
    ctx.fillStyle = colors.red;
    dot(ctx, px, py, 2.5);
    ctx.restore();
  }

  /** Hovered point: red dot plus a blue dashed velocity arrow. */
  drawHover(p) {
    const { ctx, colors } = this;
    const [px, py] = this.toPx(p.x, p.y);

    // Arrow length grows with speed: 0.06 s of travel, at least 24 px.
    const scale = this.pxPerMetre();
    let dx = p.vx * 0.06 * scale;
    let dy = -p.vy * 0.06 * (this.bounds.plotH / (this.bounds.yMax - this.bounds.yMin));
    const length = Math.hypot(dx, dy);
    if (length < 24) {
      dx *= 24 / (length || 1);
      dy *= 24 / (length || 1);
    }

    ctx.save();
    ctx.strokeStyle = colors.blue;
    ctx.fillStyle = colors.blue;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    line(ctx, px, py, px + dx, py + dy);
    ctx.setLineDash([]);
    arrowHead(ctx, px + dx, py + dy, Math.atan2(dy, dx));

    ctx.fillStyle = colors.red;
    dot(ctx, px, py, 3.5);
    ctx.restore();
  }

  /** Ball position at time t, interpolated between sampled points. */
  positionAt(t) {
    const pts = this.scene.points;
    if (t <= 0) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].t >= t) {
        const a = pts[i - 1];
        const b = pts[i];
        const f = (t - a.t) / (b.t - a.t || 1);
        return { t, x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
      }
    }
    return pts.at(-1);
  }

  /* ---------- Hover tooltip ---------- */

  onPointerMove(event) {
    if (!this.scene) return;
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

    // Place it next to the point, flipping sides near the edges.
    const [px, py] = this.toPx(p.x, p.y);
    const { offsetWidth: w, offsetHeight: h } = this.tooltip;
    const left = px + 20 + w > this.width ? px - 20 - w : px + 20;
    const top = Math.min(Math.max(8, py + 16), this.height - h - 8);
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

function arrowHead(ctx, x, y, angle, size = 7) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.4), y - size * Math.sin(angle - 0.4));
  ctx.lineTo(x - size * Math.cos(angle + 0.4), y - size * Math.sin(angle + 0.4));
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
