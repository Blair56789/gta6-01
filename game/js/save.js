// Port Solano — save / continue via localStorage.
const KEY = 'portsolano-save-v1';

export function saveGame(state) {
  try {
    const data = {
      day: state.day, clockMin: state.clockMin, cash: state.cash,
      respect: state.respect, health: state.health, armor: state.armor,
      wanted: state.wanted, weaponIndex: state.weaponIndex,
      magAmmo: state.magAmmo, reserveAmmo: state.reserveAmmo,
      owned: state.owned, carUpgrades: state.carUpgrades,
      missionIndex: state.missionIndex, missionDone: state.missionDone,
      playerX: state.player.x, playerZ: state.player.z,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

export function applySave(state, data) {
  state.day = data.day ?? 1;
  state.clockMin = data.clockMin ?? 480;
  state.cash = data.cash ?? 250;
  state.respect = data.respect ?? 0;
  state.health = data.health ?? 100;
  state.armor = data.armor ?? 0;
  state.wanted = data.wanted ?? 0;
  state.weaponIndex = data.weaponIndex ?? 0;
  state.magAmmo = data.magAmmo ?? state.magAmmo;
  state.reserveAmmo = data.reserveAmmo ?? state.reserveAmmo;
  state.owned = data.owned ?? state.owned;
  state.carUpgrades = data.carUpgrades ?? 0;
  state.missionIndex = data.missionIndex ?? 0;
  state.missionDone = data.missionDone ?? state.missionDone;
  state.player.x = data.playerX ?? 0;
  state.player.z = data.playerZ ?? 20;
}
