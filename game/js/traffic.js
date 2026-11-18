// Port Solano — traffic: civilian cars cruising the road grid on fixed lanes.
import * as THREE from 'three';
import { CAR_MODELS, newCar } from './vehicles.js';
import { WORLD } from './state.js';
import { randRange, pick, clamp } from './util.js';

const TRAFFIC_COUNT = 16;

export function spawnTraffic(scene, rng, city) {
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const model = pick(rng, CAR_MODELS);
    const horizontal = rng() < 0.5;
    const lane = (Math.floor(rng() * 11) - 5) * WORLD.block;
    const along = randRange(rng, -190, 190);
    const heading = horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const offset = 3.5;
    const x = horizontal ? along : lane + (heading === 0 ? offset : -offset);
    const z = horizontal ? lane + (heading === Math.PI / 2 ? -offset : offset) : along;
    const car = newCar(scene, model, x, z, heading, model.name === 'Palm Taxi' ? 'taxi' : 'sedan');
    car.speed = randRange(rng, 9, 14);
    car.horizontal = horizontal;
    car.lane = lane;
    car.ai = true;
    cars.push(car);
  }
  return cars;
}

// Traffic follows its lane; at an intersection it sometimes turns.
export function updateTraffic(cars, dt, rng, playerCar) {
  for (const car of cars) {
    if (car.stolen) continue;
    // Slow down if the player car is right ahead.
    let targetSpeed = car.cruise || 12;
    if (playerCar) {
      const dx = playerCar.x - car.x, dz = playerCar.z - car.z;
      const d = Math.hypot(dx, dz);
      const ahead = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
      if (d < 12 && ahead > 0) targetSpeed = 3;
    }
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Wrap around the map edge.
    if (car.x > 205) car.x = -205;
    if (car.x < -205) car.x = 205;
    if (car.z > 205) car.z = -205;
    if (car.z < -205) car.z = 205;
    // Turn at a random intersection.
    const nearX = Math.abs(car.x - Math.round(car.x / WORLD.block) * WORLD.block) < 1.2;
    const nearZ = Math.abs(car.z - Math.round(car.z / WORLD.block) * WORLD.block) < 1.2;
    if (nearX && nearZ && rng() < dt * 0.25) {
      car.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      car.horizontal = !car.horizontal;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

// Nearest drivable traffic car to a point, for carjacking (F).
export function nearestTrafficCar(cars, x, z, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of cars) {
    if (car.stolen) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
