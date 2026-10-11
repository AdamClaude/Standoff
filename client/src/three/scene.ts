// The back room: a first-person seat at a round table, one swinging lamp, rain on the window,
// and a table full of mobsters who blink, smoke, sip, sweat — and shoot.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ClientView, GameEvent, LootCard, PublicPlayer } from '@standoff/engine';
import { NEW_BOSS_TOKEN } from '@standoff/engine';
import { characterById } from '@standoff/shared';
import { music, sfx } from '../audio';
import { BANKS, Cutscene } from './cutscene';
import {
  ROOM, ROOM_H, SEAT_R, TABLE_R, TABLE_Y, buildBossCigar, buildBullet, buildCharacter, buildHeistBag, markBulletPick, setBulletFace, buildLamp, buildLoot, buildRevolver, buildRoom,
  buildTable, MAT, type CharacterRig, type RoomRig,
} from './models';
import { bloodTexture, bubbleCanvas, burstTexture, flagTexture, labelCanvas, smokeTexture, starTexture } from './textures';

export interface SceneUI {
  pickPlayers: string[];
  onPickPlayer?: (id: string) => void;
  pickCards: boolean;
  onPickCard?: (id: string) => void;
  pickLoot: string[];
  onPickLoot?: (id: string) => void;
  selectedLoot: string[];
  reducedMotion: boolean;
  labels: { boss: string; out: string; you: string; marked: string; whacked: string };
  lootLabel: (c: LootCard | 'NEW_BOSS') => string;
}

type Pick = { kind: 'player' | 'card' | 'loot'; id: string };

interface Seat {
  id: string;
  rig: CharacterRig;
  isMe: boolean;
  pos: THREE.Vector3;
  tag: THREE.Sprite;
  tagCtx: CanvasRenderingContext2D;
  tagTex: THREE.CanvasTexture;
  tagKey: string;
  hand: THREE.Group;
  handKey: string;
  loaded: THREE.Group;
  bandages: THREE.Mesh[];
  duck: number;
  slump: number;
  hit: number;
  hitDir: THREE.Vector3;
  fall: number;              // 0 seated → 1 flat on the floor (whacked)
  fallStart: number;         // ms timestamp, 0 = not falling
  crown: THREE.Group | null;
  glance: THREE.Vector3;
  glanceAt: number;
  armed: boolean;
  drawStart: number;         // ms; draw animation start
  blinkAt: number;
  sipAt: number;
  sipStart: number;
  laughUntil: number;
  talkUntil: number;
  bubble: THREE.Sprite | null;
  bubbleUntil: number;
  hatFly: { vel: THREE.Vector3; spin: THREE.Vector3; landed: boolean } | null;
  stars: THREE.Group;
  sweatAt: number;
  smokeAt: number;
}

interface LootObj { id: string; group: THREE.Group; label: THREE.Sprite; home: THREE.Vector3; born: number; ring: THREE.Mesh; fly?: { from: THREE.Vector3; to: THREE.Vector3; start: number }; bagOrder?: number; landed?: boolean; kind: string }
interface Fx { obj: THREE.Object3D; t: number; life: number; slow?: boolean; update: (k: number, dt: number) => void }
interface Particle { mesh: THREE.Object3D; vel: THREE.Vector3; life: number; age: number; gravity: number; kind: 'blood' | 'smoke' | 'casing' | 'sweat'; grow?: number }

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const REST_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, -0.2, 0));     // right hand on the table edge
const HOLSTER = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.75, 0.35, 0));   // hand inside the jacket / under the table
const REST_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.95, 0.28, 0));    // glass on the table
const AIM_VISIBLE = new Set(['KID_AIM', 'CUNNING_SWAP', 'BOSS_PRIVILEGE', 'REDIRECT', 'COURAGE', 'SHOWDOWN']);
const REVEAL = new Set(['SHOWDOWN', 'SPLIT', 'ROUND_END']);
const DRAW_MS = 420;

const easeOutBack = (k: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const easeOutBounce = (x: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

export class BarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private spot: THREE.SpotLight;
  private lamp: THREE.Group;
  private lampKick = 0;
  private room: RoomRig;
  private tableSmoke: THREE.Object3D;
  private seats = new Map<string, Seat>();
  private rosterKey = '';
  private loot = new Map<string, LootObj>();
  private myCards = new Map<string, THREE.Group>();
  private viewCigar: THREE.Group;
  private bag: THREE.Group | null = null;
  private swept = new Set<string>(); // loot thrown away this heist (nobody made the split)
  private bagStart = Infinity;
  private bagCount = 0;
  private bagPuff = 0;
  private viewSmokeAt = 0;
  private flashLights: THREE.PointLight[] = [];
  private flashIdx = 0;
  private aimGoal = new THREE.Object3D();
  private cardsRoot = new THREE.Group();
  private fx: Fx[] = [];
  private parts: Particle[] = [];
  private decals: THREE.Mesh[] = [];
  private tableDecals: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hover: Pick | null = null;
  private view: ClientView | null = null;
  private ui: SceneUI | null = null;
  private lastLog = 0;
  private yaw = 0;
  private pitch = 0;
  private drag: { x: number; y: number; moved: number; yaw: number; pitch: number } | null = null;
  private shake = 0;
  private slowUntil = 0;
  private focus: { id: string; until: number } | null = null;
  private portrait = 0;
  private camPos = new THREE.Vector3(0, 1.4, 2);
  private camLook = new THREE.Vector3(0, 0.9, 0);
  private viewGun: THREE.Group;
  private viewMuzzle: THREE.Object3D;
  private myDrawStart = 0;
  private myArmed = false;
  private marker: THREE.Sprite;
  private dust: THREE.Points;
  private haze: THREE.Sprite[] = [];
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private disposed = false;
  private flashTex: THREE.Texture;
  private insets = { top: 0, bottom: 0 };
  private perf = { frames: 0, time: 0, low: false, step: 0 };
  private viewH = 1;
  private nextLightning = 6;
  private bloodGeo = new THREE.SphereGeometry(0.02, 6, 5);
  private prevPhase = '';
  private cut: Cutscene | null = null;
  cutLog: { round: number; ms: number }[] = [];
  cutFrames = 0;
  private warmId: ReturnType<typeof setTimeout> | undefined;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'bar-canvas';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#070405');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    pmrem.dispose();
    this.scene.fog = new THREE.FogExp2('#120a08', 0.07);
    this.scene.add(new THREE.HemisphereLight('#4a3326', '#120806', 0.5));
    this.room = buildRoom(this.scene);
    const table = buildTable();
    this.tableSmoke = table.userData.smoke;
    this.scene.add(table);
    const lamp = buildLamp(this.scene);
    this.spot = lamp.spot;
    this.lamp = lamp.lamp;
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight('#ffa040', 0, 5, 2); // always present, intensity 0 until a gun fires
      this.scene.add(l);
      this.flashLights.push(l);
    }
    const faces = new THREE.PointLight('#ffc888', 3.2, 4.2, 1.4);
    faces.position.set(0, 1.55, 0);
    this.scene.add(faces);
    this.scene.add(this.camera);
    this.scene.add(this.cardsRoot);

    // First-person gun + hand + pinstripe sleeve.
    const vm = buildRevolver(0.95);
    this.viewGun = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), new THREE.MeshStandardMaterial({ color: '#1d1b22', roughness: 0.7 }));
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, -0.03, -0.21);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 10), new THREE.MeshStandardMaterial({ color: '#e9e2d0' }));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.03, -0.08);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshStandardMaterial({ color: '#c9906a', roughness: 0.6 }));
    hand.position.set(0, -0.03, -0.04);
    this.viewGun.add(vm.gun, sleeve, cuff, hand);
    this.viewMuzzle = vm.muzzle;
    this.viewGun.position.set(0.26, -0.7, -0.45);
    this.viewGun.visible = false;
    this.camera.add(this.viewGun);

    // When you are the Boss, your own cigar sits at the bottom-left of your view.
    this.viewCigar = buildBossCigar(1.4);
    this.viewCigar.position.set(-0.3, -0.36, -0.62);
    this.viewCigar.rotation.set(0.3, 0.75, 0.1);
    this.viewCigar.visible = false;
    this.camera.add(this.viewCigar);

    // "Marked" crosshair over your chosen target while the gun is still holstered.
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), depthTest: false, transparent: true }));
    this.marker.renderOrder = 25;
    this.marker.scale.set(0.42, 0.42, 1);
    this.marker.visible = false;
    this.scene.add(this.marker);

    // Dust motes and cigar haze.
    const n = 260;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 1.1, a = Math.random() * Math.PI * 2;
      pts.set([Math.cos(a) * r, 0.9 + Math.random() * 1.7, Math.sin(a) * r], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffe2b0', size: 0.012, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);
    for (let i = 0; i < 9; i++) {
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color: '#c8b8a8', transparent: true, opacity: 0.16, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.5;
      h.position.set(Math.cos(a) * r, 2.0 + Math.random() * 1.2, Math.sin(a) * r);
      h.scale.setScalar(2.2 + Math.random() * 1.6);
      h.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
      this.haze.push(h);
      this.scene.add(h);
    }

    this.flashTex = radialTexture();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.5, 0.96);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const el = this.renderer.domElement;
    window.addEventListener('standoff:skip-cutscene', this.onSkip);
    // Compile the street scene's shaders in the background so the first heist doesn't stutter.
    this.warmId = setTimeout(() => {
      if (this.cut) return;
      // Also pre-build every prop that shows up later (loot, bag, bullets, cigar, bursts) so its first
      // appearance mid-game doesn't hitch while the GPU compiles it.
      const props = new THREE.Group();
      props.position.set(0, -50, 0);
      const kinds: LootCard[] = [
        { id: 'w0', kind: 'CASH', value: 20000 }, { id: 'w1', kind: 'DIAMOND', value: 5000 }, { id: 'w2', kind: 'PAINTING', value: 0 },
        { id: 'w3', kind: 'CLIP', value: 0 }, { id: 'w4', kind: 'FIRST_AID', value: 0 },
      ];
      kinds.forEach((c, i) => props.add(buildLoot(c, i)));
      props.add(buildHeistBag(), buildBullet('BANG'), buildBullet('CLICK'), buildBullet('BACK'), buildBossCigar());
      props.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTexture('BANG!', '#e8b020', '#7a0d0d'), depthTest: false, transparent: true })));
      this.scene.add(props);
      this.renderer.compileAsync(this.scene, this.camera).catch(() => {}).finally(() => this.scene.remove(props));
      const warm = new Cutscene(1, ['rico', 'sal', 'mags', 'smoky'], 7);
      this.renderer.compileAsync(warm.scene, warm.camera).catch(() => {}).finally(() => warm.dispose());
    }, 400);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', () => { this.hover = null; el.style.cursor = ''; });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    document.fonts?.ready.then(() => { for (const s of this.seats.values()) s.tagKey = ''; for (const l of this.loot.values()) l.label.userData.key = ''; this.refresh(); });
    this.loop();
    (window as unknown as { __bar?: BarScene }).__bar = this;
  }

  /** Screen position (CSS px, relative to the canvas) of a player's head — used by automated UI tests. */
  screenPos(id: string) {
    const p = this.headPos(id, new THREE.Vector3()).project(this.camera);
    const el = this.renderer.domElement;
    return { x: (p.x + 1) / 2 * el.clientWidth, y: (1 - p.y) / 2 * el.clientHeight };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('standoff:skip-cutscene', this.onSkip);
    clearTimeout(this.warmId);
    this.skipCutscene();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Sizing & camera ────────────────────────────────────────────────────

  setInsets(top: number, bottom: number) {
    if (Math.abs(top - this.insets.top) < 2 && Math.abs(bottom - this.insets.bottom) < 2) return;
    this.insets = { top, bottom };
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    const visH = Math.max(1, h - this.insets.top - this.insets.bottom * 0.75);
    this.portrait = THREE.MathUtils.clamp((1.25 - w / visH) / 0.55, 0, 1);
    const delta = Math.max(0, h / 2 - (this.insets.top + visH / 2));
    this.viewH = h + 2 * delta;
    this.camera.aspect = w / this.viewH;
    if (delta > 1) this.camera.setViewOffset(w, this.viewH, 0, 2 * delta, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number, time: number) {
    const v = this.view;
    const me = v?.viewerId ? this.seats.get(v.viewerId) : null;
    const p = this.portrait;
    const myDuck = me ? me.duck : 0;
    const nowMs = performance.now();

    // Look at the table; once your gun is out, at the rival you drew on; in a kill, at the victim.
    const look = new THREE.Vector3(0, 0.92, 0);
    const myTarget = this.myArmed && v?.me?.target ? v.me.target : null;
    if (myTarget && this.seats.has(myTarget)) look.lerp(this.headPos(myTarget, tmpV2), 0.55);
    let zoom = 0;
    if (this.focus && nowMs < this.focus.until && this.seats.has(this.focus.id)) {
      look.lerp(this.headPos(this.focus.id, tmpV2), 0.75);
      zoom = 12;
    }
    const sway = this.ui?.reducedMotion ? 0 : 1;
    const fpPos = new THREE.Vector3(Math.sin(time * 0.6) * 0.008 * sway, 1.36 - myDuck * 0.62 + Math.sin(time * 1.3) * 0.005 * sway, SEAT_R + 0.1);
    const fpLook = look.clone(); fpLook.y -= myDuck * 0.2;
    const hiPos = new THREE.Vector3(0, 3.0, SEAT_R + 1.25);
    const hiLook = new THREE.Vector3(0, 0.62, -0.1);
    const targetPos = fpPos.lerp(hiPos, p);
    const targetLook = fpLook.lerp(hiLook, p * (zoom ? 0.6 : 1));

    if (!this.drag) { this.yaw *= 1 - Math.min(1, dt * 0.6); this.pitch *= 1 - Math.min(1, dt * 0.6); }
    const yawLimit = p > 0.5 ? 0.45 : 1.25;
    this.yaw = THREE.MathUtils.clamp(this.yaw, -yawLimit, yawLimit);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.35, 0.35);
    const off = targetLook.clone().sub(targetPos);
    off.applyAxisAngle(UP, this.yaw);
    off.y += this.pitch * off.length() * 0.6;
    const k = 1 - Math.exp(-dt * (zoom ? 9 : 6));
    this.camPos.lerp(targetPos, k);
    this.camLook.lerp(targetPos.clone().add(off), k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.05;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(this.camLook);
    const h = Math.max(1, this.host.clientHeight);
    const w = Math.max(1, this.host.clientWidth);
    const portraitFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) * h / w));
    const baseFov = THREE.MathUtils.lerp(64, Math.min(105, portraitFov), p) - zoom * (1 - p * 0.5);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * (this.viewH / h)));
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 8); this.camera.updateProjectionMatrix(); }

    // First-person gun: holstered (off-screen) until the countdown ends, then a quick-draw with a twirl.
    const alive = !!me && v!.players.find(x => x.id === v!.viewerId)?.alive === true;
    const fp = p < 0.5 && alive;
    const drawK = this.myArmed ? THREE.MathUtils.clamp((nowMs - this.myDrawStart) / DRAW_MS, 0, 1) : 0;
    // Your Boss cigar: bottom-left, puffing away (hidden while ducking).
    this.viewCigar.visible = alive && v!.bossId === v!.viewerId && myDuck < 0.5;
    if (this.viewCigar.visible) {
      // Portrait uses a much wider lens: tuck the cigar further away there.
      const pk = this.portrait;
      this.viewCigar.position.set(-0.3 - pk * 0.05, -0.36 - pk * 0.32 + Math.sin(nowMs / 900) * 0.008, -0.62 - pk * 0.75);
      this.viewCigar.scale.setScalar(1.4 - pk * 0.2);
      (this.viewCigar.userData.glow as THREE.Sprite).material.opacity = 0.6 + Math.sin(nowMs / 400) * 0.25;
      if (nowMs > this.viewSmokeAt) {
        this.viewSmokeAt = nowMs + 380 + Math.random() * 300;
        const e = (this.viewCigar.userData.ember as THREE.Object3D).getWorldPosition(new THREE.Vector3());
        this.spawnSmoke(e, new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.16, (Math.random() - 0.5) * 0.04), 0.035, 2.2);
      }
    }
    this.viewGun.visible = fp && (this.myArmed || this.viewGun.position.y > -0.65);
    if (this.viewGun.visible) {
      if (this.myArmed && myTarget && myDuck < 0.5) {
        const goal = this.aimGoal;
        goal.position.copy(this.viewGun.position);
        this.camera.add(goal);
        goal.lookAt(this.headPos(myTarget, tmpV));
        this.camera.remove(goal);
        const e = easeOutBack(drawK);
        this.viewGun.quaternion.slerp(goal.quaternion, Math.min(1, 0.15 + e * 0.85));
        this.viewGun.position.lerp(tmpV.set(0.2, -0.17, -0.42), Math.min(1, 0.2 + drawK));
        // twirl on the way up
        (this.viewGun.children[0] as THREE.Object3D).rotation.x = drawK < 0.75 ? -(1 - drawK / 0.75) * Math.PI * 3 : 0;
      } else {
        this.viewGun.quaternion.slerp(tmpQ.setFromEuler(new THREE.Euler(-0.9, 0.3, 0)), 1 - Math.exp(-dt * 6));
        this.viewGun.position.lerp(tmpV.set(0.3, -0.75, -0.45), 1 - Math.exp(-dt * 5));
      }
    }
  }

  private headPos(id: string, out: THREE.Vector3) {
    const s = this.seats.get(id);
    if (!s) return out.set(0, 1, 0);
    return s.rig.head.getWorldPosition(out);
  }

  // ── Roster ─────────────────────────────────────────────────────────────

  private buildSeats(v: ClientView) {
    const ordered = [...v.players].sort((a, b) => a.seat - b.seat);
    const i = v.viewerId ? ordered.findIndex(p => p.id === v.viewerId) : 0;
    const order = i <= 0 ? ordered : [...ordered.slice(i), ...ordered.slice(0, i)];
    const key = order.map(p => p.id + p.avatar).join('|') + '@' + v.viewerId;
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    for (const s of this.seats.values()) { this.scene.remove(s.rig.root); if (s.rig.hat?.parent === this.scene) this.scene.remove(s.rig.hat); }
    this.seats.clear();
    const t0 = this.clock.elapsedTime;
    order.forEach((p, k) => {
      const rig = buildCharacter(characterById(p.avatar));
      const phi = (-2 * Math.PI * k) / order.length;
      const pos = new THREE.Vector3(Math.sin(phi) * SEAT_R, 0, Math.cos(phi) * SEAT_R);
      rig.root.position.copy(pos);
      rig.root.lookAt(0, 0, 0);
      rig.root.traverse(o => { o.userData.pick = { kind: 'player', id: p.id } satisfies Pick; });
      rig.armPivot.quaternion.copy(REST_R);
      rig.leftPivot.quaternion.copy(REST_L);
      this.scene.add(rig.root);

      const [c, ctx] = labelCanvas(512, 200);
      const tagTex = new THREE.CanvasTexture(c);
      tagTex.colorSpace = THREE.SRGBColorSpace;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true }));
      tag.renderOrder = 20;
      tag.position.set(0, 2.02, 0);
      tag.scale.set(0.62, 0.242, 1);
      rig.root.add(tag);

      const hand = new THREE.Group();
      hand.position.set(0, TABLE_Y + 0.004, 0.72);
      rig.root.add(hand);
      const loaded = buildBullet('BACK');
      loaded.position.set(0.0, TABLE_Y + 0.004, 0.92);
      loaded.scale.setScalar(1.3);
      loaded.visible = false;
      rig.root.add(loaded);

      const bandages: THREE.Mesh[] = [];
      for (let b = 0; b < 4; b++) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.025, 6, 24), MAT.white);
        band.rotation.x = Math.PI / 2 + (b - 1.5) * 0.35;
        band.rotation.y = (b % 2 ? 0.3 : -0.3);
        band.position.y = 0.02 + b * 0.02;
        band.visible = false;
        rig.head.add(band);
        bandages.push(band);
      }
      // Cartoon stars that circle a dazed head.
      const stars = new THREE.Group();
      const sm = new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false });
      for (let s = 0; s < 4; s++) { const st = new THREE.Sprite(sm); st.scale.setScalar(0.09); st.userData.a = (s / 4) * Math.PI * 2; stars.add(st); }
      stars.position.y = 0.32;
      stars.visible = false;
      rig.head.add(stars);

      this.seats.set(p.id, {
        id: p.id, rig, isMe: p.id === v.viewerId, pos, tag, tagCtx: ctx, tagTex, tagKey: '', hand, handKey: '', loaded,
        bandages, duck: 0, slump: 0, hit: 0, hitDir: new THREE.Vector3(0, 0, -1), fall: 0, fallStart: 0, crown: null,
        glance: new THREE.Vector3(0, 0.9, 0), glanceAt: 0, armed: false, drawStart: 0,
        blinkAt: t0 + Math.random() * 4, sipAt: t0 + 4 + Math.random() * 14, sipStart: -1, laughUntil: 0, talkUntil: 0,
        bubble: null, bubbleUntil: 0, hatFly: null, stars, sweatAt: 0, smokeAt: t0 + Math.random() * 3,
      });
    });
    for (const m of this.myCards.values()) m.parent?.remove(m);
    this.myCards.clear();
    const me = v.viewerId ? this.seats.get(v.viewerId) : null;
    if (me) { this.cardsRoot.position.copy(me.rig.root.position); this.cardsRoot.quaternion.copy(me.rig.root.quaternion); }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  update(v: ClientView, ui: SceneUI) {
    const prevView = this.view;
    this.view = v;
    this.ui = ui;
    this.buildSeats(v);
    this.syncLoot(v, prevView);
    this.syncCards(v);
    this.syncDraws(v);
    this.processEvents(v);
    if (v.phase !== this.prevPhase) this.onPhase(v, this.prevPhase);
    this.prevPhase = v.phase;
    this.refresh();
  }

  /** Round-start cutscene: the crew hits the bank. Tap or call skip to end it early. */
  playCutscene(round: number, avatars: string[], ms: number) {
    this.cutLog.push({ round, ms: Math.round(ms) });   // test hook
    if (this.cut || ms < 2500) return;
    const cut = new Cutscene(round, avatars, Math.min(9, ms / 1000));
    this.cut = cut;
    cut.setAspect(this.host.clientWidth / Math.max(1, this.host.clientHeight));
    // Compile off the main thread where the browser allows it; hold a black frame meanwhile.
    const t0 = performance.now();
    this.renderer.compileAsync(cut.scene, cut.camera).catch(() => {}).finally(() => {
      cut.duration = Math.max(2, cut.duration - (performance.now() - t0) / 1000);
      cut.ready = true;
    });
    music.setMood('normal');
    this.bagStart = Infinity; // the bag waits for the cutscene
    window.dispatchEvent(new CustomEvent('standoff:cutscene', { detail: { active: true, round, bank: BANKS[(round - 1) % BANKS.length] } }));
  }

  private onSkip = () => this.skipCutscene();

  skipCutscene() {
    if (!this.cut) return;
    this.cut.dispose();
    this.cut = null;
    if (this.bag) this.bagStart = performance.now();
    window.dispatchEvent(new CustomEvent('standoff:cutscene', { detail: { active: false } }));
  }

  /** A mobster says something: speech bubble + moving jaw. */
  say(id: string, text: string) {
    const s = this.seats.get(id);
    if (!s || !text) return;
    if (s.bubble) { s.rig.root.remove(s.bubble); s.bubble.material.map?.dispose(); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleCanvas(text), depthTest: false, transparent: true }));
    sp.renderOrder = 28;
    sp.position.set(0, 2.38, 0);
    sp.scale.set(0.75, 0.29, 1);
    s.rig.root.add(sp);
    s.bubble = sp;
    s.bubbleUntil = performance.now() + 3200;
    s.talkUntil = performance.now() + Math.min(2200, 400 + text.length * 70);
  }

  private onPhase(v: ClientView, prev: string) {
    if (v.phase !== 'LOOT_REVEAL') this.skipCutscene(); // never eat into the playing time
    if (v.phase === 'COURAGE') music.setMood('tense');
    else if (v.phase === 'SHOWDOWN') music.setMood('silent');
    else if (prev === 'SHOWDOWN' || v.phase === 'LOOT_REVEAL' || v.phase === 'LOAD') setTimeout(() => music.setMood('normal'), v.phase === 'SPLIT' ? 900 : 0);
    if (v.phase === 'LOOT_REVEAL') { this.swept.clear(); this.dropBag(); }
    // Nobody made the split: the loot is gone — sweep it off the table for everyone to see.
    if (v.phase === 'ROUND_END' && v.settings.noStandRule === 'DISCARD' && v.table.length > 0) {
      const now = performance.now();
      let i = 0;
      for (const [id, o] of this.loot) {
        if (o.fly) continue;
        this.swept.add(id);
        const out = o.home.clone().setY(0).normalize().multiplyScalar(3.2);
        o.fly = { from: o.group.position.clone(), to: out.setY(0.4), start: now + (i++) * 60 };
      }
      if (i) sfx.swoosh();
    }
    if (v.phase === 'LOOT_REVEAL') {
      // New heist: hats back on, clear the blood on the cloth (the floor keeps its stains).
      for (const d of this.tableDecals) this.scene.remove(d);
      this.tableDecals = [];
      for (const p of v.players) {
        const s = this.seats.get(p.id);
        if (s && p.alive) this.restoreHat(s);
      }
    }
  }

  // ── Draw timing: mark during the countdown, draw when it ends ─────────

  private syncDraws(v: ClientView) {
    const nowMs = performance.now();
    let anyNew = false;
    for (const p of v.players) {
      const s = this.seats.get(p.id);
      if (!s) continue;
      const ducking = p.stance === 'DUCK' && REVEAL.has(v.phase);
      const armed = p.alive && !!p.target && AIM_VISIBLE.has(v.phase) && !ducking && !(s.isMe && v.me?.stance === 'DUCK' && v.phase === 'COURAGE');
      if (armed && !s.armed) { s.drawStart = nowMs + Math.random() * 140; anyNew = true; }
      s.armed = armed;
      if (s.isMe) {
        if (armed && !this.myArmed) this.myDrawStart = nowMs;
        this.myArmed = armed;
      }
    }
    if (anyNew) { sfx.draw(); setTimeout(() => sfx.swoosh(), 90); this.lampKick = Math.max(this.lampKick, 0.3); }
  }

  private refresh() {
    const v = this.view, ui = this.ui;
    if (!v || !ui) return;
    for (const p of v.players) {
      const s = this.seats.get(p.id);
      if (!s) continue;
      this.drawTag(s, p, v, ui);
      for (let i = 0; i < s.bandages.length; i++) s.bandages[i].visible = p.alive && i < p.wounds;
      // The Boss is whoever has the cigar clamped in his teeth.
      if (p.id === v.bossId && !s.crown && !s.isMe) {
        s.crown = buildBossCigar(1.15);
        s.crown.position.set(0.075, -0.1, 0.29);
        s.crown.rotation.set(0.22, 0.4, 0);
        s.rig.head.add(s.crown);
      }
      if (p.id !== v.bossId && s.crown) { s.crown.parent?.remove(s.crown); s.crown = null; }
      if (!s.isMe) {
        const hk = `${p.handCount}`;
        if (hk !== s.handKey) {
          s.handKey = hk;
          s.hand.clear();
          for (let i = 0; i < p.handCount; i++) {
            // Every rival round looks the same: nobody can count your BANGs.
            const c = buildBullet('BACK');
            const f = i - (p.handCount - 1) / 2;
            c.position.set(f * 0.05, 0, Math.abs(f) * 0.008);
            s.hand.add(c);
          }
        }
      }
      const showLoaded = (p.hasLoaded && !REVEAL.has(v.phase)) || (v.phase === 'SHOWDOWN' && !!p.revealedCard);
      s.loaded.visible = showLoaded && !s.isMe && p.alive;
      if (s.loaded.visible) {
        if (REVEAL.has(v.phase) && p.revealedCard) setBulletFace(s.loaded, p.revealedCard);
        else setBulletFace(s.loaded, 'BACK');
      }
      (s.rig.ring.material as THREE.MeshBasicMaterial).color.set(v.phase === 'BOSS_PRIVILEGE' ? '#a77bf0' : '#ff3b2f');
    }
  }

  private drawTag(s: Seat, p: PublicPlayer, v: ClientView, ui: SceneUI) {
    const picking = v.phase === 'SPLIT' && v.currentPicker === p.id;
    const tappable = ui.pickPlayers.includes(p.id);
    const key = [p.name, p.alive, p.wounds, p.woundLimit, p.shotsFired, p.lootCount, p.id === v.bossId, picking, tappable, p.isBot, s.isMe].join(',');
    if (key === s.tagKey) return;
    s.tagKey = key;
    const g = s.tagCtx, W = 512, H = 200;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(14,8,8,0.84)';
    roundRect(g, 16, 16, W - 32, H - 32, 14); g.fill();
    g.lineWidth = 6;
    g.strokeStyle = picking ? '#e2b23a' : tappable ? '#ff3b2f' : p.id === v.bossId ? '#c9a24a' : 'rgba(226,178,58,0.35)';
    g.stroke();
    g.fillStyle = p.alive ? '#f3e6c4' : '#8b8a90';
    g.font = '700 58px "Barlow Condensed", "Cairo", sans-serif';
    g.textAlign = 'center';
    g.fillText(fit(g, p.name + (s.isMe ? ` · ${ui.labels.you}` : ''), 440), W / 2, 80);
    if (!p.alive) {
      g.fillStyle = '#d9372b'; g.font = '400 50px "Limelight", serif'; g.fillText(ui.labels.out, W / 2, 148);
    } else {
      const pip = 30, gap = 8, total = p.woundLimit * (pip + gap) - gap;
      let x = 60;
      for (let i = 0; i < p.woundLimit; i++) {
        g.fillStyle = i < p.woundLimit - p.wounds ? '#4fd36a' : '#5a1414';
        roundRect(g, x + i * (pip + gap), 112, pip, 26, 6); g.fill();
      }
      x += total + 30;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < p.shotsFired ? '#e0763a' : 'rgba(216,176,78,0.25)';
        roundRect(g, x + i * 20, 106, 12, 36, 4); g.fill();
      }
      x += 80;
      g.fillStyle = '#e2b23a'; g.font = '700 44px "Barlow Condensed", sans-serif'; g.textAlign = 'left';
      g.fillText(`$ ×${p.lootCount}`, x, 140);
    }
    if (p.id === v.bossId) {
      g.fillStyle = '#c9a24a'; roundRect(g, W / 2 - 70, 0, 140, 34, 8); g.fill();
      g.fillStyle = '#16131a'; g.font = '700 28px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText(ui.labels.boss, W / 2, 26);
    }
    s.tagTex.needsUpdate = true;
  }

  // ── My bullet cards ────────────────────────────────────────────────────

  private syncCards(v: ClientView) {
    const me = v.viewerId ? this.seats.get(v.viewerId) : null;
    if (!me || !v.me) return;
    const mine = [...(v.me.loaded ? [v.me.loaded] : []), ...v.me.hand];
    const ids = new Set(mine.map(c => c.id));
    for (const [id, m] of this.myCards) if (!ids.has(id)) { m.parent?.remove(m); this.myCards.delete(id); }
    const hand = [...v.me.hand].sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'BANG' ? -1 : 1));
    for (const c of mine) {
      let m = this.myCards.get(c.id);
      if (!m) {
        m = buildBullet(c.kind);   // only you see which of your rounds are live
        markBulletPick(m, { kind: 'card', id: c.id } satisfies Pick);
        m.scale.setScalar(1.25);
        this.cardsRoot.add(m);
        this.myCards.set(c.id, m);
        m.position.set(0, TABLE_Y + 0.004, 0.6);
      }
      if (v.me.loaded?.id === c.id) {
        m.userData.home = new THREE.Vector3(0.16, TABLE_Y + 0.004, 0.78);
        m.userData.rot = new THREE.Euler(0, 0, 0);
      } else {
        const i = hand.findIndex(x => x.id === c.id);
        const f = i - (hand.length - 1) / 2;
        m.userData.home = new THREE.Vector3(f * 0.06, TABLE_Y + 0.004, 0.64 - Math.abs(f) * 0.008);
        m.userData.rot = new THREE.Euler(0, 0, 0);
      }
    }
  }

  // ── Loot ───────────────────────────────────────────────────────────────

  private lootSlots(n: number) {
    const out: THREE.Vector3[] = [];
    const inner = Math.min(n, 9);
    for (let i = 0; i < n; i++) {
      const ring = i < inner ? 0.44 : 0.72;
      const count = i < inner ? inner : n - inner;
      const k = i < inner ? i : i - inner;
      const a = (k / count) * Math.PI * 2 + (i < inner ? 0 : 0.3);
      out.push(new THREE.Vector3(Math.sin(a) * ring, TABLE_Y + 0.03, Math.cos(a) * ring));
    }
    return out;
  }

  private syncLoot(v: ClientView, prev: ClientView | null) {
    const items: (LootCard | 'NEW_BOSS')[] = [...v.table, ...(v.tokenAvailable ? ['NEW_BOSS' as const] : [])];
    const ids = new Set(items.map(c => (c === 'NEW_BOSS' ? NEW_BOSS_TOKEN : c.id)));
    for (const [id, o] of this.loot) {
      if (ids.has(id) || o.fly) continue;
      const pick = [...v.log].reverse().find(e => e.t === 'PICK' && (e.item === 'NEW_BOSS' ? NEW_BOSS_TOKEN === id : e.item.id === id));
      const taker = pick && pick.t === 'PICK' ? pick.playerId : null;
      const s = taker ? this.seats.get(taker) : null;
      if (s && prev && prev.round === v.round) {
        o.fly = { from: o.group.position.clone(), to: s.pos.clone().setY(1.1), start: performance.now() };
        if (!s.isMe && Math.random() < 0.5) s.laughUntil = performance.now() + 700;
      } else {
        this.scene.remove(o.group, o.label);
        this.loot.delete(id);
      }
    }
    const slots = this.lootSlots(Math.max(0, items.length - (v.tokenAvailable ? 1 : 0)));
    let slot = 0;
    items.forEach((c, i) => {
      const id = c === 'NEW_BOSS' ? NEW_BOSS_TOKEN : c.id;
      if (this.swept.has(id)) return;
      let o = this.loot.get(id);
      const home = c === 'NEW_BOSS' ? new THREE.Vector3(0, TABLE_Y + 0.03, 0) : slots[slot++];
      if (!o) {
        const group = buildLoot(c, i);
        group.traverse(x => { x.userData.pick = { kind: 'loot', id } satisfies Pick; });
        group.position.copy(home).add(new THREE.Vector3(0, 1.6, 0));
        group.rotation.y = Math.atan2(home.x, home.z);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.125, 32), new THREE.MeshBasicMaterial({ color: '#e2b23a', transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.025;
        group.add(ring);
        const [cv, ctx] = labelCanvas(320, 80);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
        label.renderOrder = 15;
        label.scale.set(0.25, 0.0625, 1);
        label.userData = { ctx, tex: t, key: '' };
        this.scene.add(group, label);
        // During the reveal every item comes out of the heist bag, one at a time.
        const fromBag = v.phase === 'LOOT_REVEAL';
        const kind = c === 'NEW_BOSS' ? 'NEW_BOSS' : c.kind;
        o = { id, group, label, home, born: performance.now() + i * 70, ring, kind, bagOrder: fromBag ? i : undefined, landed: !fromBag };
        if (fromBag) { this.bagCount = Math.max(this.bagCount, i + 1); group.visible = false; }
        this.loot.set(id, o);
      }
      o.home = home;
      const text = this.ui ? this.ui.lootLabel(c) : '';
      if (o.label.userData.key !== text) {
        const { ctx, tex } = o.label.userData as { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
        ctx.clearRect(0, 0, 320, 80);
        ctx.font = '700 42px "Barlow Condensed", "Cairo", sans-serif';
        const tw = Math.min(300, ctx.measureText(text).width + 40);
        ctx.fillStyle = 'rgba(14,8,8,0.82)'; roundRect(ctx, 160 - tw / 2, 8, tw, 64, 10); ctx.fill();
        ctx.fillStyle = c !== 'NEW_BOSS' && (c.kind === 'CASH' || c.kind === 'DIAMOND') ? '#b8f0a6' : c === 'NEW_BOSS' ? '#f0d48a' : '#f3e6c4';
        ctx.textAlign = 'center';
        ctx.fillText(fit(ctx, text, 280), 160, 56);
        tex.needsUpdate = true;
        o.label.userData.key = text;
      }
    });
  }

  // ── Heist bag ─────────────────────────────────────────────────────────

  private bagGap() { return Math.min(650, 5000 / Math.max(1, this.bagCount)); }

  private dropBag() {
    if (this.bag) { this.scene.remove(this.bag); }
    this.bag = buildHeistBag();
    this.bag.scale.setScalar(1.25);
    this.scene.add(this.bag);
    this.bagStart = this.cut ? Infinity : performance.now();
    this.bagCount = [...this.loot.values()].filter(o => o.bagOrder !== undefined && !o.landed).length;
    this.bagPuff = 0;
  }

  private animateBag(nowMs: number) {
    const b = this.bag;
    if (!b) return;
    const t = nowMs - this.bagStart;
    if (!isFinite(t) || t < 0) { b.visible = false; return; }
    b.visible = true;
    // Thrown onto the table, bounces, then empties itself.
    const drop = Math.min(1, t / 450);
    const y = drop < 1 ? (1 - drop) * (1 - drop) * 1.4 : Math.abs(Math.sin(Math.min(1, (t - 450) / 300) * Math.PI)) * 0.04 * (t < 750 ? 1 : 0);
    b.position.set(0, TABLE_Y + y, 0);
    if (drop >= 1 && !b.userData.thudded) { b.userData.thudded = true; sfx.thud(); }
    b.rotation.y = Math.sin(nowMs / 1400) * 0.5;
    // Each item out of the bag gives the neck a jolt.
    const pk = (nowMs - this.bagPuff) / 260;
    const neck = b.userData.neck as THREE.Group;
    const body = b.userData.body as THREE.Mesh;
    const jolt = pk >= 0 && pk < 1 ? Math.sin(pk * Math.PI) : 0;
    neck.scale.set(1 + jolt * 0.35, 1 + jolt * 0.2, 1 + jolt * 0.35);
    // The bag deflates as it empties, and vanishes once the last piece is out.
    const done = this.bagCount > 0 ? 900 + this.bagCount * this.bagGap() + 500 : Infinity;
    const empty = THREE.MathUtils.clamp((t - 900) / Math.max(1, done - 900), 0, 1);
    body.scale.set(1 + jolt * 0.06, (0.92 - empty * 0.45) * (1 - jolt * 0.05), 0.85);
    const gone = THREE.MathUtils.clamp((t - done) / 400, 0, 1);
    b.scale.setScalar(1.25 * (1 - gone));
    if (gone >= 1) { this.scene.remove(b); this.bag = null; }
  }

  // ── The showdown ───────────────────────────────────────────────────────

  private processEvents(v: ClientView) {
    if (this.lastLog > v.log.length) this.lastLog = 0;
    const fresh = v.log.slice(this.lastLog);
    const first = this.lastLog === 0;
    this.lastLog = v.log.length;
    if (first) return;
    for (const e of fresh) if (e.t === 'SHOWDOWN') this.showdown(e);
  }

  private showdown(e: Extract<GameEvent, { t: 'SHOWDOWN' }>) {
    const bangs = e.reveals.filter(r => r.card === 'BANG');
    if (bangs.length) {
      this.slowUntil = performance.now() + 1500;
      const victim = bangs.find(r => e.wounds[r.target]) ?? bangs[0];
      if (this.portrait < 0.5 && victim.target !== this.view?.viewerId) this.focus = { id: victim.target, until: performance.now() + 1700 };
    }
    // Everyone pulls the trigger together — a ragged volley, not a queue.
    e.reveals.forEach(r => {
      const delay = 60 + Math.random() * 220;
      setTimeout(() => this.fire(r.playerId, r.target, r.card === 'BANG', !!e.wounds[r.target], e.dead.includes(r.target)), delay);
    });
    if (bangs.length === 0) setTimeout(() => sfx.sting(), 500);
  }

  private fire(shooterId: string, targetId: string, bang: boolean, wounded: boolean, killed: boolean) {
    if (this.disposed) return;
    const shooter = this.seats.get(shooterId);
    const victim = this.seats.get(targetId);
    if (!shooter || !victim) return;
    const isMeFP = shooter.isMe && this.portrait < 0.5;
    const muzzleObj = isMeFP ? this.viewMuzzle : shooter.rig.muzzle;
    const muzzle = muzzleObj.getWorldPosition(new THREE.Vector3());
    const target = this.headPos(targetId, new THREE.Vector3()).add(new THREE.Vector3(0, -0.06, 0));
    // hammer snap
    shooter.rig.hammer.rotation.x = 0.5;
    setTimeout(() => { shooter.rig.hammer.rotation.x = 0; }, 120);

    if (!bang) {
      sfx.click();
      setTimeout(() => sfx.boing(), 120);
      this.popFlag(muzzleObj, muzzle);
      if (!shooter.isMe) setTimeout(() => this.say(shooterId, '…'), 400);
      return;
    }

    sfx.bang(shooter.isMe ? 1.15 : 0.9);
    this.lampKick = 1;
    this.shake = Math.min(1.4, this.shake + (shooter.isMe ? 0.6 : 0.25));
    // Muzzle flash: bright star + light + smoke puff + a spent casing.
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: '#ffcf6a', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.position.copy(muzzle);
    flash.scale.setScalar(0.7);
    // Reuse a fixed pool of flash lights: adding/removing lights recompiles every shader (a big stutter).
    const light = this.flashLights[this.flashIdx++ % this.flashLights.length];
    light.position.copy(muzzle);
    this.scene.add(flash);
    this.fx.push({ obj: flash, t: 0, life: 0.18, update: k => { flash.material.opacity = 1 - k; flash.scale.setScalar(0.7 + k * 0.5); light.intensity = 30 * (1 - k); } });
    for (let i = 0; i < 5; i++) this.spawnSmoke(muzzle, new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3), 0.18, 1.6, '#d8d0c4');
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), MAT.brass);
    casing.position.copy(muzzle).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(casing);
    this.parts.push({ mesh: casing, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2.2, (Math.random() - 0.5) * 1.2), life: 2.5, age: 0, gravity: 9, kind: 'casing' });

    // The slug itself, in slow motion, with a hot streak behind it.
    const dir = target.clone().sub(muzzle);
    const slug = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.05, 4, 6), new THREE.MeshBasicMaterial({ color: '#ffe9a8', toneMapped: false }));
    slug.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false }));
    this.scene.add(slug, trail);
    const travel = 0.34;
    const miss = !wounded; // a Lucky dodge: whizz past
    const end = miss ? target.clone().add(dir.clone().normalize().multiplyScalar(4)).add(new THREE.Vector3(0.4, 0.3, 0)) : target;
    this.fx.push({
      obj: slug, t: 0, life: travel, slow: true, update: (k) => {
        slug.position.lerpVectors(muzzle, end, k);
        const tail = muzzle.clone().lerp(slug.position, Math.max(0, 1 - 0.35 / Math.max(0.01, k * dir.length())));
        const mid = tail.clone().add(slug.position).multiplyScalar(0.5);
        trail.position.copy(mid);
        trail.scale.set(1, tail.distanceTo(slug.position), 1);
        trail.quaternion.setFromUnitVectors(UP, slug.position.clone().sub(tail).normalize());
        if (k >= 1) {
          this.scene.remove(trail);
          if (miss) sfx.whizz();
          else this.impact(shooter, victim, target, dir.clone().normalize(), killed);
        }
      },
    });
  }

  private impact(shooter: Seat, victim: Seat, at: THREE.Vector3, dir: THREE.Vector3, killed: boolean) {
    sfx.splat();
    this.shake = Math.min(1.6, this.shake + (victim.isMe ? 1.4 : 0.45));
    victim.hit = 1;
    victim.hitDir.copy(dir);
    if (victim.isMe) {
      // You took it: the blood runs down your screen instead (HUD overlay), and the room shakes.
      window.dispatchEvent(new CustomEvent('standoff:hit-me'));
      if (!shooter.isMe) shooter.laughUntil = performance.now() + 1400;
      if (killed) setTimeout(() => { sfx.crash(); setTimeout(() => sfx.whistle(), 250); }, 420);
      return;
    }
    // Comic POW
    this.burst(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 'BANG!', '#e8b020', '#7a0d0d', 0.55);
    // Blood: a big cartoon spray, mostly away from the shooter.
    for (let i = 0; i < 34; i++) {
      const d = new THREE.Mesh(this.bloodGeo, MAT.blood);
      d.position.copy(at);
      const sc = 0.6 + Math.random() * 1.6;
      d.scale.setScalar(sc);
      this.scene.add(d);
      const v = dir.clone().multiplyScalar(1.5 + Math.random() * 2.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.8 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4));
      this.parts.push({ mesh: d, vel: v, life: 3, age: 0, gravity: 7, kind: 'blood' });
    }
    // Splat on the wall behind.
    this.wallSplat(at, dir);
    // Hat goes flying.
    this.knockHat(victim, dir);
    if (!shooter.isMe) shooter.laughUntil = performance.now() + 1400;
    if (killed) {
      setTimeout(() => {
        victim.fallStart = performance.now();
        sfx.crash();
        setTimeout(() => sfx.whistle(), 250);
        this.burst(victim.pos.clone().setY(1.6), this.ui?.labels.whacked ?? 'WHACKED!', '#8a0b0b', '#16131a', 0.95);
        // a pool under the fallen chair
        const back = victim.pos.clone().add(victim.pos.clone().normalize().multiplyScalar(0.8));
        this.floorDecal(back.setY(0.012), 0.9 + Math.random() * 0.4, true);
      }, 420);
    }
  }

  private wallSplat(from: THREE.Vector3, dir: THREE.Vector3) {
    // Intersect the ray with the room's walls (axis-aligned box).
    const R = ROOM - 0.04;
    let best = Infinity;
    let normal = new THREE.Vector3();
    for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const) {
      const d = dir[axis];
      if (Math.abs(d) < 1e-4 || Math.sign(d) !== sign) continue;
      const t = (sign * R - from[axis]) / d;
      if (t > 0 && t < best) { best = t; normal = axis === 'x' ? new THREE.Vector3(-sign, 0, 0) : new THREE.Vector3(0, 0, -sign); }
    }
    if (!isFinite(best)) return;
    const p = from.clone().addScaledVector(dir, best);
    p.y = THREE.MathUtils.clamp(p.y + 0.3, 0.6, ROOM_H - 0.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: bloodTexture(Math.floor(Math.random() * 4)), transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.copy(p).addScaledVector(normal, 0.01);
    m.lookAt(p.clone().add(normal));
    m.rotation.z = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.01);
    this.scene.add(m);
    const size = 0.6 + Math.random() * 0.5;
    this.fx.push({ obj: m, t: 0, life: 0.18, slow: true, update: k => m.scale.setScalar(size * easeOutBack(k)) });
    this.decals.push(m);
    this.trimDecals();
  }

  private floorDecal(at: THREE.Vector3, size: number, pool = false) {
    const onTable = Math.hypot(at.x, at.z) < TABLE_R + 0.04 && at.y > 0.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: bloodTexture(Math.floor(Math.random() * 4)), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(at.x, onTable ? TABLE_Y + 0.014 : 0.012 + this.decals.length * 0.0001, at.z);
    this.scene.add(m);
    if (pool) {
      m.scale.setScalar(0.01);
      this.fx.push({ obj: new THREE.Object3D(), t: 0, life: 2.5, update: k => m.scale.setScalar(size * Math.sqrt(k)) });
    } else m.scale.setScalar(size);
    if (onTable) this.tableDecals.push(m); else this.decals.push(m);
    this.trimDecals();
  }

  private trimDecals() {
    while (this.decals.length > 80) this.scene.remove(this.decals.shift()!);
    while (this.tableDecals.length > 40) this.scene.remove(this.tableDecals.shift()!);
  }

  private knockHat(s: Seat, dir: THREE.Vector3) {
    const hat = s.rig.hat;
    if (!hat || s.hatFly) return;
    this.scene.attach(hat);
    s.hatFly = {
      vel: dir.clone().multiplyScalar(1.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.6 + Math.random(), (Math.random() - 0.5) * 0.8)),
      spin: new THREE.Vector3(6 + Math.random() * 6, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6),
      landed: false,
    };
    sfx.hatPop();
  }

  private restoreHat(s: Seat) {
    const hat = s.rig.hat;
    if (!hat || !s.hatFly || !s.rig.hatHome) return;
    s.rig.head.add(hat);
    hat.position.copy(s.rig.hatHome.pos);
    hat.rotation.copy(s.rig.hatHome.rot);
    hat.scale.setScalar(1);
    s.hatFly = null;
  }

  private popFlag(muzzleObj: THREE.Object3D, at: THREE.Vector3) {
    // The classic gag: a little flag on a stick springs out of the barrel.
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), MAT.chrome);
    stick.rotation.x = Math.PI / 2;
    stick.position.z = 0.08;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: flagTexture('click!'), side: THREE.DoubleSide }));
    cloth.position.set(0, 0.045, 0.14);
    cloth.rotation.y = Math.PI / 2;
    g.add(stick, cloth);
    muzzleObj.parent!.add(g);
    g.position.copy(muzzleObj.position);
    g.scale.setScalar(0.01);
    void at;
    this.fx.push({
      obj: g, t: 0, life: 1.6, update: k => {
        const s = k < 0.2 ? easeOutBack(k / 0.2) : k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
        g.scale.setScalar(Math.max(0.01, s * 1.6));
        cloth.rotation.x = Math.sin(k * 40) * 0.25 * (1 - k);
        if (k >= 1) g.parent?.remove(g);
      },
    });
  }

  private burst(at: THREE.Vector3, word: string, fill: string, ink: string, size: number) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTexture(word, fill, ink), depthTest: false, transparent: true }));
    sp.renderOrder = 30;
    sp.position.copy(at);
    this.scene.add(sp);
    const rot = (Math.random() - 0.5) * 0.5;
    sp.material.rotation = rot;
    this.fx.push({ obj: sp, t: 0, life: 1.0, update: k => {
      const s = k < 0.15 ? easeOutBack(k / 0.15) : 1 + (k - 0.15) * 0.1;
      sp.scale.set(size * s, size * 0.75 * s, 1);
      sp.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    } });
  }

  private spawnSmoke(at: THREE.Vector3, vel: THREE.Vector3, size: number, life: number, color = '#cfc6bb') {
    if (this.parts.length > 260) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, opacity: 0.6, depthWrite: false }));
    sp.position.copy(at);
    sp.scale.setScalar(size);
    sp.material.rotation = Math.random() * Math.PI * 2;
    this.scene.add(sp);
    this.parts.push({ mesh: sp, vel, life, age: 0, gravity: -0.05, kind: 'smoke', grow: size * 2.5 });
  }

  // ── Input ─────────────────────────────────────────────────────────────

  private pickAt(clientX: number, clientY: number): Pick | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      const p = h.object.userData.pick as Pick | undefined;
      if (!p || !h.object.visible) continue;
      if (this.pickable(p)) return p;
    }
    return null;
  }

  private pickable(p: Pick) {
    const ui = this.ui;
    if (!ui) return false;
    if (p.kind === 'player') return ui.pickPlayers.includes(p.id);
    if (p.kind === 'card') return ui.pickCards && this.view?.me?.loaded?.id !== p.id;
    return ui.pickLoot.includes(p.id);
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: 0, yaw: this.yaw, pitch: this.pitch };
  };

  private onMove = (e: PointerEvent) => {
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy));
      if (this.drag.moved > 8) {
        const w = this.renderer.domElement.clientWidth;
        this.yaw = this.drag.yaw + (dx / w) * 2.2;
        this.pitch = this.drag.pitch - (dy / w) * 1.2;
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      this.hover = this.pickAt(e.clientX, e.clientY);
      this.renderer.domElement.style.cursor = this.hover ? (this.hover.kind === 'player' ? 'crosshair' : 'pointer') : 'grab';
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved > 8 || e.target !== this.renderer.domElement) return;
    const p = this.pickAt(e.clientX, e.clientY);
    if (!p || !this.ui) return;
    if (p.kind === 'player') this.ui.onPickPlayer?.(p.id);
    else if (p.kind === 'card') this.ui.onPickCard?.(p.id);
    else this.ui.onPickLoot?.(p.id);
  };

  /** Slow device? Drop bloom and shadows so the game stays playable. */
  private adaptQuality(dt: number) {
    if (this.perf.low) return;
    this.perf.frames++;
    this.perf.time += dt;
    if (this.perf.time < 3) return;
    const fps = this.perf.frames / this.perf.time;
    this.perf.frames = 0; this.perf.time = 0;
    // Step down gradually: sharpness first, then bloom and shadows.
    if (fps < 50 && this.perf.step === 0 && this.renderer.getPixelRatio() > 1) {
      this.perf.step = 1;
      this.renderer.setPixelRatio(1);
      this.resize();
    } else if (fps < 34) {
      this.perf.low = true;
      this.renderer.setPixelRatio(Math.min(1, this.renderer.getPixelRatio()));
      this.renderer.shadowMap.autoUpdate = false; // keep the last shadow frame, stop re-rendering it
      this.resize();
    }
  }

  // ── Frame loop ────────────────────────────────────────────────────────

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.2, rawDt);
    const fxDt = Math.min(1, rawDt); // effects run on wall-clock time so slow devices don't leave them hanging
    const time = this.clock.elapsedTime;
    const nowMs = performance.now();
    const slow = nowMs < this.slowUntil ? 0.35 : 1;
    const sdt = dt * slow;
    const fxSlow = fxDt * slow;
    const v = this.view, ui = this.ui;
    const reduced = ui?.reducedMotion ?? false;

    if (this.cut) {
      this.cut.setAspect(this.host.clientWidth / Math.max(1, this.host.clientHeight));
      if (!this.cut.ready) { this.renderer.setRenderTarget(null); this.renderer.clear(); return; }
      if (this.cut.update(Math.min(fxDt, 0.1))) { this.cutFrames++; this.renderer.render(this.cut.scene, this.cut.camera); return; }
      this.skipCutscene();
    }
    this.animateRoom(dt, time);

    if (v) {
      const myDuckChoice = v.me?.stance === 'DUCK' && (v.phase === 'COURAGE' || REVEAL.has(v.phase));
      for (const p of v.players) {
        const s = this.seats.get(p.id);
        if (!s) continue;
        this.animateSeat(s, p, v, dt, sdt, time, nowMs, reduced, myDuckChoice);
      }

      // Marker over the rival you chose while your gun is still holstered.
      const mark = v.phase === 'LOAD' && v.me?.target && this.seats.has(v.me.target) ? v.me.target : null;
      this.marker.visible = !!mark;
      if (mark) {
        this.headPos(mark, this.marker.position).add(new THREE.Vector3(0, 0.12, 0));
        const s = 0.42 + Math.sin(time * 6) * 0.03;
        this.marker.scale.set(s * (1 + this.portrait * 0.3), s * (1 + this.portrait * 0.3), 1);
        this.marker.material.rotation = time * 0.8;
      }

      for (const [id, m] of this.myCards) {
        const home = m.userData.home as THREE.Vector3 | undefined;
        if (!home) continue;
        const hovered = this.hover?.kind === 'card' && this.hover.id === id;
        const lift = (ui?.pickCards && v.me?.loaded?.id !== id ? 0.012 : 0) + (hovered ? 0.03 : 0);
        m.position.lerp(tmpV.copy(home).add(new THREE.Vector3(0, lift, hovered ? 0.02 : 0)), 1 - Math.exp(-dt * 10));
        const rot = m.userData.rot as THREE.Euler;
        m.rotation.x += (rot.x - m.rotation.x) * Math.min(1, dt * 10);
        m.rotation.y += (rot.y - m.rotation.y) * Math.min(1, dt * 10);
      }

      for (const [id, o] of this.loot) {
        if (o.fly) {
          const k = THREE.MathUtils.clamp((nowMs - o.fly.start) / 550, 0, 1);
          o.group.position.lerpVectors(o.fly.from, o.fly.to, k);
          o.group.position.y += Math.sin(k * Math.PI) * 0.45;
          o.group.scale.setScalar(1 - k * 0.6);
          o.group.rotation.y += dt * 8;
          o.label.visible = false;
          if (k >= 1) { this.scene.remove(o.group, o.label); this.loot.delete(id); }
          continue;
        }
        if (o.bagOrder !== undefined && !o.landed) {
          // Popping out of the heist bag: hidden until its turn, then an arc from the bag mouth to its spot.
          const gap = this.bagGap();
          const start = this.bagStart + 900 + o.bagOrder * gap;
          const fk = (nowMs - start) / 520;
          o.label.visible = false;
          if (fk < 0 || !this.bag) { o.group.visible = !this.bag; if (!this.bag) o.landed = true; continue; }
          if (!o.group.visible) { o.group.visible = true; this.bagPuff = nowMs; sfx.swoosh(); }
          const e = Math.min(1, fk);
          const mouth = tmpV.set(0, TABLE_Y + 0.42, 0);
          o.group.position.lerpVectors(mouth, o.home, e);
          o.group.position.y += Math.sin(e * Math.PI) * 0.55;
          o.group.scale.setScalar(0.35 + e * 0.75);
          o.group.rotation.y += dt * 9 * (1 - e);
          if (e >= 1) {
            o.landed = true;
            o.born = nowMs - 450;
            o.group.rotation.y = Math.atan2(o.home.x, o.home.z);
            if (o.kind === 'CASH') sfx.cash(); else if (o.kind === 'DIAMOND') sfx.clink(); else if (o.kind === 'NEW_BOSS') sfx.sting(); else sfx.thud();
          }
          continue;
        }
        const k = THREE.MathUtils.clamp((nowMs - o.born) / 450, 0, 1);
        const bounce = k < 1 ? (1 - k) * (1 - k) * 1.6 + Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.12 : 0;
        o.group.visible = true;
        o.group.position.set(o.home.x, o.home.y + bounce, o.home.z);
        const can = ui?.pickLoot.includes(id);
        const hovered = this.hover?.kind === 'loot' && this.hover.id === id;
        const selected = ui?.selectedLoot.includes(id);
        const sc = hovered ? 1.2 : selected ? 1.15 : 1;
        o.group.scale.lerp(tmpV.set(sc, sc, sc), Math.min(1, dt * 10));
        (o.ring.material as THREE.MeshBasicMaterial).opacity = can ? 0.5 + Math.sin(time * 6) * 0.3 : 0;
        if (can && !reduced) o.group.position.y += 0.02 + Math.sin(time * 4 + o.home.x * 9) * 0.015;
        o.group.children.forEach(ch => { if (ch.userData.spin) ch.rotation.y += dt * 1.2; });
        o.label.position.set(o.home.x, o.home.y + 0.27 + bounce, o.home.z);
        o.label.visible = k >= 1 && (v.phase === 'LOOT_REVEAL' || v.phase === 'SPLIT' || this.hover?.id === id);
        const ls = 1 + this.portrait * 0.6;
        o.label.scale.set(0.25 * ls, 0.0625 * ls, 1);
      }
    }

    this.animateBag(nowMs);
    this.animateParticles(fxSlow);
    // Effects can spawn more effects while updating (a slug landing spawns the BANG! burst),
    // so swap the list out first and keep anything added meanwhile — otherwise it freezes on screen.
    const running = this.fx;
    this.fx = [];
    const kept = running.filter(f => {
      f.t += f.slow ? fxSlow : fxDt;
      const k = f.life <= 0 ? 1 : Math.min(1, f.t / f.life);
      f.update(k, dt);
      if (k >= 1) { if (f.obj.parent === this.scene && !(f.obj instanceof THREE.Mesh && (this.decals.includes(f.obj) || this.tableDecals.includes(f.obj)))) this.scene.remove(f.obj); return false; }
      return true;
    });
    this.fx = kept.concat(this.fx);

    this.updateCamera(dt, time);
    this.adaptQuality(dt);
    if (this.perf.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  };

  private animateRoom(dt: number, time: number) {
    const r = this.room;
    r.fan.rotation.y += dt * 2.4;
    r.rain.offset.y += dt * 0.9;
    r.rain.offset.x = Math.sin(time * 0.3) * 0.05;
    r.clockHands[1].rotation.y = -time * 0.05;
    r.clockHands[0].rotation.y = -time * 0.05 / 12 - 1.2;
    for (const c of r.candles) c.intensity = 1.4 + Math.sin(time * 13) * 0.15 + Math.random() * 0.25;
    // Lamp swings gently; gunshots kick it.
    this.lampKick = Math.max(0, this.lampKick - dt * 0.35);
    const amp = 0.025 + this.lampKick * 0.12;
    this.lamp.position.y = ROOM_H + this.portrait * 0.6; // lift it out of the high camera's way
    this.lamp.rotation.z = Math.sin(time * 1.1) * amp;
    this.lamp.rotation.x = Math.sin(time * 0.83 + 1) * amp * 0.7;
    this.spot.intensity = 20 * (1 - (Math.random() < 0.012 ? 0.4 : 0));
    // Lightning outside.
    if (time > this.nextLightning) {
      this.nextLightning = time + 12 + Math.random() * 18;
      const seq = [0, 60, 120, 200];
      seq.forEach((d, i) => setTimeout(() => { r.lightning.intensity = i % 2 ? 0 : 60; r.windowSpot.intensity = i % 2 ? 18 : 60; }, d));
      setTimeout(() => { r.lightning.intensity = 0; r.windowSpot.intensity = 18; }, 320);
    }
    this.dust.rotation.y += dt * 0.02;
    for (const h of this.haze) {
      h.position.add(tmpV.copy(h.userData.drift).multiplyScalar(dt));
      if (Math.hypot(h.position.x, h.position.z) > 3.5) h.userData.drift.multiplyScalar(-1);
      h.material.rotation += dt * 0.02;
    }
    if (Math.random() < dt * 3) {
      this.tableSmoke.getWorldPosition(tmpV);
      this.spawnSmoke(tmpV, new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.18, (Math.random() - 0.5) * 0.04), 0.05, 3.5);
    }
  }

  private animateSeat(s: Seat, p: PublicPlayer, v: ClientView, dt: number, sdt: number, time: number, nowMs: number, reduced: boolean, myDuckChoice: boolean) {
    const rig = s.rig;
    if (s.isMe) rig.root.visible = false;
    const ducking = s.isMe ? myDuckChoice : p.stance === 'DUCK' && REVEAL.has(v.phase);
    const dazed = REVEAL.has(v.phase) && v.phase !== 'SHOWDOWN' && p.hitThisRound > 0 && p.alive;
    s.duck += ((ducking ? 1 : 0) - s.duck) * Math.min(1, dt * 7);
    s.slump += ((dazed ? 1 : 0) - s.slump) * Math.min(1, dt * 3);
    s.hit = Math.max(0, s.hit - sdt * 1.8);
    const breath = reduced ? 0 : Math.sin(time * 1.6 + s.pos.x * 3) * 0.012;
    const laughing = nowMs < s.laughUntil;
    rig.body.position.y = -s.duck * 0.62 + breath + (laughing ? Math.abs(Math.sin(time * 18)) * 0.02 : 0);
    rig.body.position.z = -s.duck * 0.15 - s.hit * 0.12;
    rig.body.rotation.x = -s.slump * 0.32 - s.hit * 0.75; // dazed: slumped back in the chair
    rig.body.rotation.z = reduced ? 0 : Math.sin(time * 0.7 + s.pos.z * 2) * 0.012;

    // Whacked: chair and all go over backwards, with a bounce.
    if (!p.alive && s.fallStart === 0 && v.phase !== 'SHOWDOWN') s.fallStart = nowMs - 2000; // joined after the fact
    if (s.fallStart) {
      const k = Math.min(1, (nowMs - s.fallStart) / 900);
      s.fall = easeOutBounce(k);
      rig.tip.rotation.x = -1.45 * s.fall;
      rig.eyes.forEach(e => (e.visible = false));
      rig.deadEyes.forEach(e => (e.visible = true));
      rig.gun.visible = false;
      rig.jaw.rotation.x = 0.35;
    }

    // Blink and squint.
    if (time > s.blinkAt) s.blinkAt = time + 2 + Math.random() * 4;
    const blink = time > s.blinkAt - 0.12 ? 1 : 0;
    for (const lid of rig.lids) lid.rotation.x = 0.55 + blink * 1.1 + (s.hit > 0.3 ? 0.8 : 0);

    // Talking / laughing jaw.
    const talking = nowMs < s.talkUntil;
    rig.jaw.rotation.x = p.alive ? (talking ? Math.abs(Math.sin(time * 14)) * 0.35 : laughing ? 0.3 + Math.abs(Math.sin(time * 18)) * 0.2 : 0) : 0.35;
    if (s.bubble && nowMs > s.bubbleUntil) { rig.root.remove(s.bubble); s.bubble = null; }
    if (s.bubble) s.bubble.position.y = 2.38 - s.duck * 0.3 - s.fall * 1.2;

    // Right arm: holstered → quick-draw with a twirl → aim; back to the table after the showdown.
    let goal = REST_R;
    const targetSeat = p.target ? this.seats.get(p.target) : null;
    if (s.armed && targetSeat && p.alive) {
      const drawK = THREE.MathUtils.clamp((nowMs - s.drawStart) / DRAW_MS, 0, 1);
      const pivotW = rig.armPivot.getWorldPosition(tmpV);
      const tgt = this.headPos(p.target!, tmpV2).add(new THREE.Vector3(0, -0.05, 0));
      tmpM.lookAt(tgt, pivotW, UP);
      tmpQ.setFromRotationMatrix(tmpM);
      const parentQ = rig.armPivot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
      const aimQ = parentQ.multiply(tmpQ);
      goal = drawK < 1 ? HOLSTER.clone().slerp(aimQ, easeOutBack(drawK)) : aimQ;
      rig.gun.visible = drawK > 0.12;
      rig.gun.rotation.x = drawK < 0.8 ? -(1 - drawK / 0.8) * Math.PI * 4 : 0;
      rig.armPivot.quaternion.slerp(goal, drawK < 1 ? 1 : 1 - Math.exp(-dt * 12));
    } else {
      rig.gun.visible = false;
      if (v.phase === 'LOAD' || v.phase === 'LOOT_REVEAL') goal = REST_R;
      rig.armPivot.quaternion.slerp(goal, 1 - Math.exp(-dt * 5));
    }
    // Hammer cocks while the barrels stare each other down.
    rig.hammer.rotation.x = s.armed && v.phase === 'COURAGE' ? -0.45 : rig.hammer.rotation.x * 0.9;

    // Left arm: sip whisky now and then.
    if (p.alive && !s.armed && s.duck < 0.2 && s.slump < 0.2 && time > s.sipAt && s.sipStart < 0) { s.sipStart = time; }
    let lGoal = REST_L;
    if (s.sipStart >= 0) {
      const k = (time - s.sipStart) / 2.0;
      if (k >= 1) { s.sipStart = -1; s.sipAt = time + 8 + Math.random() * 14; }
      else {
        const lift = k < 0.3 ? k / 0.3 : k > 0.7 ? (1 - k) / 0.3 : 1;
        const mouth = rig.head.localToWorld(new THREE.Vector3(0, -0.1, 0.32));
        const pivotW = rig.leftPivot.getWorldPosition(tmpV);
        tmpM.lookAt(mouth, pivotW, UP);
        tmpQ.setFromRotationMatrix(tmpM);
        const parentQ = rig.leftPivot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
        lGoal = REST_L.clone().slerp(parentQ.multiply(tmpQ), lift);
        rig.glass.rotation.x = -lift * 0.9;
      }
    }
    rig.leftPivot.quaternion.slerp(lGoal, 1 - Math.exp(-dt * 8));

    // Head: target, the gun on you, the victim, or idle glances.
    let look: THREE.Vector3;
    const aimers = v.phase === 'COURAGE' ? v.players.filter(o => o.alive && o.target === p.id) : [];
    if (s.armed && targetSeat) look = this.headPos(p.target!, tmpV2);
    else if (aimers.length) {
      if (time > s.glanceAt) { s.glanceAt = time + 0.35 + Math.random() * 0.5; s.glance = this.headPos(aimers[Math.floor(Math.random() * aimers.length)].id, new THREE.Vector3()); }
      look = s.glance;
    } else if (this.focus && nowMs < this.focus.until && this.focus.id !== p.id) look = this.headPos(this.focus.id, tmpV2);
    else {
      if (time > s.glanceAt) {
        s.glanceAt = time + 1.5 + Math.random() * 3;
        const others = [...this.seats.values()].filter(o => o !== s);
        const o = Math.random() < 0.35 || others.length === 0 ? null : others[Math.floor(Math.random() * others.length)];
        s.glance = o ? o.rig.head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, TABLE_Y, 0);
      }
      look = s.glance;
    }
    const local = rig.root.worldToLocal(look.clone());
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - 1.45, Math.hypot(local.x, local.z)), -0.4, 0.5);
    const hk = Math.min(1, dt * (aimers.length ? 9 : 4));
    rig.head.rotation.y += (yaw - rig.head.rotation.y) * hk;
    rig.head.rotation.x += ((p.alive ? pitch - s.slump * 0.55 + (laughing ? Math.sin(time * 18) * 0.12 : 0) : 0.6) - rig.head.rotation.x) * hk;
    rig.head.rotation.z = s.slump * Math.sin(time * 2) * 0.15;

    // Sweat when guns are on you.
    if (aimers.length && p.alive && time > s.sweatAt && !s.isMe) {
      s.sweatAt = time + 0.5 / aimers.length;
      const d = new THREE.Mesh(this.bloodGeo, new THREE.MeshStandardMaterial({ color: '#bfe4ff', roughness: 0.05, transparent: true, opacity: 0.85 }));
      d.scale.set(0.8, 1.3, 0.8);
      d.position.copy(rig.head.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.12, 0.12)));
      this.scene.add(d);
      this.parts.push({ mesh: d, vel: new THREE.Vector3(0, 0.1, 0), life: 0.9, age: 0, gravity: 3, kind: 'sweat' });
    }
    // Cigar smoke.
    const ember = (s.crown?.userData.ember as THREE.Object3D | undefined) ?? rig.smoke;
    if (ember && p.alive && time > s.smokeAt) {
      s.smokeAt = time + 0.22 + Math.random() * 0.25;
      this.spawnSmoke(ember.getWorldPosition(new THREE.Vector3()), new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.22, (Math.random() - 0.5) * 0.05), 0.05, 2.8);
    }
    // Dazed stars.
    s.stars.visible = s.slump > 0.5;
    if (s.stars.visible) s.stars.children.forEach((st, i) => { const a = time * 3 + st.userData.a; st.position.set(Math.cos(a) * 0.25, Math.sin(time * 6 + i) * 0.03, Math.sin(a) * 0.25); });
    // Flying hat.
    if (s.hatFly && rig.hat && !s.hatFly.landed) {
      const h = rig.hat;
      s.hatFly.vel.y -= 9 * sdt;
      h.position.addScaledVector(s.hatFly.vel, sdt);
      h.rotation.x += s.hatFly.spin.x * sdt; h.rotation.y += s.hatFly.spin.y * sdt; h.rotation.z += s.hatFly.spin.z * sdt;
      const floorY = Math.hypot(h.position.x, h.position.z) < TABLE_R + 0.05 ? TABLE_Y + 0.02 : 0.02;
      if (h.position.y < floorY) { h.position.y = floorY; s.hatFly.landed = true; h.rotation.set(Math.random() < 0.5 ? 0 : Math.PI, Math.random() * 6, 0); }
    }

    // Selection ring & tag.
    const tappable = this.ui?.pickPlayers.includes(p.id);
    const hovered = this.hover?.kind === 'player' && this.hover.id === p.id;
    const ringMat = rig.ring.material as THREE.MeshBasicMaterial;
    const marked = v.me?.target === p.id && v.phase === 'LOAD';
    ringMat.opacity = marked ? 0.9 : tappable ? (hovered ? 0.95 : 0.45 + Math.sin(time * 5) * 0.2) : 0;
    if (marked) ringMat.color.set('#ff2a1a');
    if (s.crown) {
      const glow = s.crown.userData.glow as THREE.Sprite;
      glow.material.opacity = 0.55 + Math.sin(time * 2.3) * 0.25 + Math.random() * 0.1; // ember breathing
    }
    const sc = 1 + this.portrait * 0.3;
    s.tag.scale.set(0.62 * sc, 0.242 * sc, 1);
    s.tag.position.y = 2.02 - s.duck * 0.3 - s.fall * 1.2;
    s.tag.visible = !s.isMe;
  }

  private animateParticles(dt: number) {
    this.parts = this.parts.filter(p => {
      p.age += dt;
      if (p.age > p.life) { this.scene.remove(p.mesh); return false; }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === 'smoke') {
        const k = p.age / p.life;
        const sp = p.mesh as THREE.Sprite;
        sp.material.opacity = 0.55 * (1 - k);
        const s = (p.grow ?? 0.2) * (0.3 + k);
        sp.scale.setScalar(s);
        sp.material.rotation += dt * 0.3;
        p.vel.multiplyScalar(1 - dt * 0.6);
        return true;
      }
      const onTable = Math.hypot(p.mesh.position.x, p.mesh.position.z) < TABLE_R + 0.06;
      const floorY = onTable && p.mesh.position.y > TABLE_Y - 0.2 ? TABLE_Y + 0.015 : 0.01;
      if (p.mesh.position.y <= floorY && p.vel.y < 0) {
        if (p.kind === 'blood') {
          this.floorDecal(p.mesh.position.clone(), 0.06 + Math.random() * 0.14);
          this.scene.remove(p.mesh);
          return false;
        }
        if (p.kind === 'casing') {
          p.mesh.position.y = floorY;
          if (Math.abs(p.vel.y) > 0.6) { p.vel.y *= -0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; sfx.clink(); } else p.vel.set(0, 0, 0);
          p.mesh.rotation.z += 1.5;
          return true;
        }
        this.scene.remove(p.mesh);
        return false;
      }
      if (p.kind === 'casing') p.mesh.rotation.x += dt * 20;
      return true;
    });
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function radialTexture() {
  const [c, g] = labelCanvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  // star spikes
  g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 4;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; g.beginPath(); g.moveTo(64 - Math.cos(a) * 60, 64 - Math.sin(a) * 60); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function markerTexture() {
  const [c, g] = labelCanvas(256, 256);
  g.translate(128, 128);
  g.strokeStyle = '#ff2a1a'; g.lineWidth = 10;
  g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 8;
  for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -100); g.lineTo(0, -45); g.stroke(); }
  g.fillStyle = '#ff2a1a'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
