// Low-poly, chunky models built from primitives. Everything is original.
import * as THREE from 'three';
import type { Character, Extra } from '@standoff/shared';
import type { BulletKind, LootCard } from '@standoff/engine';
import {
  blindsTexture, bulletCardTexture, cardBackTexture, cashTexture, clothTexture, donPortraitTexture, nightWindowTexture,
  paintingTexture, rainTexture, suitTexture, tileTexture, wallpaperTexture, woodTexture,
} from './textures';

export const TABLE_R = 1.05;
export const TABLE_Y = 0.78;
export const SEAT_R = 1.58;
export const ROOM = 5;      // half-size of the back room
export const ROOM_H = 3.8;

const std = (color: THREE.ColorRepresentation, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });

const INK = '#16131a';
export const MAT = {
  metal: std('#2b2830', { metalness: 0.85, roughness: 0.32 }),
  metalLight: std('#6d6a73', { metalness: 0.8, roughness: 0.4 }),
  chrome: std('#c9c6cf', { metalness: 1, roughness: 0.18 }),
  grip: std('#5a2e18', { roughness: 0.45 }),
  brass: std('#c79a3c', { metalness: 0.9, roughness: 0.3 }),
  gold: std('#e2b23a', { metalness: 1, roughness: 0.25, emissive: '#3a2600', emissiveIntensity: 0.4 }),
  white: std('#f1ece2', { roughness: 0.6 }),
  ink: std(INK, { roughness: 0.5 }),
  red: std('#b8261d', { roughness: 0.5 }),
  eyeWhite: std('#f6f1e8', { roughness: 0.3 }),
  wood: std('#ffffff', { roughness: 0.55 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#dfe8ea', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1 }),
  whisky: std('#b5651d', { roughness: 0.1, transparent: true, opacity: 0.85, emissive: '#3a1a04', emissiveIntensity: 0.6 }),
  wine: std('#4a0a14', { roughness: 0.15, transparent: true, opacity: 0.9 }),
  blood: std('#8a0b0b', { roughness: 0.3, metalness: 0.1, emissive: '#2a0000', emissiveIntensity: 0.5 }),
  flame: new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// ── The back room ───────────────────────────────────────────────────────────

export interface RoomRig {
  fan: THREE.Group;
  rain: THREE.Texture;
  lightning: THREE.PointLight;
  windowSpot: THREE.SpotLight;
  candles: THREE.PointLight[];
  smokeSources: THREE.Object3D[];
  clockHands: THREE.Object3D[];
}

export function buildRoom(scene: THREE.Scene): RoomRig {
  const R = ROOM, H = ROOM_H;
  // Floor: worn black & cream tiles.
  const floor = mesh(new THREE.PlaneGeometry(R * 2, R * 2), std('#ffffff', { map: tileTexture(), roughness: 0.35, metalness: 0.05 }), 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const rug = mesh(new THREE.CircleGeometry(2.6, 48), std('#3a0d12', { roughness: 0.95 }), 0, 0.005, 0, false);
  rug.rotation.x = -Math.PI / 2;
  scene.add(rug);
  const rugBorder = mesh(new THREE.RingGeometry(2.4, 2.5, 64), std('#a8782a', { roughness: 0.8 }), 0, 0.007, 0, false);
  rugBorder.rotation.x = -Math.PI / 2;
  scene.add(rugBorder);

  // Walls: damask wallpaper over dark wood wainscoting.
  const paper = std('#ffffff', { map: wallpaperTexture(), roughness: 0.9 });
  const panel = std('#ffffff', { map: woodTexture('#2a150b', 13), roughness: 0.45 });
  const trim = std('#1e0f07', { roughness: 0.4 });
  const walls: [number, number, number][] = [[0, -R, 0], [0, R, Math.PI], [-R, 0, Math.PI / 2], [R, 0, -Math.PI / 2]];
  for (const [x, z, ry] of walls) {
    const w = new THREE.Group();
    w.position.set(x, 0, z);
    w.rotation.y = ry;
    const p = mesh(new THREE.PlaneGeometry(R * 2, H), paper, 0, H / 2, 0, false);
    const wain = mesh(new THREE.BoxGeometry(R * 2, 1.15, 0.06), panel, 0, 0.575, 0.03, false);
    const rail = mesh(new THREE.BoxGeometry(R * 2, 0.06, 0.1), trim, 0, 1.17, 0.05, false);
    const crown = mesh(new THREE.BoxGeometry(R * 2, 0.14, 0.12), trim, 0, H - 0.07, 0.06, false);
    const base = mesh(new THREE.BoxGeometry(R * 2, 0.14, 0.08), trim, 0, 0.07, 0.07, false);
    for (let i = -4; i <= 4; i++) w.add(mesh(new THREE.BoxGeometry(0.05, 0.9, 0.03), trim, i * 1.1, 0.58, 0.075, false));
    w.add(p, wain, rail, crown, base);
    scene.add(w);
  }
  const ceiling = mesh(new THREE.PlaneGeometry(R * 2, R * 2), std('#120a08', { roughness: 0.9 }), 0, H, 0, false);
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  // Far wall: rainy window with venetian blinds and a city outside.
  const win = new THREE.Group();
  win.position.set(0, 2.05, -R + 0.02);
  const city = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.6), new THREE.MeshBasicMaterial({ map: nightWindowTexture(), toneMapped: false }));
  city.position.z = -0.01;
  const rain = rainTexture();
  rain.repeat.set(2, 1.4);
  const rainPane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.6), new THREE.MeshBasicMaterial({ map: rain, transparent: true, depthWrite: false, toneMapped: false }));
  rainPane.position.z = 0.01;
  win.add(city, rainPane);
  const frameMat = std('#1a0d06', { roughness: 0.4 });
  win.add(mesh(new THREE.BoxGeometry(2.5, 0.1, 0.12), frameMat, 0, 0.85, 0.04), mesh(new THREE.BoxGeometry(2.5, 0.14, 0.2), frameMat, 0, -0.86, 0.08));
  win.add(mesh(new THREE.BoxGeometry(0.1, 1.8, 0.12), frameMat, -1.2, 0, 0.04), mesh(new THREE.BoxGeometry(0.1, 1.8, 0.12), frameMat, 1.2, 0, 0.04));
  win.add(mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), frameMat, 0, 0, 0.04));
  const slatMat = std('#c9bb98', { roughness: 0.6 });
  for (let i = 0; i < 14; i++) {
    const s = mesh(new THREE.BoxGeometry(2.3, 0.08, 0.008), slatMat, 0, 0.72 - i * 0.112, 0.08, false);
    s.rotation.x = 1.05; // half open
    win.add(s);
  }
  scene.add(win);
  const windowSpot = new THREE.SpotLight('#8fb0ff', 18, 9, 0.5, 0.35, 1.2);
  windowSpot.position.set(0, 2.2, -R + 0.3);
  windowSpot.target.position.set(0, 0.6, 0.6);
  windowSpot.map = blindsTexture();
  windowSpot.castShadow = true;
  windowSpot.shadow.mapSize.set(512, 512);
  scene.add(windowSpot, windowSpot.target);
  const lightning = new THREE.PointLight('#bcd2ff', 0, 12, 1);
  lightning.position.set(0, 2.2, -R - 0.5);
  scene.add(lightning);

  // Left wall: portrait of the Don, coat rack, violin case.
  const don = new THREE.Group();
  don.add(mesh(new THREE.BoxGeometry(1.0, 1.25, 0.07), MAT.gold));
  const canvasArt = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.05), std('#ffffff', { map: donPortraitTexture(), roughness: 0.8 }));
  canvasArt.position.z = 0.04;
  don.add(canvasArt);
  const picLight = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), MAT.brass, 0, 0.72, 0.12);
  picLight.rotation.z = Math.PI / 2;
  don.add(picLight);
  don.position.set(-R + 0.05, 2.2, -0.6);
  don.rotation.y = Math.PI / 2;
  scene.add(don);
  const donLight = new THREE.SpotLight('#ffcf8a', 6, 2.2, 0.8, 0.6, 1.5);
  donLight.position.set(-R + 0.3, 2.95, -0.6);
  donLight.target.position.set(-R, 2.0, -0.6);
  scene.add(donLight, donLight.target);

  const rack = new THREE.Group();
  rack.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), trim, 0, 0.95, 0));
  rack.add(mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.04, 16), trim, 0, 0.02, 0));
  const coat = mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 10), std('#4a3b2a', { roughness: 0.9 }), 0.05, 1.25, 0.05);
  coat.scale.z = 0.6;
  const rackHat = buildFedora('#2a2420', '#111', 1);
  rackHat.position.set(0, 1.92, 0);
  rackHat.rotation.z = 0.2;
  rack.add(coat, rackHat);
  rack.position.set(-R + 0.5, 0, 3.6);
  scene.add(rack);

  // Right wall: sideboard with bottles and a gramophone.
  const side = new THREE.Group();
  side.add(mesh(new THREE.BoxGeometry(2.6, 0.95, 0.55), std('#ffffff', { map: woodTexture('#3b1d0c', 17), roughness: 0.4 }), 0, 0.475, 0));
  side.add(mesh(new THREE.BoxGeometry(2.7, 0.05, 0.62), trim, 0, 0.97, 0));
  const glassCols = ['#3d6b2a', '#7a2d14', '#a8762a', '#d9cfa8', '#5a1e3a'];
  for (let i = 0; i < 7; i++) {
    const col = glassCols[i % glassCols.length];
    const h = 0.26 + (i % 3) * 0.05;
    const b = mesh(new THREE.CylinderGeometry(0.045, 0.055, h, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.1, transparent: true, opacity: 0.85, emissive: col, emissiveIntensity: 0.15 }), -1.15 + i * 0.16, 1.0 + h / 2, -0.1);
    side.add(b);
    side.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08, 8), b.material as THREE.Material, -1.15 + i * 0.16, 1.04 + h, -0.1));
  }
  const gram = new THREE.Group();
  gram.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), std('#4a2510', { roughness: 0.4 })));
  gram.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 24), MAT.ink, 0, 0.1, 0));
  const arm = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), MAT.brass, 0.1, 0.25, 0.1);
  arm.rotation.z = 0.9;
  const horn = mesh(new THREE.ConeGeometry(0.28, 0.55, 24, 1, true), std('#c79a3c', { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), 0.2, 0.55, 0.1);
  horn.rotation.z = -0.9;
  gram.add(arm, horn);
  gram.position.set(0.85, 1.07, 0);
  side.add(gram);
  side.position.set(R - 0.3, 0, -1.2);
  side.rotation.y = -Math.PI / 2;
  scene.add(side);

  // Behind you: door and a wall clock.
  const door = mesh(new THREE.BoxGeometry(1.1, 2.3, 0.08), std('#ffffff', { map: woodTexture('#24130a', 21), roughness: 0.4 }), 1.6, 1.15, R - 0.05);
  scene.add(door);
  const clock = new THREE.Group();
  clock.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 32), MAT.brass));
  const face = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.065, 32), std('#efe6cc'));
  clock.add(face);
  const hour = mesh(new THREE.BoxGeometry(0.02, 0.07, 0.12), MAT.ink, 0, 0.04, 0.05);
  const minute = mesh(new THREE.BoxGeometry(0.014, 0.07, 0.19), MAT.ink, 0, 0.045, 0.08);
  const hp = new THREE.Group(); hp.add(hour);
  const mp = new THREE.Group(); mp.add(minute);
  clock.add(hp, mp);
  clock.rotation.x = Math.PI / 2;
  clock.position.set(-1.4, 2.6, R - 0.05);
  clock.rotation.z = Math.PI;
  scene.add(clock);

  // Ceiling fan.
  const fan = new THREE.Group();
  fan.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), MAT.brass, 0, 0.2, 0));
  fan.add(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.12, 16), MAT.brass));
  for (let i = 0; i < 4; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.75, 0.012, 0.16), std('#3a1d0c', { roughness: 0.5 }), 0.45, -0.03, 0);
    const b = new THREE.Group(); b.add(blade); b.rotation.y = (i * Math.PI) / 2;
    fan.add(b);
  }
  fan.position.set(2.2, ROOM_H - 0.45, -2.0);
  scene.add(fan);

  // Bar cart by the window with a Chianti candle.
  const candles: THREE.PointLight[] = [];
  const cart = new THREE.Group();
  cart.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.5), MAT.brass, 0, 0.75, 0), mesh(new THREE.BoxGeometry(0.9, 0.04, 0.5), MAT.brass, 0, 0.35, 0));
  for (const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) cart.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.78, 6), MAT.brass, x, 0.39, z));
  const chianti = buildChianti(); chianti.position.set(-0.2, 0.77, 0);
  cart.add(chianti);
  candles.push(chianti.userData.light);
  const dec = buildDecanter(); dec.position.set(0.22, 0.77, 0.05);
  cart.add(dec);
  cart.position.set(-2.4, 0, -R + 0.6);
  scene.add(cart);

  return { fan, rain, lightning, windowSpot, candles, smokeSources: [], clockHands: [hp, mp] };
}

function buildChianti() {
  const g = new THREE.Group();
  const bottle = mesh(new THREE.SphereGeometry(0.09, 16, 12), std('#2a5a24', { roughness: 0.15, transparent: true, opacity: 0.85 }), 0, 0.1, 0);
  const straw = mesh(new THREE.CylinderGeometry(0.093, 0.08, 0.1, 16), std('#c8a35a', { roughness: 0.95 }), 0, 0.06, 0);
  const neck = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.14, 10), bottle.material as THREE.Material, 0, 0.24, 0);
  const wax = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), std('#e9dfc8'), 0, 0.33, 0);
  const candle = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10), std('#efe6cc'), 0, 0.4, 0);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), MAT.flame);
  flame.scale.y = 2;
  flame.position.y = 0.47;
  const light = new THREE.PointLight('#ffae55', 1.6, 2.4, 2);
  light.position.y = 0.5;
  g.add(bottle, straw, neck, wax, candle, flame, light);
  g.userData.light = light;
  return g;
}

function buildDecanter() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 8), MAT.glass, 0, 0.09, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.12, 8), MAT.whisky, 0, 0.065, 0));
  g.add(mesh(new THREE.SphereGeometry(0.035, 8, 8), MAT.glass, 0, 0.22, 0));
  return g;
}

export function buildWhiskyGlass() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.08, 12, 1, true), MAT.glass, 0, 0.04, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.034, 0.032, 0.04, 12), MAT.whisky, 0, 0.022, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), new THREE.MeshPhysicalMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.6, roughness: 0.1 }), 0.006, 0.04, 0.004, false));
  return g;
}

export function buildTable() {
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.06, 64), std('#2a1209', { roughness: 0.4 }), 0, TABLE_Y - 0.03, 0);
  const clothTex = clothTexture();
  const cloth = mesh(new THREE.CylinderGeometry(TABLE_R + 0.06, TABLE_R + 0.06, 0.012, 64), std('#7d705c', { map: clothTex, roughness: 0.95 }), 0, TABLE_Y + 0.006, 0);
  const skirtTex = clothTex.clone();
  skirtTex.repeat.set(6, 0.4);
  skirtTex.needsUpdate = true;
  const skirt = mesh(new THREE.CylinderGeometry(TABLE_R + 0.07, TABLE_R + 0.12, 0.34, 64, 1, true), std('#6a5e4c', { map: skirtTex, roughness: 0.95, side: THREE.DoubleSide }), 0, TABLE_Y - 0.16, 0);
  const leg = mesh(new THREE.CylinderGeometry(0.12, 0.16, TABLE_Y - 0.06, 16), std('#2a170c', { roughness: 0.5 }), 0, (TABLE_Y - 0.06) / 2, 0);
  const foot = mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 32), std('#1d1008', { roughness: 0.4, metalness: 0.2 }), 0, 0.03, 0);
  g.add(top, cloth, skirt, leg, foot);
  // Ashtray with a smouldering cigar in the middle of the action.
  const ash = new THREE.Group();
  ash.add(mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.03, 16), std('#3a3540', { metalness: 0.7, roughness: 0.3 })));
  const cig = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 8), std('#5a3018'), 0.03, 0.03, 0);
  cig.rotation.z = Math.PI / 2 - 0.15;
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff5a1a', toneMapped: false }));
  ember.position.set(0.095, 0.04, 0);
  ash.add(cig, ember);
  ash.position.set(0.18, TABLE_Y + 0.025, -0.16);
  g.add(ash);
  g.userData.smoke = ember;
  return g;
}

/** Green-glass pendant over the table. Returns the swinging group and its spotlight. */
export function buildLamp(scene: THREE.Scene) {
  const pivot = new THREE.Group();
  pivot.position.set(0, ROOM_H, 0);
  const cord = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), MAT.ink, 0, -0.55, 0);
  const shade = mesh(
    new THREE.SphereGeometry(0.42, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.6),
    std('#1d4a2c', { side: THREE.DoubleSide, roughness: 0.25, metalness: 0.2, emissive: '#0a2a14', emissiveIntensity: 0.4 }), 0, -1.38, 0,
  );
  const inner = mesh(new THREE.SphereGeometry(0.41, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), std('#f4e6c0', { side: THREE.BackSide, emissive: '#ffcf8a', emissiveIntensity: 0.6 }), 0, -1.38, 0, false);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false }));
  bulb.position.y = -1.32;
  pivot.add(cord, shade, inner, bulb);
  scene.add(pivot);

  const spot = new THREE.SpotLight('#ffcf8f', 20, 7, 0.82, 0.6, 1.6);
  spot.position.set(0, -1.3, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0006;
  spot.shadow.radius = 4;
  pivot.add(spot);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  spot.target = target;
  return { spot, lamp: pivot };
}

// ── Revolver ────────────────────────────────────────────────────────────────

/** Points along +z. Returns the group, an empty at the muzzle and the hammer. */
export function buildRevolver(scale = 1) {
  const g = new THREE.Group();
  const barrel = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 10), MAT.chrome, 0, 0.03, 0.13);
  barrel.rotation.x = Math.PI / 2;
  const rib = mesh(new THREE.BoxGeometry(0.012, 0.014, 0.22), MAT.metal, 0, 0.05, 0.13);
  const sight = mesh(new THREE.BoxGeometry(0.006, 0.014, 0.01), MAT.metal, 0, 0.062, 0.23);
  const drum = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.058, 6), MAT.metalLight, 0, 0.02, 0.0);
  drum.rotation.x = Math.PI / 2;
  const frame = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), MAT.metal, 0, 0.02, -0.02);
  const grip = mesh(new THREE.BoxGeometry(0.034, 0.12, 0.05), MAT.grip, 0, -0.055, -0.075);
  grip.rotation.x = -0.35;
  const hammer = mesh(new THREE.BoxGeometry(0.012, 0.035, 0.022), MAT.metal, 0, 0.058, -0.065);
  const guard = mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI), MAT.metal, 0, -0.012, -0.015);
  guard.rotation.y = Math.PI / 2;
  guard.rotation.z = Math.PI;
  g.add(barrel, rib, sight, drum, frame, grip, hammer, guard);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, 0.25);
  g.add(muzzle);
  g.scale.setScalar(scale);
  return { gun: g, muzzle, hammer };
}

// ── Mobsters ────────────────────────────────────────────────────────────────

export interface CharacterRig {
  root: THREE.Group;       // placed at the seat, facing +z toward the table
  tip: THREE.Group;        // pivot at the chair's back legs: tips over when whacked
  body: THREE.Group;       // everything that ducks / slumps
  head: THREE.Group;
  jaw: THREE.Group;        // opens when talking
  lids: THREE.Mesh[];      // upper eyelids for blinking
  armPivot: THREE.Group;   // right shoulder; +z points where the gun points
  leftPivot: THREE.Group;  // left shoulder holding the drink
  gun: THREE.Group;
  hammer: THREE.Mesh;
  muzzle: THREE.Object3D;
  hat: THREE.Group | null;
  hatHome: { pos: THREE.Vector3; rot: THREE.Euler } | null;
  crownAnchor: THREE.Object3D;
  smoke: THREE.Object3D | null;
  materials: THREE.MeshStandardMaterial[];
  eyes: THREE.Object3D[];
  deadEyes: THREE.Object3D[];
  ring: THREE.Mesh;
  glass: THREE.Group;
}

export function buildFedora(color: string, band: string, scale = 1, brim = 0.37) {
  const hat = new THREE.Group();
  const m = std(color, { roughness: 0.8 });
  const b = mesh(new THREE.CylinderGeometry(brim, brim, 0.02, 32), m, 0, 0.02, 0);
  b.scale.z = 0.92;
  const crown = mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.2, 24), m, 0, 0.13, 0);
  const dent = mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.21, 0);
  dent.scale.set(1, 0.35, 1.05);
  const pinch = mesh(new THREE.BoxGeometry(0.02, 0.06, 0.08), std(new THREE.Color(color).multiplyScalar(0.6)), 0, 0.23, 0.15);
  const bandM = mesh(new THREE.CylinderGeometry(0.232, 0.232, 0.05, 24), std(band, { roughness: 0.5 }), 0, 0.06, 0);
  hat.add(b, crown, dent, pinch, bandM);
  hat.scale.setScalar(scale);
  return hat;
}

export function buildCharacter(c: Character): CharacterRig {
  const has = (e: Extra) => c.extras.includes(e);
  const suitMap = suitTexture(c.color, c.pinstripe);
  const suit = std('#ffffff', { map: suitMap, roughness: 0.75 });
  const suitDark = std(new THREE.Color(c.color).multiplyScalar(0.6), { roughness: 0.6 });
  const skin = std(c.skin, { roughness: 0.55 });
  const skinDark = std(new THREE.Color(c.skin).multiplyScalar(0.8), { roughness: 0.6 });
  const shirt = std(c.shirt, { roughness: 0.8 });
  const tieM = std(c.tie, { roughness: 0.45 });
  const hairM = std(c.hair, { roughness: 0.28, metalness: 0.1 });
  const materials = [suit, suitDark, skin, skinDark, shirt];
  const W = c.build;

  const root = new THREE.Group();
  const tip = new THREE.Group();
  tip.position.set(0, 0, -0.45);
  root.add(tip);
  const seated = new THREE.Group();
  seated.position.set(0, 0, 0.45);
  tip.add(seated);
  const body = new THREE.Group();
  seated.add(body);

  // Chair: dark wood with a red leather seat.
  const chairMat = std('#2a140a', { roughness: 0.45 });
  const leather = std('#5a1414', { roughness: 0.6 });
  seated.add(mesh(new THREE.BoxGeometry(0.62, 0.08, 0.55), leather, 0, 0.5, -0.12));
  const back = mesh(new THREE.BoxGeometry(0.64, 0.82, 0.07), chairMat, 0, 0.93, -0.42);
  back.rotation.x = -0.08;
  seated.add(back, mesh(new THREE.BoxGeometry(0.5, 0.5, 0.02), leather, 0, 0.98, -0.38).rotateX(-0.08));
  for (const [x, z] of [[-0.27, 0.12], [0.27, 0.12], [-0.27, -0.36], [0.27, -0.36]]) seated.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.5, 6), chairMat, x, 0.25, z));

  // Torso, belly and broad padded shoulders.
  const torso = mesh(new THREE.CapsuleGeometry(0.27, 0.34, 6, 16), suit, 0, 0.99, -0.08);
  torso.scale.set(1.28 * W, 1, 0.86 * Math.max(1, W * 0.95));
  const belly = mesh(new THREE.SphereGeometry(0.25, 16, 12), suit, 0, 0.8, 0.02 + (W - 1) * 0.12);
  belly.scale.set(1.15 * W, 0.9, 0.9 * W);
  body.add(torso, belly);
  const shirtV = mesh(new THREE.ConeGeometry(0.13, 0.36, 3), shirt, 0, 1.09, 0.13 + (W - 1) * 0.1);
  shirtV.rotation.x = Math.PI; shirtV.scale.z = 0.25;
  body.add(shirtV);
  for (const s of [-1, 1]) {
    const lapel = mesh(new THREE.BoxGeometry(0.09, 0.34, 0.02), suitDark, s * 0.09, 1.08, 0.165 + (W - 1) * 0.1);
    lapel.rotation.z = s * 0.38; lapel.rotation.y = s * 0.25;
    body.add(lapel);
  }
  const collar = mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16, Math.PI), shirt, 0, 1.27, 0.02);
  collar.rotation.x = Math.PI / 2 + 0.3; collar.rotation.z = Math.PI;
  body.add(collar);
  if (has('bowtie')) {
    body.add(mesh(new THREE.ConeGeometry(0.04, 0.08, 8), tieM, -0.04, 1.23, 0.2).rotateZ(Math.PI / 2));
    body.add(mesh(new THREE.ConeGeometry(0.04, 0.08, 8), tieM, 0.04, 1.23, 0.2).rotateZ(-Math.PI / 2));
  } else {
    const tie = mesh(new THREE.BoxGeometry(0.065, 0.3, 0.02), tieM, 0, 1.07, 0.19 + (W - 1) * 0.1);
    tie.rotation.x = -0.18;
    body.add(tie, mesh(new THREE.BoxGeometry(0.05, 0.045, 0.03), tieM, 0, 1.22, 0.19));
  }
  if (has('carnation')) {
    for (let i = 0; i < 5; i++) body.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), MAT.red, -0.15 + (i % 3) * 0.015, 1.14 + Math.floor(i / 3) * 0.02, 0.2 + (W - 1) * 0.1, false));
  } else {
    body.add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), MAT.white, -0.15, 1.12, 0.19 + (W - 1) * 0.1, false)); // pocket square
  }
  if (has('chain')) {
    const chain = mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 24, Math.PI), MAT.gold, 0, 1.2, 0.15, false);
    chain.rotation.z = Math.PI; chain.rotation.x = 0.3;
    body.add(chain);
  }
  if (has('pearls')) {
    for (let i = 0; i < 11; i++) {
      const a = -1.2 + (i / 10) * 2.4;
      body.add(mesh(new THREE.SphereGeometry(0.02, 8, 8), MAT.white, Math.sin(a) * 0.15, 1.21 - Math.cos(a) * 0.06, 0.12 + Math.cos(a) * 0.05, false));
    }
  }
  for (const x of [-0.34, 0.34]) body.add(mesh(new THREE.SphereGeometry(0.14, 12, 10), suit, x * W, 1.19, -0.05));

  // Left arm: holds a glass of whisky on the table, sips now and then.
  const leftPivot = new THREE.Group();
  leftPivot.position.set(-0.34 * W, 1.17, -0.02);
  const lUpper = mesh(new THREE.CapsuleGeometry(0.078, 0.42, 4, 8), suit, 0, 0, 0.26);
  lUpper.rotation.x = Math.PI / 2;
  const lCuff = mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.05, 10), shirt, 0, 0, 0.5);
  lCuff.rotation.x = Math.PI / 2;
  const lHand = mesh(new THREE.SphereGeometry(0.075, 10, 10), skin, 0, -0.01, 0.56);
  const glass = buildWhiskyGlass();
  glass.position.set(0.02, -0.07, 0.6);
  leftPivot.add(lUpper, lCuff, lHand, glass);
  if (has('ring')) leftPivot.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), MAT.gold, 0.04, 0.02, 0.58, false));
  body.add(leftPivot);

  // Right arm: holstered until the draw.
  const armPivot = new THREE.Group();
  armPivot.position.set(0.34 * W, 1.17, -0.02);
  const upper = mesh(new THREE.CapsuleGeometry(0.078, 0.42, 4, 8), suit, 0, 0, 0.26);
  upper.rotation.x = Math.PI / 2;
  const cuff = mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.05, 10), shirt, 0, 0, 0.5);
  cuff.rotation.x = Math.PI / 2;
  const hand = mesh(new THREE.SphereGeometry(0.075, 10, 10), skin, 0, -0.01, 0.56);
  const { gun, muzzle, hammer } = buildRevolver(1.25);
  gun.position.set(0, 0.0, 0.6);
  gun.visible = false;
  armPivot.add(upper, cuff, hand, gun);
  body.add(armPivot);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.46, 0.0);
  body.add(head);
  body.add(mesh(new THREE.CylinderGeometry(0.11 * W, 0.13 * W, 0.12, 12), skin, 0, 1.31, 0));
  const skull = mesh(new THREE.SphereGeometry(0.23, 24, 18), skin, 0, 0.04, 0);
  skull.scale.set(1, 1.05, 0.98);
  head.add(skull);
  const jawBase = mesh(new THREE.SphereGeometry(0.205, 20, 14), skin, 0, -0.08, 0.035);
  jawBase.scale.set(1.08 * Math.min(1.15, W), 0.82, 1);
  head.add(jawBase);
  if (has('stubble') || has('goatee')) {
    const stub = mesh(
      new THREE.SphereGeometry(0.21, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1a120e', transparent: true, opacity: has('stubble') ? 0.32 : 0, roughness: 1, depthWrite: false }), 0, -0.04, 0.04, false,
    );
    stub.scale.set(1.09 * Math.min(1.15, W), 0.86, 1.02);
    head.add(stub);
  }
  const nose = mesh(new THREE.SphereGeometry(0.06, 12, 10), skinDark, 0, 0.0, 0.225);
  nose.scale.set(1, 1.25, 1.25);
  head.add(nose);
  for (const x of [-0.22, 0.22]) {
    const ear = mesh(new THREE.SphereGeometry(0.05, 10, 8), skinDark, x, 0.02, 0);
    ear.scale.set(0.6, 1, 0.8);
    head.add(ear);
  }
  const eyes: THREE.Object3D[] = [];
  const deadEyes: THREE.Object3D[] = [];
  const lids: THREE.Mesh[] = [];
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.075, 0.19);
    eye.add(mesh(new THREE.SphereGeometry(0.042, 12, 10), MAT.eyeWhite, 0, 0, 0, false));
    eye.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), MAT.ink, 0, 0, 0.03, false));
    const lid = mesh(new THREE.SphereGeometry(0.047, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin, 0, 0, 0, false);
    lid.rotation.x = 0.55; // heavy-lidded, sizing you up
    eye.add(lid);
    lids.push(lid);
    head.add(eye);
    eyes.push(eye);
    const x1 = mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), MAT.ink, x, 0.075, 0.225, false); x1.rotation.z = 0.8;
    const x2 = mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), MAT.ink, x, 0.075, 0.225, false); x2.rotation.z = -0.8;
    const dead = new THREE.Group(); dead.add(x1, x2); dead.visible = false;
    head.add(dead);
    deadEyes.push(dead);
    const brow = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.035), hairM, x, 0.14, 0.2, false);
    brow.rotation.z = x > 0 ? -0.32 : 0.32; // menacing scowl
    head.add(brow);
  }
  if (has('eyepatch')) {
    const patch = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), MAT.ink, -0.08, 0.075, 0.225, false);
    patch.rotation.x = Math.PI / 2;
    const strap = mesh(new THREE.TorusGeometry(0.235, 0.008, 6, 24), MAT.ink, 0, 0.1, 0, false);
    strap.rotation.z = 0.35; strap.rotation.y = Math.PI / 2;
    head.add(patch, strap);
    eyes[0].visible = false;
  }
  // Mouth on a hinged jaw so mobsters can talk.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.12);
  head.add(jaw);
  const lipM = has('lipstick') ? std('#a8141e', { roughness: 0.3 }) : MAT.ink;
  jaw.add(mesh(new THREE.BoxGeometry(0.11, has('lipstick') ? 0.025 : 0.016, 0.02), lipM, 0, -0.025, 0.09, false));
  head.add(mesh(new THREE.BoxGeometry(0.11, has('lipstick') ? 0.025 : 0.014, 0.02), lipM, 0, -0.095, 0.208, false));

  if (has('moustache')) {
    const m1 = mesh(new THREE.CapsuleGeometry(0.027, 0.09, 4, 8), hairM, -0.05, -0.06, 0.225, false); m1.rotation.z = 1.25;
    const m2 = mesh(new THREE.CapsuleGeometry(0.027, 0.09, 4, 8), hairM, 0.05, -0.06, 0.225, false); m2.rotation.z = -1.25;
    head.add(m1, m2);
  }
  if (has('goatee')) head.add(mesh(new THREE.ConeGeometry(0.035, 0.08, 8), hairM, 0, -0.2, 0.17, false).rotateX(Math.PI));
  let smoke: THREE.Object3D | null = null;
  if (has('cigar')) {
    const cig = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 8), std('#5a3018'), 0.07, -0.1, 0.28, false);
    cig.rotation.x = Math.PI / 2 - 0.25; cig.rotation.z = -0.35;
    const band = mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.02, 8), MAT.gold, 0.065, -0.105, 0.26, false);
    band.rotation.copy(cig.rotation);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff5a1a', toneMapped: false }));
    ember.position.set(0.11, -0.08, 0.36);
    head.add(cig, band, ember);
    smoke = ember;
  }
  if (has('toothpick')) {
    const tp = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6), std('#d9c08a'), 0.04, -0.1, 0.26, false);
    tp.rotation.x = Math.PI / 2 - 0.1; tp.rotation.z = -0.5;
    head.add(tp);
  }
  if (has('monocle')) head.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), MAT.gold, 0.08, 0.075, 0.235, false));
  if (has('scar')) { const s = mesh(new THREE.BoxGeometry(0.014, 0.16, 0.01), std('#7a2424'), 0.13, 0.04, 0.2, false); s.rotation.z = 0.5; head.add(s); }
  if (has('goldtooth')) head.add(mesh(new THREE.BoxGeometry(0.025, 0.022, 0.01), MAT.gold, 0.02, -0.105, 0.215, false));
  if (has('earring')) head.add(mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), MAT.gold, -0.225, -0.06, 0, false));
  if (has('shades')) {
    for (const x of [-0.08, 0.08]) {
      const lens = mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.015, 16), std('#050506', { roughness: 0.05, metalness: 0.9 }), x, 0.075, 0.235, false);
      lens.rotation.x = Math.PI / 2;
      head.add(lens);
    }
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), MAT.gold, 0, 0.09, 0.24, false));
    eyes.forEach(e => (e.visible = false));
  }

  // Hair
  if (c.hairStyle === 'slick') {
    const h = mesh(new THREE.SphereGeometry(0.238, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.3), hairM, 0, 0.05, -0.02);
    h.rotation.x = -0.25;
    head.add(h);
  } else if (c.hairStyle === 'bob') {
    const h = mesh(new THREE.SphereGeometry(0.255, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.6), hairM, 0, 0.04, -0.03);
    h.scale.set(1.05, 1, 1.02);
    head.add(h);
    head.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.1), hairM, 0, 0.16, 0.14).rotateX(0.3));
  } else if (c.hairStyle === 'curly') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), hairM, Math.sin(a) * 0.17, 0.14 + Math.cos(a * 2) * 0.03, Math.cos(a) * 0.17 - 0.03));
    }
  }

  // Hat
  let hat: THREE.Group | null = null;
  switch (c.hat) {
    case 'fedora': hat = buildFedora(c.hatColor, c.band, 1, c.build > 1.25 ? 0.4 : 0.37); hat.position.y = 0.17; hat.rotation.x = -0.08; hat.rotation.z = 0.06; break;
    case 'bowler': {
      hat = new THREE.Group();
      const m = std(c.hatColor, { roughness: 0.6 });
      hat.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 28), m, 0, 0.02, 0));
      hat.add(mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.02, 0));
      hat.position.y = 0.18;
      break;
    }
    case 'cap': {
      hat = new THREE.Group();
      const m = std(c.hatColor, { roughness: 0.95 });
      const top = mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, -0.02, 0.02);
      top.scale.set(1, 0.45, 1.1);
      hat.add(top, mesh(new THREE.BoxGeometry(0.28, 0.02, 0.14), m, 0, -0.01, 0.25));
      hat.position.y = 0.2;
      break;
    }
    case 'beret': {
      hat = new THREE.Group();
      const b = mesh(new THREE.SphereGeometry(0.26, 24, 12), std(c.hatColor), 0.04, 0, -0.02);
      b.scale.set(1, 0.35, 1); b.rotation.z = -0.3;
      hat.add(b);
      hat.position.y = 0.2;
      break;
    }
    case 'top': {
      hat = new THREE.Group();
      const m = std(c.hatColor);
      hat.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 28), m, 0, 0.02, 0));
      hat.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.36, 24), m, 0, 0.2, 0));
      hat.position.y = 0.18;
      break;
    }
  }
  if (hat) head.add(hat);
  const hatHome = hat ? { pos: hat.position.clone(), rot: hat.rotation.clone() } : null;

  const crownAnchor = new THREE.Object3D();
  crownAnchor.position.set(0, c.hat === 'top' ? 0.6 : hat ? 0.5 : 0.36, 0);
  head.add(crownAnchor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.46, 48),
    new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);

  return { root, tip, body, head, jaw, lids, armPivot, leftPivot, gun, hammer, muzzle, hat, hatHome, crownAnchor, smoke, materials, eyes, deadEyes, ring, glass };
}

export function buildCrown() {
  const g = new THREE.Group();
  const gold = MAT.gold.clone();
  gold.side = THREE.DoubleSide;
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.08, 20, 1, true), gold));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.ConeGeometry(0.03, 0.09, 6), MAT.gold, Math.sin(a) * 0.125, 0.08, Math.cos(a) * 0.125));
    g.add(mesh(new THREE.SphereGeometry(0.015, 8, 8), std(i % 2 ? '#d9372b' : '#3fa9f5', { emissive: i % 2 ? '#5a0a05' : '#0a2a5a' }), Math.sin(a) * 0.13, 0.0, Math.cos(a) * 0.13));
  }
  return g;
}

// ── Loot ────────────────────────────────────────────────────────────────────

let cashTex: THREE.Texture | null = null;
export function buildLoot(c: LootCard | 'NEW_BOSS', index: number): THREE.Group {
  const g = new THREE.Group();
  if (c === 'NEW_BOSS') {
    const crown = buildCrown();
    crown.scale.setScalar(1.15);
    crown.position.y = 0.05;
    g.add(crown);
    return g;
  }
  switch (c.kind) {
    case 'CASH': {
      cashTex ??= cashTexture();
      const n = c.value >= 20000 ? 4 : c.value >= 10000 ? 2 : 1;
      const top = std('#bfc9b4', { map: cashTex, roughness: 0.9 });
      const side = std('#9fae92', { roughness: 0.95 });
      for (let i = 0; i < n; i++) {
        const stack = mesh(new THREE.BoxGeometry(0.17, 0.035, 0.08), [side, side, top, side, side, side], 0, 0.018 + i * 0.036, 0);
        stack.rotation.y = (i % 2 ? 0.12 : -0.08);
        g.add(stack);
      }
      g.add(mesh(new THREE.BoxGeometry(0.02, n * 0.036 + 0.004, 0.082), std('#c79a3c'), 0, n * 0.018, 0, false)); // paper band
      break;
    }
    case 'DIAMOND': {
      const s = c.value >= 10000 ? 1.5 : c.value >= 5000 ? 1.2 : 0.9;
      const gem = mesh(
        new THREE.OctahedronGeometry(0.05 * s, 0),
        new THREE.MeshPhysicalMaterial({ color: '#bff3ff', roughness: 0.02, metalness: 0.1, clearcoat: 1, emissive: '#2a8aa8', emissiveIntensity: 0.5, flatShading: true }),
        0, 0.06 * s, 0,
      );
      gem.scale.y = 1.3;
      gem.userData.spin = true;
      g.add(gem);
      break;
    }
    case 'PAINTING': {
      const frame = mesh(new THREE.BoxGeometry(0.24, 0.18, 0.02), MAT.gold, 0, 0.1, 0);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), std('#ffffff', { map: paintingTexture(index + 1) }));
      art.position.set(0, 0.1, 0.011);
      frame.rotation.x = -0.25;
      art.rotation.x = -0.25;
      const easel = mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), std('#3b2112'), 0, 0.08, -0.05);
      easel.rotation.x = 0.35;
      g.add(frame, art, easel);
      break;
    }
    case 'CLIP': {
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.13, 0.03), MAT.metal, 0, 0.065, 0));
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), MAT.brass, -0.02 + i * 0.02, 0.145, 0));
      g.rotation.z = 0.15;
      break;
    }
    case 'FIRST_AID': {
      g.add(mesh(new THREE.BoxGeometry(0.17, 0.08, 0.12), MAT.white, 0, 0.04, 0));
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.005, 0.03), MAT.red, 0, 0.083, 0));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.005, 0.1), MAT.red, 0, 0.083, 0));
      g.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), MAT.ink, 0, 0.085, 0).rotateY(Math.PI / 2));
      break;
    }
  }
  return g;
}

// ── Bullet cards ────────────────────────────────────────────────────────────

const cardTex: Partial<Record<BulletKind | 'BACK', THREE.Texture>> = {};
const edgeMat = std('#e8dcc0');
export function buildCard(kind: BulletKind | 'BACK') {
  const front = (cardTex[kind] ??= kind === 'BACK' ? cardBackTexture() : bulletCardTexture(kind));
  const back = (cardTex.BACK ??= cardBackTexture());
  const fm = std('#d8d2c6', { map: front, roughness: 0.9 });
  const bm = std('#d8d2c6', { map: back, roughness: 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.165), [edgeMat, edgeMat, fm, bm, edgeMat, edgeMat]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function setCardFace(m: THREE.Mesh, kind: BulletKind | 'BACK') {
  const mats = m.material as THREE.MeshStandardMaterial[];
  const tex = (cardTex[kind] ??= kind === 'BACK' ? cardBackTexture() : bulletCardTexture(kind));
  if (mats[2].map !== tex) { mats[2] = std('#d8d2c6', { map: tex, roughness: 0.9 }); m.material = [...mats]; }
}

export { INK };
