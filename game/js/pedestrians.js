// pedestrians.js — sidewalk walkers who stroll, cross at corners, and flee
// from speeding cars, gunfire and police chases. Some carry a taxi "!" fare.
import * as THREE from 'three';
import { ROAD, BOUND } from './city.js';

const SHIRTS = [0xe85a5a, 0x5a8ae8, 0x5ae88a, 0xe8d25a, 0xb45ae8, 0xe8a25a, 0x5ad8e8];

export function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rng() * SHIRTS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: [0xe8b88a, 0xc98a5a, 0x8a5a34][Math.floor(rng() * 3)] });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), shirt);
  body.position.y = 1.0; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.85; head.castShadow = true; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), new THREE.MeshLambertMaterial({ color: 0x2c3138 }));
  legL.position.set(-0.14, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

export function createPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePedMesh(rng);
    const road = ROAD[Math.floor(rng() * ROAD.length)];
    const along = (rng() * 2 - 1) * 105;
    const side = rng() < 0.5;
    const x = side ? along : road + 7.5;
    const z = side ? road + 7.5 : along;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({ mesh, pos: mesh.position, heading: rng() * Math.PI * 2,
      speed: 1 + rng() * 1.2, fleeing: 0, taxi: false, walkPhase: rng() * 6 });
  }
  return peds;
}

export function updatePedestrians(peds, dangerPos, dangerRadius, dt, rng) {
  for (const p of peds) {
    const dx = p.pos.x - dangerPos.x, dz = p.pos.z - dangerPos.z;
    const d = Math.hypot(dx, dz);
    if (dangerRadius > 0 && d < dangerRadius) {
      p.fleeing = 2.5;
      p.heading = Math.atan2(dx, dz);
    }
    if (p.fleeing > 0) {
      p.fleeing -= dt;
      p.speed = 4.5;
    } else {
      p.speed = 1.4;
      if (rng() < dt * 0.08) p.heading += (rng() - 0.5) * 1.6;
      // keep to sidewalks: steer back toward a road line offset
      if (Math.abs(p.pos.x) > BOUND - 4 || Math.abs(p.pos.z) > BOUND - 4) p.heading += Math.PI;
    }
    p.pos.x += Math.sin(p.heading) * p.speed * dt;
    p.pos.z += Math.cos(p.heading) * p.speed * dt;
    p.pos.x = THREE.MathUtils.clamp(p.pos.x, -BOUND, BOUND);
    p.pos.z = THREE.MathUtils.clamp(p.pos.z, -BOUND, BOUND);
    p.mesh.rotation.y = p.heading;
    p.walkPhase += dt * p.speed * 3;
    const sw = Math.sin(p.walkPhase) * 0.35;
    p.mesh.userData.legL.position.z = sw; p.mesh.userData.legR.position.z = -sw;
  }
}

// A pedestrian the player can pick up for a taxi fare.
export function markTaxiPed(ped) { ped.taxi = true; }
