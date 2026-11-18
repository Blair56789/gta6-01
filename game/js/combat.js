// Port Solano — on-foot combat: fists, pistol and SMG hitscan shooting,
// reload, muzzle flashes, tracers and damage to peds, cops and traffic.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { clamp } from './util.js';

export function createCombat(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe94a });
  const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
  const tracers = [];
  const flash = new THREE.PointLight(0xffe94a, 0, 18);
  scene.add(flash);
  return { tracers, tracerMat, tracerGeo, flash, flashT: 0 };
}

export function currentWeapon(state) {
  return WEAPONS[state.weaponIndex];
}

// Fire the current weapon. Returns a hit description or null.
export function fireWeapon(state, combat, scene, targets, audio) {
  const w = currentWeapon(state);
  const now = state.time;
  if (state.lastShot && now - state.lastShot < w.rate) return null;
  if (w.id !== 'fists') {
    if (state.magAmmo[state.weaponIndex] <= 0) { audio.blip(220, 0.08, 'square', 0.06); return { empty: true }; }
    state.magAmmo[state.weaponIndex]--;
  }
  state.lastShot = now;
  state.stats.shotsFired++;
  audio.shoot(w.id);
  combat.flashT = 0.06;
  const px = state.player.x, pz = state.player.z;
  const dir = state.player.heading;
  // Muzzle flash at the player's hand.
  combat.flash.position.set(px + Math.sin(dir) * 1, 1.4, pz + Math.cos(dir) * 1);
  combat.flash.intensity = 6;
  if (w.id === 'fists') {
    audio.punch();
    for (const t of targets) {
      if (t.down) continue;
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < w.range) { damageTarget(t, w.damage); return { hit: t, damage: w.damage }; }
    }
    return { miss: true };
  }
  // Hitscan: nearest target inside a narrow cone in front of the player.
  let best = null, bestD = w.range;
  for (const t of targets) {
    if (t.down) continue;
    const dx = t.x - px, dz = t.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > w.range) continue;
    const ang = Math.atan2(dx, dz);
    let diff = ang - dir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.14 && d < bestD) { best = t; bestD = d; }
  }
  // Tracer line from the player toward the aim point.
  const endD = best ? bestD : w.range;
  const tracer = new THREE.Mesh(combat.tracerGeo, combat.tracerMat);
  tracer.position.set(px + Math.sin(dir) * endD / 2, 1.35, pz + Math.cos(dir) * endD / 2);
  tracer.rotation.y = dir;
  tracer.scale.z = endD;
  scene.add(tracer);
  combat.tracers.push({ mesh: tracer, t: 0.09 });
  if (best) {
    damageTarget(best, w.damage);
    if (best.isCopCar) state.wanted = Math.min(5, state.wanted + 1);
    return { hit: best, damage: w.damage };
  }
  return { miss: true };
}

function damageTarget(t, dmg) {
  t.hp = (t.hp ?? 100) - dmg;
  if (t.hp <= 0) {
    t.down = true;
    if (t.mesh) t.mesh.visible = false;
  }
}

export function reloadWeapon(state, audio) {
  const w = currentWeapon(state);
  if (w.id === 'fists') return;
  const need = w.mag - state.magAmmo[state.weaponIndex];
  if (need <= 0 || state.reserveAmmo[state.weaponIndex] <= 0) return;
  const take = Math.min(need, state.reserveAmmo[state.weaponIndex]);
  state.magAmmo[state.weaponIndex] += take;
  state.reserveAmmo[state.weaponIndex] -= take;
  audio.reload();
}

export function updateCombatVisuals(combat, dt) {
  if (combat.flashT > 0) {
    combat.flashT -= dt;
    if (combat.flashT <= 0) combat.flash.intensity = 0;
  }
  for (let i = combat.tracers.length - 1; i >= 0; i--) {
    const tr = combat.tracers[i];
    tr.t -= dt;
    if (tr.t <= 0) {
      tr.mesh.parent?.remove(tr.mesh);
      combat.tracers.splice(i, 1);
    }
  }
}

// Player takes damage: armor absorbs first, then health.
export function hurtPlayer(state, dmg, audio) {
  let left = dmg;
  if (state.armor > 0) {
    const absorbed = Math.min(state.armor, left);
    state.armor -= absorbed;
    left -= absorbed;
  }
  state.health = Math.max(0, state.health - left);
  if (state.health <= 0) state.mode = 'wasted';
}
