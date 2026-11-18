// Port Solano — Solano PD: patrol cars that chase and ram, foot cops at low
// wanted levels, and roadblocks once the heat hits 4 stars.
import * as THREE from 'three';
import { newCar, CAR_MODELS } from './vehicles.js';
import { clamp } from './util.js';

const POLICE_MODEL = { name: 'PD Interceptor', color: 0x14181f, top: 30, accel: 18 };

export function spawnPolice(scene, count) {
  const cops = [];
  for (let i = 0; i < count; i++) {
    const car = newCar(scene, POLICE_MODEL, 0, 0, 0, 'police');
    car.isCop = true;
    car.active = false;
    car.mesh.visible = false;
    cops.push(car);
  }
  return cops;
}

function placeCopNear(cop, px, pz, rng) {
  const a = rng() * Math.PI * 2;
  const d = 45 + rng() * 25;
  cop.x = clamp(px + Math.sin(a) * d, -195, 195);
  cop.z = clamp(pz + Math.cos(a) * d, -195, 195);
  cop.speed = 8;
  cop.mesh.visible = true;
  cop.active = true;
}

export function updatePolice(cops, dt, state, rng, city) {
  const wanted = state.wanted;
  const px = state.inCar && state.car ? state.car.x : state.player.x;
  const pz = state.inCar && state.car ? state.car.z : state.player.z;
  const playerSpeed = state.inCar && state.car ? Math.abs(state.car.speed) : 0;
  const wantCount = wanted === 0 ? 0 : wanted <= 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : wanted === 4 ? 4 : 5;
  let active = 0;
  for (const cop of cops) if (cop.active) active++;
  // Spawn more cops up to the wanted level's count.
  for (const cop of cops) {
    if (active >= wantCount) break;
    if (!cop.active) { placeCopNear(cop, px, pz, rng); active++; }
  }
  // Stand down extras when the heat drops.
  let idx = 0;
  for (const cop of cops) {
    if (cop.active) { idx++; if (idx > wantCount) { cop.active = false; cop.mesh.visible = false; } }
  }

  state.roadblock = wanted >= 4;
  let closest = Infinity;
  for (const cop of cops) {
    if (!cop.active) continue;
    const dx = px - cop.x, dz = pz - cop.z;
    const d = Math.hypot(dx, dz);
    closest = Math.min(closest, d);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    const top = 24 + wanted * 1.6;
    cop.speed = Math.min(cop.speed + 16 * dt, top);
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    // Ram: bump the player car and slow it (rate-limited, not every frame).
    cop.ramT = Math.max(0, (cop.ramT || 0) - dt);
    if (d < 4.2 && cop.ramT <= 0) {
      cop.ramT = 0.6;
      if (state.inCar && state.car) {
        state.car.speed *= 0.82;
        // Only shove a moving car: a stopped car should not be bulldozed.
        if (Math.abs(state.car.speed) > 3) {
          state.car.x += Math.sin(cop.heading) * 1.2;
          state.car.z += Math.cos(cop.heading) * 1.2;
        }
        cop.speed *= 0.6;
        state.bumped = true;
      } else if (d < 2.2) {
        state.bustedTimer = (state.bustedTimer || 0) + dt;
      }
    } else if (!state.inCar && d < 2.2) {
      state.bustedTimer = (state.bustedTimer || 0) + dt;
    }
  }
  state.closestCop = closest;
  // Busted: a cop stays on top of the player on foot, or the player car is
  // stopped cold with cops touching it.
  if (state.wanted > 0) {
    if (!state.inCar && closest < 2.4 && (state.bustedTimer || 0) > 1.2) state.mode = 'busted';
    if (state.inCar && state.car && Math.abs(state.car.speed) < 0.5 && closest < 3.5) {
      state.stoppedTimer = (state.stoppedTimer || 0) + dt;
      if (state.stoppedTimer > 3) state.mode = 'busted';
    } else {
      state.stoppedTimer = 0;
    }
  } else {
    state.bustedTimer = 0;
    state.stoppedTimer = 0;
  }
  return closest;
}

// Foot cops: simple visual markers that wander near the player at 1-2 stars.
export function spawnFootCops(scene) {
  const cops = [];
  const mat = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.32), mat);
    torso.position.y = 1.1; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
    head.position.y = 1.7; g.add(head);
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), new THREE.MeshLambertMaterial({ color: 0x101418 }));
    hat.position.y = 1.92; g.add(hat);
    g.visible = false;
    scene.add(g);
    cops.push({ mesh: g, x: 0, z: 0, heading: 0, active: false });
  }
  return cops;
}

export function updateFootCops(cops, dt, state, rng) {
  const want = state.wanted >= 1 && state.wanted <= 2;
  cops.forEach((cop, i) => {
    cop.active = want;
    cop.mesh.visible = want;
    if (!want) return;
    const px = state.player.x, pz = state.player.z;
    if (Math.hypot(cop.x - px, cop.z - pz) > 40 || (cop.x === 0 && cop.z === 0)) {
      cop.x = px + (rng() - 0.5) * 50;
      cop.z = pz + (rng() - 0.5) * 50;
    }
    const d = Math.hypot(px - cop.x, pz - cop.z);
    cop.heading = Math.atan2(px - cop.x, pz - cop.z);
    const sp = d > 6 ? 3.2 : 0;
    cop.x += Math.sin(cop.heading) * sp * dt;
    cop.z += Math.cos(cop.heading) * sp * dt;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    if (d < 2.0) state.bustedTimer = (state.bustedTimer || 0) + dt * 1.5;
  });
}
