// Port Solano — pedestrians: locals walking the sidewalks who flee when scared.
import * as THREE from 'three';
import { WORLD } from './state.js';
import { randRange, pick, clamp } from './util.js';

const PED_COUNT = 26;
const SHIRT_COLORS = [0xe84c4c, 0x4ce87a, 0x4c8fe8, 0xe8d44c, 0xe88ac0, 0x8a4ce8, 0xf0f0f0, 0x333333];

function makePedMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
  torso.position.y = 1.05; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
  head.position.y = 1.6; g.add(head);
  for (const s of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.2), pants);
    leg.position.set(s, 0.34, 0); g.add(leg);
  }
  return g;
}

export function spawnPedestrians(scene, rng) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i++) {
    const mesh = makePedMesh(pick(rng, SHIRT_COLORS));
    scene.add(mesh);
    const p = {
      mesh,
      x: randRange(rng, -190, 160),
      z: randRange(rng, -190, 190),
      heading: rng() * Math.PI * 2,
      speed: randRange(rng, 1.2, 2.2),
      flee: 0,           // seconds of fleeing left
      scared: false,
      down: false,
      walkPhase: rng() * 6,
    };
    mesh.position.set(p.x, 0, p.z);
    peds.push(p);
  }
  return peds;
}

export function updatePedestrians(peds, dt, playerPos, playerSpeed, rng) {
  for (const p of peds) {
    if (p.down) continue;
    const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
    if (d < 14 && playerSpeed > 8) {
      p.flee = 2.5;
      if (!p.scared) { p.scared = true; p.fled = true; }
    }
    if (p.flee > 0) {
      p.flee -= dt;
      const away = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
      p.heading = away;
      p.speed = 5.5;
    } else {
      p.speed = 1.6;
      if (rng() < dt * 0.08) p.heading += (rng() - 0.5) * 1.6;
      // Stay off the roads: steer back toward the nearest block centre.
      const onRoadX = Math.abs(p.x - Math.round(p.x / 40) * 40) < 9;
      const onRoadZ = Math.abs(p.z - Math.round(p.z / 40) * 40) < 9;
      if (onRoadX || onRoadZ) {
        const bx = Math.round((p.x - 20) / 40) * 40 + 20;
        const bz = Math.round((p.z - 20) / 40) * 40 + 20;
        p.heading = Math.atan2(bx - p.x, bz - p.z);
      }
    }
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    p.x = clamp(p.x, -195, 195);
    p.z = clamp(p.z, -195, 195);
    p.walkPhase += dt * p.speed * 2;
    p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
    p.mesh.rotation.y = p.heading;
  }
}

export function scaredCount(peds) {
  let n = 0;
  for (const p of peds) if (p.fled) n++;
  return n;
}
