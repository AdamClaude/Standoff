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
