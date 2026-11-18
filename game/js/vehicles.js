// Port Solano — vehicles: car meshes and arcade driving physics.
// Original designs: boxy low-poly sedans, taxis, trucks and police interceptors.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { collideCircle } from './city.js';

export const CAR_MODELS = [
  { name: 'Solano Sedan', color: 0x2f6fd8, top: 26, accel: 15 },
  { name: 'Comet GT', color: 0xd82f2f, top: 34, accel: 19 },
  { name: 'Palm Taxi', color: 0xf2c200, top: 24, accel: 14 },
  { name: 'Harbor Truck', color: 0x5a6e7a, top: 20, accel: 11 },
  { name: 'Coast Coupe', color: 0x8e2fd8, top: 30, accel: 17 },
  { name: 'Beach Buggy', color: 0x2fd8a0, top: 24, accel: 15 },
];

export function makeCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2027 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, kind === 'truck' ? 4.6 : 4.1), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, kind === 'truck' ? 1.6 : 2.1), darkMat);
  cabin.position.set(0, 1.1, kind === 'truck' ? 0.9 : -0.15);
  g.add(cabin);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 2.2), new THREE.MeshLambertMaterial({ color: 0x3a4550 }));
    bed.position.set(0, 0.95, -1.1);
    g.add(bed);
  }
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const s of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    hl.position.set(s, 0.6, 2.06);
    g.add(hl);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const s of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), tailMat);
    tl.position.set(s, 0.62, -2.06);
    g.add(tl);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe94a }));
    sign.position.set(0, 1.5, -0.15);
    g.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.45, -0.15);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.45, -0.15);
    bar2.position.x = 0;
    g.add(bar2);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x274e7d });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), jacket);
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
  head.position.y = 1.78; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0xffd25a }));
  cap.position.y = 2.0; g.add(cap);
  for (const s of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), pants);
    leg.position.set(s, 0.38, 0); g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
    arm.position.set(s * 2.1, 1.15, 0); g.add(arm);
  }
  return g;
}

// Arcade car physics: throttle, steering scaled by speed, drag, handbrake slide.
export function driveCar(car, input, dt, city, upgrades) {
  const top = car.top * (1 + 0.12 * (upgrades || 0));
  const accel = car.accel;
  let throttle = 0;
  if (input.forward) throttle += 1;
  if (input.back) throttle -= 0.75;
  car.speed += throttle * accel * dt;
  if (input.handbrake) car.speed *= Math.max(0, 1 - 2.4 * dt);
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  car.speed = clamp(car.speed, -top * 0.45, top);
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  // Steering still bites at low speed (a slow turn must stay possible).
  const steerFactor = Math.abs(car.speed) < 0.3 ? 0 : clamp(Math.abs(car.speed) / 8, 0.35, 1);
  const steer = steerInput * (car.speed >= 0 ? 1 : -1) * steerFactor;
  car.heading += steer * 2.4 * dt * (input.handbrake ? 1.5 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // Keep inside the map; ocean edge is a wall.
  car.x = clamp(nx, -WORLD_HALF(), WORLD_HALF());
  car.z = clamp(nz, -WORLD_HALF(), WORLD_HALF());
  const fixed = collideCircle(city, car.x, car.z, 2.1);
  if (fixed) {
    car.x = fixed.x; car.z = fixed.z;
    // A scrape only costs speed (and flags a crash) once per half second:
    // cutting speed every frame while touching a wall stalls the car dead.
    car.crashT = Math.max(0, (car.crashT || 0) - dt);
    // Only a fast impact counts as a crash: slow scrapes along a wall just
    // slide, or a long scrape would bleed the player to death.
    if (Math.abs(car.speed) > 14 && car.crashT <= 0) {
      car.crashed = true;
      car.crashT = 1.5;
      car.speed *= 0.45;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Body roll and wheel spin flavour.
  car.mesh.rotation.z = -steer * 0.05 * clamp(Math.abs(car.speed) / 20, 0, 1);
  car.mesh.position.y = Math.abs(Math.sin(car.speed * 0.4)) * 0.02;
  return car.crashed;
}

function WORLD_HALF() { return 198; }

export function newCar(scene, model, x, z, heading, kind = 'sedan') {
  const mesh = makeCarMesh(model.color, kind);
  scene.add(mesh);
  const car = {
    mesh, x, z, heading, speed: 0,
    color: model.color, name: model.name,
    top: model.top, accel: model.accel, kind,
    crashed: false, health: 100,
  };
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return car;
}
