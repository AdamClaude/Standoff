// Procedural canvas textures — no image files, nothing to license.
import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dark varnished wood planks. */
export function woodTexture(base = '#3a2416', seed = 1) {
  const [c, g] = canvas(512, 512);
  const r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  const plank = 64;
  for (let y = 0; y < 512; y += plank) {
    const shade = (r() - 0.5) * 30;
    g.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 200 : 0},${shade > 0 ? 140 : 0},${Math.abs(shade) / 255})`;
    g.fillRect(0, y, 512, plank);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(20,10,4,${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      const yy = y + r() * plank;
      g.moveTo(0, yy);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, yy + Math.sin(x / 60 + r() * 2) * 3);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y, 512, 2);
  }
  return tex(c, 2);
}

/** Worn green baize with a soft vignette and stains. */
export function feltTexture() {
  const [c, g] = canvas(1024, 1024);
  const r = rand(7);
  const grad = g.createRadialGradient(512, 512, 60, 512, 512, 560);
  grad.addColorStop(0, '#2c6b53'); grad.addColorStop(0.75, '#1c4a3a'); grad.addColorStop(1, '#0f2a21');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 1024);
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 9; i++) { // drink rings & burns
    g.strokeStyle = `rgba(20,30,20,${0.15 + r() * 0.2})`;
    g.lineWidth = 3 + r() * 5;
    g.beginPath(); g.arc(150 + r() * 720, 150 + r() * 720, 24 + r() * 30, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = 'rgba(226,178,58,0.35)'; g.lineWidth = 4;
  g.beginPath(); g.arc(512, 512, 330, 0, Math.PI * 2); g.stroke();
  return tex(c, 1);
}

/** Grimy brick wall. */
export function brickTexture() {
  const [c, g] = canvas(512, 512);
  const r = rand(3);
  g.fillStyle = '#1b1416'; g.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 28;
  for (let row = 0; row < 512 / bh + 1; row++) {
    for (let col = -1; col < 512 / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      const l = 22 + r() * 16;
      g.fillStyle = `hsl(${8 + r() * 10}, ${30 + r() * 20}%, ${l}%)`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)'); grad.addColorStop(1, 'rgba(0,0,0,0.1)');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  return tex(c, 3);
}

/** Painting on the wall / loot painting: a small abstract landscape. */
export function paintingTexture(seed: number) {
  const [c, g] = canvas(256, 192);
  const r = rand(seed * 97 + 11);
  const hue = Math.floor(r() * 360);
  const sky = g.createLinearGradient(0, 0, 0, 192);
  sky.addColorStop(0, `hsl(${hue},45%,62%)`); sky.addColorStop(1, `hsl(${(hue + 40) % 360},50%,30%)`);
  g.fillStyle = sky; g.fillRect(0, 0, 256, 192);
  g.fillStyle = `hsl(${(hue + 180) % 360},50%,70%)`;
  g.beginPath(); g.arc(60 + r() * 140, 40 + r() * 40, 16 + r() * 14, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 3; i++) {
    g.fillStyle = `hsl(${(hue + 90 + i * 30) % 360},${35 + i * 10}%,${30 - i * 7}%)`;
    g.beginPath(); g.moveTo(0, 192);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, 120 + i * 22 + Math.sin(x / 30 + r() * 3) * 18);
    g.lineTo(256, 192); g.fill();
  }
  return tex(c, 1);
}

/** Front face of a bullet card. */
export function bulletCardTexture(kind: 'BANG' | 'CLICK') {
  const [c, g] = canvas(256, 384);
  const bang = kind === 'BANG';
  g.fillStyle = bang ? '#8f1d16' : '#3a3740'; g.fillRect(0, 0, 256, 384);
  g.strokeStyle = bang ? '#f3c66b' : '#a9a6ae'; g.lineWidth = 10; g.strokeRect(12, 12, 232, 360);
  g.lineWidth = 2; g.strokeRect(26, 26, 204, 332);
  // cartridge
  g.save(); g.translate(128, 170);
  g.fillStyle = '#d8b04e'; g.fillRect(-26, -30, 52, 120);
  g.fillStyle = '#b88c32'; g.fillRect(-30, 86, 60, 14);
  if (bang) { g.fillStyle = '#c8693a'; g.beginPath(); g.moveTo(-26, -30); g.quadraticCurveTo(0, -120, 26, -30); g.fill(); }
  else { g.fillStyle = '#c9a14a'; g.beginPath(); g.moveTo(-26, -30); g.lineTo(-12, -62); g.lineTo(0, -44); g.lineTo(12, -62); g.lineTo(26, -30); g.fill(); }
  g.restore();
  g.fillStyle = bang ? '#ffe7a8' : '#d8d6dc';
  g.font = 'bold 64px "Limelight", "Barlow Condensed", serif'; g.textAlign = 'center';
  g.fillText(bang ? 'BANG' : 'click', 128, 340);
  return tex(c, 1);
}

export function cardBackTexture() {
  const [c, g] = canvas(256, 384);
  g.fillStyle = '#231b2c'; g.fillRect(0, 0, 256, 384);
  g.strokeStyle = '#e2b23a'; g.lineWidth = 8; g.strokeRect(14, 14, 228, 356);
  g.strokeStyle = 'rgba(226,178,58,0.35)'; g.lineWidth = 2;
  for (let i = -384; i < 384; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 384, 384); g.stroke(); }
  g.fillStyle = '#231b2c'; g.beginPath(); g.arc(128, 192, 54, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e2b23a'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#e2b23a'; g.font = 'bold 60px "Limelight", serif'; g.textAlign = 'center'; g.fillText('S', 128, 212);
  return tex(c, 1);
}

/** Banknote face for cash stacks. */
export function cashTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#7fae6b'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#3e6b33'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#5a8a4a'; g.beginPath(); g.ellipse(128, 64, 30, 38, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e7d8b0'; g.fillRect(104, 0, 48, 128);
  return tex(c, 1);
}

/** Text label drawn to a canvas (used for name tags and loot tags). */
export function labelCanvas(w: number, h: number) {
  return canvas(w, h);
}

export function neonTexture(text: string, color: string) {
  const [c, g] = canvas(512, 128);
  g.font = '400 84px "Limelight", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color;
  g.fillText(text, 256, 68); g.fillText(text, 256, 68);
  g.shadowBlur = 0; g.fillStyle = '#fff6e8'; g.fillText(text, 256, 68);
  return tex(c, 1);
}

// ── Mob back room ──────────────────────────────────────────────────────────

const stripeCache = new Map<string, THREE.Texture>();
/** Suit cloth: base colour with optional chalk pinstripes and a little weave noise. */
export function suitTexture(color: string, pinstripe: boolean) {
  const key = color + pinstripe;
  const hit = stripeCache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256, 256);
  const r = rand(color.length * 31 + (pinstripe ? 7 : 3));
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  if (pinstripe) {
    const light = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
    g.strokeStyle = light ? 'rgba(235,228,210,0.32)' : 'rgba(20,16,14,0.35)';
    g.lineWidth = 2;
    for (let x = 8; x < 256; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  }
  const t = tex(c, 2);
  stripeCache.set(key, t);
  return t;
}

/** Dark damask wallpaper. */
export function wallpaperTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#2a0f12'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(120,60,40,0.22)';
  for (let y = 0; y < 512; y += 128) for (let x = 0; x < 512; x += 128) {
    const ox = (y / 128) % 2 ? 64 : 0;
    g.save(); g.translate(x + ox + 64, y + 64);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(0, -8); g.bezierCurveTo(26, -40, 46, -10, 12, 6); g.bezierCurveTo(30, 20, 10, 44, 0, 30); g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (let x = 0; x < 512; x += 64) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 2, 512); }
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  return tex(c, 3);
}

/** Black and cream art-deco floor tiles, worn. */
export function tileTexture() {
  const [c, g] = canvas(512, 512);
  const r = rand(19);
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dark = (x + y) % 2 === 0;
    const l = dark ? 9 + r() * 4 : 62 + r() * 8;
    g.fillStyle = `hsl(35, ${dark ? 8 : 22}%, ${l}%)`;
    g.fillRect(x * s, y * s, s, s);
  }
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * 512, r() * 512, 2 + r() * 6, 1 + r() * 3); }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
  return tex(c, 4);
}

/** Red and cream checked tablecloth. */
export function clothTexture() {
  const [c, g] = canvas(512, 512);
  const r = rand(41);
  g.fillStyle = '#d9cdb0'; g.fillRect(0, 0, 512, 512);
  const n = 16, s = 512 / n;
  g.fillStyle = 'rgba(150,22,26,0.55)';
  for (let i = 0; i < n; i += 2) { g.fillRect(i * s, 0, s, 512); g.fillRect(0, i * s, 512, s); }
  g.fillStyle = 'rgba(110,10,14,0.35)';
  for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) g.fillRect(x * s, y * s, s, s);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const k = (r() - 0.5) * 16; img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 6; i++) { // wine stains
    g.fillStyle = `rgba(90,10,30,${0.15 + r() * 0.15})`;
    g.beginPath(); g.ellipse(80 + r() * 350, 80 + r() * 350, 18 + r() * 26, 12 + r() * 20, r() * 3, 0, Math.PI * 2); g.fill();
  }
  return tex(c, 1);
}

/** Night city through a rainy window: dark skyline, lit windows and a neon sign. */
export function nightWindowTexture() {
  const [c, g] = canvas(512, 384);
  const r = rand(77);
  const sky = g.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, '#0b1424'); sky.addColorStop(1, '#1d2a44');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 9; i++) {
    const w = 40 + r() * 70, h = 120 + r() * 220, x = i * 60 - 20 + r() * 20;
    g.fillStyle = `hsl(220, 20%, ${6 + r() * 6}%)`;
    g.fillRect(x, 384 - h, w, h);
    for (let yy = 384 - h + 10; yy < 384; yy += 16) for (let xx = x + 6; xx < x + w - 6; xx += 12) {
      if (r() < 0.35) { g.fillStyle = r() < 0.8 ? 'rgba(255,200,120,0.85)' : 'rgba(170,200,255,0.8)'; g.fillRect(xx, yy, 6, 8); }
    }
  }
  g.save();
  g.font = 'bold 54px "Limelight", serif'; g.textAlign = 'center';
  g.shadowColor = '#ff2a4a'; g.shadowBlur = 26; g.fillStyle = '#ff5a6e';
  g.fillText('HOTEL', 380, 120); g.fillText('HOTEL', 380, 120);
  g.restore();
  return tex(c, 1);
}

/** Rain streaks, tiled and scrolled. */
export function rainTexture() {
  const [c, g] = canvas(256, 256);
  const r = rand(5);
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    const x = r() * 256, y = r() * 256, l = 10 + r() * 24;
    g.strokeStyle = `rgba(190,210,255,${0.15 + r() * 0.35})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + l); g.stroke();
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(200,220,255,0.35)'; g.beginPath(); g.arc(r() * 256, r() * 256, 1 + r() * 2, 0, Math.PI * 2); g.fill(); }
  return tex(c, 1, false);
}

/** Light cookie for the window spotlight: venetian blind stripes. */
export function blindsTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff';
  for (let y = 20; y < 236; y += 22) g.fillRect(24, y, 208, 12);
  g.fillStyle = '#000'; g.fillRect(124, 0, 8, 256);
  return tex(c, 1);
}

/** Oil portrait of an unnamed Don (silhouette in a fedora). */
export function donPortraitTexture() {
  const [c, g] = canvas(256, 320);
  const bg = g.createRadialGradient(128, 130, 20, 128, 160, 200);
  bg.addColorStop(0, '#6b4a2a'); bg.addColorStop(1, '#1c120a');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#120c08';
  g.beginPath(); g.ellipse(128, 300, 110, 90, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#c99068'; g.beginPath(); g.ellipse(128, 150, 48, 60, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#100b08'; g.beginPath(); g.ellipse(128, 100, 92, 14, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(84, 52, 88, 50);
  g.fillStyle = '#7a1414'; g.fillRect(84, 86, 88, 10);
  g.fillStyle = '#2a1a10'; g.fillRect(100, 140, 22, 6); g.fillRect(134, 140, 22, 6);
  g.fillStyle = '#3a2418'; g.beginPath(); g.ellipse(128, 178, 22, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8e0cc'; g.beginPath(); g.moveTo(108, 230); g.lineTo(128, 290); g.lineTo(148, 230); g.fill();
  g.fillStyle = '#7a1414'; g.fillRect(124, 236, 8, 46);
  return tex(c, 1);
}

/** Cartoon blood splat with drips; a few variants. */
const splats: THREE.Texture[] = [];
export function bloodTexture(i: number) {
  const k = i % 4;
  if (splats[k]) return splats[k];
  const [c, g] = canvas(256, 256);
  const r = rand(k * 13 + 3);
  g.fillStyle = '#8a0b0b';
  g.beginPath(); g.arc(128, 128, 44 + r() * 14, 0, Math.PI * 2); g.fill();
  for (let i2 = 0; i2 < 14; i2++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 70, s = 6 + r() * 16;
    g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, s, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.9; g.strokeStyle = '#8a0b0b';
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * d, 128 + Math.sin(a) * d); g.stroke();
  }
  g.fillStyle = 'rgba(255,90,90,0.25)';
  g.beginPath(); g.arc(112, 112, 16, 0, Math.PI * 2); g.fill();
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  splats[k] = t;
  return t;
}

let smokeTex: THREE.Texture | null = null;
export function smokeTexture() {
  if (smokeTex) return smokeTex;
  const [c, g] = canvas(128, 128);
  const r = rand(9);
  for (let i = 0; i < 18; i++) {
    const x = 34 + r() * 60, y = 34 + r() * 60, rad = 14 + r() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  }
  smokeTex = tex(c, 1);
  smokeTex.wrapS = smokeTex.wrapT = THREE.ClampToEdgeWrapping;
  return smokeTex;
}

/** Comic-book burst with a word in it. */
export function burstTexture(word: string, fill: string, ink: string) {
  const [c, g] = canvas(512, 384);
  g.translate(256, 192);
  g.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, rr = i % 2 ? 120 : 185 + (i % 4) * 8;
    g.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.92);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.lineWidth = 12; g.strokeStyle = ink; g.stroke();
  g.font = '400 118px "Limelight", "Barlow Condensed", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 16; g.strokeStyle = ink; g.strokeText(word, 0, 6);
  g.fillStyle = '#fff6d6'; g.fillText(word, 0, 6);
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The gag flag that pops out of an empty gun. */
export function flagTexture(word: string) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#a81d14'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 118);
  g.font = '400 64px "Limelight", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#a81d14'; g.fillText(word, 128, 68);
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Speech bubble sprite canvas. */
export function bubbleCanvas(text: string) {
  const [c, g] = canvas(512, 200);
  g.font = '700 52px "Barlow Condensed", "Cairo", sans-serif';
  const w = Math.min(480, g.measureText(text).width + 70);
  const x = 256 - w / 2;
  g.fillStyle = '#f6efdc'; g.strokeStyle = '#16131a'; g.lineWidth = 7;
  g.beginPath();
  g.moveTo(x + 30, 20); g.lineTo(x + w - 30, 20); g.quadraticCurveTo(x + w, 20, x + w, 60);
  g.lineTo(x + w, 110); g.quadraticCurveTo(x + w, 145, x + w - 30, 145);
  g.lineTo(290, 145); g.lineTo(250, 190); g.lineTo(256, 145);
  g.lineTo(x + 30, 145); g.quadraticCurveTo(x, 145, x, 110); g.lineTo(x, 60); g.quadraticCurveTo(x, 20, x + 30, 20);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#16131a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let t = text;
  while (t.length > 1 && g.measureText(t).width > 430) t = t.slice(0, -2) + '…';
  g.fillText(t, 256, 84);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  return out;
}

export function starTexture() {
  const [c, g] = canvas(64, 64);
  g.translate(32, 32); g.fillStyle = '#ffe066'; g.strokeStyle = '#7a5a00'; g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 11 : 26; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
