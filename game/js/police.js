// police.js — wanted level, police car pursuit, foot cops, 5-star roadblocks,
// and the "lose the heat" timer (break line of sight, then hide or bribe).
import * as THREE from 'three';
import { createCar } from './vehicles.js';
import { BOUND } from './city.js';

const POLICE_MODEL = { name: 'Solano PD Interceptor', color: 0x1a1d22, top: 24, grip: 1.1 };

export function createPolice(scene) {
  return { cars: [], foot: [], hiddenTimer: 0, roadblocks: [], spawnCooldown: 0 };
}

function spawnPoliceCar(scene, police, near, rng) {
  const ang = rng() * Math.PI * 2;
  const x = THREE.MathUtils.clamp(near.x + Math.sin(ang) * 55, -BOUND, BOUND);
  const z = THREE.MathUtils.clamp(near.z + Math.cos(ang) * 55, -BOUND, BOUND);
  const car = createCar(scene, POLICE_MODEL, x, z, Math.atan2(near.x - x, near.z - z), { isPolice: true });
  car.speed = 12;
  police.cars.push(car);
  return car;
}

function spawnFootCop(scene, police, near, rng) {
  const g = new THREE.Group();
  const uni = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 8), uni);
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.9; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x0e1a33 }));
  cap.position.y = 2.08; g.add(cap);
  const ang = rng() * Math.PI * 2;
  g.position.set(THREE.MathUtils.clamp(near.x + Math.sin(ang) * 18, -BOUND, BOUND), 0,
    THREE.MathUtils.clamp(near.z + Math.cos(ang) * 18, -BOUND, BOUND));
  scene.add(g);
  const cop = { mesh: g, pos: g.position, heading: 0, speed: 3.4, shootCd: 2 + rng() * 2 };
  police.foot.push(cop);
  return cop;
}

export function wantedTargetCount(wanted) {
  return wanted <= 0 ? 0 : wanted === 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : wanted === 4 ? 4 : 5;
}

export function updatePolice(ctx, dt, rng) {
  const { scene, state, police, player, audio } = ctx;
  const wanted = state.wanted;
  police.spawnCooldown -= dt;

  // --- spawn to match wanted level ---
  const want = wantedTargetCount(wanted);
  if (police.cars.length < want && police.spawnCooldown <= 0) {
    spawnPoliceCar(scene, police, player.pos, rng);
    police.spawnCooldown = 4;
    if (wanted >= 3 && police.foot.length < 2) spawnFootCop(scene, police, player.pos, rng);
  }
  if (wanted === 0) {
    // heat gone: police peel off and despawn at distance
    for (const c of police.cars) { c.speed = 14; c.heading += dt * 0.2; }
  }

  // --- police cars chase + ram ---
  const px = player.pos.x, pz = player.pos.z;
  for (const c of police.cars) {
    const dx = px - c.pos.x, dz = pz - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - c.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    c.heading += THREE.MathUtils.clamp(dh, -2.4 * dt, 2.4 * dt);
    const wantSpeed = wanted === 0 ? 14 : 13 + wanted * 2.2;
    c.speed += (wantSpeed - c.speed) * Math.min(1, dt * 1.2);
    c.pos.x += Math.sin(c.heading) * c.speed * dt;
    c.pos.z += Math.cos(c.heading) * c.speed * dt;
    c.mesh.rotation.y = c.heading;
    // flashing light bar
    if (c.mesh.userData.lightBar) {
      const on = Math.floor(performance.now() / 180) % 2 === 0;
      c.mesh.userData.lightBar[0].visible = on; c.mesh.userData.lightBar[1].visible = !on;
    }
    // ram: damage the player car / player
    if (dist < 3.4 && wanted > 0) {
      ctx.damagePlayer(6 * dt * 10, 'ram');
      if (player.inCar) {
        player.car.speed *= 0.92;
        const push = 6 * dt;
        player.car.pos.x += Math.sin(c.heading) * push;
        player.car.pos.z += Math.cos(c.heading) * push;
      }
      if (Math.random() < dt * 2) audio.crash();
    }
  }
  // despawn far police when heat is gone
  police.cars = police.cars.filter(c => {
    const d = Math.hypot(c.pos.x - px, c.pos.z - pz);
    if (wanted === 0 && d > 90) { scene.remove(c.mesh); return false; }
    if (d > 260) { scene.remove(c.mesh); return false; }
    return true;
  });

  // --- foot cops: run at the player, shoot when close and player is on foot ---
  for (const cop of police.foot) {
    const dx = px - cop.pos.x, dz = pz - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    cop.heading = Math.atan2(dx, dz);
    if (dist > 2.2) {
      cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
    }
    cop.mesh.rotation.y = cop.heading;
    cop.shootCd -= dt;
    if (cop.shootCd <= 0 && dist < 26 && !player.inCar && wanted > 0) {
      cop.shootCd = 2.4;
      ctx.damagePlayer(7, 'shot');
      audio.gunshot();
      ctx.addFeed('A cop opened fire on you!');
    }
    // arrest: cop touches the player on foot while wanted
    if (dist < 1.6 && !player.inCar && wanted > 0) ctx.busted('arrested by Solano PD');
  }
  police.foot = police.foot.filter(cop => {
    const d = Math.hypot(cop.pos.x - px, cop.pos.z - pz);
    if (wanted === 0 && d > 70) { scene.remove(cop.mesh); return false; }
    return true;
  });

  // --- 5-star roadblocks: parked police cars across the road ahead ---
  if (wanted >= 5 && police.roadblocks.length === 0) {
    for (let i = -1; i <= 1; i++) {
      const rb = createCar(scene, POLICE_MODEL, px + i * 3.2 + 20, pz + 24, Math.PI / 2, { isPolice: true });
      rb.parked = true; rb.speed = 0;
      police.roadblocks.push(rb);
    }
    ctx.addFeed('ROADBLOCK AHEAD — 5 stars! Turn around or smash through!');
    audio.sirenBlip();
  }
  if (wanted < 5) {
    for (const rb of police.roadblocks) scene.remove(rb.mesh);
    police.roadblocks = [];
  }

  // --- losing the heat: far from all police + out of sight for a while ---
  const nearest = Math.min(
    ...police.cars.map(c => Math.hypot(c.pos.x - px, c.pos.z - pz)), 999);
  if (wanted > 0 && nearest > 55) {
    police.hiddenTimer += dt;
    if (police.hiddenTimer > 6 + wanted * 2) {
      state.wanted = Math.max(0, wanted - 1);
      police.hiddenTimer = 0;
      ctx.addFeed(state.wanted === 0 ? 'You lost them. Heat is off.' : `Wanted level dropped to ${state.wanted} star${state.wanted > 1 ? 's' : ''}.`);
      audio.blip();
    }
  } else police.hiddenTimer = 0;
}
