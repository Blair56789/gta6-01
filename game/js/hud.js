// hud.js — the dense HUD: bars, stars, cash, respect, day/time, mission
// tracker, message feed, banner, prompts and the shop list.
import { MISSION_DEFS, rankFor } from './missions.js';

const $ = id => document.getElementById(id);
const feedItems = [];

export function addFeed(msg) {
  const feed = $('feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.textContent = msg;
  feed.prepend(div);
  feedItems.unshift(div);
  while (feedItems.length > 5) feedItems.pop().remove();
}

let bannerTimer = null;
export function showBanner(title, sub) {
  const b = $('banner');
  b.textContent = sub ? `${title} — ${sub}` : title;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600);
}

export function setPrompt(text) {
  const p = $('prompt');
  if (text) { p.textContent = text; p.classList.remove('hidden'); }
  else p.classList.add('hidden');
}

export function fmtClock(timeMin) {
  const h = Math.floor(timeMin / 60) % 24, m = Math.floor(timeMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function updateHud(state, mission, progressText) {
  $('hp-fill').style.width = `${Math.max(0, state.health)}%`;
  $('hp-num').textContent = Math.ceil(Math.max(0, state.health));
  $('ar-fill').style.width = `${Math.max(0, Math.min(100, state.armor))}%`;
  $('ar-num').textContent = Math.ceil(Math.max(0, state.armor));
  $('weapon').textContent = state.weapon === 'fists' ? 'Fists' : state.weapon === 'pistol' ? 'Pistol' : 'SMG';
  $('ammo').textContent = state.weapon === 'fists' ? '' : ` — ${state.ammo} rounds`;
  $('car-name').textContent = state.inCarName || '— on foot —';
  const starsEl = $('stars');
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += i <= state.wanted ? '★' : `<span class="off">☆</span>`;
  starsEl.innerHTML = stars;
  $('cash').textContent = `$${state.cash.toLocaleString()}`;
  $('respect').textContent = `${rankFor(state.respect)} (${state.respect})`;
  $('day-time').textContent = `Day ${state.day} — ${fmtClock(state.timeMin)}`;
  if (mission) {
    const def = MISSION_DEFS[mission.index];
    $('mission-line').textContent = `Mission ${mission.index + 1}/6: ${def.name}`;
    $('mission-progress').textContent = progressText;
  } else {
    $('mission-line').textContent = 'Free roam — Port Solano';
    $('mission-progress').textContent = progressText;
  }
}

export function updateTracker(mission) {
  const ul = $('tracker-steps');
  ul.innerHTML = '';
  if (!mission) {
    const li = document.createElement('li');
    li.textContent = '✓ All jobs done for today — explore, earn side cash, or start the next job (R).';
    ul.appendChild(li);
    return;
  }
  const def = MISSION_DEFS[mission.index];
  def.stages.forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = `${i < mission.stage ? '✓' : i === mission.stage ? '►' : '○'} ${s.text}`;
    li.className = i < mission.stage ? 'done' : i === mission.stage ? 'now' : '';
    ul.appendChild(li);
  });
}

export function updateGigLine(text) { $('gig-line').textContent = `Side gig: ${text}`; }

export const SHOP_ITEMS = [
  { id: 'vest', name: 'Kevlar vest (+50 armor)', price: 300, can: s => s.armor < 50 },
  { id: 'pistol', name: 'Pistol (60 rounds)', price: 500, can: s => s.weapon === 'fists' },
  { id: 'smg', name: 'SMG (120 rounds)', price: 1200, can: s => s.weapon !== 'smg' },
  { id: 'ammo', name: 'Ammo refill (+60 rounds)', price: 150, can: s => s.weapon !== 'fists' },
  { id: 'cararmor', name: 'Car armor plating', price: 800, can: s => (s.upgrades.carArmor || 0) < 2 },
  { id: 'carspeed', name: 'Tuned engine (+speed)', price: 900, can: s => (s.upgrades.carSpeed || 0) < 2 },
  { id: 'bribe', name: 'Bribe the desk sergeant (−1 wanted star)', price: 400, can: s => s.wanted > 0 },
  { id: 'heal', name: 'Patch up at Solano General (+50 health)', price: 200, can: s => s.health < 100 },
];

export function renderShop(state, onBuy) {
  const list = $('shop-list');
  list.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const affordable = state.cash >= item.price;
    const usable = item.can(state);
    row.innerHTML = `<span>${item.name}</span>`;
    const btn = document.createElement('button');
    btn.textContent = `$${item.price}`;
    btn.disabled = !affordable || !usable;
    btn.onclick = () => onBuy(item);
    row.appendChild(btn);
    list.appendChild(row);
  }
}
