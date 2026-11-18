// Port Solano — the minimap: a top-down canvas of roads, shops, the player,
// traffic, police, pedestrians and the gold mission marker.
import { WORLD } from './state.js';

export function drawMinimap(canvas, state, game) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const scale = W / (WORLD.half * 2 + 40);
  const toX = (x) => (x + WORLD.half + 20) * scale;
  const toZ = (z) => (z + WORLD.half + 20) * scale;
  ctx.fillStyle = '#0d2036';
  ctx.fillRect(0, 0, W, H);
  // Ocean + beach on the east.
  ctx.fillStyle = '#1e6f9e';
  ctx.fillRect(toX(WORLD.oceanX), 0, W - toX(WORLD.oceanX), H);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(toX(WORLD.beachX), 0, toX(WORLD.oceanX) - toX(WORLD.beachX), H);
  // Roads.
  ctx.strokeStyle = '#3a4550';
  ctx.lineWidth = 5;
  for (let i = -5; i <= 5; i++) {
    const c = i * WORLD.block;
    ctx.beginPath(); ctx.moveTo(toX(-220), toZ(c)); ctx.lineTo(toX(220), toZ(c)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(c), toZ(-220)); ctx.lineTo(toX(c), toZ(220)); ctx.stroke();
  }
  // Buildings as blocks.
  ctx.fillStyle = '#5a6e8a';
  for (const b of game.city.buildings) {
    const w = 12 * scale, h = 12 * scale;
    ctx.fillRect(toX(b.position.x) - w / 2, toZ(b.position.z) - h / 2, w, h);
  }
  // Shops.
  ctx.fillStyle = '#ffd25a';
  for (const s of game.city.shops) {
    ctx.beginPath(); ctx.arc(toX(s.x), toZ(s.z), 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Mission marker (gold, pulsing).
  if (state.objective) {
    const pulse = 5 + Math.sin(state.time * 4) * 2;
    ctx.fillStyle = '#ffd25a';
    ctx.beginPath(); ctx.arc(toX(state.objective.x), toZ(state.objective.z), pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(toX(state.objective.x), toZ(state.objective.z), pulse + 3, 0, Math.PI * 2); ctx.stroke();
  }
  // Pedestrians (tiny grey dots).
  ctx.fillStyle = '#9fb2c8';
  for (const p of game.peds) ctx.fillRect(toX(p.x) - 1, toZ(p.z) - 1, 2, 2);
  // Traffic (white dots).
  ctx.fillStyle = '#ffffff';
  for (const c of game.traffic) ctx.fillRect(toX(c.x) - 1.5, toZ(c.z) - 1.5, 3, 3);
  // Police (blue/red flashing dots).
  for (const cop of game.cops) {
    if (!cop.active) continue;
    ctx.fillStyle = Math.floor(state.time * 4) % 2 ? '#ff2222' : '#2244ff';
    ctx.beginPath(); ctx.arc(toX(cop.x), toZ(cop.z), 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player (white triangle, pointing along heading).
  const px = state.inCar && state.car ? state.car.x : state.player.x;
  const pz = state.inCar && state.car ? state.car.z : state.player.z;
  const heading = state.inCar && state.car ? state.car.heading : state.player.heading;
  ctx.save();
  ctx.translate(toX(px), toZ(pz));
  ctx.rotate(-heading + Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // North arrow.
  ctx.fillStyle = '#cfe2f5';
  ctx.font = 'bold 11px Verdana';
  ctx.fillText('N', 6, 14);
}
