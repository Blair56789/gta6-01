// minimap.js — top-down 2D minimap: roads, sea, player arrow, gold mission
// marker, red/blue police, white traffic, green safehouse, shop icons.
import { ROAD, BOUND } from './city.js';

function toMap(x, z, size) {
  const s = size / (BOUND * 2 + 40);
  return [size / 2 + x * s, size / 2 + z * s];
}

export function drawMinimap(canvas, ctx) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  // base
  g.fillStyle = '#0e2a3d'; g.fillRect(0, 0, W, H);
  // sea (east edge)
  const [seaX] = toMap(BOUND, 0, W);
  g.fillStyle = '#1d6a94'; g.fillRect(seaX, 0, W - seaX, H);
  g.fillStyle = '#e8d49a';
  const [sandX] = toMap(BOUND - 6, 0, W);
  g.fillRect(sandX, 0, seaX - sandX, H);
  // roads
  g.strokeStyle = '#5a636e'; g.lineWidth = 5; g.lineCap = 'round';
  for (const r of ROAD) {
    const [x1, y1] = toMap(r, -BOUND, W), [x2, y2] = toMap(r, BOUND, W);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const [x3, y3] = toMap(-BOUND, r, W), [x4, y4] = toMap(BOUND, r, W);
    g.beginPath(); g.moveTo(x3, y3); g.lineTo(x4, y4); g.stroke();
  }
  // buildings hint (small blocks)
  g.fillStyle = 'rgba(210,190,150,0.5)';
  for (let i = 0; i < ROAD.length - 1; i++) for (let j = 0; j < ROAD.length - 1; j++) {
    const [x, y] = toMap(ROAD[i] + 23, ROAD[j] + 23, W);
    g.fillRect(x - 7, y - 7, 14, 14);
  }
  const dot = (x, z, color, r) => {
    const [mx, my] = toMap(x, z, W);
    g.fillStyle = color; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
  };
  const ring = (x, z, color, r) => {
    const [mx, my] = toMap(x, z, W);
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.stroke();
  };
  // landmarks: safehouse green, garage/chop shop yellow
  const lm = ctx.landmarks;
  dot(lm.safehouse.x, lm.safehouse.z, '#2fd673', 5);
  dot(lm.garage.x, lm.garage.z, '#ffd25a', 4);
  dot(lm.chopShop.x, lm.chopShop.z, '#ff9d7d', 4);
  dot(lm.bank.x, lm.bank.z, '#ffe9a8', 4);
  // traffic white
  for (const c of ctx.traffic) dot(c.pos.x, c.pos.z, '#ffffff', 2);
  // tail target / comet: purple
  if (ctx.tailTarget) dot(ctx.tailTarget.pos.x, ctx.tailTarget.pos.z, '#c07dff', 4);
  if (ctx.cometCar) dot(ctx.cometCar.pos.x, ctx.cometCar.pos.z, '#ffd25a', 4);
  // police: red cars, blue foot
  for (const c of ctx.police.cars) dot(c.pos.x, c.pos.z, '#ff3a3a', 3.5);
  for (const c of ctx.police.foot) dot(c.pos.x, c.pos.z, '#3aa7ff', 3);
  // mission marker: pulsing gold ring
  const target = ctx.missionTargetPos ? ctx.missionTargetPos() : null;
  if (target) {
    const pulse = 6 + Math.sin(performance.now() / 250) * 2;
    ring(target.x, target.z, '#ffd25a', pulse);
    dot(target.x, target.z, '#ffd25a', 4);
  }
  // player arrow (rotates with heading)
  const [px, py] = toMap(ctx.player.pos.x, ctx.player.pos.z, W);
  g.save();
  g.translate(px, py);
  g.rotate(-ctx.player.heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#10202e'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
  g.fill(); g.stroke();
  g.restore();
  // north tick + label
  g.fillStyle = '#9fd8ff'; g.font = 'bold 11px Verdana, sans-serif'; g.textAlign = 'left';
  g.fillText('N', 6, 14);
  g.fillText('PORT SOLANO', 6, H - 8);
}
