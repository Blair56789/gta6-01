// Port Solano — the HUD: stats, wanted stars, mission box, tracker, feed,
// speedometer and the overlays (menu / pause / shop / end cards).
import { WEAPONS, respectName } from './state.js';
import { fmtMoney, fmtClock } from './util.js';
import { MISSIONS } from './missions.js';

const $ = (id) => document.getElementById(id);

export function buildTracker(state) {
  const list = $('trackerList');
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const div = document.createElement('div');
    const mark = state.missionDone[i] ? '✓' : i === state.missionIndex ? '▶' : '○';
    div.textContent = mark + ' ' + (i + 1) + '. ' + m.name;
    div.className = state.missionDone[i] ? 'done' : i === state.missionIndex ? 'now' : '';
    list.appendChild(div);
  });
}

export function updateHUD(state, game) {
  const w = WEAPONS[state.weaponIndex];
  $('healthBar').style.width = state.health + '%';
  $('healthNum').textContent = Math.round(state.health);
  $('armorBar').style.width = Math.min(100, state.armor) + '%';
  $('armorNum').textContent = Math.round(state.armor);
  $('weaponName').textContent = w.name;
  $('ammoNum').textContent = w.id === 'fists' ? '∞' : state.magAmmo[state.weaponIndex] + ' / ' + state.reserveAmmo[state.weaponIndex];
  $('carName').textContent = state.inCar && state.car ? state.car.name : 'On foot';
  $('stars').textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  $('stars').style.color = state.wanted >= 4 ? '#ff5a5a' : '#ffd25a';
  $('cashNum').textContent = fmtMoney(state.cash);
  $('respectNum').textContent = respectName(state.respect) + ' (' + state.respect + ')';
  $('dayNum').textContent = 'Day ' + state.day + ' — ' + fmtClock(state.clockMin);
  const m = MISSIONS[state.missionIndex];
  $('missionTitle').textContent = 'Mission ' + (state.missionIndex + 1) + '/6: ' + m.name;
  $('missionObj').textContent = state.objective ? state.objective.label : m.briefing;
  const px = state.inCar && state.car ? state.car.x : state.player.x;
  const pz = state.inCar && state.car ? state.car.z : state.player.z;
  if (state.objective) {
    const d = Math.round(Math.hypot(px - state.objective.x, pz - state.objective.z));
    $('markerDist').textContent = '◈ ' + d + 'm to marker';
  } else {
    $('markerDist').textContent = '';
  }
  $('missionTimer').textContent = state.missionActive ? '⏱ ' + Math.max(0, Math.ceil(state.missionTimer)) + 's' : '';
  const speed = state.inCar && state.car ? Math.abs(state.car.speed) * 2.2 : Math.abs(state.player.speed || 0) * 2.2;
  $('speedNum').textContent = Math.round(speed);
  $('crosshair').classList.toggle('on', !state.inCar && state.mode === 'play');
  buildTracker(state);
  // Side gig readout.
  let gig = 'Side gig: none nearby';
  if (state.gig === 'taxi') gig = 'Side gig: TAXI — fares pay cash, no wanted';
  else if (state.gig === 'chop') gig = 'Side gig: CHOP SHOP — sell a stolen car for $1,500';
  else if (game.nearShop) gig = 'Shop nearby — press Q to browse (' + game.nearShop.name + ')';
  $('sidegig').textContent = gig;
}

export function feed(state, msg) {
  state.messages.push(msg);
  if (state.messages.length > 5) state.messages.shift();
  const feedEl = $('feed');
  feedEl.innerHTML = '';
  for (const m of state.messages) {
    const div = document.createElement('div');
    div.textContent = m;
    feedEl.appendChild(div);
  }
}

export function showToast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

export function setModeUI(state, game) {
  $('hud').classList.toggle('hidden', state.mode === 'menu');
  $('menu').classList.toggle('hidden', state.mode !== 'menu');
  $('pause').classList.toggle('hidden', state.mode !== 'paused');
  $('shop').classList.toggle('hidden', state.mode !== 'shop');
  $('endcard').classList.toggle('hidden', !['busted', 'wasted', 'won', 'lost'].includes(state.mode));
  if (state.mode === 'busted') { $('endTitle').textContent = 'BUSTED'; $('endText').textContent = 'The Solano PD hauled you in. The Meridian Job stays undone — retry the mission.'; }
  if (state.mode === 'wasted') { $('endTitle').textContent = 'WASTED'; $('endText').textContent = 'Rook went down in the streets of Port Solano. Retry the mission and come back harder.'; }
  if (state.mode === 'won') { $('endTitle').textContent = 'THE MERIDIAN JOB — DONE'; $('endText').textContent = state.endReason; }
  if (state.mode === 'lost') { $('endTitle').textContent = 'TIME\'S UP'; $('endText').textContent = state.endReason; }
  if (state.mode === 'paused') $('pauseInfo').textContent = 'Day ' + state.day + ' — ' + fmtClock(state.clockMin) + ' · Mission ' + (state.missionIndex + 1) + '/6 · Cash ' + fmtMoney(state.cash);
  if (state.mode === 'menu') $('btnContinue').style.opacity = game.hasSave ? '1' : '0.45';
}

export const SHOP_ITEMS = [
  { id: 'vest', name: 'Kevlar Vest (+50 armor)', price: 300, buy(s) { s.armor = Math.min(100, s.armor + 50); } },
  { id: 'pistol', name: 'Pistol + 48 rounds', price: 500, buy(s) { s.owned.pistol = true; s.reserveAmmo[1] += 48; } },
  { id: 'smg', name: 'SMG + 120 rounds', price: 1200, buy(s) { s.owned.smg = true; s.reserveAmmo[2] += 120; } },
  { id: 'ammo', name: 'Ammo box (+60 pistol / +90 SMG)', price: 200, buy(s) { s.reserveAmmo[1] += 60; s.reserveAmmo[2] += 90; } },
  { id: 'engine', name: 'Engine tune (+12% top speed)', price: 900, buy(s) { s.carUpgrades = Math.min(3, s.carUpgrades + 1); } },
  { id: 'bribe', name: 'Bribe the desk sergeant (−2 wanted stars)', price: 700, buy(s) { s.wanted = Math.max(0, s.wanted - 2); } },
  { id: 'heal', name: 'Clinic patch-up (full health)', price: 250, buy(s) { s.health = 100; } },
];

export function renderShop(state, onBuy) {
  $('shopCash').textContent = 'Cash: ' + fmtMoney(state.cash) + ' · Armor ' + Math.round(state.armor) + ' · Health ' + Math.round(state.health);
  const box = $('shopItems');
  box.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const row = document.createElement('div');
    row.className = 'item';
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = item.name;
    const pr = document.createElement('span');
    pr.className = 'pr'; pr.textContent = fmtMoney(item.price);
    const btn = document.createElement('button');
    btn.className = 'buy'; btn.textContent = 'BUY';
    btn.disabled = state.cash < item.price || (item.id === 'engine' && state.carUpgrades >= 3);
    btn.addEventListener('click', () => onBuy(item));
    row.appendChild(nm); row.appendChild(pr); row.appendChild(btn);
    box.appendChild(row);
  }
}
