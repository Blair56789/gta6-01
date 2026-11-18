// Port Solano — the single shared game state object.
// Every system reads and writes this one plain object, created fresh per game.
import { mulberry32 } from './util.js';

export const WORLD = {
  half: 200,          // city extends -200..200 on x and z
  block: 40,          // road grid spacing
  roadHalf: 7,        // half width of a road
  beachX: 168,        // east of this is sand, then ocean
  oceanX: 196,
};

export const WEAPONS = [
  { id: 'fists', name: 'Fists', damage: 12, range: 2.4, rate: 0.35, ammo: Infinity, mag: Infinity, auto: false },
  { id: 'pistol', name: 'Pistol', damage: 34, range: 55, rate: 0.28, ammo: 120, mag: 12, auto: false },
  { id: 'smg', name: 'SMG', damage: 18, range: 45, rate: 0.09, ammo: 240, mag: 30, auto: true },
];

export const RESPECT_RANKS = [
  [0, 'Rookie'], [400, 'Wheelman'], [1200, 'Connected'], [2500, 'Made'], [4500, 'Kingpin'],
];

export function respectName(score) {
  let name = 'Rookie';
  for (const [need, label] of RESPECT_RANKS) if (score >= need) name = label;
  return name;
}

export function createGameState(seed) {
  const rng = mulberry32(seed);
  return {
    seed,
    rng,
    mode: 'menu',           // menu | play | paused | shop | busted | wasted | won | lost
    prevMode: 'play',
    time: 0,                // seconds since game start (real play time)
    day: 1,
    clockMin: 8 * 60,       // 08:00 on day 1
    cash: 250,
    respect: 0,
    health: 100,
    armor: 0,
    wanted: 0,
    wantedHeat: 0,          // 0..1, decays when unseen
    weaponIndex: 0,
    magAmmo: [Infinity, 12, 30],
    reserveAmmo: [Infinity, 48, 120],
    owned: { pistol: false, smg: false },
    carUpgrades: 0,         // 0..3 engine upgrades
    muted: false,
    // player on foot
    player: { x: 0, z: 20, heading: 0, speed: 0, onFoot: false, mesh: null },
    // player car (null when on foot and no car owned nearby)
    car: null,              // { mesh, x, z, heading, speed, color, name, kind, health }
    inCar: true,
    camYaw: 0,
    camPitch: 0.32,
    // mission runtime
    missionIndex: 0,        // 0..5
    missionStage: 0,
    missionTimer: 0,
    missionDone: [false, false, false, false, false, false],
    missionActive: false,
    objective: null,        // { x, z, label }
    objectives: [],         // remaining objective points for multi-stop missions
    taxiPassenger: null,    // { x, z } pickup point while taxi gig is live
    taxiFare: 0,
    chopTarget: null,       // traffic car object to steal for mission 4
    crateCount: 0,
    // side gigs
    gig: null,              // 'taxi' | 'chop' | null
    gigTarget: null,
    // end state
    endReason: '',
    // shot staging
    shot: null,
    messages: [],
    stats: { shotsFired: 0, carsStolen: 0, copsDodged: 0, pedsScared: 0 },
  };
}
