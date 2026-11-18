// audio.js — all sound is synthesized with WebAudio. No audio assets, no network.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseBurst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function setEngine(running, speedNorm) {
    if (!ensure() || muted) { stopEngine(); return; }
    if (!running) { stopEngine(); return; }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain(); engineGain.gain.value = 0.04;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    }
    engineOsc.frequency.value = 55 + speedNorm * 140;
    engineGain.gain.value = 0.03 + speedNorm * 0.05;
  }
  function stopEngine() {
    if (engineOsc) { try { engineOsc.stop(); } catch {} engineOsc.disconnect(); engineOsc = null; engineGain = null; }
  }
  function setSiren(on, dt) {
    if (!ensure() || muted || !on) {
      if (sirenOsc) { try { sirenOsc.stop(); } catch {} sirenOsc.disconnect(); sirenOsc = null; }
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start(); sirenTimer = 0;
    }
    sirenTimer += dt;
    sirenOsc.frequency.value = (Math.floor(sirenTimer / 0.45) % 2 === 0) ? 720 : 980;
  }

  return {
    unlock,
    setMuted(m) { muted = m; if (muted) { stopEngine(); } },
    isMuted() { return muted; },
    setEngine, setSiren,
    blip() { tone(880, 0.12, 'sine', 0.25, 1320); },
    cash() { tone(660, 0.1, 'sine', 0.25); setTimeout(() => tone(990, 0.16, 'sine', 0.25), 90); },
    gunshot() { noiseBurst(0.18, 0.5, 900); tone(160, 0.12, 'square', 0.2, 60); },
    punch() { noiseBurst(0.09, 0.3, 500); },
    crash() { noiseBurst(0.3, 0.45, 700); tone(90, 0.25, 'sawtooth', 0.25, 40); },
    sirenBlip() { tone(980, 0.3, 'triangle', 0.18, 720); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.28), i * 120)); },
    busted() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.2), i * 160)); },
    pickup() { tone(520, 0.08, 'square', 0.15, 780); },
  };
}
