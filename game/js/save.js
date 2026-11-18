// save.js — localStorage persistence for Port Solano progress.
const KEY = 'portsolano-save-v1';

export function saveGame(state) {
  try {
    const data = {
      day: state.day, timeMin: state.timeMin, cash: state.cash, respect: state.respect,
      health: state.health, armor: state.armor, weapon: state.weapon, ammo: state.ammo,
      upgrades: state.upgrades, missionIndex: state.missionIndex,
      missionsDone: state.missionsDone, carsSold: state.carsSold, gigsDone: state.gigsDone,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.missionIndex !== 'number') return null;
    return d;
  } catch { return null; }
}

export function hasSave() { return loadGame() !== null; }

export function clearSave() { try { localStorage.removeItem(KEY); } catch {} }

// Deterministic RNG (mulberry32) so ?shot=…&seed=N replays the same city layout.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
