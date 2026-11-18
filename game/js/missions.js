// missions.js — the six-job story chain for Rook and fixer Mara Voss.
// Each mission is stages with a waypoint, a radius and an optional timer.
// Completing a mission pays cash + Respect and advances the clock one day.
import * as THREE from 'three';

export const MISSION_DEFS = [
  { name: 'GETAWAY', short: 'Lose the cops, reach the gold marker.',
    intro: 'Mara: "Cops are on you already, Rook. Lose them and get to the gold marker. Drive!"',
    reward: 800, respect: 400,
    stages: [{ text: 'Reach the gold marker', target: [46, 92], radius: 8, timer: 150 }] },
  { name: 'COURIER RUN', short: 'Deliver the package — two drops, on the clock.',
    intro: 'Mara: "Two drops, one package, no questions. First the north docks, then the pier. Go."',
    reward: 1200, respect: 500,
    stages: [
      { text: 'Deliver to the north docks', target: [0, -92], radius: 8, timer: 180 },
      { text: 'Deliver to the pier', target: [112, 0], radius: 8, timer: 180 },
    ] },
  { name: 'STEAL THE COMET', short: 'Steal the gold Comet GT and bring it to the Chop Shop.',
    intro: 'Mara: "A gold Comet GT is parked by the pier. Take it — press E — and bring it to the Chop Shop. No scratches."',
    reward: 1500, respect: 700,
    stages: [
      { text: 'Reach the gold Comet GT', target: [100, 46], radius: 6, timer: 240 },
      { text: 'Steal the Comet (press E by the car)', target: [100, 46], radius: 6, timer: 240, needCar: 'comet' },
      { text: 'Deliver the Comet to the Chop Shop', target: [69, 69], radius: 9, timer: 240, needCar: 'comet' },
    ] },
  { name: 'TAIL THE COURIER', short: 'Follow the courier — close enough to see, far enough not to be seen.',
    intro: 'Mara: "A courier is carrying the Meridian vault codes. Tail him. Stay 10–45m back. Get spotted and he burns the codes."',
    reward: 1800, respect: 800,
    stages: [{ text: 'Tail the courier — stay in range', target: null, radius: 0, timer: 240, tail: true }] },
  { name: 'DEFEND THE STASH', short: 'Hold the safehouse. Drop all 8 raiders.',
    intro: 'Mara: "Rivals found the stash house. Hold the safehouse and drop all 8 raiders. Punch with F, shoot with click."',
    reward: 2500, respect: 1000,
    stages: [{ text: 'Defend the safehouse — raiders left: 8', target: [-69, -69], radius: 20, timer: 200, defend: true }] },
  { name: 'THE MERIDIAN JOB', short: 'The final heist. Hit the bank, grab the vault, escape to the pier.',
    intro: 'Mara: "This is it, Rook. The Meridian Bank vault. Grab the cash, lose a 4-star manhunt, and meet me at the pier. $50,000 if we walk away."',
    reward: 50000, respect: 5000,
    stages: [
      { text: 'Reach Meridian Bank', target: [23, -69], radius: 9, timer: 300 },
      { text: 'Hold the vault — stay in the gold zone', target: [23, -69], radius: 9, timer: 300, hold: 10 },
      { text: 'Escape to the pier with the cash', target: [112, 0], radius: 9, timer: 300, wanted: 4 },
    ] },
];

export function rankFor(respect) {
  if (respect >= 8000) return 'Kingpin';
  if (respect >= 4000) return 'Respected';
  if (respect >= 1500) return 'Connected';
  return 'Street';
}

export function startMission(ctx, index) {
  const def = MISSION_DEFS[index];
  ctx.mission = { index, stage: 0, timer: def.stages[0].timer || 0, holdLeft: 0,
    tailTime: 0, spawned: false, text: def.stages[0].text };
  ctx.addFeed(`MISSION ${index + 1}/6: ${def.name} — ${def.short}`);
  ctx.banner(def.name, def.short);
  ctx.audio.blip();
  if (index === 0 && ctx.state.wanted < 1) ctx.raiseWanted(1, 'spotted fleeing the scene');
  if (index === 5) ctx.state.wanted = Math.max(ctx.state.wanted, 0);
  if (index === 3) spawnTailTarget(ctx);
  if (index === 4) ctx.combatSpawn(def);
}

function spawnTailTarget(ctx) {
  const { scene, rng } = ctx;
  const { createCar } = ctx.vehicleApi;
  const car = createCar(scene, { name: 'Courier Van', color: 0x8a8a8a, top: 15, grip: 1 }, -92, 46, Math.PI / 2);
  car.speed = 8; car.isTailTarget = true;
  car.waypoints = [[-92, 46], [46, 46], [46, -46], [-46, -46], [-46, 92], [92, 92], [92, -92], [-92, -92]];
  car.wp = 0;
  ctx.tailTarget = car;
}

export function missionTargetPos(ctx) {
  const m = ctx.mission;
  if (!m) return null;
  const def = MISSION_DEFS[m.index];
  const st = def.stages[m.stage];
  if (st.tail && ctx.tailTarget) return new THREE.Vector3(ctx.tailTarget.pos.x, 0, ctx.tailTarget.pos.z);
  if (!st.target) return null;
  return new THREE.Vector3(st.target[0], 0, st.target[1]);
}

export function missionProgressText(ctx) {
  const m = ctx.mission;
  if (!m) return 'Free roam — press R to restart the current mission';
  const def = MISSION_DEFS[m.index];
  const st = def.stages[m.stage];
  const t = missionTargetPos(ctx);
  const d = t ? Math.round(Math.hypot(t.x - ctx.player.pos.x, t.z - ctx.player.pos.z)) : 0;
  let extra = ` — ${d}m`;
  if (st.tail) extra = ` — in range ${Math.round(m.tailTime)}s / 60s`;
  if (st.hold) extra = ` — hold ${Math.ceil(m.holdLeft)}s`;
  if (st.defend) extra = ` — raiders left: ${ctx.combat.enemies.length}`;
  const timer = m.timer > 0 ? ` ⏱ ${Math.ceil(m.timer)}s` : '';
  return `${st.text}${extra}${timer}`;
}

function advanceStage(ctx) {
  const m = ctx.mission;
  const def = MISSION_DEFS[m.index];
  m.stage += 1;
  if (m.stage >= def.stages.length) { completeMission(ctx); return; }
  const st = def.stages[m.stage];
  m.timer = st.timer || 0; m.holdLeft = st.hold || 0; m.text = st.text;
  ctx.addFeed(`Next: ${st.text}`);
  ctx.audio.blip();
  if (m.index === 5 && m.stage === 2) ctx.raiseWanted(4, 'tripped the Meridian Bank alarm');
}

export function completeMission(ctx) {
  const m = ctx.mission;
  const def = MISSION_DEFS[m.index];
  ctx.state.cash += def.reward;
  ctx.state.respect += def.respect;
  ctx.state.missionsDone += 1;
  ctx.audio.missionDone(); ctx.audio.cash();
  ctx.addFeed(`MISSION COMPLETE: ${def.name} — +$${def.reward.toLocaleString()} +${def.respect} Respect`);
  if (ctx.tailTarget) { ctx.scene.remove(ctx.tailTarget.mesh); ctx.tailTarget = null; }
  ctx.combatClear();
  ctx.state.day += 1;
  ctx.state.timeMin = 8 * 60;
  ctx.saveGame();
  if (m.index === 5) { ctx.winGame(); return; }
  ctx.showEndCard('MISSION COMPLETE',
    `${def.name} done.\n+$${def.reward.toLocaleString()}  •  +${def.respect} Respect  •  Rank: ${rankFor(ctx.state.respect)}\nDay ${ctx.state.day} begins — ${6 - m.index - 1} job${6 - m.index - 1 === 1 ? '' : 's'} left before the Meridian Job.\nNext: ${MISSION_DEFS[m.index + 1].name} — ${MISSION_DEFS[m.index + 1].short}`);
  ctx.mission = null;
  ctx.pendingNextMission = m.index + 1;
}

export function failMission(ctx, reason) {
  const m = ctx.mission;
  ctx.audio.busted();
  if (ctx.tailTarget) { ctx.scene.remove(ctx.tailTarget.mesh); ctx.tailTarget = null; }
  ctx.combatClear();
  ctx.showEndCard('MISSION FAILED', `${reason}\nMara is not happy. The job is still open — try again.`);
  ctx.mission = null;
  ctx.pendingRetryMission = m ? m.index : 0;
}

export function updateMission(ctx, dt) {
  const m = ctx.mission;
  if (!m) return;
  const def = MISSION_DEFS[m.index];
  const st = def.stages[m.stage];
  // countdown
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(ctx, `Out of time on ${def.name}.`); return; }
  }
  const p = ctx.player.pos;
  // tail mission: follow the courier van along its waypoints
  if (st.tail && ctx.tailTarget) {
    const t = ctx.tailTarget;
    const wp = t.waypoints[t.wp];
    const dx = wp[0] - t.pos.x, dz = wp[1] - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) t.wp = (t.wp + 1) % t.waypoints.length;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - t.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    t.heading += THREE.MathUtils.clamp(dh, -1.6 * dt, 1.6 * dt);
    t.speed = 8;
    t.pos.x += Math.sin(t.heading) * t.speed * dt;
    t.pos.z += Math.cos(t.heading) * t.speed * dt;
    t.mesh.rotation.y = t.heading;
    const dist = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
    if (dist < 8) { failMission(ctx, 'The courier spotted you — too close! He burned the codes.'); return; }
    if (dist > 50) { m.tailTime = Math.max(0, m.tailTime - dt * 2); }
    else { m.tailTime += dt; if (Math.floor(m.tailTime) !== Math.floor(m.tailTime - dt)) ctx.addFeed(`Tailing… ${Math.round(m.tailTime)}s / 60s`); }
    if (m.tailTime >= 60) { completeMission(ctx); }
    return;
  }
  // defend mission: all raiders down wins
  if (st.defend) {
    if (m.spawned && ctx.combat.enemies.length === 0) { completeMission(ctx); }
    return;
  }
  // hold stage (vault): stay inside the zone
  if (st.hold) {
    const t = new THREE.Vector3(st.target[0], 0, st.target[1]);
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d < st.radius) {
      m.holdLeft -= dt;
      if (m.holdLeft <= 0) { ctx.addFeed('Vault cracked — $50,000 in the bag! RUN!'); advanceStage(ctx); }
    } else m.holdLeft = st.hold;
    return;
  }
  // plain reach-the-marker stage
  const t = new THREE.Vector3(st.target[0], 0, st.target[1]);
  const d = Math.hypot(p.x - t.x, p.z - t.z);
  if (st.needCar === 'comet') {
    const inComet = ctx.player.inCar && ctx.player.car && ctx.player.car.model.name === 'Comet GT';
    if (m.stage === 1 && inComet) { advanceStage(ctx); return; }
    if (m.stage === 2 && inComet && d < st.radius) { completeMission(ctx); return; }
    if (d < st.radius && m.stage === 1) ctx.setPrompt('Press E to steal the Comet GT');
    return;
  }
  if (d < st.radius) advanceStage(ctx);
}
