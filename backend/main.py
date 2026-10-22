import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from physics import simulate_trajectory
from physics import cal_velocity
from physics import cal_drop_height

app = FastAPI()

# Extra allowed origins, comma-separated, e.g. your GitHub Pages site:
#   ALLOWED_ORIGINS=https://yourname.github.io
origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Always allow a local dev server on any port: http://localhost:8080,
    # http://127.0.0.1:5500 (VS Code Live Server), and so on.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/trajectory")
def trajectory(
    v0: float = Query(..., description="Launch speed (m/s)", gt=0),
    angle_deg: float = Query(..., description="Launch angle (degrees above horizontal)", gt=0, lt=90),
    launch_height: float = Query(0.0, description="Launch height (m)"),
    radius: float = Query(0.048, description="Ball radius (m)", gt=0),
    mass: float = Query(0.04593, description="Ball mass (kg)", gt=0),
    drag_coeff: float = Query(0.47, description="Drag coefficient", gt=0),
    air_density: float = Query(1.293, description="Air density (kg/m^3)", gt=0),
    dt: float = Query(0.001, description="Time step for simulation (s)", gt=0, lt=0.01),
    sample_dt: float = Query(0.01, description="Time step for returned points (s)", gt=0, lt=1),
):
    return simulate_trajectory(
        v0=v0,
        angle_deg=angle_deg,
        launch_height=launch_height,
        radius=radius,
        mass=mass,
        drag_coeff=drag_coeff,
        air_density=air_density,
        dt=dt,
        sample_dt=sample_dt,
    )

@app.get("/launch_velocity")
def launch_velocity(
    ramp_height: float = Query(..., description="Height of the ramp (m)", gt=0),
    drop_height: float = Query(..., description="Height of the drop (m)", gt=0),
    slip_coeff: float = Query(..., description="Slip coefficient", gt=0, lt=1),
    radius: float = Query(0.048, description="Ball radius (m)", gt=0),
    mass: float = Query(0.04593, description="Ball mass (kg)", gt=0),
    air_density: float = Query(1.293, description="Air density (kg/m^3)", gt=0),
    drag_coeff: float = Query(0.47, description="Drag coefficient", gt=0),
    rolling_res: float = Query(..., description="Rolling resistance coefficient", gt=0),
):
    try:
        return cal_velocity(
            ramp_height=ramp_height,
            drop_height=drop_height,
            slip_coeff=slip_coeff,
            radius=radius,
            mass=mass,
            air_density=air_density,
            drag_coeff=drag_coeff,
            rolling_res=rolling_res,
        )
    except ValueError:
        # Negative under the square root: the losses eat all the energy,
        # so the ball never leaves the ramp. Answer with a clear 422
        # instead of crashing (a crash also loses the CORS headers).
        raise HTTPException(
            status_code=422,
            detail="With these values the ball doesn't have enough energy to leave the ramp.",
        )


@app.get("/drop_height")
def drop_height(
    target_range: float = Query(..., description="Target horizontal distance (m)", gt=0),
    angle_deg: float = Query(..., description="Launch angle (degrees above horizontal)", gt=0, lt=90),
    ramp_height: float = Query(..., description="Height of the ramp (m)", gt=0),
    slip_coeff: float = Query(..., description="Slip coefficient", gt=0, lt=1),
    rolling_res: float = Query(..., description="Rolling resistance coefficient", gt=0),
    radius: float = Query(0.048, description="Ball radius (m)", gt=0),
    mass: float = Query(0.04593, description="Ball mass (kg)", gt=0),
    air_density: float = Query(1.293, description="Air density (kg/m^3)", gt=0),
    drag_coeff: float = Query(0.47, description="Drag coefficient", gt=0),
    launch_height: float = Query(0.0, description="Launch height (m)"),
    max_drop_height: float = Query(3.0, description="Maximum drop height (m)", gt=0),
    tol: float = Query(1e-6, description="Precision of the answer (m)", gt=0),
    dt: float = Query(0.001, description="Time step for simulation (s)", gt=0, lt=0.01),
):
    return cal_drop_height(
        target_range=target_range,
        max_drop_height=max_drop_height,
        angle_deg=angle_deg,
        ramp_height=ramp_height,
        slip_coeff=slip_coeff,
        rolling_res=rolling_res,
        radius=radius,
        mass=mass,
        air_density=air_density,
        drag_coeff=drag_coeff,
        launch_height=launch_height,
        tol=tol,
        dt=dt,
    )