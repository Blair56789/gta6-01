// city.js — builds Port Solano: a 5x5 road grid, procedural buildings with
// window textures, beach and sea to the east, landmarks, palms and streetlights.
// All geometry is original, generated from boxes, cylinders and canvas textures.
import * as THREE from 'three';

export const ROAD = [-92, -46, 0, 46, 92]; // road centre lines on x and z
export const BOUND = 118;                    // playable half-extent
export const GRID_STEP = 46;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 12; y += 28) {
      for (let x = 12; x < w - 12; x += 26) {
        g.fillStyle = Math.random() < 0.25 ? '#ffd97a' : (lit ? '#9fd8ff' : '#2c4a63');
        g.fillRect(x, y, 16, 18);
      }
    }
  });
}

function labelSprite(text, color) {
  const tex = canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = 'rgba(8,24,38,0.85)';
    g.beginPath(); g.roundRect(6, 8, w - 12, h - 16, 18); g.fill();
    g.strokeStyle = color; g.lineWidth = 4; g.stroke();
    g.fillStyle = color; g.font = 'bold 44px Trebuchet MS, Verdana, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(26, 4.9, 1);
  return s;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const landmarks = {};
  const palette = ['#f2d8a7', '#e8b48c', '#a8d0c6', '#f7e8c9', '#d99a7c', '#c9d6a3', '#e6c9d6', '#b8cfe0'];
  const winTexes = [windowTexture('#e8cfa0', true), windowTexture('#d9a583', false), windowTexture('#a8c8c0', true)];

  // ---- ground, sea, beach ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUND * 2 + 260, BOUND * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x9db98a }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(20, 0, 0); ground.receiveShadow = true;
  scene.add(ground);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(140, BOUND * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(BOUND + 95, 0.05, 0); scene.add(sea);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(36, BOUND * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(BOUND + 12, 0.06, 0); scene.add(sand);
  // boardwalk strip
  const walk = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, BOUND * 2), new THREE.MeshLambertMaterial({ color: 0xc9a06a }));
  walk.position.set(BOUND - 8, 0.15, 0); scene.add(walk);

  // ---- roads + sidewalks + dashes ----
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c9 });
  for (const c of ROAD) {
    for (const horiz of [true, false]) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(horiz ? BOUND * 2 : 12, 0.12, horiz ? 12 : BOUND * 2),
        roadMat);
      road.position.set(horiz ? 0 : c, 0.06, horiz ? c : 0); road.receiveShadow = true; scene.add(road);
      const sw = new THREE.Mesh(new THREE.BoxGeometry(horiz ? BOUND * 2 : 16, 0.1, horiz ? 16 : BOUND * 2), walkMat);
      sw.position.set(horiz ? 0 : c, 0.05, horiz ? c : 0); scene.add(sw);
      // centre dashes
      for (let d = -BOUND + 8; d < BOUND; d += 12) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 5 : 0.7, 0.05, horiz ? 0.7 : 5), dashMat);
        dash.position.set(horiz ? d : c, 0.14, horiz ? c : d); scene.add(dash);
      }
    }
  }

  // ---- buildings per block ----
  const blocks = [];
  for (let i = 0; i < ROAD.length - 1; i++) {
    for (let j = 0; j < ROAD.length - 1; j++) {
      blocks.push({ x0: ROAD[i] + 8, z0: ROAD[j] + 8, x1: ROAD[i + 1] - 8, z1: ROAD[j + 1] - 8 });
    }
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
  for (const b of blocks) {
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const w = 12 + rng() * 12, d = 12 + rng() * 12;
      const x = b.x0 + 8 + rng() * Math.max(1, (b.x1 - b.x0) - w - 16);
      const z = b.z0 + 8 + rng() * Math.max(1, (b.z1 - b.z0) - d - 16);
      const h = 8 + rng() * rng() * 34;
      const tex = winTexes[Math.floor(rng() * winTexes.length)];
      const mat = new THREE.MeshLambertMaterial({ map: tex, color: palette[Math.floor(rng() * palette.length)] });
      const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      bld.position.set(x, h / 2, z); bld.castShadow = true; bld.receiveShadow = true; scene.add(bld);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
      roof.position.set(x, h + 0.4, z); scene.add(roof);
      colliders.push({ x, z, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
      // rooftop AC box on tall towers
      if (h > 22) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
        ac.position.set(x + w / 4, h + 1.6, z); scene.add(ac);
      }
    }
  }

  // ---- palms + streetlights along roads ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamps = [];
  for (const c of ROAD) {
    for (let d = -BOUND + 14; d < BOUND; d += 46) {
      for (const [px, pz] of [[c + 9, d], [c - 9, d + 23]]) {
        if (Math.abs(px) > BOUND || Math.abs(pz) > BOUND) continue;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
        trunk.position.set(px, 3, pz); scene.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 7, 5), leafMat);
        crown.scale.y = 0.55; crown.position.set(px, 6.4, pz); scene.add(crown);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 7, 6), poleMat);
      pole.position.set(c + 7.5, 3.5, d + 10); scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
      lamp.position.set(c + 7.5, 7.1, d + 10); scene.add(lamp); lamps.push(lamp);
    }
  }

  // ---- landmarks (distinct buildings + floating labels) ----
  function landmark(name, x, z, w, h, d, color, labelColor) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); b.castShadow = true; scene.add(b);
    const sign = labelSprite(name, labelColor); sign.position.set(x, h + 4, z); scene.add(sign);
    colliders.push({ x, z, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
    return new THREE.Vector3(x, 0, z);
  }
  landmarks.safehouse = landmark('SAFEHOUSE', -69, -69, 20, 10, 16, 0x3f7d5a, '#7dff9e');
  landmarks.garage = landmark("MARA'S GARAGE", -69, 69, 22, 12, 18, 0x8a5a2e, '#ffd25a');
  landmarks.chopShop = landmark('CHOP SHOP', 69, 69, 22, 11, 18, 0x7a3a3a, '#ff9d7d');
  landmarks.bank = landmark('MERIDIAN BANK', 23, -69, 24, 26, 18, 0xd9c27a, '#ffe9a8');
  landmarks.hospital = landmark('SOLANO GENERAL', 69, -69, 22, 16, 18, 0xe8e8e8, '#9fd8ff');
  landmarks.pier = new THREE.Vector3(112, 0, 0);
  // pier planks out over the sea
  const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
  pier.position.set(126, 0.4, 0); scene.add(pier);

  // ---- lights: sun + hemisphere (day/night driven by updateDayNight) ----
  const sun = new THREE.DirectionalLight(0xffe9c0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x87bfe8, 220, 420);

  const daySky = new THREE.Color(0x87bfe8), duskSky = new THREE.Color(0xe8906a), nightSky = new THREE.Color(0x0e1c33);
  const tmp = new THREE.Color();
  function updateDayNight(timeMin) {
    // timeMin: minutes since midnight. Day 06:00–18:30, dusk to 20:00, night after.
    const t = timeMin / 1440;
    const ang = (t - 0.25) * Math.PI * 2; // sun rises ~06:00
    const elev = Math.sin(ang);
    sun.position.set(Math.cos(ang) * 180, Math.max(12, elev * 200 + 20), 80);
    const dayF = THREE.MathUtils.clamp(elev * 2.2, 0, 1);
    const duskF = THREE.MathUtils.clamp(1 - Math.abs(elev) * 3, 0, 1) * (elev > -0.15 ? 1 : 0);
    tmp.copy(nightSky).lerp(daySky, dayF).lerp(duskSky, duskF * 0.55);
    scene.background.copy(tmp); scene.fog.color.copy(tmp);
    sun.intensity = 0.25 + dayF * 2.0;
    hemi.intensity = 0.25 + dayF * 0.65;
    for (const l of lamps) l.material.color.setHex(dayF > 0.4 ? 0xffe9a8 : 0xfff2c0);
  }

  return { colliders, landmarks, lamps, updateDayNight };
}

// Circle (player/car/ped) vs building AABB push-out. Returns corrected {x, z}.
export function resolveCollisions(x, z, radius, colliders) {
  for (const c of colliders) {
    const dx = x - c.x, dz = z - c.z;
    const px = c.hx + radius - Math.abs(dx), pz = c.hz + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) x = c.x + Math.sign(dx || 1) * (c.hx + radius);
      else z = c.z + Math.sign(dz || 1) * (c.hz + radius);
    }
  }
  return { x: THREE.MathUtils.clamp(x, -BOUND, BOUND + 8), z: THREE.MathUtils.clamp(z, -BOUND, BOUND) };
}

// Nearest point on the road grid (for snapping AI cars back to lanes).
export function nearestRoadPoint(x, z) {
  let bx = ROAD[0], bz = ROAD[0];
  for (const r of ROAD) { if (Math.abs(r - x) < Math.abs(bx - x)) bx = r; if (Math.abs(r - z) < Math.abs(bz - z)) bz = r; }
  return Math.abs(bx - x) < Math.abs(bz - z) ? { x: bx, z, along: 'z' } : { x, z: bz, along: 'x' };
}
