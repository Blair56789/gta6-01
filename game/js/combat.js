// combat.js — on-foot punch, pistol/SMG hitscan shooting, enemy shooters for
// the Mission 5 shootout, and tracers that show where shots went.
import * as THREE from 'three';

export function createCombat(scene) {
  return { enemies: [], tracers: [], punchCd: 0, shootCd: 0 };
}

function makeEnemyMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x3a1a1a });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 8), jacket);
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9a06a }));
  head.position.y = 1.9; g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), new THREE.MeshLambertMaterial({ color: 0x14161a }));
  gun.position.set(0.3, 1.3, 0.4); g.add(gun);
  return g;
}

export function spawnEnemies(scene, combat, center, count, rng) {
  combat.enemies = [];
  for (let i = 0; i < count; i++) {
    const mesh = makeEnemyMesh();
    const ang = rng() * Math.PI * 2, r = 14 + rng() * 16;
    mesh.position.set(center.x + Math.sin(ang) * r, 0, center.z + Math.cos(ang) * r);
    scene.add(mesh);
    combat.enemies.push({ mesh, pos: mesh.position, hp: 30, shootCd: 1 + rng() * 2, speed: 2.6 });
  }
}

export function clearEnemies(scene, combat) {
  for (const e of combat.enemies) scene.remove(e.mesh);
  combat.enemies = [];
}

function addTracer(scene, combat, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
  scene.add(line);
  combat.tracers.push({ line, life: 0.12 });
}

// Player punch: hits the nearest enemy/ped within 2.2m in front.
export function playerPunch(ctx) {
  const { combat, player, state, audio } = ctx;
  if (combat.punchCd > 0) return;
  combat.punchCd = 0.45;
  audio.punch();
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  let best = null, bestD = 2.4;
  for (const e of combat.enemies) {
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD && dx * fx + dz * fz > 0) { best = e; bestD = d; }
  }
  if (best) {
    best.hp -= 20;
    ctx.addFeed('You landed a punch!');
    if (best.hp <= 0) {
      ctx.scene.remove(best.mesh);
      combat.enemies = combat.enemies.filter(e => e !== best);
      state.cash += 25; ctx.addFeed('Enemy down — +$25');
      audio.cash();
    }
  }
}

// Player shoot: hitscan toward the camera-forward direction on the ground plane.
export function playerShoot(ctx, targetPoint) {
  const { combat, player, state, audio, scene } = ctx;
  if (state.weapon === 'fists') { playerPunch(ctx); return; }
  if (combat.shootCd > 0 || state.ammo <= 0) return;
  combat.shootCd = state.weapon === 'smg' ? 0.11 : 0.3;
  state.ammo -= 1;
  audio.gunshot();
  const from = new THREE.Vector3(player.pos.x, 1.4, player.pos.z);
  const dir = new THREE.Vector3(targetPoint.x - from.x, 0, targetPoint.z - from.z).normalize();
  const to = from.clone().add(dir.clone().multiplyScalar(42));
  // hit the first enemy within 1.2m of the shot line
  let best = null, bestT = 42;
  for (const e of combat.enemies) {
    const ex = e.pos.x - from.x, ez = e.pos.z - from.z;
    const t = ex * dir.x + ez * dir.z;
    if (t > 0 && t < bestT) {
      const px = from.x + dir.x * t, pz = from.z + dir.z * t;
      if (Math.hypot(e.pos.x - px, e.pos.z - pz) < 1.4) { best = e; bestT = t; }
    }
  }
  if (best) {
    best.hp -= state.weapon === 'smg' ? 18 : 34;
    to.copy(new THREE.Vector3(best.pos.x, 1.2, best.pos.z));
    if (best.hp <= 0) {
      scene.remove(best.mesh);
      combat.enemies = combat.enemies.filter(e => e !== best);
      state.cash += 50; ctx.addFeed('Enemy down — +$50'); audio.cash();
      ctx.onEnemyDown?.();
    }
  } else {
    // shooting a cop or a bystander raises heat
    if (state.wanted < 5 && Math.random() < 0.3) ctx.raiseWanted(1, 'fired a shot in public');
  }
  addTracer(scene, combat, from, to);
  // muzzle flash light
  const flash = new THREE.PointLight(0xffe27a, 12, 9);
  flash.position.copy(from); scene.add(flash);
  setTimeout(() => scene.remove(flash), 60);
}

export function updateCombat(ctx, dt) {
  const { combat, player, state, audio, scene } = ctx;
  combat.punchCd = Math.max(0, combat.punchCd - dt);
  combat.shootCd = Math.max(0, combat.shootCd - dt);
  for (const t of combat.tracers) t.life -= dt;
  combat.tracers = combat.tracers.filter(t => {
    if (t.life <= 0) { scene.remove(t.line); return false; }
    return true;
  });
  // enemies advance on the player and shoot back
  for (const e of combat.enemies) {
    const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    if (dist > 6) {
      e.pos.x += Math.sin(e.mesh.rotation.y) * e.speed * dt;
      e.pos.z += Math.cos(e.mesh.rotation.y) * e.speed * dt;
    }
    e.shootCd -= dt;
    if (e.shootCd <= 0 && dist < 30) {
      e.shootCd = 2.2 + Math.random();
      addTracer(scene, combat, new THREE.Vector3(e.pos.x, 1.4, e.pos.z),
        new THREE.Vector3(player.pos.x, 1.2, player.pos.z));
      audio.gunshot();
      if (Math.random() < 0.45) ctx.damagePlayer(5, 'shot');
    }
    // enemy reaches the player on foot: melee damage
    if (dist < 1.8 && !player.inCar) { ctx.damagePlayer(8 * dt, 'beaten'); }
  }
}
