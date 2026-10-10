// One room = one table. Wraps the pure engine with timers, seats, bots and broadcasting.

import {
  botAction, createGame, filterView, GameError, reduce,
  type Action, type BotLevel, type GameState, type PlayerId,
} from '@standoff/engine';
import {
  BOT_NAMES, CHARACTERS, DEFAULT_ROOM_SETTINGS, LOOT_REVEAL_FIRST_MS, LOOT_REVEAL_MS, phaseDuration,
  type ChatMessage, type GameMessage, type Intent, type LobbyView, type RoomSettings, type TimerKey,
} from '@standoff/shared';

export interface SeatState {
  playerId: PlayerId;
  name: string;
  avatar: string;
  token: string;          // secret reconnection token
  isBot: boolean;
  botLevel: BotLevel;
  socketIds: Set<string>;
  disconnectedAt: number | null;
  takenOverByBot: boolean;
}

export interface RoomHooks {
  /** Send a game view to one socket. */
  sendView(socketId: string, msg: GameMessage): void;
  sendLobby(lobby: LobbyView): void;
  sendChat(msg: ChatMessage): void;
  onGameOver?(room: Room): void;
  now(): number;
  /** Multiplier on all timers (tests run fast). */
  timeScale: number;
}

export const RECONNECT_GRACE_MS = 60_000;

export class Room {
  hostId: PlayerId = '';
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  seats: SeatState[] = [];
  spectators = new Set<string>();
  state: GameState | null = null;
  actions: Action[] = [];
  seed = '';
  phaseEndsAt = 0;
  chat: ChatMessage[] = [];
  tutorial = false;
  lastActivity: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private feintRolled = new Set<string>();
  private botRngState = 0;
  private chatId = 0;
  private seq = 0;

  constructor(public code: string, private hooks: RoomHooks) {
    this.lastActivity = hooks.now();
  }

  // ── Seats ────────────────────────────────────────────────────────────────

  addHuman(name: string, avatar: string): SeatState {
    const seat: SeatState = {
      playerId: `h${++this.seq}`, name: clean(name) || 'Stranger', avatar: validAvatar(avatar),
      token: randomHex(16), isBot: false, botLevel: this.settings.botLevel,
      socketIds: new Set(), disconnectedAt: null, takenOverByBot: false,
    };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.playerId;
    return seat;
  }

  addBot(): SeatState {
    const used = new Set(this.seats.map(s => s.name));
    const name = BOT_NAMES.find(n => !used.has(n)) ?? `Bot ${this.seats.length + 1}`;
    const usedAv = new Set(this.seats.map(s => s.avatar));
    const avatar = (CHARACTERS.find(c => !usedAv.has(c.id)) ?? CHARACTERS[this.seats.length % CHARACTERS.length]).id;
    const seat: SeatState = {
      playerId: `b${++this.seq}`, name, avatar, token: '', isBot: true, botLevel: this.settings.botLevel,
      socketIds: new Set(), disconnectedAt: null, takenOverByBot: false,
    };
    this.seats.push(seat);
    return seat;
  }

  removeSeat(playerId: PlayerId) {
    this.seats = this.seats.filter(s => s.playerId !== playerId);
    if (this.hostId === playerId) this.hostId = this.seats.find(s => !s.isBot)?.playerId ?? '';
  }

  seatBySocket(socketId: string) {
    return this.seats.find(s => s.socketIds.has(socketId)) ?? null;
  }

  humans() {
    return this.seats.filter(s => !s.isBot);
  }

  connect(seat: SeatState, socketId: string) {
    seat.socketIds.add(socketId);
    seat.disconnectedAt = null;
    if (seat.takenOverByBot && this.state) {
      seat.takenOverByBot = false;
      this.dispatch({ type: 'REPLACE_WITH_BOT', playerId: seat.playerId, isBot: false });
    }
    this.touch();
  }

  disconnect(socketId: string) {
    this.spectators.delete(socketId);
    const seat = this.seatBySocket(socketId);
    if (!seat) return;
    seat.socketIds.delete(socketId);
    if (seat.socketIds.size > 0) return;
    if (!this.state) {
      // In the lobby, leaving frees the seat.
      this.removeSeat(seat.playerId);
      return;
    }
    seat.disconnectedAt = this.hooks.now();
    const at = seat.disconnectedAt;
    setTimeout(() => {
      if (seat.disconnectedAt !== at || !this.state || this.state.phase === 'GAME_OVER') return;
      if (this.settings.botTakeover) {
        seat.takenOverByBot = true;
        this.dispatch({ type: 'REPLACE_WITH_BOT', playerId: seat.playerId, isBot: true });
      }
    }, RECONNECT_GRACE_MS * this.hooks.timeScale);
  }

  lobby(): LobbyView {
    return {
      code: this.code,
      hostId: this.hostId,
      settings: this.settings,
      seats: this.seats.map(s => ({
        playerId: s.playerId, name: s.name, avatar: s.avatar, isBot: s.isBot || s.takenOverByBot,
        connected: s.isBot || s.socketIds.size > 0, isHost: s.playerId === this.hostId,
      })),
      spectators: this.spectators.size,
      inGame: !!this.state && this.state.phase !== 'GAME_OVER',
    };
  }

  updateSettings(p: Partial<RoomSettings>) {
    const s = { ...this.settings };
    if (p.maxPlayers !== undefined) s.maxPlayers = Math.max(3, Math.min(8, Math.floor(p.maxPlayers)));
    if (p.timers && ['FAST', 'NORMAL', 'CHILL'].includes(p.timers)) s.timers = p.timers;
    // Powers and open vaults are not offered any more: always off.
    s.powers = false;
    s.openVaults = false;
    if (p.noStandRule && ['ROLLOVER', 'DISCARD'].includes(p.noStandRule)) s.noStandRule = p.noStandRule;
    if (p.botLevel && ['EASY', 'NORMAL', 'SHARK'].includes(p.botLevel)) s.botLevel = p.botLevel;
    if (typeof p.botTakeover === 'boolean') s.botTakeover = p.botTakeover;
    this.settings = s;
    for (const seat of this.seats) if (seat.isBot) seat.botLevel = s.botLevel;
  }

  // ── Game lifecycle ───────────────────────────────────────────────────────

  start(tutorial = false): string | null {
    if (this.state && this.state.phase !== 'GAME_OVER') return 'already playing';
    this.tutorial = tutorial;
    if (tutorial) {
      this.seats = this.seats.filter(s => !s.isBot);
      this.settings = { ...this.settings, timers: 'CHILL', botLevel: 'EASY', powers: false };
      while (this.seats.length < 4) this.addBot();
    }
    if (this.seats.length < 3) return 'need at least 3 players (add bots to fill seats)';
    if (this.seats.length > 8) return 'at most 8 players';
    this.seed = randomHex(16);
    this.botRngState = parseInt(this.seed.slice(0, 8), 16);
    this.actions = [];
    this.feintRolled.clear();
    this.state = createGame(
      this.seats.map(s => ({ id: s.playerId, name: s.name, avatar: s.avatar, isBot: s.isBot })),
      { seed: this.seed, settings: { powers: this.settings.powers, openVaults: this.settings.openVaults, noStandRule: this.settings.noStandRule } },
    );
    // Players already gone for good become bots immediately.
    for (const seat of this.seats) {
      if (!seat.isBot && seat.socketIds.size === 0 && seat.disconnectedAt && this.settings.botTakeover) seat.takenOverByBot = true;
    }
    this.chat.push(this.system('@doorsLocked'));
    this.hooks.sendChat(this.chat[this.chat.length - 1]);
    this.afterChange(-1);
    return null;
  }

  /** Apply a client intent for the seat. Returns an error code or null. */
  intent(playerId: PlayerId, intent: Intent): string | null {
    if (!this.state) return 'NO_GAME';
    if (this.hooks.now() > this.phaseEndsAt + 150 && intent.type !== 'DICTATE') return 'LATE';
    return this.dispatch({ ...intent, playerId } as Action);
  }

  /** The single entry point that changes game state. */
  dispatch(action: Action): string | null {
    if (!this.state) return 'NO_GAME';
    const before = this.state.phaseSeq;
    try {
      this.state = reduce(this.state, action);
    } catch (e) {
      if (e instanceof GameError) return e.code;
      throw e;
    }
    this.actions.push(action);
    this.touch();
    this.afterChange(before);
    return null;
  }

  private afterChange(prevSeq: number) {
    const s = this.state!;
    if (s.phaseSeq !== prevSeq) this.armTimer();
    this.broadcast();
    if (s.phase === 'GAME_OVER') {
      this.clearTimers();
      this.hooks.onGameOver?.(this);
      return;
    }
    this.scheduleBots();
    this.botChatter();
  }

  private armTimer() {
    const s = this.state!;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (s.phase === 'GAME_OVER') return;
    const key: TimerKey = s.pending && s.phase === 'SPLIT' ? 'PENDING' : s.phase as TimerKey;
    let ms = phaseDuration(this.settings.timers, key);
    // Showdown waits longer if a Smart player must choose.
    if (s.phase === 'SHOWDOWN' && s.pending) ms += phaseDuration(this.settings.timers, 'PENDING');
    // The reveal is a show, not a decision: the loot pours out of the heist bag at the same pace in every preset,
    // and the first heist also plays the getaway cutscene.
    if (s.phase === 'LOOT_REVEAL') ms = s.round === 1 ? LOOT_REVEAL_FIRST_MS : LOOT_REVEAL_MS;
    ms = Math.max(20, ms * this.hooks.timeScale);
    this.phaseEndsAt = this.hooks.now() + ms;
    const seq = s.phaseSeq;
    this.timer = setTimeout(() => {
      if (!this.state || this.state.phaseSeq !== seq) return;
      this.dispatch({ type: 'TIMEOUT', phaseSeq: seq });
    }, ms);
  }

  broadcast() {
    if (!this.state) return;
    const serverNow = this.hooks.now();
    for (const seat of this.seats) {
      if (seat.socketIds.size === 0) continue;
      const msg: GameMessage = { view: filterView(this.state, seat.playerId), phaseEndsAt: this.phaseEndsAt, serverNow };
      for (const sid of seat.socketIds) this.hooks.sendView(sid, msg);
    }
    if (this.spectators.size) {
      const msg: GameMessage = { view: filterView(this.state, null), phaseEndsAt: this.phaseEndsAt, serverNow };
      for (const sid of this.spectators) this.hooks.sendView(sid, msg);
    }
  }

  viewFor(socketId: string): GameMessage | null {
    if (!this.state) return null;
    const seat = this.seatBySocket(socketId);
    return { view: filterView(this.state, seat?.playerId ?? null), phaseEndsAt: this.phaseEndsAt, serverNow: this.hooks.now() };
  }

  // ── Bots ─────────────────────────────────────────────────────────────────

  private rand = () => {
    // mulberry32 for bot think-time & choices (not part of game determinism: bot actions are logged)
    let t = (this.botRngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ── Bot table talk ─────────────────────────────────────────────────────
  private chatterSeq = -1;
  private botChatter() {
    const s = this.state;
    if (!s || s.phaseSeq === this.chatterSeq) return;
    this.chatterSeq = s.phaseSeq;
    const bots = this.seats.filter(x => (x.isBot || x.takenOverByBot) && s.players.find(p => p.id === x.playerId)?.alive);
    if (!bots.length) return;
    const pick = <T,>(arr: T[]) => arr[Math.floor(this.rand() * arr.length)];
    let budget = 2;
    const say = (seat: SeatState, taunt: string, delay: number) => {
      if (budget-- <= 0) return;
      setTimeout(() => {
        if (!this.state) return;
        const m = this.addChat(seat, '', taunt);
        this.hooks.sendChat(m);
      }, delay * this.hooks.timeScale);
    };
    const seatOf = (id: string) => bots.find(b => b.playerId === id);
    switch (s.phase) {
      case 'LOOT_REVEAL':
        if (this.rand() < 0.45) say(pick(bots), pick(['MY_MONEY', 'FAMILY', 'BUSINESS', 'CAPISCE']), 1400 + this.rand() * 1500);
        break;
      case 'COURAGE':
        for (const p of s.players) {
          const bot = seatOf(p.id);
          if (!bot) continue;
          const onMe = s.players.filter(o => o.alive && o.target === p.id).length;
          if (onMe && this.rand() < 0.3 + onMe * 0.1) say(bot, pick(['TRY_ME', 'NOT_TODAY', 'LIAR', 'TRUCE', 'FORGET_IT']), 300 + this.rand() * 1800);
          else if (p.target && this.rand() < 0.18) say(bot, pick(['CAPISCE', 'LOADED', 'NOTHING_PERSONAL']), 300 + this.rand() * 1800);
        }
        break;
      case 'SHOWDOWN': {
        const ev = [...s.log].reverse().find(e => e.t === 'SHOWDOWN');
        if (!ev || ev.t !== 'SHOWDOWN') break;
        for (const r of ev.reveals) {
          const bot = seatOf(r.playerId);
          if (bot && r.card === 'BANG' && ev.wounds[r.target] && this.rand() < 0.55) say(bot, pick(['BADA_BING', 'NOTHING_PERSONAL', 'BUSINESS', 'CAPISCE']), 1700 + this.rand() * 900);
        }
        break;
      }
      case 'SPLIT':
        if (this.rand() < 0.25) say(pick(bots), pick(['MY_MONEY', 'FAMILY']), 800 + this.rand() * 2000);
        break;
    }
  }

  private scheduleBots() {
    const s = this.state!;
    for (const seat of this.seats) {
      const p = s.players.find(x => x.id === seat.playerId);
      if (!p) continue;
      const botControlled = seat.isBot || seat.takenOverByBot;
      if (!botControlled) continue;
      const key = `${seat.playerId}:${s.phaseSeq}`;
      if (this.botTimers.has(key)) continue;
      const action = botAction(filterView(s, seat.playerId), seat.botLevel, this.rand);
      if (!action) continue;
      const delay = this.botDelay(s, action) * this.hooks.timeScale;
      const seqAtSchedule = s.phaseSeq;
      this.botTimers.set(key, setTimeout(() => {
        this.botTimers.delete(key);
        if (!this.state || this.state.phaseSeq !== seqAtSchedule) return;
        // re-decide on the latest view (things may have moved, e.g. aims)
        const fresh = botAction(filterView(this.state, seat.playerId), seat.botLevel, this.rand);
        if (fresh) this.dispatch(fresh);
      }, delay));
    }
  }

  /** Live mind games: some bots swing their gun to someone else late in the countdown. */
  private scheduleFeint(playerId: PlayerId, level: BotLevel, seq: number) {
    const key = `${playerId}:${seq}:feint`;
    if (this.feintRolled.has(key)) return;
    this.feintRolled.add(key);
    const chance = level === 'SHARK' ? 0.45 : 0.2;
    if (this.rand() > chance) return;
    const budget = phaseDuration(this.settings.timers, 'HOLD_UP');
    const delay = budget * (0.78 + this.rand() * 0.12) * this.hooks.timeScale;
    this.botTimers.set(key, setTimeout(() => {
      this.botTimers.delete(key);
      const st = this.state;
      if (!st || st.phaseSeq !== seq || st.phase !== 'HOLD_UP') return;
      const me = st.players.find(x => x.id === playerId);
      if (!me?.alive || !me.target) return;
      const options = st.players.filter(x => x.alive && x.id !== playerId && x.id !== me.target);
      if (options.length === 0) return;
      // prefer swinging onto someone who is pointing at us
      const threats = options.filter(x => x.target === playerId);
      const pool = threats.length ? threats : options;
      this.dispatch({ type: 'AIM', playerId, target: pool[Math.floor(this.rand() * pool.length)].id });
    }, delay));
  }

  /** Human-ish think time; aims land inside the countdown so they look live. */
  private botDelay(s: GameState, a: Action): number {
    const budget = phaseDuration(this.settings.timers, s.phase as TimerKey);
    switch (a.type) {
      case 'AIM': return 600 + this.rand() * Math.max(800, budget * 0.45);
      case 'DECIDE': return budget * (0.25 + this.rand() * 0.5);
      case 'LOAD': return 900 + this.rand() * Math.max(800, budget * 0.3);
      case 'PICK': return 700 + this.rand() * 1500;
      case 'DICTATE': return 300 + this.rand() * 600;
      default: return 800 + this.rand() * 1800;
    }
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  system(text: string): ChatMessage {
    return { id: ++this.chatId, from: null, name: '', text, at: this.hooks.now() };
  }

  addChat(from: SeatState | null, text: string, taunt?: string): ChatMessage {
    const msg: ChatMessage = { id: ++this.chatId, from: from?.playerId ?? null, name: from?.name ?? 'Spectator', text: clean(text, 200).replace(/^@+/, ''), taunt, at: this.hooks.now() };
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.shift();
    return msg;
  }

  // ── Housekeeping ─────────────────────────────────────────────────────────

  touch() { this.lastActivity = this.hooks.now(); }

  clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const t of this.botTimers.values()) clearTimeout(t);
    this.botTimers.clear();
  }

  replayRecord() {
    return {
      code: this.code,
      seed: this.seed,
      players: this.state?.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot })),
      settings: this.state?.settings,
      actions: this.actions,
      winners: this.state?.winners,
      finishedAt: new Date().toISOString(),
    };
  }
}

/** Cryptographically random hex; works in Node 20+ and browsers. */
function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function clean(s: string, max = 20): string {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function validAvatar(a: string): string {
  return CHARACTERS.some(c => c.id === a) ? a : CHARACTERS[0].id;
}
