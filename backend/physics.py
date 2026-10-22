import math

G = 9.81  # m/s^2


def simulate_trajectory(
    v0: float,                  # launch speed (m/s)
    angle_deg: float,           # launch angle beta, degrees above horizontal
    launch_height: float = 0.0, # h_l (m), ground is y = 0
    radius: float = 0.048,    # ball radius r (m)
    mass: float = 0.04593,       # m (kg)
    drag_coeff: float = 0.47,   # Cd
    air_density: float = 1.293, # rho (kg/m^3)
    dt: float = 0.001,          # time step (s)
    sample_dt: float = 0.01,    # spacing of returned points (s)
    max_time: float = 90.0,     # safety cap so the loop always ends
) -> dict:
    area = math.pi * radius**2
    # k/m term: acceleration from drag = -k * |v| * v
    k = 0.5 * air_density * drag_coeff * area / mass

    beta = math.radians(angle_deg)
    ground = radius
    x, y = 0.0, launch_height + radius
    vx, vy = v0 * math.cos(beta), v0 * math.sin(beta)
    t = 0.0

    points = [{"t": 0.0, "x": x, "y": y, "vx": vx, "vy": vy}]
    max_height = y
    record_every = max(1, round(sample_dt / dt))
    step = 0
    landed = False

    while t < max_time:
        speed = math.hypot(vx, vy)
        ax = -k * speed * vx
        ay = -G - k * speed * vy

        vx_new = vx + ax * dt
        vy_new = vy + ay * dt
        x_new = x + 0.5 * (vx + vx_new) * dt
        y_new = y + 0.5 * (vy + vy_new) * dt
        t_new = t + dt

        if y_new <= ground:
            # Linear interpolation inside the last step to find the exact landing
            f = (y - ground) / (y - y_new) if y != y_new else 1.0
            x = x + f * (x_new - x)
            vx = vx + f * (vx_new - vx)
            vy = vy + f * (vy_new - vy)
            t = t + f * dt
            y = ground
            landed = True
            break

        x, y, vx, vy, t = x_new, y_new, vx_new, vy_new, t_new
        max_height = max(max_height, y)
        step += 1
        if step % record_every == 0:
            points.append({"t": t, "x": x, "y": y, "vx": vx, "vy": vy})

    points.append({"t": t, "x": x, "y": y, "vx": vx, "vy": vy})

    return {
        "landed": landed,
        "range": x,
        "flight_time": t,
        "max_height": max_height - radius,
        "impact_speed": math.hypot(vx, vy),
        "points": points,
    }

def cal_velocity(
    ramp_height: float,
    drop_height: float,
    slip_coeff: float,
    radius: float,
    mass: float,
    air_density: float,
    drag_coeff: float,
    rolling_res: float,
) -> dict:
    delta_h = drop_height - ramp_height
    k = 0.5 * air_density * drag_coeff * radius**2 * math.pi / mass
    potential_const = G * ramp_height
    fall_slip_const = G * delta_h * (1 - slip_coeff) * (1 - k * delta_h)
    roll_const = rolling_res * math.pi * G * (6 * ramp_height + 5 * delta_h) / 7
    drag_const = 20 * k * G * ramp_height * (2 * ramp_height + 3 * delta_h) /21
    launch_speed = math.sqrt(10 *(potential_const + fall_slip_const - roll_const - drag_const) / 7)

    return {
        "launch_speed": launch_speed,
    }


"""Find the drop height that makes the ball land at a requested range.

Chain being inverted (all from physics.py):
    drop_height --cal_velocity()--> launch speed --simulate_trajectory()--> range

Dropping from higher gives a faster launch, and a faster launch goes
farther, so the range grows steadily with drop height and there is at most
one answer. We search for it numerically:
  1. Check the range when released from the ramp top (drop height = ramp
     height). If it already overshoots, no valid drop height exists
     (the model in the notes only covers h >= h0).
  2. Raise the drop height in growing steps until the shot overshoots.
  3. Bisect between the last two heights.
"""

def cal_drop_height(
    target_range: float,        # wanted horizontal distance (m)
    angle_deg: float,           # launch angle beta, degrees above horizontal
    ramp_height: float,         # h0: height of the ramp (m)
    slip_coeff: float,          # eta: slip energy-loss coefficient
    rolling_res: float,         # Crr: rolling resistance coefficient
    radius: float = 0.048,    # ball radius (m)
    mass: float = 0.04593,       # ball mass (kg)
    air_density: float = 1.293, # rho (kg/m^3)
    drag_coeff: float = 0.47,   # Cd
    launch_height: float = 0.0, # h_l: height the ball leaves the ramp (m)
    max_drop_height: float = 3.0,  # give up above this drop height (m)
    tol: float = 1e-6,          # precision of the answer (m)
    dt: float = 0.001,          # flight time step (s)
) -> dict:
    """Return the drop height h (m, measured like ramp_height) for `target_range`.

    Result keys:
      drop_height       the answer, or None if there is none
      launch_speed      speed leaving the ramp at that drop height (m/s)
      reachable         True if an answer was found
      reason            short explanation when there is no answer
      range_at_ramp_top range when released exactly at the ramp top
    """
    if target_range <= 0:
        raise ValueError("target_range must be positive")
    if ramp_height <= 0:
        raise ValueError("ramp_height must be positive")
    if not 0 <= angle_deg < 90:
        raise ValueError("angle_deg must be in [0, 90)")

    def speed_at(h: float) -> float:
        try:
            return cal_velocity(
                ramp_height, h, slip_coeff, radius, mass,
                air_density, drag_coeff, rolling_res,
            )["launch_speed"]
        except ValueError:      # negative under the square root: too little energy
            return 0.0

    def range_at(h: float) -> float:
        v = speed_at(h)
        if v <= 0:
            return 0.0
        return simulate_trajectory(
            v, angle_deg, launch_height=launch_height, radius=radius,
            mass=mass, drag_coeff=drag_coeff, air_density=air_density, dt=dt,
        )["range"]

    r_top = range_at(ramp_height)
    result = {"drop_height": None, "launch_speed": None, "reachable": False,
              "reason": "", "range_at_ramp_top": r_top}

    if r_top >= target_range:
        result["reason"] = (
            f"Released at the ramp top ({ramp_height:g} m) the ball already "
            f"reaches {r_top:.4f} m. A shorter range needs a release point "
            f"lower than the ramp top, which the model does not cover. "
            f"Lower the ramp or change the angle."
        )
        return result

    # Bracket: grow the height above the ramp top until the shot is long enough
    lo, step = ramp_height, 0.01
    hi = ramp_height + step
    while range_at(hi) < target_range:
        lo = hi
        step *= 2
        hi = ramp_height + step
        if hi > max_drop_height:
            result["reason"] = (
                f"Even dropping from {max_drop_height:g} m the ball does not "
                f"reach {target_range:g} m (or the model stops being "
                f"monotonic there). Check angle and parameters."
            )
            return result

    # Bisect: range_at(lo) < target <= range_at(hi)
    while hi - lo > tol:
        mid = 0.5 * (lo + hi)
        if range_at(mid) < target_range:
            lo = mid
        else:
            hi = mid

    h = 0.5 * (lo + hi)
    result.update(drop_height=h, launch_speed=speed_at(h), reachable=True)
    return result