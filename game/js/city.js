// Port Solano — the procedural city: road grid, buildings with lit windows,
// palm trees, streetlights, beach and ocean, shops and mission landmarks.
import * as THREE from 'three';
import { WORLD } from './state.js';
import { randRange, pick } from './util.js';

const PALETTE = [0xe8a34c, 0xd97b4f, 0x7fb3d5, 0xc9a06a, 0x9db8c4, 0xe0b56a, 0x8fa8bf, 0xd98c6a];
const SHOP_NAMES = ['SOLANO ARMS', 'MARINA MOTORS', 'PALM CLINIC', 'CHOP SHOP', 'MERIDIAN TOWER', 'SOLANO GENERAL'];

function windowTexture(rng, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b9c2cb';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 18) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#42505e';
      g.fillRect(x, y, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const city = { buildings: [], colliders: [], shops: [], lamps: [], palms: [], landmarks: {} };
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x5d7a52 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2 + 120, WORLD.half * 2 + 120), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  scene.add(ground);

  // Roads: dark strips along every grid line, with dashed centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
  const roadLen = WORLD.half * 2 + 40;
  for (let i = -5; i <= 5; i++) {
    const c = i * WORLD.block;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, WORLD.roadHalf * 2), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0, c); scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, roadLen), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.01, 0); scene.add(v);
    for (let d = -roadLen / 2 + 6; d < roadLen / 2; d += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), lineMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.02, c); scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), lineMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(c, 0.02, d); scene.add(dash2);
    }
  }

  // Beach + ocean on the east edge.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(30, WORLD.half * 2 + 40), new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(WORLD.beachX + 13, 0.03, 0); scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(120, WORLD.half * 2 + 120), new THREE.MeshLambertMaterial({ color: 0x1e6f9e }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(WORLD.oceanX + 60, 0.02, 0); scene.add(ocean);
  city.ocean = ocean;

  // Buildings: one or two per block, kept off the roads and the beach.
  const winTex = windowTexture(rng, 0.35);
  const winTexNight = windowTexture(rng, 0.75);
  city.winTex = winTex; city.winTexNight = winTexNight;
  for (let bx = -4; bx <= 4; bx++) {
    for (let bz = -4; bz <= 4; bz++) {
      if (bx * WORLD.block > WORLD.beachX - 30) continue;
      const cx = bx * WORLD.block + WORLD.block / 2;
      const cz = bz * WORLD.block + WORLD.block / 2;
      const n = rng() < 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = randRange(rng, 10, 16);
        const d = randRange(rng, 10, 16);
        const h = randRange(rng, 9, 42);
        const ox = n === 2 ? (k === 0 ? -7 : 7) : 0;
        const oz = n === 2 ? (k === 0 ? -6 : 6) : 0;
        const color = pick(rng, PALETTE);
        const mat = new THREE.MeshLambertMaterial({ color, map: winTex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx + ox, h / 2, cz + oz);
        scene.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.8, d + 1), new THREE.MeshLambertMaterial({ color: 0x3a3f47 }));
        roof.position.set(cx + ox, h + 0.4, cz + oz);
        scene.add(roof);
        city.buildings.push(b);
        city.colliders.push({ x: cx + ox, z: cz + oz, hw: w / 2 + 0.3, hd: d / 2 + 0.3 });
      }
    }
  }

  // Landmark: the Meridian Tower — tall glass spire near the centre-north.
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x4a6f8e, map: winTexNight, emissive: 0x223344 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(18, 78, 18), towerMat);
  tower.position.set(-60, 39, -140);
  scene.add(tower);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2, 16, 8), new THREE.MeshLambertMaterial({ color: 0xffd25a, emissive: 0xaa7700 }));
  spire.position.set(-60, 86, -140);
  scene.add(spire);
  city.colliders.push({ x: -60, z: -140, hw: 10, hd: 10 });
  city.landmarks.meridian = { x: -60, z: -140 };

  // Shops around the map, each a low colourful box with a sign.
  const shopDefs = [
    { name: 'SOLANO ARMS', x: 20, z: -60, color: 0x8e2f2f, kind: 'arms' },
    { name: 'PALM CLINIC', x: -100, z: 60, color: 0x2f6e4e, kind: 'clinic' },
    { name: 'MARINA MOTORS', x: 100, z: 100, color: 0x2f4e8e, kind: 'motors' },
    { name: 'CHOP SHOP', x: -140, z: -20, color: 0x6e2f6e, kind: 'chop' },
    { name: 'SOLANO GENERAL', x: 60, z: -140, color: 0x8e6e2f, kind: 'general' },
  ];
  for (const def of shopDefs) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), new THREE.MeshLambertMaterial({ color: def.color }));
    box.position.set(def.x, 3, def.z);
    scene.add(box);
    const sign = makeSign(def.name, 0xffd25a);
    sign.position.set(def.x, 8.2, def.z);
    scene.add(sign);
    city.shops.push({ ...def, mesh: box, sign });
    city.colliders.push({ x: def.x, z: def.z, hw: 7.6, hd: 5.6 });
  }

  // Palm trees along the beach and scattered on blocks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8e4e });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = 0.08; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4, 7.2, Math.sin(a) * 1.4);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    city.palms.push(g);
  }
  for (let z = -180; z <= 180; z += 24) palm(WORLD.beachX + 4 + rng() * 6, z + rng() * 8);
  for (let i = 0; i < 26; i++) palm(randRange(rng, -180, 150), randRange(rng, -180, 180));

  // Streetlights at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x44484f });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let ix = -4; ix <= 4; ix++) {
    for (let iz = -4; iz <= 4; iz++) {
      if ((ix + iz) % 2 !== 0) continue;
      const x = ix * WORLD.block + 9, z = iz * WORLD.block + 9;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
      pole.position.set(x, 3.5, z); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), bulbMat);
      bulb.position.set(x, 7.2, z); scene.add(bulb);
      city.lamps.push(bulb);
    }
  }
  return city;
}

function makeSign(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1420'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#ffd25a';
  g.font = 'bold 34px Verdana, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), mat);
  mesh.userData.isSign = true;
  return mesh;
}

// Sun + sky follow the clock: bright noon, orange dusk, dark blue night with lit windows.
export function updateDayNight(scene, sun, hemi, clockMin, city) {
  const t = clockMin / 1440;
  const dayFrac = (clockMin - 360) / 840; // 06:00..20:00
  const isDay = clockMin >= 360 && clockMin < 1200;
  const dusk = (clockMin >= 1080 && clockMin < 1200) || (clockMin >= 300 && clockMin < 420);
  if (isDay) {
    const elev = Math.sin(Math.max(0.08, dayFrac) * Math.PI);
    sun.position.set(Math.cos(t * Math.PI * 2) * 180, 60 + elev * 120, 80);
    sun.intensity = dusk ? 1.1 : 1.7;
    sun.color.setHex(dusk ? 0xffb36b : 0xfff2d0);
    hemi.intensity = 0.75;
    scene.background = new THREE.Color(dusk ? 0xf7b26a : 0x87bfe8);
    scene.fog = new THREE.Fog(dusk ? 0xf7b26a : 0x87bfe8, 220, 520);
  } else {
    sun.position.set(-120, 90, -60);
    sun.intensity = 0.25;
    sun.color.setHex(0x9fb8ff);
    hemi.intensity = 0.28;
    scene.background = new THREE.Color(0x0b1a33);
    scene.fog = new THREE.Fog(0x0b1a33, 160, 420);
  }
  const night = !isDay;
  for (const b of city.buildings) {
    if (b.material.map !== (night ? city.winTexNight : city.winTex)) b.material.map = night ? city.winTexNight : city.winTex;
    b.material.needsUpdate = false;
  }
  for (const lamp of city.lamps) lamp.material.color.setHex(night ? 0xffe9a8 : 0x8a7a55);
}

// Circle (player/car) vs building AABB push-out. Returns corrected {x,z} or null.
export function collideCircle(city, x, z, r) {
  let nx = x, nz = z, hit = false;
  for (const c of city.colliders) {
    const dx = nx - c.x, dz = nz - c.z;
    const px = c.hw + r - Math.abs(dx);
    const pz = c.hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      hit = true;
      if (px < pz) nx = c.x + Math.sign(dx || 1) * (c.hw + r);
      else nz = c.z + Math.sign(dz || 1) * (c.hd + r);
    }
  }
  return hit ? { x: nx, z: nz } : null;
}

export function nearestRoadPoint(x, z) {
  const rx = Math.round(x / WORLD.block) * WORLD.block;
  const rz = Math.round(z / WORLD.block) * WORLD.block;
  return Math.abs(x - rx) < Math.abs(z - rz) ? { x: rx, z } : { x, z: rz };
}
