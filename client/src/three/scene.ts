// The bar: a first-person seat at a round table, one lamp, everyone armed.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ClientView, LootCard, PublicPlayer } from '@standoff/engine';
import { NEW_BOSS_TOKEN } from '@standoff/engine';
import { characterById } from '@standoff/shared';
import {
  SEAT_R, TABLE_Y, buildCard, buildCharacter, buildCrown, buildLamp, buildLoot, buildRevolver, buildRoom, buildTable,
  setCardFace, MAT, type CharacterRig,
} from './models';
import { labelCanvas } from './textures';

export interface SceneUI {
  pickPlayers: string[];
  onPickPlayer?: (id: string) => void;
  pickCards: boolean;
  onPickCard?: (id: string) => void;
  pickLoot: string[];
  onPickLoot?: (id: string) => void;
  selectedLoot: string[];
  reducedMotion: boolean;
  labels: { boss: string; out: string; you: string };
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
  loaded: THREE.Mesh;
  bandages: THREE.Mesh[];
  duck: number;
  slump: number;
  hit: number;
  greyed: boolean;
  crown: THREE.Group | null;
  glance: THREE.Vector3;
  glanceAt: number;
}

interface LootObj { id: string; group: THREE.Group; label: THREE.Sprite; home: THREE.Vector3; born: number; ring: THREE.Mesh; fly?: { from: THREE.Vector3; to: THREE.Vector3; start: number } }

interface Fx { obj: THREE.Object3D; t: number; life: number; update: (k: number) => void }

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const LOWERED = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.95, -0.25, 0));
const AIM_VISIBLE = new Set(['LOAD', 'KID_AIM', 'CUNNING_SWAP', 'BOSS_PRIVILEGE', 'REDIRECT', 'COURAGE', 'SHOWDOWN']);
const REVEAL = new Set(['SHOWDOWN', 'SPLIT', 'ROUND_END']);

export class BarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private spot: THREE.SpotLight;
  private seats = new Map<string, Seat>();
  private rosterKey = '';
  private loot = new Map<string, LootObj>();
  private myCards = new Map<string, THREE.Mesh>();
  private cardsRoot = new THREE.Group(); // my cards live here so they stay visible in first person
  private fx: Fx[] = [];
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
  private portrait = 0;
  private camPos = new THREE.Vector3(0, 1.4, 2);
  private camLook = new THREE.Vector3(0, 0.9, 0);
  private viewGun: THREE.Group;
  private viewMuzzle: THREE.Object3D;
  private dust: THREE.Points;
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private disposed = false;
  private flashTex: THREE.Texture;
  private insets = { top: 0, bottom: 0 };
  private perf = { frames: 0, time: 0, low: false };
  private viewH = 1;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'bar-canvas';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#07050a');
    // Soft reflections so brass, gold and gun metal read as metal instead of black.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.28;
    pmrem.dispose();
    this.scene.fog = new THREE.FogExp2('#0b0709', 0.085);
    this.scene.add(new THREE.HemisphereLight('#3a3044', '#120a08', 0.55));
    const rim = new THREE.DirectionalLight('#6a7bd8', 0.35);
    rim.position.set(-3, 3, -4);
    this.scene.add(rim);
    buildRoom(this.scene);
    this.scene.add(buildTable());
    this.spot = buildLamp(this.scene).spot;
    // Warm bounce off the felt so faces across the table read clearly.
    const faces = new THREE.PointLight('#ffcf9a', 5, 4.2, 1.4);
    faces.position.set(0, 1.55, 0);
    this.scene.add(faces);
    this.scene.add(this.camera);
    this.scene.add(this.cardsRoot);

    // First-person gun + hand.
    const vm = buildRevolver(1.1);
    this.viewGun = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), new THREE.MeshStandardMaterial({ color: '#2b2731', roughness: 0.7 }));
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, -0.03, -0.2);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshStandardMaterial({ color: '#d9a77c', roughness: 0.6 }));
    hand.position.set(0, -0.03, -0.05);
    this.viewGun.add(vm.gun, sleeve, hand);
    this.viewMuzzle = vm.muzzle;
    this.viewGun.position.set(0.24, -0.22, -0.48);
    this.camera.add(this.viewGun);

    // Dust motes in the lamp light.
    const n = 260;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 1.1, a = Math.random() * Math.PI * 2;
      pts.set([Math.cos(a) * r, 0.9 + Math.random() * 1.7, Math.sin(a) * r], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffe2b0', size: 0.012, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);

    this.flashTex = radialTexture();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const el = this.renderer.domElement;
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Sizing & camera ────────────────────────────────────────────────────

  /** HUD covers the top and bottom of the canvas: keep the table centred in what's left. */
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
    // Landscape = first-person seat; portrait = high over-the-shoulder view so the whole table fits.
    const visH = Math.max(1, h - this.insets.top - this.insets.bottom * 0.75);
    this.portrait = THREE.MathUtils.clamp((1.25 - w / visH) / 0.55, 0, 1);
    // Shift the projection centre into the uncovered band.
    const delta = Math.max(0, h / 2 - (this.insets.top + visH / 2));
    this.viewH = h + 2 * delta;
    this.camera.aspect = w / this.viewH;
    if (delta > 1) this.camera.setViewOffset(w, this.viewH, 0, 2 * delta, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number) {
    const v = this.view;
    const me = v?.viewerId ? this.seats.get(v.viewerId) : null;
    const p = this.portrait;
    const myDuck = me ? me.duck : 0;

    // Where we look: the table, or the rival we're aiming at.
    const look = new THREE.Vector3(0, 0.92, 0);
    const myTarget = v?.me?.target && v.players.find(x => x.id === v.me!.target)?.alive ? v.me.target : null;
    if (myTarget && this.seats.has(myTarget) && v && AIM_VISIBLE.has(v.phase)) {
      look.lerp(this.headPos(myTarget, tmpV2), 0.55);
    }
    const fpPos = new THREE.Vector3(0, 1.36 - myDuck * 0.62, SEAT_R + 0.1);
    const fpLook = look.clone(); fpLook.y -= myDuck * 0.2;
    const hiPos = new THREE.Vector3(0, 3.0, SEAT_R + 1.25);
    const hiLook = new THREE.Vector3(0, 0.62, -0.1);
    const targetPos = fpPos.lerp(hiPos, p);
    const targetLook = fpLook.lerp(hiLook, p);

    // Drag-to-look (yaw around the seat), springing back slowly when released.
    if (!this.drag) { this.yaw *= 1 - Math.min(1, dt * 0.6); this.pitch *= 1 - Math.min(1, dt * 0.6); }
    const yawLimit = p > 0.5 ? 0.45 : 1.25;
    this.yaw = THREE.MathUtils.clamp(this.yaw, -yawLimit, yawLimit);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.35, 0.35);
    const off = targetLook.clone().sub(targetPos);
    off.applyAxisAngle(UP, this.yaw);
    off.y += this.pitch * off.length() * 0.6;
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(targetPos, k);
    this.camLook.lerp(targetPos.clone().add(off), k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.04;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.camLook);
    const h = Math.max(1, this.host.clientHeight);
    const w = Math.max(1, this.host.clientWidth);
    // Portrait screens are narrow: pick the vertical fov that still shows ~64° across.
    const portraitFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) * h / w));
    const baseFov = THREE.MathUtils.lerp(64, Math.min(105, portraitFov), p);
    // the offset view is a crop of a taller frustum: widen it so the visible slice keeps baseFov
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * (this.viewH / h)));
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

    // Viewmodel gun only in first person.
    this.viewGun.visible = p < 0.5 && !!me && v!.players.find(x => x.id === v!.viewerId)?.alive === true;
    if (this.viewGun.visible) {
      const aimed = myTarget && v && AIM_VISIBLE.has(v.phase) && myDuck < 0.5;
      if (aimed) {
        const goal = new THREE.Object3D();
        goal.position.copy(this.viewGun.position);
        this.camera.add(goal);
        goal.lookAt(this.headPos(myTarget!, tmpV));
        this.camera.remove(goal);
        this.viewGun.quaternion.slerp(goal.quaternion, 1 - Math.exp(-dt * 10));
        this.viewGun.position.lerp(tmpV.set(0.2, -0.17, -0.42), k);
      } else {
        this.viewGun.quaternion.slerp(tmpQ.setFromEuler(new THREE.Euler(-0.55, 0.25, 0)), 1 - Math.exp(-dt * 6));
        this.viewGun.position.lerp(tmpV.set(0.26, -0.3, -0.45), k);
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
    for (const s of this.seats.values()) this.scene.remove(s.rig.root);
    this.seats.clear();
    order.forEach((p, k) => {
      const rig = buildCharacter(characterById(p.avatar));
      const phi = (-2 * Math.PI * k) / order.length;
      const pos = new THREE.Vector3(Math.sin(phi) * SEAT_R, 0, Math.cos(phi) * SEAT_R);
      rig.root.position.copy(pos);
      rig.root.lookAt(0, 0, 0);
      rig.root.traverse(o => { o.userData.pick = { kind: 'player', id: p.id } satisfies Pick; });
      this.scene.add(rig.root);

      const [c, ctx] = labelCanvas(512, 200);
      const tagTex = new THREE.CanvasTexture(c);
      tagTex.colorSpace = THREE.SRGBColorSpace;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true }));
      tag.renderOrder = 20;
      tag.position.set(0, 1.98, 0);
      tag.scale.set(0.62, 0.242, 1);
      rig.root.add(tag);

      const hand = new THREE.Group();
      hand.position.set(0, TABLE_Y + 0.035, 0.72);
      rig.root.add(hand);
      const loaded = buildCard('BACK');
      loaded.position.set(0.0, TABLE_Y + 0.04, 0.92);
      loaded.rotation.z = Math.PI; // face down
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

      this.seats.set(p.id, {
        id: p.id, rig, isMe: p.id === v.viewerId, pos, tag, tagCtx: ctx, tagTex, tagKey: '', hand, handKey: '', loaded,
        bandages, duck: 0, slump: 0, hit: 0, greyed: false, crown: null, glance: new THREE.Vector3(0, 0.9, 0), glanceAt: 0,
      });
    });
    for (const m of this.myCards.values()) m.parent?.remove(m);
    this.myCards.clear();
    const me = v.viewerId ? this.seats.get(v.viewerId) : null;
    if (me) { this.cardsRoot.position.copy(me.rig.root.position); this.cardsRoot.quaternion.copy(me.rig.root.quaternion); }
  }

  // ── Public update from React ───────────────────────────────────────────

  update(v: ClientView, ui: SceneUI) {
    const prevView = this.view;
    this.view = v;
    this.ui = ui;
    this.buildSeats(v);
    this.syncLoot(v, prevView);
    this.syncCards(v);
    this.processEvents(v);
    this.refresh();
  }

  private refresh() {
    const v = this.view, ui = this.ui;
    if (!v || !ui) return;
    for (const p of v.players) {
      const s = this.seats.get(p.id);
      if (!s) continue;
      this.drawTag(s, p, v, ui);
      for (let i = 0; i < s.bandages.length; i++) s.bandages[i].visible = p.alive && i < p.wounds;
      // Crown on the Boss.
      if (p.id === v.bossId && !s.crown) { s.crown = buildCrown(); s.rig.crownAnchor.add(s.crown); }
      if (p.id !== v.bossId && s.crown) { s.crown.parent?.remove(s.crown); s.crown = null; }
      // Hand of card backs for rivals.
      if (!s.isMe) {
        const hk = `${p.handCount}`;
        if (hk !== s.handKey) {
          s.handKey = hk;
          s.hand.clear();
          for (let i = 0; i < p.handCount; i++) {
            const c = buildCard('BACK');
            c.rotation.z = Math.PI;
            const f = i - (p.handCount - 1) / 2;
            c.position.set(f * 0.035, i * 0.003, Math.abs(f) * 0.006);
            c.rotation.y = f * 0.12;
            s.hand.add(c);
          }
        }
      }
      // The chosen bullet: face down until the showdown reveals it.
      const showLoaded = (p.hasLoaded && !REVEAL.has(v.phase)) || (REVEAL.has(v.phase) && !!p.revealedCard && v.phase === 'SHOWDOWN');
      s.loaded.visible = showLoaded && !s.isMe && p.alive;
      if (s.loaded.visible) {
        if (REVEAL.has(v.phase) && p.revealedCard) { setCardFace(s.loaded, p.revealedCard); s.loaded.userData.flip = 0; }
        else setCardFace(s.loaded, 'BACK');
      }
      // Ring for tappable players.
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
    g.fillStyle = 'rgba(12,10,14,0.82)';
    roundRect(g, 16, 16, W - 32, H - 32, 26); g.fill();
    g.lineWidth = 6;
    g.strokeStyle = picking ? '#e2b23a' : tappable ? '#ff3b2f' : p.id === v.bossId ? '#8a5ad8' : 'rgba(243,230,196,0.25)';
    g.stroke();
    g.fillStyle = p.alive ? '#f3e6c4' : '#8b8a90';
    g.font = '700 58px "Barlow Condensed", "Cairo", sans-serif';
    g.textAlign = 'center';
    const name = p.name + (s.isMe ? ` · ${ui.labels.you}` : '');
    g.fillText(fit(g, name, 440), W / 2, 80);
    if (!p.alive) {
      g.fillStyle = '#d9372b'; g.font = '400 50px "Limelight", serif'; g.fillText(ui.labels.out, W / 2, 148);
    } else {
      // health pips
      const pip = 30, gap = 8, total = p.woundLimit * (pip + gap) - gap;
      let x = 60;
      for (let i = 0; i < p.woundLimit; i++) {
        g.fillStyle = i < p.woundLimit - p.wounds ? '#4fd36a' : '#4a2626';
        roundRect(g, x + i * (pip + gap), 112, pip, 26, 6); g.fill();
      }
      x += total + 30;
      // casings fired
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < p.shotsFired ? '#e0763a' : 'rgba(216,176,78,0.25)';
        roundRect(g, x + i * 20, 106, 12, 36, 4); g.fill();
      }
      x += 80;
      g.fillStyle = '#e2b23a'; g.font = '700 44px "Barlow Condensed", sans-serif'; g.textAlign = 'left';
      g.fillText(`$ ×${p.lootCount}`, x, 140);
    }
    if (p.id === v.bossId) {
      g.fillStyle = '#8a5ad8'; roundRect(g, W / 2 - 70, 0, 140, 34, 12); g.fill();
      g.fillStyle = '#fff'; g.font = '700 28px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText(ui.labels.boss, W / 2, 26);
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
        m = buildCard(c.kind);
        m.userData.pick = { kind: 'card', id: c.id } satisfies Pick;
        this.cardsRoot.add(m);
        this.myCards.set(c.id, m);
        m.position.set(0, TABLE_Y + 0.04, 0.6);
      }
      const isLoaded = v.me.loaded?.id === c.id;
      if (isLoaded) {
        m.userData.home = new THREE.Vector3(0, TABLE_Y + 0.05, 0.92);
        m.userData.rot = new THREE.Euler(-0.0, 0, 0);
      } else {
        const i = hand.findIndex(x => x.id === c.id);
        const f = i - (hand.length - 1) / 2;
        m.userData.home = new THREE.Vector3(f * 0.075, TABLE_Y + 0.035 + Math.abs(f) * 0.002, 0.66 - Math.abs(f) * 0.012);
        m.userData.rot = new THREE.Euler(-0.35, -f * 0.07, 0);
      }
    }
  }

  // ── Loot on the table ─────────────────────────────────────────────────

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
    // Items that left the table fly to whoever took them.
    for (const [id, o] of this.loot) {
      if (ids.has(id) || o.fly) continue;
      const pick = [...v.log].reverse().find(e => e.t === 'PICK' && (e.item === 'NEW_BOSS' ? NEW_BOSS_TOKEN === id : e.item.id === id));
      const taker = pick && pick.t === 'PICK' ? pick.playerId : null;
      const s = taker ? this.seats.get(taker) : null;
      if (s && prev && prev.round === v.round) {
        o.fly = { from: o.group.position.clone(), to: s.pos.clone().setY(1.1), start: performance.now() };
      } else {
        this.scene.remove(o.group, o.label);
        this.loot.delete(id);
      }
    }
    const slots = this.lootSlots(Math.max(0, items.length - (v.tokenAvailable ? 1 : 0)));
    let slot = 0;
    items.forEach((c, i) => {
      const id = c === 'NEW_BOSS' ? NEW_BOSS_TOKEN : c.id;
      let o = this.loot.get(id);
      const home = c === 'NEW_BOSS' ? new THREE.Vector3(0, TABLE_Y + 0.03, 0) : slots[slot++];
      if (!o) {
        const group = buildLoot(c, i);
        group.traverse(x => { x.userData.pick = { kind: 'loot', id } satisfies Pick; });
        group.position.copy(home).add(new THREE.Vector3(0, 1.6, 0));
        group.rotation.y = Math.atan2(home.x, home.z); // face outward, toward the nearest players
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
        o = { id, group, label, home, born: performance.now() + i * 70, ring };
        this.loot.set(id, o);
      }
      o.home = home;
      const text = this.ui ? this.ui.lootLabel(c) : '';
      if (o.label.userData.key !== text) {
        const { ctx, tex } = o.label.userData as { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
        ctx.clearRect(0, 0, 320, 80);
        ctx.font = '700 42px "Barlow Condensed", "Cairo", sans-serif';
        const tw = Math.min(300, ctx.measureText(text).width + 40);
        ctx.fillStyle = 'rgba(12,10,14,0.8)'; roundRect(ctx, 160 - tw / 2, 8, tw, 64, 18); ctx.fill();
        ctx.fillStyle = c !== 'NEW_BOSS' && (c.kind === 'CASH' || c.kind === 'DIAMOND') ? '#b8f0a6' : c === 'NEW_BOSS' ? '#d9c8f5' : '#f3e6c4';
        ctx.font = '700 42px "Barlow Condensed", "Cairo", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(fit(ctx, text, 280), 160, 56);
        tex.needsUpdate = true;
        o.label.userData.key = text;
      }
    });
  }

  // ── Showdown effects ──────────────────────────────────────────────────

  private processEvents(v: ClientView) {
    if (this.lastLog > v.log.length) this.lastLog = 0;
    const fresh = v.log.slice(this.lastLog);
    const first = this.lastLog === 0;
    this.lastLog = v.log.length;
    if (first) return;
    for (const e of fresh) {
      if (e.t !== 'SHOWDOWN') continue;
      e.reveals.forEach((r, i) => {
        setTimeout(() => this.fire(r.playerId, r.target, r.card === 'BANG'), 80 + i * 45);
      });
    }
  }

  private fire(shooterId: string, targetId: string, bang: boolean) {
    if (this.disposed) return;
    const shooter = this.seats.get(shooterId);
    if (!shooter) return;
    const isMeFP = shooter.isMe && this.portrait < 0.5;
    const muzzle = (isMeFP ? this.viewMuzzle : shooter.rig.muzzle).getWorldPosition(new THREE.Vector3());
    const target = this.headPos(targetId, new THREE.Vector3()).add(new THREE.Vector3(0, -0.12, 0));
    if (!bang) { this.floatText(muzzle, 'click', '#c9c7cf'); return; }
    // flash
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: '#ffcf6a', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.position.copy(muzzle);
    flash.scale.setScalar(0.45);
    const light = new THREE.PointLight('#ffa040', 18, 4, 2);
    light.position.copy(muzzle);
    this.scene.add(flash, light);
    this.fx.push({ obj: flash, t: 0, life: 0.16, update: k => { flash.material.opacity = 1 - k; flash.scale.setScalar(0.45 + k * 0.3); light.intensity = 18 * (1 - k); if (k >= 1) this.scene.remove(light); } });
    // tracer
    const dir = target.clone().sub(muzzle);
    const len = dir.length();
    const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
    tracer.position.copy(muzzle).addScaledVector(dir, 0.5);
    tracer.quaternion.setFromUnitVectors(UP, dir.normalize());
    this.scene.add(tracer);
    this.fx.push({ obj: tracer, t: 0, life: 0.3, update: k => { (tracer.material as THREE.MeshBasicMaterial).opacity = 1 - k; } });
    // impact
    const t = this.seats.get(targetId);
    if (t) t.hit = 1;
    this.floatText(target.clone().add(new THREE.Vector3(0, 0.35, 0)), 'BANG!', '#ffe066');
    this.shake = Math.min(1.2, this.shake + (targetId === this.view?.viewerId ? 1 : 0.5));
  }

  private floatText(at: THREE.Vector3, text: string, color: string) {
    const [c, g] = labelCanvas(256, 96);
    g.font = text === 'click' ? '700 56px "Barlow Condensed", sans-serif' : '400 70px "Limelight", serif';
    g.textAlign = 'center';
    g.lineWidth = 8; g.strokeStyle = text === 'click' ? '#16131a' : '#a81d14';
    g.strokeText(text, 128, 70);
    g.fillStyle = color; g.fillText(text, 128, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    sp.renderOrder = 30;
    sp.position.copy(at);
    sp.scale.set(0.36, 0.135, 1);
    this.scene.add(sp);
    const y0 = at.y;
    this.fx.push({ obj: sp, t: 0, life: 1.1, update: k => { sp.position.y = y0 + k * 0.3; sp.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; } });
  }

  /** Slow device? Drop bloom, soften shadows and render fewer pixels so the game stays playable. */
  private adaptQuality(dt: number) {
    if (this.perf.low) return;
    this.perf.frames++;
    this.perf.time += dt;
    if (this.perf.time < 4) return;
    const fps = this.perf.frames / this.perf.time;
    this.perf.frames = 0; this.perf.time = 0;
    if (fps < 28) {
      this.perf.low = true;
      this.renderer.setPixelRatio(1);
      this.spot.shadow.mapSize.set(512, 512);
      this.spot.shadow.map?.dispose();
      (this.spot.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
      this.resize();
    }
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

  // ── Frame loop ────────────────────────────────────────────────────────

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.2, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    const v = this.view, ui = this.ui;
    const reduced = ui?.reducedMotion ?? false;

    // Lamp flicker.
    this.spot.intensity = 30 * (1 - (Math.random() < 0.015 ? 0.35 : 0) - Math.sin(time * 11) * 0.01);
    this.dust.rotation.y += dt * 0.02;

    if (v) {
      const myDuckChoice = v.me?.stance === 'DUCK' && (v.phase === 'COURAGE' || REVEAL.has(v.phase));
      for (const p of v.players) {
        const s = this.seats.get(p.id);
        if (!s) continue;
        const rig = s.rig;
        // visibility of my own body
        if (s.isMe) rig.root.visible = false;
        // duck / slump / hit
        const ducking = s.isMe ? myDuckChoice : p.stance === 'DUCK' && REVEAL.has(v.phase);
        const downAfterHit = REVEAL.has(v.phase) && p.hitThisRound > 0;
        s.duck += ((ducking ? 1 : 0) - s.duck) * Math.min(1, dt * 7);
        s.slump += ((!p.alive ? 1 : downAfterHit ? 0.35 : 0) - s.slump) * Math.min(1, dt * 4);
        s.hit = Math.max(0, s.hit - dt * 2.2);
        const breath = reduced ? 0 : Math.sin(time * 1.6 + s.pos.x) * 0.012;
        rig.body.position.y = -s.duck * 0.62 + breath;
        rig.body.position.z = -s.duck * 0.15;
        rig.body.rotation.x = s.slump * 0.85 - s.hit * 0.45;
        if (!p.alive && !s.greyed) {
          s.greyed = true;
          for (const m of rig.materials) m.color.lerp(new THREE.Color('#55525a'), 0.7);
          rig.eyes.forEach(e => (e.visible = false));
          rig.deadEyes.forEach(e => (e.visible = true));
          rig.gun.visible = false;
        }

        // gun arm
        const showAim = p.alive && p.target && AIM_VISIBLE.has(v.phase) && s.duck < 0.5 && this.seats.has(p.target);
        let goal = LOWERED;
        if (showAim) {
          const pivotW = rig.armPivot.getWorldPosition(tmpV);
          const tgt = this.headPos(p.target!, tmpV2).add(new THREE.Vector3(0, -0.05, 0));
          tmpM.lookAt(tgt, pivotW, UP);
          tmpQ.setFromRotationMatrix(tmpM);
          const parentQ = rig.armPivot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
          goal = parentQ.multiply(tmpQ);
        }
        rig.armPivot.quaternion.slerp(goal, 1 - Math.exp(-dt * (showAim ? 9 : 5)));

        // head: look at your target, or glance around
        let look: THREE.Vector3;
        if (showAim) look = this.headPos(p.target!, tmpV2);
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
        rig.head.rotation.y += (yaw - rig.head.rotation.y) * Math.min(1, dt * 4);
        rig.head.rotation.x += ((p.alive ? pitch : 0.6) - rig.head.rotation.x) * Math.min(1, dt * 4);

        // selection ring
        const tappable = ui?.pickPlayers.includes(p.id);
        const hovered = this.hover?.kind === 'player' && this.hover.id === p.id;
        const ringMat = rig.ring.material as THREE.MeshBasicMaterial;
        ringMat.opacity = tappable ? (hovered ? 0.95 : 0.45 + Math.sin(time * 5) * 0.2) : (v.me?.target === p.id && v.phase === 'LOAD' ? 0.8 : 0);
        if (v.me?.target === p.id && v.phase === 'LOAD') ringMat.color.set('#ff3b2f');

        // crown bob
        if (s.crown) s.crown.rotation.y += dt * 0.8;
        // tag scale grows with the high camera
        const sc = 1 + this.portrait * 0.3;
        s.tag.scale.set(0.62 * sc, 0.242 * sc, 1);
        s.tag.position.y = 1.98 - s.duck * 0.3;
      }

      // my cards glide to their spots
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

      // loot: drop in, idle, highlight, fly away
      for (const [id, o] of this.loot) {
        if (o.fly) {
          const k = Math.min(1, (performance.now() - o.fly.start) / 550);
          o.group.position.lerpVectors(o.fly.from, o.fly.to, k);
          o.group.position.y += Math.sin(k * Math.PI) * 0.45;
          o.group.scale.setScalar(1 - k * 0.6);
          o.label.visible = false;
          if (k >= 1) { this.scene.remove(o.group, o.label); this.loot.delete(id); }
          continue;
        }
        const k = THREE.MathUtils.clamp((performance.now() - o.born) / 450, 0, 1);
        const bounce = k < 1 ? (1 - k) * (1 - k) * 1.6 + Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.12 : 0;
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
        o.label.visible = k >= 1 && !!v && (v.phase === 'LOOT_REVEAL' || v.phase === 'SPLIT' || this.hover?.id === id);
        const ls = 1 + this.portrait * 0.6;
        o.label.scale.set(0.25 * ls, 0.0625 * ls, 1);
      }
    }

    // fx
    this.fx = this.fx.filter(f => {
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      f.update(k);
      if (k >= 1) { this.scene.remove(f.obj); return false; }
      return true;
    });

    this.updateCamera(dt);
    this.adaptQuality(dt);
    if (this.perf.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  };
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
