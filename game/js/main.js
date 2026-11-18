// Port Solano — main game: boot, input, camera, the play loop, carjacking,
// shops, the day cycle and win/lose. Written fresh for this build.
import * as THREE from 'three';
import { createGameState, WEAPONS, WORLD } from './state.js';
import { clamp, lerp, angleLerp, mulberry32 } from './util.js';
import { SoundEngine } from './audio.js';
import { buildCity, updateDayNight, collideCircle } from './city.js';
import { CAR_MODELS, newCar, makePlayerMesh, driveCar } from './vehicles.js';
import { spawnTraffic, updateTraffic, nearestTrafficCar } from './traffic.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { spawnPolice, updatePolice, spawnFootCops, updateFootCops } from './police.js';
import { createCombat, fireWeapon, reloadWeapon, updateCombatVisuals, hurtPlayer } from './combat.js';
import { MISSIONS, startMission, completeMission, failMission } from './missions.js';
import { updateHUD, feed, showToast, setModeUI, renderShop, SHOP_ITEMS } from './hud.js';
import { drawMinimap } from './minimap.js';
import { saveGame, loadGame, hasSave, applySave } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('scene');
const minimapCanvas = document.getElementById('minimap');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '1') || 1;

const audio = new SoundEngine();
const game = {
  scene: null, camera: null, renderer: null, sun: null, hemi: null,
  city: null, traffic: [], peds: [], cops: [], footCops: [],
  combat: null, marker: null, markerBeam: null, crates: [],
  chopCar: null, roadblock: null, frozen: false, hasSave: false,
  nearShop: null, keys: {}, pointerLocked: false,
  autosaveT: 0, roadblockT: 0, wantedT: 0,
};
let state = createGameState(seed);
window.__portSolano = { state, game, startNewGame, stepSim: null };

function makeMarker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.35, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.85 })
  );
  ring.position.y = 0.2;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 40, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  beam.position.y = 20;
  g.add(beam);
  g.visible = false;
  game.scene.add(g);
  game.marker = g;
  game.markerBeam = beam;
}

function setMarker(x, z, label, color = 0xffd25a) {
  game.marker.visible = true;
  game.marker.position.set(x, 0, z);
  game.marker.children[0].material.color.setHex(color);
  game.markerBeam.material.color.setHex(color);
}

function clearMarker() {
  game.marker.visible = false;
}

function spawnChopCar() {
  const model = CAR_MODELS[1]; // Comet GT
  const car = newCar(game.scene, { ...model, color: 0xffd25a }, 80, -120, Math.PI / 2, 'sedan');
  car.isChopCar = true;
  car.cruise = 0;
  car.speed = 0;
  game.chopCar = car;
  game.traffic.push(car);
  return car;
}

function spawnCrates(points) {
  clearCrates();
  for (const p of points) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshLambertMaterial({ color: 0x7be495 }));
    box.position.set(p.x, 0.6, p.z);
    game.scene.add(box);
    game.crates.push(box);
  }
}
function clearCrates() {
  for (const c of game.crates) game.scene.remove(c);
  game.crates = [];
}

const missionApi = {
  setMarker, clearMarker,
  setWanted(n) { setWanted(n); },
  addCash(n) { state.cash += n; },
  feed(m) { feed(state, m); },
  blip() { audio.pickup(); },
  toast(t) { showToast(t); },
  missionDoneSound() { audio.missionDone(); },
  failSound() { audio.fail(); },
  spawnChopCar, spawnCrates,
  collectCrate(i) { const c = game.crates[i]; if (c) c.visible = false; },
};

function setWanted(n) {
  if (n > state.wanted) audio.wantedUp();
  state.wanted = Math.max(0, Math.min(5, n));
}

function buildWorld() {
  game.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  game.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  game.renderer.setSize(innerWidth, innerHeight);
  game.scene = new THREE.Scene();
  game.scene.background = new THREE.Color(0x87bfe8);
  game.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  game.sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
  game.sun.position.set(120, 160, 80);
  game.scene.add(game.sun);
  game.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a5a3a, 0.75);
  game.scene.add(game.hemi);
  const rng = mulberry32(seed);
  game.city = buildCity(game.scene, rng);
  game.traffic = spawnTraffic(game.scene, rng, game.city);
  game.peds = spawnPedestrians(game.scene, rng);
  game.cops = spawnPolice(game.scene, 5);
  game.footCops = spawnFootCops(game.scene);
  game.combat = createCombat(game.scene);
  makeMarker();
  // Roadblock props: two parked interceptors + barrier, hidden until wanted 4+.
  game.roadblock = new THREE.Group();
  for (const [x, z] of [[-4, 0], [4, 0]]) {
    const car = newCar(game.scene, { name: 'PD Interceptor', color: 0x14181f, top: 0, accel: 0 }, x, z, Math.PI / 2, 'police');
    game.roadblock.add(car.mesh);
  }
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(12, 1.1, 0.5), new THREE.MeshLambertMaterial({ color: 0xff6a2a }));
  barrier.position.y = 0.8;
  game.roadblock.add(barrier);
  game.roadblock.visible = false;
  game.scene.add(game.roadblock);
  // Player mesh + starter car.
  state.player.mesh = makePlayerMesh();
  game.playerMesh = state.player.mesh;
  game.scene.add(state.player.mesh);
  state.car = newCar(game.scene, CAR_MODELS[0], 0, 20, 0, 'sedan');
  state.car.isPlayerCar = true;
  state.player.x = 0; state.player.z = 20;
  state.inCar = true;
  addEventListener('resize', () => {
    game.camera.aspect = innerWidth / innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(innerWidth, innerHeight);
  });
}

function readInput() {
  const k = game.keys;
  return {
    forward: !!(k.KeyW || k.ArrowUp),
    back: !!(k.KeyS || k.ArrowDown),
    left: !!(k.KeyA || k.ArrowLeft),
    right: !!(k.KeyD || k.ArrowRight),
    sprint: !!k.ShiftLeft || !!k.ShiftRight,
    handbrake: !!k.Space,
  };
}

function enterCar(car) {
  state.car = car;
  state.inCar = true;
  state.player.mesh.visible = false;
  car.speed = 0;
  audio.blip(520, 0.08);
}
function exitCar() {
  if (!state.car) return;
  state.inCar = false;
  state.player.mesh.visible = true;
  const h = state.car.heading;
  state.player.x = state.car.x - Math.sin(h) * 3;
  state.player.z = state.car.z - Math.cos(h) * 3;
  state.player.heading = h;
  state.player.mesh.position.set(state.player.x, 0, state.player.z);
  state.player.mesh.rotation.y = h;
  audio.blip(420, 0.08);
}

function trySteal() {
  const near = nearestTrafficCar(game.traffic, state.player.x, state.player.z, 5);
  if (!near) return false;
  near.stolen = true;
  near.ai = false;
  game.traffic = game.traffic.filter((c) => c !== near);
  enterCar(near);
  state.stats.carsStolen++;
  setWanted(state.wanted + 1);
  feed(state, 'Stole a ' + near.name + ' — the owner called it in! Wanted ★ up.');
  audio.crash();
  return true;
}

function updatePlayer(dt, input) {
  if (state.inCar && state.car) {
    const crashed = driveCar(state.car, input, dt, game.city, state.carUpgrades);
    if (crashed) {
      audio.crash();
      hurtPlayer(state, 3, audio);
      state.car.crashed = false;
      if (state.time - (state.lastCrashFeed || -99) > 3) {
        state.lastCrashFeed = state.time;
        feed(state, 'Crash! You took a hit.');
      }
    }
    // Run over a pedestrian? That draws heat.
    for (const p of game.peds) {
      if (p.down) continue;
      if (Math.hypot(p.x - state.car.x, p.z - state.car.z) < 2.2 && Math.abs(state.car.speed) > 6) {
        p.down = true; p.mesh.visible = false;
        setWanted(state.wanted + 1);
        feed(state, 'You hit a pedestrian! Wanted ★ up.');
        audio.crash();
      }
    }
    // Bump traffic cars aside (rate-limited so a lingering touch does not
    // drain all of the player's speed frame by frame).
    game.bumpT = Math.max(0, (game.bumpT || 0) - dt);
    for (const c of game.traffic) {
      const d = Math.hypot(c.x - state.car.x, c.z - state.car.z);
      if (d < 4 && d > 0.01) {
        const push = (4 - d) / 2;
        const nx = (c.x - state.car.x) / d, nz = (c.z - state.car.z) / d;
        c.x += nx * push; c.z += nz * push;
        state.car.x -= nx * push * 0.4; state.car.z -= nz * push * 0.4;
        if (game.bumpT <= 0) {
          game.bumpT = 0.4;
          state.car.speed *= 0.96;
          c.speed *= 0.7;
        }
      }
    }
    state.player.x = state.car.x; state.player.z = state.car.z;
    state.player.heading = state.car.heading;
  } else {
    // On foot: move relative to the camera yaw.
    const sp = input.sprint ? 8.5 : 5;
    let mx = 0, mz = 0;
    const fwd = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
    const right = { x: Math.cos(state.camYaw), z: -Math.sin(state.camYaw) };
    if (input.forward) { mx += fwd.x; mz += fwd.z; }
    if (input.back) { mx -= fwd.x; mz -= fwd.z; }
    if (input.right) { mx += right.x; mz += right.z; }
    if (input.left) { mx -= right.x; mz -= right.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      state.player.x += mx * sp * dt;
      state.player.z += mz * sp * dt;
      state.player.heading = Math.atan2(mx, mz);
      state.player.speed = sp;
    } else state.player.speed = 0;
    const fixed = collideCircle(game.city, state.player.x, state.player.z, 0.7);
    if (fixed) { state.player.x = fixed.x; state.player.z = fixed.z; }
    state.player.x = clamp(state.player.x, -198, 198);
    state.player.z = clamp(state.player.z, -198, 198);
    state.player.mesh.position.set(state.player.x, 0, state.player.z);
    state.player.mesh.rotation.y = state.player.heading;
    // Interact prompt.
    const near = nearestTrafficCar(game.traffic, state.player.x, state.player.z, 5);
    const prompt = document.getElementById('interact');
    if (near) { prompt.textContent = 'Press F to steal the ' + near.name; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
  }
}

function updateCamera(dt) {
  const cam = game.camera;
  if (state.inCar && state.car) {
    state.camYaw = angleLerp(state.camYaw, state.car.heading, Math.min(1, dt * 2.2));
    const back = 11 + Math.abs(state.car.speed) * 0.08;
    const tx = state.car.x - Math.sin(state.camYaw) * back;
    const tz = state.car.z - Math.cos(state.camYaw) * back;
    cam.position.x = lerp(cam.position.x, tx, Math.min(1, dt * 6));
    cam.position.y = lerp(cam.position.y, 5.2, Math.min(1, dt * 6));
    cam.position.z = lerp(cam.position.z, tz, Math.min(1, dt * 6));
    cam.lookAt(state.car.x + Math.sin(state.car.heading) * 8, 1.6, state.car.z + Math.cos(state.car.heading) * 8);
  } else {
    const dist = 6.5;
    const tx = state.player.x - Math.sin(state.camYaw) * dist;
    const tz = state.player.z - Math.cos(state.camYaw) * dist;
    cam.position.x = lerp(cam.position.x, tx, Math.min(1, dt * 8));
    cam.position.y = lerp(cam.position.y, 3.4, Math.min(1, dt * 8));
    cam.position.z = lerp(cam.position.z, tz, Math.min(1, dt * 8));
    cam.lookAt(state.player.x + Math.sin(state.camYaw) * 3, 1.4, state.player.z + Math.cos(state.camYaw) * 3);
  }
}

function updateClock(dt) {
  state.clockMin += dt * 0.45; // ~1 game minute per 2.2 real seconds
  if (state.clockMin >= 1440) {
    state.clockMin -= 1440;
    state.day++;
    feed(state, 'Day ' + state.day + ' dawns over Port Solano.');
    if (state.day > 7 && state.missionIndex < 5) {
      state.mode = 'lost';
      state.endReason = 'Day 7 ended with The Meridian Job undone. Mara Voss moves on — and so does the crew.';
      audio.fail();
      setModeUI(state, game);
    }
  }
}

function updateWanted(dt) {
  if (state.wanted === 0) return;
  game.wantedT += dt;
  // Heat cools when no cop is close.
  if ((state.closestCop ?? 99) > 45 && game.wantedT > 14) {
    game.wantedT = 0;
    setWanted(state.wanted - 1);
    feed(state, 'The heat is cooling off… wanted ★ down.');
  }
  audio.setSiren(state.wanted > 0);
}

function updateRoadblock(dt) {
  game.roadblockT += dt;
  const show = state.wanted >= 4 && state.mode === 'play';
  game.roadblock.visible = show;
  if (!show || game.roadblockT < 4) return;
  game.roadblockT = 0;
  const px = state.inCar && state.car ? state.car.x : state.player.x;
  const pz = state.inCar && state.car ? state.car.z : state.player.z;
  const heading = state.inCar && state.car ? state.car.heading : state.player.heading;
  const ax = px + Math.sin(heading) * 55, az = pz + Math.cos(heading) * 55;
  game.roadblock.position.set(ax, 0, az);
  game.roadblock.rotation.y = heading + Math.PI / 2;
}

function nearestShop() {
  let best = null, bestD = 13;
  const px = state.player.x, pz = state.player.z;
  for (const s of game.city.shops) {
    const d = Math.hypot(s.x - px, s.z - pz);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function stepSim(dt, input) {
  state.time += dt;
  updateClock(dt);
  updatePlayer(dt, input);
  updateTraffic(game.traffic, dt, state.rng, state.car);
  updatePedestrians(game.peds, dt, { x: state.player.x, z: state.player.z }, state.inCar && state.car ? Math.abs(state.car.speed) : (state.player.speed || 0), state.rng);
  updatePolice(game.cops, dt, state, state.rng, game.city);
  updateFootCops(game.footCops, dt, state, state.rng);
  updateCombatVisuals(game.combat, dt);
  updateWanted(dt);
  updateRoadblock(dt);
  updateDayNight(game.scene, game.sun, game.hemi, state.clockMin, game.city);
  // Mission tick.
  if (state.missionActive) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      failMission(state, missionApi, 'Out of time on ' + MISSIONS[state.missionIndex].name);
    } else {
      const result = MISSIONS[state.missionIndex].tick(state, missionApi);
      if (result === 'done') completeMission(state, missionApi);
    }
  }
  // Marker pulse.
  if (game.marker.visible) game.marker.children[0].position.y = 0.2 + Math.sin(state.time * 3) * 0.15;
  game.nearShop = nearestShop();
  updateCamera(dt);
  audio.setEngine(state.inCar && state.car ? Math.abs(state.car.speed) / 34 : 0, state.inCar && state.mode === 'play');
  // Autosave every 30 s of play.
  game.autosaveT += dt;
  if (game.autosaveT > 30) { game.autosaveT = 0; if (state.mode === 'play') saveGame(state); }
}

function startNewGame() {
  state = createGameState(seed === 1 ? Math.floor(Math.random() * 1e9) : seed);
  window.__portSolano.state = state;
  // Remove the previous run's player mesh and car so nothing lingers.
  if (game.playerMesh) { game.scene.remove(game.playerMesh); game.playerMesh = null; }
  state.player.mesh = makePlayerMesh();
  game.playerMesh = state.player.mesh;
  game.scene.add(state.player.mesh);
  if (game.playerCar) { game.scene.remove(game.playerCar.mesh); game.playerCar = null; }
  state.car = newCar(game.scene, CAR_MODELS[0], 0, 20, 0, 'sedan');
  game.playerCar = state.car;
  state.player.x = 0; state.player.z = 20;
  state.inCar = true;
  state.camYaw = 0;
  state.mode = 'play';
  audio.ensure();
  audio.startMusic();
  startMission(state, missionApi, 0);
  feed(state, 'Welcome to Port Solano, Rook. Mission 1/6: GETAWAY — lose the cops, reach the gold marker.');
  saveGame(state);
  setModeUI(state, game);
  game.camera.position.set(0, 5.2, 9);
}

function continueGame() {
  const data = loadGame();
  if (!data) { startNewGame(); return; }
  state = createGameState(seed);
  window.__portSolano.state = state;
  applySave(state, data);
  if (game.playerMesh) { game.scene.remove(game.playerMesh); game.playerMesh = null; }
  state.player.mesh = makePlayerMesh();
  game.playerMesh = state.player.mesh;
  game.scene.add(state.player.mesh);
  state.car = newCar(game.scene, CAR_MODELS[0], state.player.x, state.player.z, 0, 'sedan');
  if (game.playerCar && game.playerCar !== state.car) game.scene.remove(game.playerCar.mesh);
  game.playerCar = state.car;
  state.inCar = true;
  state.mode = 'play';
  audio.ensure();
  startMission(state, missionApi, state.missionIndex);
  feed(state, 'Welcome back, Rook. Mission ' + (state.missionIndex + 1) + '/6 resumes.');
  setModeUI(state, game);
}

function bindUI() {
  document.getElementById('btnNew').addEventListener('click', () => { audio.ensure(); startNewGame(); });
  document.getElementById('btnContinue').addEventListener('click', () => { audio.ensure(); continueGame(); });
  document.getElementById('btnResume').addEventListener('click', () => { state.mode = 'play'; setModeUI(state, game); });
  document.getElementById('btnRestartMission').addEventListener('click', () => {
    state.health = 100; state.wanted = 0;
    state.mode = 'play';
    startMission(state, missionApi, state.missionIndex);
    setModeUI(state, game);
  });
  document.getElementById('btnSaveQuit').addEventListener('click', () => {
    saveGame(state);
    state.mode = 'menu';
    game.hasSave = hasSave();
    setModeUI(state, game);
  });
  document.getElementById('btnCloseShop').addEventListener('click', () => { state.mode = 'play'; setModeUI(state, game); });
  document.getElementById('btnRetry').addEventListener('click', () => {
    state.health = 100; state.armor = 0; state.wanted = 0;
    state.player.x = 0; state.player.z = 20;
    if (state.car) { state.car.x = 0; state.car.z = 20; state.car.speed = 0; }
    state.inCar = true;
    state.mode = 'play';
    startMission(state, missionApi, state.missionIndex);
    setModeUI(state, game);
  });
  document.getElementById('btnEndMenu').addEventListener('click', () => {
    state.mode = 'menu';
    game.hasSave = hasSave();
    setModeUI(state, game);
  });
  addEventListener('keydown', (e) => {
    game.keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyM') {
      state.muted = !state.muted;
      audio.setMuted(state.muted);
      feed(state, state.muted ? 'Sound muted.' : 'Sound on.');
    }
    if (state.mode === 'play') {
      if (e.code === 'KeyE') {
        if (state.inCar) exitCar();
        else {
          const near = nearestTrafficCar(game.traffic, state.player.x, state.player.z, 4.5);
          if (near) trySteal();
          else if (state.car && Math.hypot(state.car.x - state.player.x, state.car.z - state.player.z) < 4.5) enterCar(state.car);
        }
      }
      if (e.code === 'KeyF') {
        if (!state.inCar) {
          if (!trySteal()) {
            const w = WEAPONS[state.weaponIndex];
            if (w.id === 'fists') fireWeapon(state, game.combat, game.scene, [...game.peds, ...game.footCops], audio);
            else feed(state, 'F is punch — click to shoot with ' + w.name + '.');
          }
        }
      }
      if (e.code === 'KeyR') {
        if (state.weaponIndex > 0) reloadWeapon(state, audio);
        else if (e.shiftKey) { state.health = 100; state.wanted = 0; startMission(state, missionApi, state.missionIndex); }
      }
      if (e.code === 'Digit1') { state.weaponIndex = 0; audio.blip(500, 0.06); }
      if (e.code === 'Digit2' && state.owned.pistol) { state.weaponIndex = 1; audio.blip(600, 0.06); }
      if (e.code === 'Digit3' && state.owned.smg) { state.weaponIndex = 2; audio.blip(700, 0.06); }
      if (e.code === 'KeyQ') {
        game.nearShop = nearestShop();
        if (game.nearShop) {
          state.mode = 'shop';
          document.getElementById('shopTitle').textContent = game.nearShop.name;
          const buyItem = (item) => {
            if (state.cash < item.price) return;
            state.cash -= item.price;
            item.buy(state);
            audio.cash();
            feed(state, 'Bought ' + item.name + ' for ' + item.price + '.');
            renderShop(state, buyItem);
          };
          renderShop(state, buyItem);
          setModeUI(state, game);
        } else feed(state, 'No shop nearby — look for a signed storefront (gold dots on the minimap).');
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        state.mode = 'paused';
        saveGame(state);
        setModeUI(state, game);
      }
    } else if (state.mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) {
      state.mode = 'play';
      setModeUI(state, game);
    } else if (state.mode === 'shop' && e.code === 'KeyQ') {
      state.mode = 'play';
      setModeUI(state, game);
    }
  });
  addEventListener('keyup', (e) => { game.keys[e.code] = false; });
  canvas.addEventListener('click', () => {
    audio.ensure();
    if (state.mode === 'play' && !state.inCar) canvas.requestPointerLock?.();
    if (state.mode === 'play' && !state.inCar) {
      const w = WEAPONS[state.weaponIndex];
      if (w.id !== 'fists') {
        const res = fireWeapon(state, game.combat, game.scene, [...game.peds, ...game.footCops], audio);
        if (res && res.hit) { setWanted(state.wanted + 1); feed(state, 'Shot fired in public — wanted ★ up.'); }
      }
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (!game.pointerLocked) return;
    state.camYaw -= e.movementX * 0.0032;
    if (!state.inCar) state.player.heading = state.camYaw;
  });
  document.addEventListener('pointerlockchange', () => {
    game.pointerLocked = document.pointerLockElement === canvas;
  });
}

function render() {
  game.renderer.render(game.scene, game.camera);
}

let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (game.frozen) { render(); return; }
  if (state.mode === 'play') {
    stepSim(dt, readInput());
    if (['busted', 'wasted', 'won', 'lost'].includes(state.mode)) {
      saveGame(state);
      setModeUI(state, game);
      if (state.mode === 'wasted') audio.fail();
      if (state.mode === 'busted') audio.fail();
      if (state.mode === 'won') audio.missionDone();
    }
    updateHUD(state, game);
    drawMinimap(minimapCanvas, state, game);
  } else if (state.mode === 'menu') {
    // Slow cinematic orbit behind the menu.
    state.time += dt;
    const a = state.time * 0.05;
    game.camera.position.set(Math.sin(a) * 120, 55, Math.cos(a) * 120);
    game.camera.lookAt(0, 0, 0);
    updateDayNight(game.scene, game.sun, game.hemi, 600, game.city);
  }
  render();
}

function boot() {
  buildWorld();
  bindUI();
  window.__portSolano.stepSim = stepSim;
  window.__portSolano.getState = () => state;
  game.hasSave = hasSave();
  setModeUI(state, game);
  const shot = params.get('shot');
  if (shot) {
    stageShot(shot, {
      getState: () => state, game, startNewGame, continueGame,
      stepSim, missionApi, feed, setModeUI,
    });
    game.frozen = true;
    updateHUD(state, game);
    drawMinimap(minimapCanvas, state, game);
    setModeUI(state, game);
  }
  updateDayNight(game.scene, game.sun, game.hemi, 600, game.city);
  requestAnimationFrame(loop);
}

boot();
