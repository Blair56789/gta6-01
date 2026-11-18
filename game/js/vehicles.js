// vehicles.js — low-poly car models (boxes + cylinder wheels) and arcade car
// physics for the player car, plus parked cars the player can steal.
import * as THREE from 'three';

const CAR_MODELS = [
  { name: 'Solano Sedan', color: 0x3a6fd8, top: 18, grip: 1.0 },
  { name: 'Comet GT', color: 0xd8b23a, top: 26, grip: 1.15 },
  { name: 'Vagabond Van', color: 0x7a8a99, top: 15, grip: 0.9 },
  { name: 'Sunset Coupe', color: 0xc23a5a, top: 22, grip: 1.1 },
  { name: 'Harbor Taxi', color: 0xe8c23a, top: 17, grip: 1.0 },
  { name: 'Dockside Pickup', color: 0x4a7a3a, top: 16, grip: 0.95 },
];

export function makeCarMesh(model, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1d22 : model.color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1d22 : 0x222a33 }));
  cabin.position.set(0, 1.15, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w);
  }
  // headlights + taillights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  hl.position.set(0, 0.6, 2.22); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3a3a }));
  tl.position.set(0, 0.6, -2.22); g.add(tl);
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.55, -0.2); g.add(bar);
    const bar2 = bar.clone(); bar2.material = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    bar2.position.x = 0; bar2.position.z = 0.25; g.add(bar2);
    g.userData.lightBar = [bar, bar2];
  }
  return g;
}

export function randomCarModel(rng) { return CAR_MODELS[Math.floor(rng() * CAR_MODELS.length)]; }
export function cometModel() { return CAR_MODELS[1]; }

// A car entity: { mesh, model, pos:Vector3, heading, speed, isPlayer, isPolice, parked, stolen, hp }
export function createCar(scene, model, x, z, heading, opts = {}) {
  const mesh = makeCarMesh(model, opts.isPolice);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  scene.add(mesh);
  const car = { mesh, model, pos: mesh.position, heading, speed: 0,
    isPolice: !!opts.isPolice, parked: !!opts.parked, stolen: false,
    hp: 100, steer: 0, topSpeed: model.top * (opts.speedMul || 1) };
  return car;
}

// Arcade driving: W/S accelerate, A/D steer (scales with speed), Space handbrake.
export function driveCar(car, input, dt, upgrades) {
  const maxFwd = car.topSpeed * (1 + 0.18 * (upgrades.carSpeed || 0));
  const accel = 20, brake = 30, drag = 0.6;
  if (input.forward) car.speed += accel * dt;
  if (input.back) car.speed -= (car.speed > 0.5 ? brake : 10) * dt;
  if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * drag * 4 * dt;
  if (input.handbrake) car.speed *= Math.max(0, 1 - 3.5 * dt);
  car.speed = THREE.MathUtils.clamp(car.speed, -9, maxFwd);
  if (Math.abs(car.speed) < 0.05) car.speed = 0;
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const turn = car.steer * 1.9 * Math.min(1, Math.abs(car.speed) / 8) * (car.speed >= 0 ? 1 : -1);
  car.heading += turn * dt * (input.handbrake ? 1.5 : 1);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.rotation.y = car.heading;
  // body roll + pitch for feel
  car.mesh.rotation.z = -car.steer * 0.05 * Math.min(1, Math.abs(car.speed) / 10);
  car.mesh.rotation.x = THREE.MathUtils.clamp(-(input.forward ? 1 : 0) * 0.02, -0.03, 0.03);
}

export function carSpeedMph(car) { return Math.abs(car.speed) * 2.4; }
