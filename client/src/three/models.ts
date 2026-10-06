// Low-poly, chunky models built from primitives. Everything is original.
import * as THREE from 'three';
import type { Character } from '@standoff/shared';
import type { BulletKind, LootCard } from '@standoff/engine';
import {
  brickTexture, bulletCardTexture, cardBackTexture, cashTexture, feltTexture, neonTexture, paintingTexture, woodTexture,
} from './textures';

export const TABLE_R = 1.05;
export const TABLE_Y = 0.78;
export const SEAT_R = 1.58;

const std = (color: THREE.ColorRepresentation, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });

const INK = '#16131a';
export const MAT = {
  metal: std('#2b2830', { metalness: 0.85, roughness: 0.32 }),
  metalLight: std('#6d6a73', { metalness: 0.8, roughness: 0.4 }),
  grip: std('#4a2c1a', { roughness: 0.55 }),
  brass: std('#c79a3c', { metalness: 0.9, roughness: 0.3 }),
  gold: std('#e2b23a', { metalness: 1, roughness: 0.25, emissive: '#3a2600', emissiveIntensity: 0.4 }),
  white: std('#f1ece2', { roughness: 0.6 }),
  ink: std(INK, { roughness: 0.5 }),
  shirt: std('#cfc8ba', { roughness: 0.9 }),
  red: std('#b8261d', { roughness: 0.5 }),
  hat: std('#26222b', { roughness: 0.75 }),
  eyeWhite: std('#f6f1e8', { roughness: 0.3 }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ── Room ────────────────────────────────────────────────────────────────────

export function buildRoom(scene: THREE.Scene) {
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: woodTexture('#2b1a10', 4), roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  scene.add(floor);

  const walls = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 6.5, 4.4, 24, 1, true),
    std('#ffffff', { map: brickTexture(), side: THREE.BackSide, roughness: 0.95 }),
  );
  walls.position.y = 2.2;
  walls.receiveShadow = true;
  scene.add(walls);

  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(6.5, 24), std('#120d10', { side: THREE.BackSide }));
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = 4.4;
  scene.add(ceiling);

  // Bar counter with bottles, behind the far side of the table.
  const bar = new THREE.Group();
  const counter = mesh(new THREE.BoxGeometry(4.2, 1.1, 0.7), std('#ffffff', { map: woodTexture('#3b2112', 9) }), 0, 0.55, 0);
  const top = mesh(new THREE.BoxGeometry(4.4, 0.08, 0.85), std('#2a160b', { roughness: 0.35, metalness: 0.1 }), 0, 1.12, 0);
  const brassRail = mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 8), MAT.brass, 0, 0.25, 0.42);
  brassRail.rotation.z = Math.PI / 2;
  bar.add(counter, top, brassRail);
  const shelf = mesh(new THREE.BoxGeometry(4.2, 0.05, 0.3), std('#2a160b'), 0, 1.95, -0.9);
  const shelf2 = shelf.clone(); shelf2.position.y = 2.45;
  bar.add(shelf, shelf2);
  const glassCols = ['#3d6b2a', '#7a2d14', '#a8762a', '#2a4a6b', '#d9cfa8', '#5a1e3a'];
  for (let i = 0; i < 22; i++) {
    const col = glassCols[i % glassCols.length];
    const h = 0.22 + ((i * 37) % 10) / 60;
    const b = mesh(
      new THREE.CylinderGeometry(0.045, 0.05, h, 10),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.1, metalness: 0.2, emissive: col, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }),
      -1.95 + (i % 11) * 0.38 + (i > 10 ? 0.15 : 0), (i > 10 ? 2.48 : 1.98) + h / 2, -0.9,
    );
    b.castShadow = false;
    bar.add(b);
  }
  bar.position.set(0, 0, -5.2);
  scene.add(bar);

  // Neon sign over the bar.
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: neonTexture('STANDOFF', '#ff3b5c'), transparent: true, toneMapped: false }),
  );
  neon.position.set(0, 3.15, -6.3);
  scene.add(neon);
  const neonLight = new THREE.PointLight('#ff3b5c', 6, 6, 1.6);
  neonLight.position.set(0, 3.0, -5.6);
  scene.add(neonLight);

  // Framed paintings on the walls.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.5 + i * (Math.PI / 2) + 0.4;
    if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) < 0) continue;
    const frame = new THREE.Group();
    frame.add(mesh(new THREE.BoxGeometry(1.1, 0.85, 0.06), MAT.gold));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7), std('#ffffff', { map: paintingTexture(i + 3) }));
    art.position.z = 0.035;
    frame.add(art);
    frame.position.set(Math.sin(a) * 6.3, 2.2, Math.cos(a) * 6.3);
    frame.lookAt(0, 2.2, 0);
    scene.add(frame);
  }

  // Wall sconces for some warm fill.
  for (const a of [1.1, -1.1, 2.4, -2.4]) {
    const l = new THREE.PointLight('#ffb36b', 2.2, 5, 2);
    l.position.set(Math.sin(a) * 6.0, 2.6, Math.cos(a) * 6.0);
    scene.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), new THREE.MeshBasicMaterial({ color: '#ffd59a', toneMapped: false }));
    bulb.position.copy(l.position);
    scene.add(bulb);
  }

  // Back door with a little light leaking under it.
  const door = mesh(new THREE.BoxGeometry(1.2, 2.3, 0.08), std('#ffffff', { map: woodTexture('#24160d', 21) }));
  door.position.set(Math.sin(Math.PI * 0.75) * 6.42, 1.15, Math.cos(Math.PI * 0.75) * 6.42);
  door.lookAt(0, 1.15, 0);
  scene.add(door);
}

export function buildTable() {
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.05, 64), std('#ffffff', { map: feltTexture(), roughness: 0.95 }), 0, TABLE_Y, 0);
  const rim = mesh(new THREE.TorusGeometry(TABLE_R + 0.02, 0.06, 12, 64), std('#ffffff', { map: woodTexture('#4a2a15', 5), roughness: 0.35 }), 0, TABLE_Y + 0.02, 0);
  rim.rotation.x = Math.PI / 2;
  const leg = mesh(new THREE.CylinderGeometry(0.12, 0.16, TABLE_Y - 0.06, 16), std('#2a170c', { roughness: 0.5 }), 0, (TABLE_Y - 0.06) / 2, 0);
  const foot = mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 32), std('#1d1008', { roughness: 0.4, metalness: 0.2 }), 0, 0.03, 0);
  g.add(top, rim, leg, foot);
  // ashtray and a couple of glasses for life
  const ash = mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.03, 16), std('#5a5560', { metalness: 0.6, roughness: 0.4 }), 0.55, TABLE_Y + 0.04, -0.35);
  g.add(ash);
  return g;
}

/** Lamp hanging over the table; returns the spotlight so the scene can flicker it. */
export function buildLamp(scene: THREE.Scene) {
  const g = new THREE.Group();
  const cord = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 6), MAT.ink, 0, 3.6, 0);
  const shade = mesh(
    new THREE.CylinderGeometry(0.12, 0.42, 0.28, 32, 1, true),
    std('#1f3b2c', { side: THREE.DoubleSide, roughness: 0.4, metalness: 0.4 }), 0, 2.72, 0,
  );
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false }));
  bulb.position.y = 2.62;
  g.add(cord, shade, bulb);
  scene.add(g);

  const spot = new THREE.SpotLight('#ffd9a0', 40, 7, 0.78, 0.55, 1.6);
  spot.position.set(0, 2.6, 0);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0006;
  spot.shadow.radius = 4;
  scene.add(spot, spot.target);
  return { spot, lamp: g };
}

// ── Revolver ────────────────────────────────────────────────────────────────

/** Points along +z. Returns the group and an empty at the muzzle. */
export function buildRevolver(scale = 1) {
  const g = new THREE.Group();
  const barrel = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 10), MAT.metal, 0, 0.03, 0.12);
  barrel.rotation.x = Math.PI / 2;
  const rib = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), MAT.metal, 0, 0.05, 0.12);
  const drum = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.055, 6), MAT.metalLight, 0, 0.02, 0.0);
  drum.rotation.x = Math.PI / 2;
  const frame = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.09), MAT.metal, 0, 0.02, -0.02);
  const grip = mesh(new THREE.BoxGeometry(0.03, 0.11, 0.045), MAT.grip, 0, -0.05, -0.07);
  grip.rotation.x = -0.35;
  const hammer = mesh(new THREE.BoxGeometry(0.012, 0.03, 0.02), MAT.metal, 0, 0.055, -0.06);
  const guard = mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI), MAT.metal, 0, -0.012, -0.015);
  guard.rotation.y = Math.PI / 2;
  guard.rotation.z = Math.PI;
  g.add(barrel, rib, drum, frame, grip, hammer, guard);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, 0.23);
  g.add(muzzle);
  g.scale.setScalar(scale);
  return { gun: g, muzzle };
}

// ── Characters ──────────────────────────────────────────────────────────────

export interface CharacterRig {
  root: THREE.Group;       // placed at the seat, facing +z toward the table
  body: THREE.Group;       // everything that ducks / slumps
  head: THREE.Group;
  armPivot: THREE.Group;   // right shoulder; +z points where the gun points
  gun: THREE.Group;
  muzzle: THREE.Object3D;
  crownAnchor: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  eyes: THREE.Object3D[];
  deadEyes: THREE.Object3D[];
  ring: THREE.Mesh;        // selection ring on the floor
}

export function buildCharacter(c: Character): CharacterRig {
  const suit = std(c.color, { roughness: 0.65 });
  const suitDark = std(new THREE.Color(c.color).multiplyScalar(0.55), { roughness: 0.7 });
  const skin = std(c.skin, { roughness: 0.55 });
  const skinDark = std(new THREE.Color(c.skin).multiplyScalar(0.82), { roughness: 0.6 });
  const materials = [suit, suitDark, skin, skinDark];

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Chair (stays when the gangster ducks).
  const chairMat = std('#2a170c', { roughness: 0.5 });
  const seat = mesh(new THREE.BoxGeometry(0.62, 0.07, 0.55), chairMat, 0, 0.5, -0.12);
  const back = mesh(new THREE.BoxGeometry(0.62, 0.75, 0.07), chairMat, 0, 0.9, -0.42);
  back.rotation.x = -0.08;
  root.add(seat, back);
  for (const [x, z] of [[-0.27, 0.12], [0.27, 0.12], [-0.27, -0.36], [0.27, -0.36]]) root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), chairMat, x, 0.25, z));

  // Torso: big chunky capsule.
  const torso = mesh(new THREE.CapsuleGeometry(0.27, 0.32, 6, 16), suit, 0, 0.98, -0.08);
  torso.scale.set(1.3, 1, 0.85);
  const belly = mesh(new THREE.SphereGeometry(0.25, 16, 12), suit, 0, 0.82, 0.02);
  belly.scale.set(1.2, 0.9, 0.9);
  const shirt = mesh(new THREE.ConeGeometry(0.14, 0.38, 3), MAT.shirt, 0, 1.08, 0.13);
  shirt.rotation.x = Math.PI;
  shirt.scale.z = 0.25;
  body.add(torso, belly, shirt);
  if (c.extra === 'bowtie') {
    body.add(mesh(new THREE.ConeGeometry(0.04, 0.08, 8), MAT.red, -0.04, 1.23, 0.2).rotateZ(Math.PI / 2));
    body.add(mesh(new THREE.ConeGeometry(0.04, 0.08, 8), MAT.red, 0.04, 1.23, 0.2).rotateZ(-Math.PI / 2));
  } else {
    const tie = mesh(new THREE.BoxGeometry(0.06, 0.28, 0.02), MAT.ink, 0, 1.08, 0.18);
    tie.rotation.x = -0.18;
    body.add(tie);
  }
  if (c.extra === 'pearls') {
    for (let i = 0; i < 9; i++) {
      const a = -1.1 + (i / 8) * 2.2;
      body.add(mesh(new THREE.SphereGeometry(0.022, 8, 8), MAT.white, Math.sin(a) * 0.16, 1.2 - Math.cos(a) * 0.05, 0.12 + Math.cos(a) * 0.04));
    }
  }
  // Shoulders
  for (const x of [-0.33, 0.33]) body.add(mesh(new THREE.SphereGeometry(0.13, 12, 10), suit, x, 1.18, -0.05));

  // Left arm resting on the table edge.
  const lArm = mesh(new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), suit, -0.36, 1.0, 0.15);
  lArm.rotation.x = 1.2;
  lArm.rotation.z = 0.25;
  const lHand = mesh(new THREE.SphereGeometry(0.075, 10, 10), skin, -0.3, 0.88, 0.42);
  body.add(lArm, lHand);

  // Right arm: pivot at shoulder, arm along +z, revolver in the hand.
  const armPivot = new THREE.Group();
  armPivot.position.set(0.34, 1.16, -0.02);
  const upper = mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 8), suit, 0, 0, 0.26);
  upper.rotation.x = Math.PI / 2;
  const cuff = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), MAT.shirt, 0, 0, 0.5);
  cuff.rotation.x = Math.PI / 2;
  const hand = mesh(new THREE.SphereGeometry(0.075, 10, 10), skin, 0, -0.01, 0.56);
  const { gun, muzzle } = buildRevolver(1.25);
  gun.position.set(0, 0.0, 0.6);
  armPivot.add(upper, cuff, hand, gun);
  body.add(armPivot);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.45, 0.0);
  body.add(head);
  body.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), skin, 0, 1.3, 0));
  const skull = mesh(new THREE.SphereGeometry(0.23, 24, 18), skin, 0, 0.04, 0);
  skull.scale.set(1, 1.05, 0.98);
  const jaw = mesh(new THREE.SphereGeometry(0.2, 20, 14), skin, 0, -0.07, 0.04);
  jaw.scale.set(1.08, 0.8, 1);
  const nose = mesh(new THREE.SphereGeometry(0.055, 12, 10), skinDark, 0, 0.0, 0.22);
  nose.scale.set(1, 1.1, 1.2);
  head.add(skull, jaw, nose);
  for (const x of [-0.22, 0.22]) {
    const ear = mesh(new THREE.SphereGeometry(0.05, 10, 8), skinDark, x, 0.02, 0);
    ear.scale.set(0.6, 1, 0.8);
    head.add(ear);
  }
  const eyes: THREE.Object3D[] = [];
  const deadEyes: THREE.Object3D[] = [];
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.07, 0.19);
    eye.add(mesh(new THREE.SphereGeometry(0.042, 12, 10), MAT.eyeWhite));
    eye.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), MAT.ink, 0, 0, 0.03));
    head.add(eye);
    eyes.push(eye);
    const x1 = mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), MAT.ink, x, 0.07, 0.225); x1.rotation.z = 0.8;
    const x2 = mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), MAT.ink, x, 0.07, 0.225); x2.rotation.z = -0.8;
    const dead = new THREE.Group(); dead.add(x1, x2); dead.visible = false;
    head.add(dead);
    deadEyes.push(dead);
    const brow = mesh(new THREE.BoxGeometry(0.09, 0.022, 0.03), MAT.ink, x, 0.135, 0.2);
    brow.rotation.z = x > 0 ? -0.25 : 0.25; // menacing scowl
    head.add(brow);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.11, 0.015, 0.02), MAT.ink, 0, -0.1, 0.2);
  head.add(mouth);

  // Extras
  switch (c.extra) {
    case 'moustache': {
      const m1 = mesh(new THREE.CapsuleGeometry(0.025, 0.08, 4, 8), MAT.ink, -0.05, -0.06, 0.22); m1.rotation.z = 1.2;
      const m2 = mesh(new THREE.CapsuleGeometry(0.025, 0.08, 4, 8), MAT.ink, 0.05, -0.06, 0.22); m2.rotation.z = -1.2;
      head.add(m1, m2); break;
    }
    case 'cigar': {
      const cig = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), std('#6b3f22'), 0.08, -0.1, 0.28);
      cig.rotation.x = Math.PI / 2 - 0.2; cig.rotation.z = -0.3;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff6a1a', toneMapped: false }));
      tip.position.set(0.11, -0.085, 0.36);
      head.add(cig, tip); break;
    }
    case 'monocle': {
      const mon = mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), MAT.gold, 0.08, 0.07, 0.235);
      head.add(mon); break;
    }
    case 'scar': {
      const s = mesh(new THREE.BoxGeometry(0.012, 0.13, 0.01), std('#8a2b2b'), 0.13, 0.03, 0.2);
      s.rotation.z = 0.5; head.add(s); break;
    }
    case 'goldtooth': head.add(mesh(new THREE.BoxGeometry(0.025, 0.025, 0.01), MAT.gold, 0.02, -0.093, 0.215)); break;
    case 'earring': head.add(mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), MAT.gold, -0.23, -0.06, 0)); break;
  }

  // Hats
  const hat = new THREE.Group();
  hat.position.y = 0.18;
  head.add(hat);
  const hatMat = c.hat === 'bandana' ? MAT.red : c.hat === 'cap' ? std('#5b4a3a') : MAT.hat;
  switch (c.hat) {
    case 'fedora':
      hat.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 28), hatMat, 0, 0.02, 0));
      hat.add(mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.2, 24), hatMat, 0, 0.13, 0));
      hat.add(mesh(new THREE.CylinderGeometry(0.232, 0.232, 0.045, 24), std(c.color), 0, 0.06, 0));
      break;
    case 'bowler':
      hat.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 28), hatMat, 0, 0.02, 0));
      hat.add(mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, 0.02, 0));
      break;
    case 'top':
      hat.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.025, 28), hatMat, 0, 0.02, 0));
      hat.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.36, 24), hatMat, 0, 0.2, 0));
      hat.add(mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.05, 24), std(c.color), 0, 0.07, 0));
      break;
    case 'cap':
      hat.add(mesh(new THREE.SphereGeometry(0.235, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, -0.02, 0));
      hat.add(mesh(new THREE.BoxGeometry(0.26, 0.02, 0.18), hatMat, 0, -0.01, 0.25));
      break;
    case 'beret': {
      const b = mesh(new THREE.SphereGeometry(0.26, 24, 12), std('#1e1e2a'), 0.04, 0.0, -0.02);
      b.scale.set(1, 0.35, 1); b.rotation.z = -0.25; hat.add(b); break;
    }
    case 'bandana':
      hat.add(mesh(new THREE.SphereGeometry(0.238, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, -0.04, 0));
      hat.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 6), hatMat, 0, -0.02, -0.25).rotateX(-1.2));
      break;
    case 'shades': {
      const lens = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.03), std('#0a0a0c', { roughness: 0.1, metalness: 0.6 }), 0, -0.11, 0.225);
      head.add(lens);
      hat.add(mesh(new THREE.SphereGeometry(0.235, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), std('#1a1310'), 0, -0.05, -0.01));
      eyes.forEach(e => (e.visible = false));
      break;
    }
    case 'none':
      hat.add(mesh(new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), std('#3a2a22'), 0, -0.06, -0.02));
      break;
  }

  const crownAnchor = new THREE.Object3D();
  crownAnchor.position.set(0, c.hat === 'top' ? 0.6 : c.hat === 'fedora' ? 0.48 : 0.42, 0);
  head.add(crownAnchor);

  // Selection ring on the floor around the seat.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.46, 48),
    new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);

  return { root, body, head, armPivot, gun, muzzle, crownAnchor, materials, eyes, deadEyes, ring };
}

export function buildCrown() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.08, 20, 1, true), MAT.gold));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.03, 0.09, 6), MAT.gold, Math.sin(a) * 0.125, 0.08, Math.cos(a) * 0.125);
    g.add(spike);
    const jewel = mesh(new THREE.SphereGeometry(0.015, 8, 8), std(i % 2 ? '#d9372b' : '#3fa9f5', { emissive: i % 2 ? '#5a0a05' : '#0a2a5a' }), Math.sin(a) * 0.13, 0.0, Math.cos(a) * 0.13);
    g.add(jewel);
  }
  (g.children[0] as THREE.Mesh).material = MAT.gold.clone();
  ((g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
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
        const stack = mesh(new THREE.BoxGeometry(0.17, 0.035, 0.08), [side, side, top, side, side, side] as unknown as THREE.Material, 0, 0.018 + i * 0.036, 0);
        stack.rotation.y = (i % 2 ? 0.12 : -0.08);
        g.add(stack);
      }
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

export const CARD_BACK = 'BACK' as const;
export type { BulletKind };
export { INK };
