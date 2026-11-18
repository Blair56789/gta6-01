// traffic.js — AI traffic cars that follow the road lanes, stop at nothing,
// turn at intersections, and honk (visually: brake lights) when blocked.
import * as THREE from 'three';
import { ROAD, nearestRoadPoint } from './city.js';
import { createCar, randomCarModel } from './vehicles.js';

export function createTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const horizontal = rng() < 0.5;
    const road = ROAD[Math.floor(rng() * ROAD.length)];
    const along = (rng() * 2 - 1) * 105;
    const dir = rng() < 0.5 ? 1 : -1;
    const x = horizontal ? along : road + (dir > 0 ? 3 : -3);
    const z = horizontal ? road + (dir > 0 ? 3 : -3) : along;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(scene, randomCarModel(rng), x, z, heading);
    car.speed = 9 + rng() * 4;
    car.horizontal = horizontal; car.dir = dir; car.lane = road;
    cars.push(car);
  }
  return cars;
}

function aheadBlocked(car, others, playerCar) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const check = (p, r) => {
    const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    return along > 0 && along < 12 && side < 2.5;
  };
  for (const o of others) if (o !== car && check(o.pos)) return true;
  if (playerCar && check(playerCar.pos)) return true;
  return false;
}

export function updateTraffic(cars, playerCar, dt, rng) {
  for (const car of cars) {
    if (car === playerCar) continue; // the player is driving this one now
    // at an intersection, sometimes turn
    const onX = ROAD.some(r => Math.abs(car.pos.x - r) < 1.2);
    const onZ = ROAD.some(r => Math.abs(car.pos.z - r) < 1.2);
    if (onX && onZ && rng() < dt * 0.25) {
      car.horizontal = !car.horizontal;
      car.dir = rng() < 0.5 ? 1 : -1;
      car.heading = car.horizontal ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    }
    // snap back onto the lane line
    const snap = nearestRoadPoint(car.pos.x, car.pos.z);
    if (car.horizontal) car.pos.z += (snap.z - car.pos.z) * Math.min(1, dt * 3);
    else car.pos.x += (snap.x - car.pos.x) * Math.min(1, dt * 3);
    const target = aheadBlocked(car, cars, playerCar) ? 0 : 7 + (car.cruise || 0);
    if (!car.cruise) car.cruise = 4 + rng() * 3;
    car.speed += ((aheadBlocked(car, cars, playerCar) ? 0 : car.cruise + 5) - car.speed) * Math.min(1, dt * 1.5);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.rotation.y = car.heading;
    // wrap around the city edge
    if (car.pos.x > 118) car.pos.x = -118; if (car.pos.x < -118) car.pos.x = 118;
    if (car.pos.z > 118) car.pos.z = -118; if (car.pos.z < -118) car.pos.z = 118;
  }
}
