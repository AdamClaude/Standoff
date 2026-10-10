// All sound is synthesised live with Web Audio: no files, nothing to license.
// Buses: sfx (with a room reverb send), music (a small noir jazz combo), ambience (rain + vinyl crackle).
import { store } from './storage';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let ambBus: GainNode;
let reverbSend: GainNode;
let noiseBuf: AudioBuffer;

let volume = Number(store.get('standoff.volume') ?? '0.8');
let muted = store.get('standoff.muted') === '1';
let musicOn = store.get('standoff.music') !== '0';

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = volume;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.55 : 0; musicBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    // Room reverb: a generated impulse response (dark, ~2s tail).
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.2, 3.2);
    const verbTone = ctx.createBiquadFilter(); verbTone.type = 'lowpass'; verbTone.frequency.value = 3200;
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.5;
    reverbSend.connect(verb); verb.connect(verbTone); verbTone.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function impulse(c: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export const sound = {
  get muted() { return muted; },
  setMuted(m: boolean) { muted = m; store.set('standoff.muted', m ? '1' : '0'); if (m) ctx?.suspend(); else { ac(); music.start(); } },
  get volume() { return volume; },
  setVolume(v: number) { volume = v; store.set('standoff.volume', String(v)); if (ctx) master.gain.value = v; },
  get music() { return musicOn; },
  setMusic(on: boolean) {
    musicOn = on; store.set('standoff.music', on ? '1' : '0');
    if (ctx) musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.3);
    if (on) music.start();
  },
  /** Call from a user gesture: browsers only allow audio after one. */
  unlock() { if (ac()) { music.start(); ambience.start(); } },
};

// ── building blocks ─────────────────────────────────────────────────────────

type Dest = 'sfx' | 'music' | 'amb';
const bus = (d: Dest) => (d === 'music' ? musicBus : d === 'amb' ? ambBus : sfxBus);

function env(c: AudioContext, peak: number, attack: number, decay: number, at: number, dest: Dest = 'sfx', verb = 0) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(bus(dest));
  if (verb > 0) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(reverbSend); }
  return g;
}

function noise(c: AudioContext, at: number, dur: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.start(at, Math.random() * 1.5, dur + 0.05);
  return src;
}

function filt(c: AudioContext, type: BiquadFilterType, f: number, q = 0.7) {
  const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
}

function osc(c: AudioContext, type: OscillatorType, f: number, at: number, dur: number, out: AudioNode) {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
  o.connect(out); o.start(at); o.stop(at + dur + 0.05);
  return o;
}

const now = () => (ctx ? ctx.currentTime : 0);

// ── sound effects ───────────────────────────────────────────────────────────

export const sfx = {
  /** Wooden clock tick for the countdown. */
  tick() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.03); const b = filt(c, 'bandpass', 2400, 6);
    n.connect(b); b.connect(env(c, 0.35, 0.001, 0.03, t, 'sfx', 0.2));
  },
  go() { this.sting(); },
  /** Revolver hammer being cocked: two metallic clicks. */
  cock() {
    const c = ac(); if (!c) return; const t = now();
    for (const [dt, f, v] of [[0, 3200, 0.5], [0.085, 2400, 0.6]] as const) {
      const n = noise(c, t + dt, 0.04); const b = filt(c, 'bandpass', f, 9);
      n.connect(b); b.connect(env(c, v, 0.001, 0.05, t + dt, 'sfx', 0.25));
      osc(c, 'square', f * 0.7, t + dt, 0.03, env(c, 0.04, 0.001, 0.025, t + dt));
    }
  },
  /** Quick-draw: cloth whoosh out of the jacket, then the hammer. */
  draw() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.22); const b = filt(c, 'bandpass', 700, 1.2);
    b.frequency.setValueAtTime(500, t); b.frequency.exponentialRampToValueAtTime(3000, t + 0.18);
    n.connect(b); b.connect(env(c, 0.35, 0.04, 0.16, t));
    setTimeout(() => this.cock(), 180);
  },
  /** Big gunshot: crack + body + sub thump + room tail. */
  bang(power = 1) {
    const c = ac(); if (!c) return; const t = now();
    const crack = noise(c, t, 0.05); const hp = filt(c, 'highpass', 1800);
    crack.connect(hp); hp.connect(env(c, 1.0 * power, 0.001, 0.06, t, 'sfx', 0.6));
    const body = noise(c, t, 0.6); const lp = filt(c, 'lowpass', 5000);
    lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.45);
    body.connect(lp); lp.connect(env(c, 1.1 * power, 0.002, 0.5, t, 'sfx', 0.9));
    const sub = c.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(110, t); sub.frequency.exponentialRampToValueAtTime(32, t + 0.35);
    sub.connect(env(c, 0.9 * power, 0.002, 0.4, t)); sub.start(t); sub.stop(t + 0.5);
    // shell casing tinkling on the table
    for (let i = 0; i < 3; i++) {
      const tt = t + 0.35 + i * 0.09 + Math.random() * 0.03;
      osc(c, 'sine', 5200 + Math.random() * 900, tt, 0.06, env(c, 0.06 / (i + 1), 0.001, 0.06, tt));
    }
  },
  /** Bullet whizzing past. */
  whizz() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.25); const b = filt(c, 'bandpass', 3000, 8);
    b.frequency.setValueAtTime(4500, t); b.frequency.exponentialRampToValueAtTime(900, t + 0.22);
    n.connect(b); b.connect(env(c, 0.25, 0.02, 0.2, t));
  },
  /** Dry fire. */
  click() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.02); const b = filt(c, 'highpass', 3500);
    n.connect(b); b.connect(env(c, 0.45, 0.001, 0.025, t, 'sfx', 0.3));
  },
  /** The gag flag springing out of the barrel. */
  boing() {
    const c = ac(); if (!c) return; const t = now() + 0.04;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(i % 2 ? 260 : 420 - i * 15, t + i * 0.04);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.5);
    o.connect(env(c, 0.22, 0.005, 0.5, t, 'sfx', 0.2)); o.start(t); o.stop(t + 0.6);
  },
  /** Wet, cartoonish impact. */
  splat() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.25); const lp = filt(c, 'lowpass', 900, 2);
    lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    n.connect(lp); lp.connect(env(c, 0.8, 0.002, 0.22, t, 'sfx', 0.3));
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    o.connect(env(c, 0.45, 0.002, 0.2, t)); o.start(t); o.stop(t + 0.25);
  },
  /** Hat flying off. */
  hatPop() {
    const c = ac(); if (!c) return; const t = now();
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
    o.connect(env(c, 0.15, 0.01, 0.15, t)); o.start(t); o.stop(t + 0.2);
  },
  /** Chair going over with a body in it. */
  crash() {
    const c = ac(); if (!c) return; const t = now();
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.07 + Math.random() * 0.03;
      const n = noise(c, tt, 0.08); const b = filt(c, 'bandpass', 500 + Math.random() * 900, 3);
      n.connect(b); b.connect(env(c, 0.5 / (1 + i * 0.4), 0.002, 0.09, tt, 'sfx', 0.4));
    }
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t + 0.05); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    o.connect(env(c, 0.8, 0.005, 0.3, t + 0.05)); o.start(t + 0.05); o.stop(t + 0.4);
  },
  /** Comic slide whistle for a gangster going down for good. */
  whistle() {
    const c = ac(); if (!c) return; const t = now();
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.8);
    const vib = c.createOscillator(); vib.frequency.value = 7; const vg = c.createGain(); vg.gain.value = 18;
    vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + 0.9);
    o.connect(env(c, 0.2, 0.03, 0.8, t, 'sfx', 0.3)); o.start(t); o.stop(t + 0.9);
  },
  /** Cash register + coins. */
  cash() {
    const c = ac(); if (!c) return; const t = now();
    for (const [f, d] of [[1318, 0], [1760, 0.07], [2637, 0.07]] as const) osc(c, 'sine', f, t + d, 0.5, env(c, 0.12, 0.002, 0.45, t + d, 'sfx', 0.2));
    for (let i = 0; i < 5; i++) { const tt = t + 0.12 + i * 0.05; osc(c, 'triangle', 3000 + Math.random() * 2500, tt, 0.05, env(c, 0.05, 0.001, 0.05, tt)); }
  },
  swoosh() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.3); const b = filt(c, 'bandpass', 600, 1.5);
    b.frequency.setValueAtTime(400, t); b.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
    n.connect(b); b.connect(env(c, 0.12, 0.06, 0.22, t));
  },
  thud() {
    const c = ac(); if (!c) return; const t = now();
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    o.connect(env(c, 0.6, 0.003, 0.25, t, 'sfx', 0.2)); o.start(t); o.stop(t + 0.3);
  },
  /** "Hold your ground" — a short brassy swell instead of a shout. */
  banzai() {
    const c = ac(); if (!c) return; const t = now();
    const lp = filt(c, 'lowpass', 1400, 1); lp.connect(env(c, 0.12, 0.08, 0.35, t, 'sfx', 0.3));
    for (const f of [196, 247, 294]) osc(c, 'sawtooth', f, t, 0.45, lp);
  },
  /** Noir stinger: dun… dun… DUNN. */
  sting() {
    const c = ac(); if (!c) return; const t = now();
    const chords = [[98, 117, 147], [92.5, 117, 139], [87, 104, 131, 156]];
    chords.forEach((ch, i) => {
      const at = t + i * 0.32; const dur = i === 2 ? 1.2 : 0.22;
      const lp = filt(c, 'lowpass', 900 + i * 300, 1.5);
      lp.connect(env(c, i === 2 ? 0.22 : 0.14, 0.02, dur, at, 'sfx', 0.6));
      for (const f of ch) osc(c, 'sawtooth', f, at, dur + 0.1, lp);
    });
  },
  heartbeat(intensity: number) {
    const c = ac(); if (!c) return; const t = now();
    const k = Math.min(1, 0.3 + intensity * 0.25);
    for (const [d, v] of [[0, 0.7], [0.22, 0.5]] as const) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.12);
      o.connect(env(c, v * k, 0.005, 0.15, t + d)); o.start(t + d); o.stop(t + d + 0.2);
    }
  },
  /** Faint hammer tick when you mark a target (your gun is still holstered). */
  mark() {
    const c = ac(); if (!c) return; const t = now();
    const n = noise(c, t, 0.02); const b = filt(c, 'bandpass', 4200, 10);
    n.connect(b); b.connect(env(c, 0.18, 0.001, 0.02, t));
  },
  clink() {
    const c = ac(); if (!c) return; const t = now();
    for (const f of [3100, 4650]) osc(c, 'sine', f, t, 0.25, env(c, 0.04, 0.001, 0.25, t, 'sfx', 0.3));
  },
  thunder() {
    const c = ac(); if (!c) return; const t = now() + 0.4 + Math.random() * 0.8;
    const n = noise(c, t, 2.5); const lp = filt(c, 'lowpass', 300, 0.8);
    n.connect(lp); lp.connect(env(c, 0.35, 0.15, 2.2, t, 'amb', 0.4));
  },
};

// ── Ambience: rain on the window and a dusty record ─────────────────────────

const ambience = {
  started: false,
  start() {
    const c = ac(); if (!c || this.started) return;
    this.started = true;
    const rain = c.createBufferSource(); rain.buffer = noiseBuf; rain.loop = true;
    const hp = filt(c, 'highpass', 500); const lp = filt(c, 'lowpass', 2600);
    const g = c.createGain(); g.gain.value = 0.07;
    rain.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ambBus); rain.start();
    // vinyl crackle: sparse clicks
    const crackle = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = crackle.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.015;
    const cr = c.createBufferSource(); cr.buffer = crackle; cr.loop = true;
    const cg = c.createGain(); cg.gain.value = 0.18; const cb = filt(c, 'bandpass', 2500, 0.6);
    cr.connect(cb); cb.connect(cg); cg.connect(musicBus); cr.start();
  },
};

// ── Music: a small noir jazz combo, generated bar by bar ───────────────────

type Mood = 'normal' | 'tense' | 'silent';
const NOTE = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// C minor ii-V cycle with a turnaround: chord tones as MIDI numbers (bass register roots).
const PROG: { root: number; tones: number[] }[] = [
  { root: 36, tones: [0, 3, 7, 10] },  // Cm7
  { root: 41, tones: [0, 3, 7, 10] },  // Fm7
  { root: 38, tones: [0, 3, 6, 10] },  // Dm7b5
  { root: 43, tones: [0, 4, 7, 10] },  // G7
  { root: 36, tones: [0, 3, 7, 10] },  // Cm7
  { root: 44, tones: [0, 4, 7, 10] },  // Ab7
  { root: 38, tones: [0, 3, 6, 10] },  // Dm7b5
  { root: 43, tones: [0, 4, 7, 10, 13] }, // G7b9
];
const BLUES = [0, 3, 5, 6, 7, 10, 12, 15];

export const music = {
  started: false,
  mood: 'normal' as Mood,
  drums: null as GainNode | null,
  keys: null as GainNode | null,
  lead: null as GainNode | null,
  bass: null as GainNode | null,
  next: 0,
  beat: 0,
  timer: 0 as unknown as ReturnType<typeof setInterval>,
  start() {
    const c = ac(); if (!c || this.started || !musicOn) return;
    this.started = true;
    this.drums = c.createGain(); this.drums.connect(musicBus);
    this.keys = c.createGain(); this.keys.connect(musicBus);
    this.lead = c.createGain(); this.lead.connect(musicBus);
    this.bass = c.createGain(); this.bass.connect(musicBus);
    const s = c.createGain(); s.gain.value = 0.25; this.keys.connect(s); this.lead.connect(s); s.connect(reverbSend);
    this.next = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 60);
  },
  setMood(m: Mood) {
    if (!ctx || !this.drums) { this.mood = m; return; }
    if (m === this.mood) return;
    this.mood = m;
    const t = ctx.currentTime;
    const set = (g: GainNode | null, v: number, tc = 0.25) => g?.gain.setTargetAtTime(v, t, tc);
    if (m === 'normal') { set(this.drums, 1); set(this.keys, 1); set(this.lead, 1); set(this.bass, 1); }
    if (m === 'tense') { set(this.drums, 0.0, 0.15); set(this.keys, 0.25); set(this.lead, 0); set(this.bass, 0.9); }
    if (m === 'silent') { set(this.drums, 0, 0.05); set(this.keys, 0, 0.05); set(this.lead, 0, 0.05); set(this.bass, 0, 0.05); }
  },
  schedule() {
    const c = ctx; if (!c || !musicOn) return;
    const spb = 60 / 92; // seconds per beat
    while (this.next < c.currentTime + 0.25) {
      this.playBeat(c, this.next, this.beat, spb);
      this.next += spb;
      this.beat++;
    }
  },
  playBeat(c: AudioContext, t: number, beat: number, spb: number) {
    const bar = Math.floor(beat / 4) % PROG.length;
    const pos = beat % 4;
    const ch = PROG[bar];
    const nextCh = PROG[(bar + 1) % PROG.length];
    const swing = spb * 0.66;

    // Walking bass: root on 1, chord tones, chromatic approach on 4.
    let m = ch.root;
    if (pos === 1) m = ch.root + ch.tones[1 + (beat % 2)];
    if (pos === 2) m = ch.root + ch.tones[2];
    if (pos === 3) m = nextCh.root + (Math.random() < 0.5 ? -1 : 1);
    if (this.mood === 'tense' && pos !== 0) m = -1;
    if (m > 0) {
      const g = env(c, 0.5, 0.008, spb * 0.9, t, 'music');
      g.disconnect(); g.connect(this.bass!);
      const lp = filt(c, 'lowpass', 700, 1); lp.connect(g);
      osc(c, 'triangle', NOTE(m), t, spb, lp);
      osc(c, 'sine', NOTE(m), t, spb, lp);
    }

    // Ride cymbal "ding, ding-a ding" + hat foot on 2 & 4 + brushes.
    const ride = (at: number, v: number, dec: number) => {
      const n = noise(c, at, dec); const hp = filt(c, 'highpass', 7000);
      const g = env(c, v, 0.002, dec, at, 'music'); g.disconnect(); g.connect(this.drums!);
      n.connect(hp); hp.connect(g);
    };
    ride(t, 0.05, 0.35);
    if (pos === 1 || pos === 3) {
      ride(t + swing, 0.03, 0.15);
      const n = noise(c, t, 0.2); const bp = filt(c, 'bandpass', 1800, 0.7);
      const g = env(c, 0.04, 0.02, 0.18, t, 'music'); g.disconnect(); g.connect(this.drums!);
      n.connect(bp); bp.connect(g);
    }

    // Piano comping: rootless voicing stabs on random off-beats.
    if (Math.random() < (pos === 0 ? 0.25 : 0.4)) {
      const at = t + (Math.random() < 0.6 ? swing : 0);
      const lp = filt(c, 'lowpass', 2200, 0.8);
      const g = env(c, 0.07, 0.004, 0.55, at, 'music'); g.disconnect(); g.connect(this.keys!);
      lp.connect(g);
      for (const tn of ch.tones.slice(1)) osc(c, 'triangle', NOTE(ch.root + 24 + tn), at, 0.6, lp);
    }

    // Vibraphone line every other phrase: blues scale, swung eighths.
    const phrase = Math.floor(beat / 32) % 2;
    if (phrase === 1 && Math.random() < 0.55) {
      for (const off of [0, swing]) {
        if (Math.random() < 0.45) continue;
        const at = t + off;
        const note = 60 + BLUES[Math.floor(Math.random() * BLUES.length)];
        const g = env(c, 0.06, 0.004, 0.9, at, 'music'); g.disconnect(); g.connect(this.lead!);
        const trem = c.createGain(); trem.gain.value = 1;
        const lfo = c.createOscillator(); lfo.frequency.value = 5.5; const lg = c.createGain(); lg.gain.value = 0.35;
        lfo.connect(lg); lg.connect(trem.gain); lfo.start(at); lfo.stop(at + 1);
        trem.connect(g);
        osc(c, 'sine', NOTE(note), at, 0.95, trem);
        osc(c, 'sine', NOTE(note) * 4, at, 0.3, env(c, 0.01, 0.002, 0.2, at, 'music'));
      }
    }
  },
};
