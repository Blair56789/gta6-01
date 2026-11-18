// main.js — Port Solano boot + game loop. Wires city, vehicles, traffic,
// pedestrians, police, missions, combat, HUD, minimap, audio and saves into
// one playable open world. You are Rook, getaway driver for Mara Voss.
import * as THREE from 'three';
import { buildCity, resolveCollisions, BOUND } from './city.js';
import { createCar, driveCar, carSpeedMph, randomCarModel, cometModel } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPedestrians, updatePedestrians, makePedMesh } from './pedestrians.js';
import { createPolice, updatePolice } from './police.js';
import { createCombat, updateCombat, playerPunch, playerShoot, spawnEnemies, clearEnemies } from './combat.js';
import { MISSION_DEFS, startMission, updateMission, missionTargetPos, missionProgressText, rankFor } from './missions.js';
import { addFeed, showBanner, setPrompt, updateHud, updateTracker, updateGigLine, renderShop, SHOP_ITEMS, fmtClock } from './hud.js';
import { drawMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave, mulberry32 } from './save.js';
import { parseShotParams, applyShotScene } from './shots.js';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- state ----------
const state = {
  mode: 'menu', // menu | playing | paused | endcard
  day: 1, timeMin: 8 * 60, cash: 250, respect: 0,
  health: 100, armor: 0, wanted: 0,
  weapon: 'fists', ammo: 0,
  upgrades: { carArmor: 0, carSpeed: 0 },
  missionIndex: 0, missionsDone: 0, carsSold: 0, gigsDone: 0,
  inCarName: '',
};
let mission = null;           // active mission runtime (in ctx.mission)
let pendingNextMission = null, pendingRetryMission = null;
let tailTarget = null;

// ---------- world ----------
const shotParams = parseShotParams();
const rng = mulberry32(shotParams ? shotParams.seed : 20261118);
const city = buildCity(scene, rng);
const audio = createAudio();
const police = createPolice(scene);
const combat = createCombat(scene);
const traffic = createTraffic(scene, rng, 16);
const peds = createPedestrians(scene, rng, 26);

// player on-foot mesh
const playerMesh = new THREE.Group();
{
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e6db4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 8), shirt);
  body.position.y = 1.05; body.castShadow = true; playerMesh.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.92; head.castShadow = true; playerMesh.add(head);
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x1a1d22 }));
  jacket.position.y = 1.25; playerMesh.add(jacket);
}
scene.add(playerMesh);

const player = { pos: new THREE.Vector3(0, 0, 23), heading: 0, speed: 0, inCar: true, car: null, mesh: playerMesh };

// starter car + parked cars + the gold Comet GT
const starterCar = createCar(scene, { name: 'Solano Sedan', color: 0x3a6fd8, top: 18, grip: 1 }, 0, 23, 0);
player.car = starterCar;
const parkedCars = [];
for (let i = 0; i < 10; i++) {
  const road = [-92, -46, 0, 46, 92][Math.floor(rng() * 5)];
  const along = (rng() * 2 - 1) * 100;
  const horiz = rng() < 0.5;
  const car = createCar(scene, randomCarModel(rng),
    horiz ? along : road + 8.5, horiz ? road + 8.5 : along,
    horiz ? Math.PI / 2 : 0, { parked: true });
  parkedCars.push(car);
}
const cometCar = createCar(scene, cometModel(), 100, 46, Math.PI / 2, { parked: true });
parkedCars.push(cometCar);

// mission marker beacon (gold cylinder + ring, bobbing)
const beacon = new THREE.Group();
{
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  cyl.position.y = 15; beacon.add(cyl);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.5, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd25a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; beacon.add(ring);
  beacon.userData.ring = ring;
}
beacon.visible = false;
scene.add(beacon);

// taxi fare flag marker (floating "!")
const fareMarker = new THREE.Group();
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), new THREE.MeshBasicMaterial({ color: 0x2fd673 }));
  pole.position.y = 2; fareMarker.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2fd673 }));
  ball.position.y = 4.4; fareMarker.add(ball);
}
fareMarker.visible = false; scene.add(fareMarker);

let gig = null; let gigTimer = 25;
let camYaw = 0, camDist = 12, camHeight = 6.5;

// ---------- shared context for the modules ----------
const ctx = {
  scene, state, player, police, combat, traffic, peds,
  landmarks: city.landmarks, rng, audio, vehicleApi: { createCar },
  get mission() { return mission; },
  set mission(v) { mission = v; },
  get tailTarget() { return tailTarget; },
  set tailTarget(v) { tailTarget = v; },
  get cometCar() { return cometCar; },
  get pendingNextMission() { return pendingNextMission; },
  set pendingNextMission(v) { pendingNextMission = v; },
  get pendingRetryMission() { return pendingRetryMission; },
  set pendingRetryMission(v) { pendingRetryMission = v; },
  addFeed, banner: showBanner, setPrompt,
  raiseWanted(n, why) {
    const before = state.wanted;
    state.wanted = Math.min(5, state.wanted + n);
    if (state.wanted > before) {
      addFeed(`Wanted level up! ${'★'.repeat(state.wanted)} — ${why}`);
      audio.sirenBlip();
    }
  },
  damagePlayer(amount, cause) {
    if (state.mode !== 'playing') return;
    const absorbed = Math.min(state.armor, amount * 0.6);
    state.armor -= absorbed;
    state.health -= (amount - absorbed);
    if (state.health <= 0) {
      state.health = 0;
      if (state.wanted > 0) ctx.busted(`busted (${cause})`);
      else {
        state.health = 50; state.cash = Math.max(0, state.cash - 150);
        player.pos.set(city.landmarks.hospital.x, 0, city.landmarks.hospital.z + 12);
        if (player.inCar) exitCar();
        addFeed('You woke up at Solano General — $150 hospital bill.');
        audio.busted();
      }
    }
  },
  busted(reason) {
    if (state.mode !== 'playing') return;
    state.mode = 'endcard';
    audio.busted();
    const fine = Math.min(500, state.cash);
    state.cash -= fine; state.wanted = 0; state.health = 100;
    saveGame(state);
    showEndCard('BUSTED',
      `Solano PD got you — ${reason}.\nFine paid: $${fine}. Mara bailed you out, but the job is still open.\nDay ${state.day} continues. Press CONTINUE to get back on the street.`);
    pendingRetryMission = mission ? mission.index : state.missionIndex;
    mission = null;
  },
  winGame() {
    state.mode = 'endcard';
    showEndCard('🏆 YOU WIN — THE MERIDIAN JOB',
      `The vault is empty, the crew is rich, and Rook drives into the sunset.\nFinal cut: $50,000  •  Rank: ${rankFor(state.respect)}\nDays used: ${state.day} of 7  •  Cars sold: ${state.carsSold}  •  Gigs done: ${state.gigsDone}\nPORT SOLANO — thanks for playing!`);
    saveGame(state);
  },
  showEndCard(title, body) { showEndCard(title, body); },
  saveGame() { saveGame(state); },
  combatSpawn(def) {
    spawnEnemies(scene, combat, city.landmarks.safehouse, 8, rng);
    mission.spawned = true;
  },
  combatClear() { clearEnemies(scene, combat); },
  onEnemyDown() { if (mission && MISSION_DEFS[mission.index].stages[mission.stage].defend) addFeed(`Raiders left: ${combat.enemies.length}`); },
  missionTargetPos() { return missionTargetPos(ctx); },
  missionsStart(i) { startMission(ctx, i); },
  policeSpawnNear(n) {
    for (let i = 0; i < n; i++) {
      const ang = rng() * Math.PI * 2;
      const car = createCar(scene, { name: 'Solano PD Interceptor', color: 0x1a1d22, top: 24, grip: 1.1 },
        THREE.MathUtils.clamp(player.pos.x + Math.sin(ang) * 40, -BOUND, BOUND),
        THREE.MathUtils.clamp(player.pos.z + Math.cos(ang) * 40, -BOUND, BOUND),
        Math.atan2(player.pos.x, player.pos.z), { isPolice: true });
      car.speed = 14; police.cars.push(car);
    }
  },
  game: null, // set below (shot scenes use it)
};

// ---------- input ----------
const keys = {};
const input = { forward: false, back: false, left: false, right: false, handbrake: false };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') { if (state.mode === 'playing') pauseGame(); else if (state.mode === 'paused') resumeGame(); }
  if (e.code === 'KeyM') { audio.setMuted(!audio.isMuted()); addFeed(audio.isMuted() ? 'Sound muted (M).' : 'Sound on (M).'); }
  if (e.code === 'KeyR' && state.mode === 'playing') restartMission();
  if (e.code === 'KeyE' && state.mode === 'playing') interactKey();
  if (e.code === 'KeyQ' && state.mode === 'playing') tryShop();
  if (e.code === 'KeyF' && state.mode === 'playing' && !player.inCar) playerPunch(ctx);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => {
  if (state.mode !== 'playing' || player.inCar) return;
  audio.unlock();
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const t = -ray.ray.origin.y / ray.ray.direction.y;
  const hit = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(Math.max(0, t)));
  playerShoot(ctx, hit);
});

function readInput() {
  input.forward = !!(keys.KeyW || keys.ArrowUp);
  input.back = !!(keys.KeyS || keys.ArrowDown);
  input.left = !!(keys.KeyA || keys.ArrowLeft);
  input.right = !!(keys.KeyD || keys.ArrowRight);
  input.handbrake = !!keys.Space;
  input.sprint = !!keys.ShiftLeft || !!keys.ShiftRight;
}

// ---------- car enter / exit / steal / sell ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  const all = [...parkedCars, starterCar, ...traffic];
  for (const c of all) {
    if (player.inCar && c === player.car) continue;
    const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function enterCar(car) {
  player.inCar = true; player.car = car;
  car.parked = false; car.stolen = car !== starterCar;
  const ti = traffic.indexOf(car);
  if (ti >= 0) traffic.splice(ti, 1); // stop the traffic AI driving it
  playerMesh.visible = false;
  state.inCarName = car.model.name + (car.stolen ? ' (stolen)' : '');
  if (car.stolen) {
    ctx.raiseWanted(1, `stole a ${car.model.name}`);
    addFeed(`You stole a ${car.model.name}!`);
  } else addFeed(`In the ${car.model.name}.`);
  audio.blip();
}

function exitCar() {
  if (!player.car) return;
  const car = player.car;
  car.speed = 0;
  player.pos.set(car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.5, 0, car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.5);
  player.heading = car.heading;
  player.inCar = false; player.car = null;
  playerMesh.visible = true;
  state.inCarName = '';
  if (!parkedCars.includes(car) && car !== starterCar) parkedCars.push(car);
  car.parked = true;
}

function interactKey() {
  // chop shop sell
  if (player.inCar && player.car.stolen && player.car !== cometCar) {
    const s = city.landmarks.chopShop;
    if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 12) {
      const price = 400 + Math.floor(rng() * 500);
      state.cash += price; state.carsSold += 1;
      addFeed(`Sold the ${player.car.model.name} at the Chop Shop — +$${price}`);
      audio.cash();
      scene.remove(player.car.mesh);
      parkedCars.splice(parkedCars.indexOf(player.car), 1);
      player.inCar = false; player.car = null; playerMesh.visible = true;
      state.inCarName = '';
      player.pos.set(s.x, 0, s.z - 14);
      return;
    }
  }
  // taxi pickup
  if (gig && gig.type === 'taxi' && !gig.pickedUp) {
    const d = Math.hypot(gig.ped.pos.x - player.pos.x, gig.ped.pos.z - player.pos.z);
    if (d < 4 && player.inCar) {
      gig.pickedUp = true;
      addFeed(`Passenger aboard — take them to the gold marker. Fare $${gig.fare}.`);
      audio.blip();
      return;
    }
  }
  if (player.inCar) { exitCar(); return; }
  const car = nearestCar(4.5);
  if (car) { enterCar(car); return; }
  // taxi ped on foot
  if (gig && gig.type === 'taxi' && !gig.pickedUp) {
    const d = Math.hypot(gig.ped.pos.x - player.pos.x, gig.ped.pos.z - player.pos.z);
    if (d < 3) { addFeed('Get in a car first, then pick up the fare (E).'); }
  }
}

function tryShop() {
  const spots = [city.landmarks.garage, city.landmarks.safehouse, city.landmarks.chopShop];
  const near = spots.some(s => Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 16);
  if (near) { pauseGame(); addFeed('Shop open — Mara\'s Garage.'); }
  else addFeed('No shop nearby — head to Mara\'s Garage, the Safehouse or the Chop Shop.');
}

function buyShopItem(item) {
  if (state.cash < item.price || !item.can(state)) return;
  state.cash -= item.price;
  switch (item.id) {
    case 'vest': state.armor = Math.min(100, state.armor + 50); break;
    case 'pistol': state.weapon = 'pistol'; state.ammo = 60; break;
    case 'smg': state.weapon = 'smg'; state.ammo = 120; break;
    case 'ammo': state.ammo += 60; break;
    case 'cararmor': state.upgrades.carArmor += 1; break;
    case 'carspeed': state.upgrades.carSpeed += 1; break;
    case 'bribe': state.wanted = Math.max(0, state.wanted - 1); addFeed('Bribe paid — one star drops off.'); break;
    case 'heal': state.health = Math.min(100, state.health + 50); break;
  }
  audio.cash();
  addFeed(`Bought: ${item.name}`);
  renderShop(state, buyShopItem);
}

// ---------- missions / flow ----------
function restartMission() {
  if (!mission) { if (state.missionIndex < 6) startMission(ctx, state.missionIndex); return; }
  const idx = mission.index;
  if (tailTarget) { scene.remove(tailTarget.mesh); tailTarget = null; }
  clearEnemies(scene, combat);
  mission = null;
  state.wanted = Math.max(0, state.wanted - 1);
  startMission(ctx, idx);
  addFeed(`Restarted mission ${idx + 1}/6.`);
}

function showEndCard(title, body) {
  state.mode = 'endcard';
  $('end-title').textContent = title;
  $('end-body').textContent = body;
  $('endcard').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
}

function hideEndCard() {
  $('endcard').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state.mode = 'playing';
  if (pendingNextMission !== null && pendingNextMission < 6) {
    const n = pendingNextMission; pendingNextMission = null;
    state.missionIndex = n;
    startMission(ctx, n);
  } else if (pendingRetryMission !== null) {
    const n = pendingRetryMission; pendingRetryMission = null;
    state.missionIndex = n;
    startMission(ctx, n);
  }
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  $('pause-sub').textContent = `Day ${state.day} — ${fmtClock(state.timeMin)} — ${mission ? `Mission ${mission.index + 1}/6: ${MISSION_DEFS[mission.index].name}` : 'Free roam'} — $${state.cash.toLocaleString()}`;
  renderShop(state, buyShopItem);
  $('pause').classList.remove('hidden');
  audio.setEngine(false, 0); audio.setSiren(false, 0);
}
function resumeGame() {
  $('pause').classList.add('hidden');
  state.mode = 'playing';
}

function showMenu() {
  state.mode = 'menu';
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('btn-continue').style.opacity = hasSave() ? '1' : '0.4';
}
function hideMenu() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
}

function startNewGame(opts = {}) {
  const fresh = {
    day: 1, timeMin: 8 * 60, cash: 250, respect: 0, health: 100, armor: 0,
    wanted: 0, weapon: 'fists', ammo: 0, upgrades: { carArmor: 0, carSpeed: 0 },
    missionIndex: 0, missionsDone: 0, carsSold: 0, gigsDone: 0,
  };
  Object.assign(state, fresh);
  state.mode = 'playing';
  player.pos.set(0, 0, 23); player.heading = 0;
  player.inCar = true; player.car = starterCar; playerMesh.visible = false;
  starterCar.pos.set(0, 0, 23); starterCar.heading = 0; starterCar.speed = 0;
  state.inCarName = 'Solano Sedan';
  mission = null; tailTarget = null; gig = null;
  hideMenu(); $('endcard').classList.add('hidden'); $('pause').classList.add('hidden');
  audio.unlock();
  if (!opts.silent) { addFeed('Welcome to Port Solano, Rook.'); }
  startMission(ctx, 0);
  saveGame(state);
}

function continueGame() {
  const d = loadGame();
  if (!d) { startNewGame(); return; }
  Object.assign(state, d);
  state.mode = 'playing';
  player.pos.set(0, 0, 23); player.heading = 0;
  player.inCar = true; player.car = starterCar; playerMesh.visible = false;
  starterCar.pos.set(0, 0, 23); starterCar.heading = 0; starterCar.speed = 0;
  state.inCarName = 'Solano Sedan';
  mission = null;
  hideMenu(); $('endcard').classList.add('hidden');
  audio.unlock();
  addFeed(`Welcome back, Rook — Day ${state.day}, $${state.cash.toLocaleString()}, ${rankFor(state.respect)}.`);
  startMission(ctx, Math.min(d.missionIndex, 5));
}

$('btn-new').onclick = () => startNewGame();
$('btn-continue').onclick = () => continueGame();
$('btn-resume').onclick = resumeGame;
$('btn-restart-mission').onclick = () => { $('pause').classList.add('hidden'); state.mode = 'playing'; restartMission(); };
$('btn-quit-menu').onclick = () => { saveGame(state); $('pause').classList.add('hidden'); showMenu(); };
$('btn-end-continue').onclick = hideEndCard;

// ---------- side gigs ----------
function updateGigs(dt) {
  gigTimer -= dt;
  if (!gig && gigTimer <= 0 && state.mode === 'playing') {
    // spawn a taxi fare: a pedestrian with a green marker near the player
    const near = peds[Math.floor(rng() * peds.length)];
    const dest = { x: [-92, -46, 0, 46, 92][Math.floor(rng() * 5)], z: [-92, -46, 0, 46, 92][Math.floor(rng() * 5)] };
    gig = { type: 'taxi', ped: near, dest, fare: 150 + Math.floor(rng() * 200), pickedUp: false };
    fareMarker.position.set(near.pos.x, 0, near.pos.z);
    fareMarker.visible = true;
    addFeed('Taxi fare waiting nearby — green marker. Get in a car and press E by them.');
    audio.blip();
  }
  if (gig && gig.type === 'taxi') {
    fareMarker.position.set(gig.ped.pos.x, 0, gig.ped.pos.z);
    fareMarker.visible = !gig.pickedUp;
    const target = gig.pickedUp ? gig.dest : { x: gig.ped.pos.x, z: gig.ped.pos.z };
    const d = Math.hypot(player.pos.x - target.x, player.pos.z - target.z);
    updateGigLine(gig.pickedUp ? `Taxi: drop the passenger — ${Math.round(d)}m ($${gig.fare})` : `Taxi fare waiting — ${Math.round(d)}m`);
    if (gig.pickedUp && d < 8) {
      state.cash += gig.fare; state.gigsDone += 1;
      addFeed(`Fare complete — +$${gig.fare}`);
      audio.cash();
      gig = null; gigTimer = 40; updateGigLine('none nearby');
    }
    if (gig && !gig.pickedUp && Math.hypot(gig.ped.pos.x - player.pos.x, gig.ped.pos.z - player.pos.z) > 120) {
      gig = null; gigTimer = 30; fareMarker.visible = false; updateGigLine('none nearby');
    }
  }
}

// ---------- per-frame update ----------
let hudTimer = 0, saveTimer = 0;
const clock = new THREE.Clock();

function stepWorld(dt, scripted) {
  readInput();
  const inp = scripted || input;
  // clock: 1 real second ≈ 1.5 game-minutes; day ends 24:00
  state.timeMin += dt * 1.5;
  if (state.timeMin >= 24 * 60) {
    state.timeMin = 8 * 60; state.day += 1;
    addFeed(`Day ${state.day} begins in Port Solano.`);
    if (state.day > 7 && !(mission && mission.index === 5)) {
      state.mode = 'endcard';
      showEndCard('TIME\'S UP — DAY 7 IS OVER',
        `Seven days passed and The Meridian Job is still undone.\nMara moves on without you. Final rank: ${rankFor(state.respect)}.\nPress CONTINUE to try the week again.`);
      pendingRetryMission = 0; state.day = 1;
      return;
    }
  }
  city.updateDayNight(state.timeMin);

  // --- player movement ---
  if (player.inCar && player.car) {
    driveCar(player.car, inp, dt, state.upgrades);
    player.pos.copy(player.car.pos);
    player.heading = player.car.heading;
    const r = resolveCollisions(player.pos.x, player.pos.z, 1.7, city.colliders);
    player.pos.x = r.x; player.pos.z = r.z;
    player.car.pos.x = r.x; player.car.pos.z = r.z;
    // crash into traffic cars
    for (const t of traffic) {
      const d = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      if (d < 3.4 && Math.abs(player.car.speed) > 4) {
        // shunt: the traffic car gets pushed up to the player's speed instead
        // of dead-stopping the chase
        t.speed = Math.max(t.speed, Math.abs(player.car.speed) * 0.9);
        player.car.speed *= 0.85;
        audio.crash();
        if (Math.random() < dt * 3) ctx.raiseWanted(1, 'caused a pile-up');
      }
    }
    // hit a pedestrian
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (d < 2.2 && Math.abs(player.car.speed) > 3) {
        scene.remove(p.mesh); peds.splice(i, 1);
        ctx.raiseWanted(1, 'hit a pedestrian');
        addFeed('You hit a pedestrian! The city saw it.');
        audio.crash();
      }
    }
    audio.setEngine(true, Math.abs(player.car.speed) / 24);
  } else {
    const sprint = inp.sprint ? 2.1 : 1;
    const spd = 5.2 * sprint;
    if (inp.forward) { player.pos.x += Math.sin(player.heading) * spd * dt; player.pos.z += Math.cos(player.heading) * spd * dt; }
    if (inp.back) { player.pos.x -= Math.sin(player.heading) * spd * 0.6 * dt; player.pos.z -= Math.cos(player.heading) * spd * 0.6 * dt; }
    if (inp.left) player.heading += 2.6 * dt;
    if (inp.right) player.heading -= 2.6 * dt;
    const r = resolveCollisions(player.pos.x, player.pos.z, 0.5, city.colliders);
    player.pos.x = r.x; player.pos.z = r.z;
    playerMesh.position.copy(player.pos);
    playerMesh.rotation.y = player.heading;
    playerMesh.position.y = Math.abs(Math.sin(performance.now() / 130)) * 0.05;
    audio.setEngine(false, 0);
  }
  playerMesh.position.copy(player.pos);
  playerMesh.rotation.y = player.heading;

  // --- world systems ---
  updateTraffic(traffic, player.inCar ? player.car : null, dt, rng);
  const danger = state.wanted > 0 || player.inCar ? player.pos : { x: 9999, z: 9999 };
  updatePedestrians(peds, danger, player.inCar && Math.abs(player.car?.speed || 0) > 6 ? 10 : (state.wanted > 0 ? 14 : 0), dt, rng);
  updatePolice(ctx, dt, rng);
  updateCombat(ctx, dt);
  if (mission) updateMission(ctx, dt);
  updateGigs(dt);

  // --- prompts ---
  let prompt = null;
  if (!player.inCar) {
    const car = nearestCar(4.5);
    if (car) prompt = `Press E to ${car.stolen || car !== starterCar ? 'steal' : 'enter'} the ${car.model.name}`;
    else if (gig && gig.type === 'taxi' && !gig.pickedUp && Math.hypot(gig.ped.pos.x - player.pos.x, gig.ped.pos.z - player.pos.z) < 3) prompt = 'Press E to hail the fare (get in a car first)';
  } else {
    if (player.car.stolen && player.car !== cometCar) {
      const s = city.landmarks.chopShop;
      if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 12) prompt = 'Press E to sell this car at the Chop Shop';
    }
    if (gig && gig.type === 'taxi' && !gig.pickedUp && Math.hypot(gig.ped.pos.x - player.pos.x, gig.ped.pos.z - player.pos.z) < 4) prompt = 'Press E to pick up the passenger';
  }
  setPrompt(prompt);

  // --- mission beacon ---
  const target = mission ? missionTargetPos(ctx) : null;
  const gigTarget = !target && gig ? (gig.pickedUp ? gig.dest : { x: gig.ped.pos.x, z: gig.ped.pos.z }) : null;
  const bp = target || gigTarget;
  if (bp) {
    beacon.visible = true;
    beacon.position.set(bp.x, 0, bp.z);
    beacon.userData.ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.15);
    beacon.position.y = Math.sin(performance.now() / 400) * 0.4;
  } else beacon.visible = false;

  // --- camera follow ---
  const wantYaw = player.heading;
  let dy = wantYaw - camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  camYaw += dy * Math.min(1, dt * 3.5);
  camDist = player.inCar ? 13 : 9;
  camHeight = player.inCar ? 6.5 : 4.5;
  const cx = player.pos.x - Math.sin(camYaw) * camDist;
  const cz = player.pos.z - Math.cos(camYaw) * camDist;
  camera.position.set(cx, camHeight, cz);
  camera.lookAt(player.pos.x + Math.sin(camYaw) * 6, 1.6, player.pos.z + Math.cos(camYaw) * 6);

  // --- audio: siren while wanted ---
  audio.setSiren(state.wanted > 0, dt);

  // --- HUD (10 Hz) ---
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    updateHud(state, mission, mission ? missionProgressText(ctx) : 'Free roam — explore, earn side cash, or press R for the next job.');
    updateTracker(mission);
    drawMinimap($('minimap'), ctx);
    $('speed-num').textContent = player.inCar && player.car ? Math.round(carSpeedMph(player.car)) : Math.round(0);
    $('crosshair').classList.toggle('hidden', player.inCar || state.weapon === 'fists');
  }
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 20; if (state.mode === 'playing') saveGame(state); }
}

// ---------- shot mode ----------
let shotSteps = 0, shotScript = null, shotFrozen = false;
ctx.game = {
  showMenu, startNewGame,
};
if (shotParams) {
  const sceneCfg = applyShotScene(ctx, shotParams.shot);
  shotSteps = 0;
  // Play the scripted scene forward synchronously (fixed 1/60s steps) so the
  // screenshot frame is a real, deterministic render of the simulation —
  // headless software rendering runs few rAF frames per second, so stepping
  // per frame would leave the scene barely moved when the shot is taken.
  for (let i = 0; i < sceneCfg.steps; i++) stepWorld(1 / 60, sceneCfg.scripted);
  shotFrozen = shotParams.shot !== 'start';
  if (shotParams.shot !== 'start') { $('hud').classList.remove('hidden'); }
}

// ---------- main loop ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (shotParams) {
    if (shotSteps > 0) {
      stepWorld(1 / 60, shotScript);
      shotSteps--;
      if (shotSteps === 0) shotFrozen = true;
    } else if (!shotFrozen) {
      // menu shot: slow orbit around the city
      const t = performance.now() / 1000;
      camera.position.set(Math.sin(t * 0.08) * 120, 55, Math.cos(t * 0.08) * 120);
      camera.lookAt(0, 0, 0);
      city.updateDayNight(10 * 60);
    }
    renderer.render(scene, camera);
    return;
  }
  if (state.mode === 'playing') stepWorld(dt, null);
  else if (state.mode === 'menu') {
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.06) * 110, 50, Math.cos(t * 0.06) * 110);
    camera.lookAt(0, 0, 0);
    city.updateDayNight(state.timeMin);
  }
  renderer.render(scene, camera);
}
city.updateDayNight(state.timeMin);
animate();
