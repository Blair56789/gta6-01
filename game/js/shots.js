// shots.js — deterministic screenshot scenes for ?shot=…&seed=N.
// Each scene sets a fixed camera, positions, wanted level and mission state,
// then plays forward a fixed number of steps so the frame is a real render
// of the game's own code (no staging, no compositing).
export function parseShotParams() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  return { shot, seed: parseInt(q.get('seed') || '1', 10) || 1 };
}

export const SHOT_SCENES = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' },
  { name: '2-drive.jpg', query: '?shot=drive&seed=1' },
  { name: '3-chase.jpg', query: '?shot=chase&seed=1' },
  { name: '4-mission.jpg', query: '?shot=mission&seed=1' },
];

// Applies the shot setup to the game context. Returns the number of fixed
// simulation steps to run before freezing the frame for the screenshot.
export function applyShotScene(ctx, name) {
  const g = ctx.game;
  if (name === 'start') {
    // start screen over a live city view, objective + controls visible
    g.showMenu();
    return { steps: 40, scripted: null, freeze: true };
  }
  // all other shots auto-start the game (no click needed in headless Chrome)
  g.startNewGame({ silent: true });
  if (name === 'drive') {
    // driving through the city: HUD + minimap + traffic, midday sun
    ctx.state.timeMin = 11 * 60;
    return { steps: 150, scripted: { forward: true, left: false, right: false }, freeze: true };
  }
  if (name === 'chase') {
    // police chase: 3 wanted stars, two interceptors visible ahead in frame,
    // player rolling east down 0th Avenue so the shot differs from the drive shot
    ctx.state.timeMin = 16 * 60 + 30;
    ctx.state.wanted = 3;
    ctx.state.cash = 4820;
    ctx.state.respect = 2100;
    const car = ctx.player.car;
    ctx.player.pos.set(-46, 0, 0);
    car.pos.set(-46, 0, 0);
    ctx.player.heading = Math.PI / 2; car.heading = Math.PI / 2; car.speed = 14;
    for (const [px, pz, hd] of [[-8, 2.5, -Math.PI / 2], [14, -2.5, -Math.PI / 2]]) {
      const pc = ctx.vehicleApi.createCar(ctx.scene,
        { name: 'Solano PD Interceptor', color: 0x1a1d22, top: 24, grip: 1.1 },
        px, pz, hd, { isPolice: true });
      pc.speed = 13;
      ctx.police.cars.push(pc);
    }
    return { steps: 170, scripted: { forward: true }, freeze: true };
  }
  if (name === 'mission') {
    // mission in progress: Mission 2 courier run, gold marker ahead, 2 stars
    ctx.state.timeMin = 9 * 60 + 20;
    ctx.state.wanted = 2;
    ctx.state.cash = 2340;
    ctx.missionsStart(1);
    return { steps: 150, scripted: { forward: true }, freeze: true };
  }
  return { steps: 60, scripted: null, freeze: true };
}
