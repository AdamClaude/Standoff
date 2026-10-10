// Round-start cutscene: the crew roars up in a getaway car, sprints into the bank,
// kicks the doors in, and cash comes flying out. ~7 seconds, procedural, skippable.
import * as THREE from 'three';
import { characterById } from '@standoff/shared';
import { sfx } from '../audio';
import { MAT, buildCharacter, type CharacterRig } from './models';
import { cashTexture, labelCanvas, tileTexture, woodTexture } from './textures';

export const BANKS = [
  'First Federal Savings', 'Harbor Trust & Loan', 'Merchants’ Mutual', 'Union Gold Reserve',
  'Little Italy Savings', 'Bank of the Bay', 'Diamond Exchange', 'Last National Bank',
];

const std = (color: THREE.ColorRepresentation, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b;
};

interface Runner { rig: CharacterRig; group: THREE.Group; legs: THREE.Group[]; start: THREE.Vector3; delay: number; lane: number }

export class Cutscene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  duration: number;
  ready = false;
  private t = 0;
  private car: THREE.Group;
  private wheels: THREE.Mesh[] = [];
  private runners: Runner[] = [];
  private doors: THREE.Group[] = [];
  private alarm: THREE.PointLight;
  private alarmLamp: THREE.Mesh;
  private flash: THREE.PointLight;
  private bills: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private cues = new Set<string>();
  private billMat: THREE.MeshStandardMaterial;

  constructor(public round: number, avatars: string[], duration: number) {
    this.duration = duration;
    const s = this.scene;
    s.background = new THREE.Color('#0a0e1a');
    s.fog = new THREE.Fog('#0a0e1a', 14, 46);
    s.add(new THREE.HemisphereLight('#4a5a80', '#120c08', 0.6));
    const moon = new THREE.DirectionalLight('#9fb4ff', 0.6);
    moon.position.set(-10, 20, 10);
    s.add(moon);

    // Street, kerb and pavement (wet and shiny).
    const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 14), std('#15171c', { roughness: 0.25, metalness: 0.3 }));
    road.rotation.x = -Math.PI / 2;
    road.position.z = 4;
    s.add(road);
    const walkTex = tileTexture(); walkTex.repeat.set(20, 2);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(80, 5), std('#ffffff', { map: walkTex, roughness: 0.35, color: '#6a6660' }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.12, -5.5);
    s.add(walk, box(80, 0.12, 0.3, std('#5a5650'), 0, 0.06, -3));
    for (let x = -36; x <= 36; x += 4) s.add(box(1.6, 0.01, 0.15, std('#c9b46a', { emissive: '#3a3010' }), x, 0.01, 4));

    // The bank: columns, steps, sign, brass doors, lit windows.
    const bank = new THREE.Group();
    const stone = std('#b9ae98', { roughness: 0.85 });
    bank.add(box(16, 9, 1, stone, 0, 4.5, -10));
    bank.add(box(14, 1.2, 1.6, stone, 0, 8.2, -8.6));
    const pediment = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 1.4, 3, 1), stone);
    pediment.rotation.z = Math.PI / 2; pediment.rotation.y = Math.PI / 2; pediment.scale.set(1, 1, 0.4);
    pediment.position.set(0, 9.4, -8.6);
    bank.add(pediment);
    for (let i = 0; i < 6; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 7, 16), stone);
      col.position.set(-6 + i * 2.4, 4, -8.2);
      if (i === 2 || i === 3) continue; // gap for the doors
      bank.add(col);
    }
    for (let i = 0; i < 4; i++) bank.add(box(14 - i * 0.6, 0.25, 1.4 - i * 0.2, stone, 0, 0.12 + i * 0.25, -7.2 - i * 0.25));
    const doorFrame = box(3.4, 4.6, 0.3, std('#2a1a10'), 0, 2.3 + 1, -9.4);
    bank.add(doorFrame);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.55, 1.0, -9.2);
      const door = box(1.5, 4.2, 0.12, std('#c79a3c', { metalness: 0.85, roughness: 0.3 }), -side * 0.75, 2.1, 0);
      pivot.add(door);
      bank.add(pivot);
      this.doors.push(pivot);
    }
    const inside = new THREE.PointLight('#ffd08a', 0, 12, 1.5);
    inside.position.set(0, 3, -10.5);
    bank.add(inside);
    this.flash = inside;
    // Sign
    const [c, g] = labelCanvas(1024, 160);
    g.fillStyle = '#1a1208'; g.fillRect(0, 0, 1024, 160);
    g.strokeStyle = '#e2b23a'; g.lineWidth = 8; g.strokeRect(8, 8, 1008, 144);
    g.font = '400 88px "Limelight", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f3e6c4'; g.fillText(BANKS[(round - 1) % BANKS.length].toUpperCase(), 512, 84);
    const signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 8.2, -7.78);
    bank.add(sign);
    const winMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a' });
    for (const x of [-6.6, 6.6]) for (const y of [2.8, 6]) bank.add(box(1.2, 1.8, 0.05, winMat, x, y, -9.45));
    // Alarm bell lamp over the door.
    this.alarmLamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: '#550000' }));
    this.alarmLamp.position.set(0, 6.6, -9.3);
    bank.add(this.alarmLamp);
    this.alarm = new THREE.PointLight('#ff2010', 0, 18, 1.2);
    this.alarm.position.set(0, 6.4, -8.6);
    bank.add(this.alarm);
    s.add(bank);

    // Neighbouring buildings with lit windows.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const b = new THREE.Group();
        const w = 7 + k * 2, h = 10 + k * 6;
        b.add(box(w, h, 6, std(k ? '#2a2024' : '#30282a', { map: woodTexture('#2a1e1a', 5 + k) }), 0, h / 2, 0));
        for (let y = 2; y < h - 1; y += 2.4) for (let x = -w / 2 + 1; x < w / 2 - 0.5; x += 1.8) {
          if (Math.random() < 0.45) b.add(box(0.9, 1.2, 0.05, new THREE.MeshBasicMaterial({ color: Math.random() < 0.8 ? '#ffc070' : '#9ab8ff' }), x, y, 3.03));
        }
        b.position.set(side * (12.5 + k * 8), 0, -11 - k * 2);
        s.add(b);
      }
    }
    // Street lamps.
    for (const x of [-9, 9]) {
      const post = new THREE.Group();
      post.add(box(0.15, 5, 0.15, MAT.metal, 0, 2.5, 0));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd59a' }));
      bulb.position.y = 5.1;
      const l = new THREE.PointLight('#ffc070', 30, 14, 1.6);
      l.position.y = 4.9;
      post.add(bulb, l);
      post.position.set(x, 0, -3.8);
      s.add(post);
    }

    // Getaway car: a long black 1930s sedan.
    this.car = new THREE.Group();
    const paint = std('#0d0d10', { metalness: 0.6, roughness: 0.25 });
    this.car.add(box(4.6, 0.7, 1.8, paint, 0, 0.8, 0));
    this.car.add(box(2.4, 0.75, 1.65, paint, -0.3, 1.5, 0));
    this.car.add(box(2.3, 0.45, 1.7, new THREE.MeshStandardMaterial({ color: '#2a3550', metalness: 0.9, roughness: 0.05 }), -0.3, 1.55, 0)); // windows
    this.car.add(box(1.4, 0.55, 1.5, paint, 2.2, 0.95, 0));
    this.car.add(box(0.1, 0.5, 1.2, MAT.chrome, 2.95, 0.95, 0));
    for (const z of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff4c8' }));
      hl.position.set(2.95, 1.15, z);
      this.car.add(hl);
    }
    const beam = new THREE.SpotLight('#fff0c0', 40, 16, 0.5, 0.5, 1.2);
    beam.position.set(3, 1.1, 0);
    beam.target.position.set(10, 0, 0);
    this.car.add(beam, beam.target);
    for (const [x, z] of [[-1.5, 0.95], [1.5, 0.95], [-1.5, -0.95], [1.5, -0.95]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 18), std('#111', { roughness: 0.9 }));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.45, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), MAT.chrome);
      cap.rotation.x = Math.PI / 2; cap.position.copy(w.position);
      this.car.add(w, cap);
      this.wheels.push(w);
    }
    for (const z of [-0.95, 0.95]) this.car.add(box(4.4, 0.08, 0.35, paint, 0, 0.55, z)); // running boards
    this.car.position.set(-30, 0, 2.2);
    s.add(this.car);

    // The crew (up to four of the players at the table).
    const crew = avatars.slice(0, 4);
    crew.forEach((id, i) => {
      const rig = buildCharacter(characterById(id));
      const group = new THREE.Group();
      // Stand them up: keep the body, add legs, drop the chair.
      rig.body.parent!.remove(rig.body);
      rig.body.position.y = 0.33;
      group.add(rig.body);
      const pants = std(characterById(id).color, { roughness: 0.75 });
      const legs: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.14, 0.95, -0.05);
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 4, 8), pants);
        leg.position.y = -0.4;
        const shoe = box(0.15, 0.09, 0.3, std('#0c0a0a', { roughness: 0.3 }), 0, -0.83, 0.06);
        hip.add(leg, shoe);
        group.add(hip);
        legs.push(hip);
      }
      rig.gun.visible = true;
      rig.glass.visible = false;
      group.rotation.y = Math.PI; // face the bank (−z)
      const start = new THREE.Vector3(-1.2 + i * 0.9, 0, 2.2 + (i % 2 ? 0.9 : -0.9));
      group.position.copy(start);
      group.visible = false;
      s.add(group);
      this.runners.push({ rig, group, legs, start, delay: i * 0.12, lane: -1.4 + i * 0.95 });
    });

    // Banknotes for the getaway.
    const bt = cashTexture();
    this.billMat = new THREE.MeshStandardMaterial({ map: bt, side: THREE.DoubleSide, roughness: 0.8 });
  }

  setAspect(a: number) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  /** Advances the scene; returns false when the cutscene is over. */
  update(dt: number): boolean {
    this.t += dt;
    const T = this.t, D = this.duration;
    // Timeline scales with the available duration (6–9 s).
    const k = D / 7;
    const tCar = 1.4 * k, tOut = 1.7 * k, tRun = 4.3 * k, tDoor = 4.6 * k;

    // Car roars in and skids to a stop.
    const ce = Math.min(1, T / tCar);
    const ease = 1 - Math.pow(1 - ce, 3);
    this.car.position.x = -30 + 30 * ease;
    this.car.rotation.y = ce < 1 ? Math.sin(ce * Math.PI) * -0.08 : 0;
    this.car.position.y = ce >= 1 && T < tCar + 0.25 ? Math.sin((T - tCar) * 25) * 0.03 : 0;
    for (const w of this.wheels) w.rotation.y += dt * (1 - ease) * 30;
    this.cue('car', 0, () => sfx.car());

    // Crew piles out and runs for the doors.
    for (const r of this.runners) {
      const tt = T - tOut - r.delay;
      r.group.visible = tt > 0;
      if (tt <= 0) continue;
      const runK = Math.min(1, tt / (tRun - tOut));
      const from = r.start;
      const to = new THREE.Vector3(r.lane * 0.6, 0, -9.0);
      const p = runK < 1 ? runK : 1;
      r.group.position.lerpVectors(from, to, p);
      // climb the steps
      if (r.group.position.z < -7) r.group.position.y = Math.min(1, (-7 - r.group.position.z) * 0.5);
      const cycle = tt * 13;
      const running = runK < 1;
      r.legs[0].rotation.x = running ? Math.sin(cycle) * 0.9 : 0;
      r.legs[1].rotation.x = running ? -Math.sin(cycle) * 0.9 : 0;
      r.rig.body.position.y = 0.33 + (running ? Math.abs(Math.sin(cycle)) * 0.07 : 0);
      r.rig.body.rotation.x = running ? 0.18 : 0;
      r.rig.armPivot.rotation.set(running ? 0.5 + Math.sin(cycle) * 0.4 : 0.2, -0.1, 0);   // gun forward
      r.rig.leftPivot.rotation.set(running ? 1.4 - Math.sin(cycle) * 0.7 : 1.4, 0.2, 0);    // swinging arm
      r.group.visible = runK < 1 || T < tDoor + 0.3; // they vanish inside
    }
    this.cue('steps', tOut, () => sfx.steps(Math.round(14 * k), 0.17));

    // Doors kicked in: flash, alarm, money everywhere.
    if (T > tDoor) {
      const dk = Math.min(1, (T - tDoor) / 0.25);
      this.doors[0].rotation.y = -dk * 1.6;
      this.doors[1].rotation.y = dk * 1.6;
      this.flash.intensity = Math.max(0, 60 * (1 - (T - tDoor) / 0.8));
      const on = Math.floor(T * 6) % 2 === 0;
      this.alarm.intensity = on ? 30 : 4;
      (this.alarmLamp.material as THREE.MeshBasicMaterial).color.set(on ? '#ff3020' : '#550000');
      if (this.bills.length < 70 && T < D - 0.6) for (let i = 0; i < 3; i++) this.spawnBill();
    }
    this.cue('doors', tDoor, () => { sfx.doors(); setTimeout(() => sfx.alarm(Math.max(1, (D - tDoor) * 0.8)), 150); setTimeout(() => sfx.bang(0.8), 350); });
    for (const b of this.bills) {
      b.v.y -= 2.2 * dt;
      b.v.multiplyScalar(1 - dt * 0.9);
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      if (b.m.position.y < 0.15) { b.m.position.y = 0.15; b.v.set(0, 0, 0); b.spin.set(0, 0, 0); }
    }

    this.shoot(T, k, tCar, tOut, tRun, tDoor);
    return T < D;
  }

  private spawnBill() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), this.billMat);
    m.position.set((Math.random() - 0.5) * 2.4, 2 + Math.random() * 2, -8.6);
    this.scene.add(m);
    this.bills.push({
      m,
      v: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, 3 + Math.random() * 5),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }

  /** Camera: wide establishing shot → low tracking shot on the crew → front of the bank. */
  private shoot(T: number, k: number, tCar: number, tOut: number, tRun: number, tDoor: number) {
    const cam = this.camera;
    const lead = this.runners[0]?.group.position ?? new THREE.Vector3();
    if (T < tCar + 0.3) {
      const a = T / (tCar + 0.3);
      cam.position.set(12 - a * 4, 2.2 + a * 0.6, 12 - a * 2);
      cam.lookAt(this.car.position.x * 0.6, 1.4, 0);
    } else if (T < tRun) {
      const a = (T - tCar - 0.3) / Math.max(0.1, tRun - tCar - 0.3);
      // high enough to look over the car roof
      cam.position.set(6 - a * 3, 2.4 + a * 0.3, lead.z + 5 - a * 1.5);
      cam.lookAt(lead.x, 1.1 + a * 1.4, lead.z - 2);
    } else {
      const a = Math.min(1, (T - tRun) / Math.max(0.1, this.duration - tRun));
      // stand in front of the parked car so it never blocks the doors
      cam.position.set(Math.sin(a * 1.2) * 1.5, 1.4 + a * 1.4, 0.6 - a * 1.6);
      cam.lookAt(0, 3.6 + a * 1.6, -8.5);
    }
    void k; void tOut; void tDoor;
  }

  private cue(name: string, at: number, fn: () => void) {
    if (this.t >= at && !this.cues.has(name)) { this.cues.add(name); fn(); }
  }

  dispose() {
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
