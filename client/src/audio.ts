import { store } from './storage';
// All sounds are synthesised with Web Audio — no audio files, nothing to license.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = Number(store.get('standoff.volume') ?? '0.7');
let muted = store.get('standoff.muted') === '1';

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const sound = {
  get muted() { return muted; },
  setMuted(m: boolean) { muted = m; store.set('standoff.muted', m ? '1' : '0'); },
  get volume() { return volume; },
  setVolume(v: number) { volume = v; store.set('standoff.volume', String(v)); if (master) master.gain.value = v; },
  unlock() { ac(); },
};

function noise(c: AudioContext, dur: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(c: AudioContext, peak: number, attack: number, decay: number, at = c.currentTime) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(master!);
  return g;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.3, delay = 0) {
  const c = ac(); if (!c) return;
  const at = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.connect(env(c, peak, 0.005, dur, at));
  o.start(at); o.stop(at + dur + 0.05);
}

export const sfx = {
  tick() { tone(1400, 0.05, 'square', 0.08); },
  go() { tone(220, 0.25, 'sawtooth', 0.15); tone(330, 0.25, 'sawtooth', 0.1, 0.02); },
  cock() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.06);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    n.connect(f); f.connect(env(c, 0.4, 0.002, 0.06));
    n.start();
    setTimeout(() => {
      const c2 = ac(); if (!c2) return;
      const n2 = noise(c2, 0.05);
      const f2 = c2.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1800;
      n2.connect(f2); f2.connect(env(c2, 0.35, 0.002, 0.05));
      n2.start();
    }, 90);
  },
  bang() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.6);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(4000, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.4);
    n.connect(f); f.connect(env(c, 0.9, 0.003, 0.55));
    n.start();
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.3);
    o.connect(env(c, 0.7, 0.003, 0.35)); o.start(); o.stop(c.currentTime + 0.4);
  },
  click() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.03);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    n.connect(f); f.connect(env(c, 0.35, 0.001, 0.03));
    n.start();
  },
  heartbeat(intensity: number) {
    const k = Math.min(1, 0.25 + intensity * 0.25);
    tone(55, 0.14, 'sine', 0.55 * k);
    tone(50, 0.16, 'sine', 0.45 * k, 0.22);
  },
  cash() { tone(1318, 0.12, 'triangle', 0.2); tone(1760, 0.3, 'triangle', 0.2, 0.08); },
  banzai() {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(520, c.currentTime + 0.35);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    o.connect(f); f.connect(env(c, 0.18, 0.02, 0.4)); o.start(); o.stop(c.currentTime + 0.5);
  },
  swoosh() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.25);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.2);
    n.connect(f); f.connect(env(c, 0.12, 0.05, 0.2)); n.start();
  },
  thud() { tone(70, 0.3, 'sine', 0.5); },
  sting() { tone(196, 0.5, 'triangle', 0.18); tone(233, 0.5, 'triangle', 0.14, 0.05); tone(277, 0.7, 'triangle', 0.12, 0.1); },
};
