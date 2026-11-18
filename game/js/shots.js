// Port Solano — deterministic screenshot staging for ?shot=start|drive|chase|mission.
// Each scene plays the real game forward from a seeded state for a fixed
// number of fixed steps with a scripted autopilot, so the same seed always
// gives the same frame. The main loop freezes after staging.
import { startMission } from './missions.js';

const STEP = 1 / 60;

// Drive toward the current objective along the road grid: first along the
// current road to the target's street, then turn onto it. If the car stalls
// against a building, reverse out and try again.
function autopilotDrive(ctx, steps) {
  let stuck = 0, reversing = 0;
  for (let i = 0; i < steps; i++) {
    const state = ctx.getState();
    const car = state.car;
    if (!car || !state.objective) { ctx.stepSim(STEP, { forward: false, back: false, left: false, right: false, sprint: false, handbrake: false }); continue; }
    const tx = state.objective.x, tz = state.objective.z;
    // Waypoint: stay on the road grid — drive to the target's street first.
    const roadX = Math.round(car.x / 40) * 40;
    const roadZ = Math.round(car.z / 40) * 40;
    let wx, wz;
    if (Math.abs(car.z - tz) > 12) { wx = roadX; wz = tz; }
    else { wx = tx; wz = tz; }
    const target = Math.atan2(wx - car.x, wz - car.z);
    let dh = target - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    // Left key raises heading (turns toward +x); right lowers it.
    const steer = dh > 0.1 ? 1 : dh < -0.1 ? -1 : 0;
    if (Math.abs(car.speed) < 0.6 && Math.abs(dh) < 0.5) stuck++; else stuck = 0;
    if (stuck > 40) { reversing = 25; stuck = 0; }
    if (reversing > 0) {
      reversing--;
      ctx.stepSim(STEP, { forward: false, back: true, left: steer === -1, right: steer === 1, sprint: false, handbrake: false });
    } else {
      // Coast through hard turns so the car rotates instead of ploughing on —
      // but keep a little throttle when nearly stopped, or a slow turn stalls.
      // Brake hard into very sharp turns at speed.
      const hardTurn = Math.abs(dh) > 0.5;
      const crawling = Math.abs(car.speed) < 2.5;
      ctx.stepSim(STEP, {
        forward: !hardTurn || crawling, back: false,
        left: steer === 1, right: steer === -1,
        sprint: false, handbrake: false,
      });
    }
  }
}

// On-foot autopilot: walk toward the objective.
function autopilotWalk(ctx, steps) {
  for (let i = 0; i < steps; i++) {
    const state = ctx.getState();
    if (state.objective) {
      const target = Math.atan2(state.objective.x - state.player.x, state.objective.z - state.player.z);
      state.camYaw = target;
      state.player.heading = target;
    }
    ctx.stepSim(STEP, { forward: true, back: false, left: false, right: false, sprint: false, handbrake: false });
  }
}

export function stageShot(name, ctx) {
  const getState = ctx.getState;
  if (name === 'start') {
    // Menu over the live city at golden morning light.
    const state = getState();
    state.mode = 'menu';
    state.clockMin = 600;
    ctx.game.camera.position.set(90, 55, 110);
    ctx.game.camera.lookAt(0, 0, 0);
    return;
  }
  // All gameplay shots start a fresh game: in the car, Mission 1 auto-started.
  ctx.startNewGame();
  const state = getState();
  state.clockMin = 600; // 10:00, bright sun
  state.cash = 4820;
  state.respect = 2100;

  if (name === 'drive') {
    // Drive toward the Mission 1 marker for ~7 s with traffic around.
    autopilotDrive(ctx, 420);
    ctx.feed(getState(), 'MISSION 1/6: GETAWAY — Lose the cops, reach the gold marker.');
    return;
  }
  if (name === 'chase') {
    // Three-star chase: cops spawn behind and ram for ~6 s.
    getState().wanted = 3;
    autopilotDrive(ctx, 360);
    ctx.feed(getState(), 'Wanted level up! ★★★ — spotted fleeing the scene');
    ctx.feed(getState(), 'MISSION 1/6: GETAWAY — Lose the cops, reach the gold marker.');
    return;
  }
  if (name === 'mission') {
    // Mission 2/6 Courier Run in progress: drive the full route to drop 1 so
    // the delivery genuinely happens, then head for drop 2.
    startMission(getState(), ctx.missionApi, 1);
    getState().missionTimer = 198;
    getState().cash = 5240;
    autopilotDrive(ctx, 1100);
    return;
  }
  // Unknown shot name falls back to the menu.
  getState().mode = 'menu';
}
