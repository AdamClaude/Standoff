// STANDOFF rules engine: pure (state, action) → state.
// The reducer clones its input, so callers can keep old states around (replays, bots).

import {
  type Action, type BulletCard, type GameSettings, type GameState, type LootCard, type LootKind,
  type NewPlayer, type Player, type PlayerId, type Stance,
  DEFAULT_SETTINGS, GameError, NEW_BOSS_TOKEN,
} from './types.js';
import { seedToState, shuffle, pick, int } from './rng.js';
import { buildLootDeck, paintingValue, DIAMOND_BONUS } from './loot.js';
import * as powers from './powers.js';
import { hasPower, woundLimit } from './powers.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getPlayer(s: GameState, id: PlayerId): Player {
  const p = s.players.find(x => x.id === id);
  if (!p) throw new GameError('NOT_A_PLAYER', `unknown player ${id}`);
  return p;
}

export const alive = (s: GameState) => s.players.filter(p => p.alive);

/** Players in clockwise order starting at (and including) the given seat's player. */
export function clockwiseFrom(s: GameState, id: PlayerId): Player[] {
  const start = s.players.findIndex(p => p.id === id);
  const out: Player[] = [];
  for (let i = 0; i < s.players.length; i++) out.push(s.players[(start + i) % s.players.length]);
  return out;
}

function setPhase(s: GameState, phase: GameState['phase']) {
  s.phase = phase;
  s.phaseSeq++;
}

/** Bump the step counter without changing phase (new split turn, new pending choice). */
function bumpStep(s: GameState) {
  s.phaseSeq++;
}

function freshStats() {
  return { bangsFired: 0, ducks: 0, aimsSurvived: 0, bluffs: 0, hits: 0 };
}

/** Bullet ids are opaque ("k17") so an id never reveals a card's kind or original owner. */
function makeHand(ids: number[]): BulletCard[] {
  const kinds: ('BANG' | 'CLICK')[] = ['BANG', 'BANG', 'BANG', 'CLICK', 'CLICK', 'CLICK', 'CLICK', 'CLICK'];
  return kinds.map((kind, i) => ({ id: `k${ids[i]}`, kind }));
}

/** Cards still to be claimed this split (loot ids + the New Boss token). */
export function splitItems(s: GameState): string[] {
  const ids = s.table.map(c => c.id);
  if (s.tokenAvailable) ids.push(NEW_BOSS_TOKEN);
  return ids;
}

export function itemKind(s: GameState, itemId: string): LootKind | 'NEW_BOSS' {
  if (itemId === NEW_BOSS_TOKEN) return 'NEW_BOSS';
  const c = s.table.find(x => x.id === itemId);
  if (!c) throw new GameError('NO_SUCH_ITEM');
  return c.kind;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

export interface CreateOptions {
  seed: string;
  settings?: Partial<GameSettings>;
  bossId?: PlayerId;
}

export function createGame(newPlayers: NewPlayer[], opts: CreateOptions): GameState {
  if (newPlayers.length < 2) throw new Error('need at least 2 players');
  if (newPlayers.length > 8) throw new Error('at most 8 players');
  const settings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const rng = seedToState(opts.seed);

  const deck = shuffle(rng, buildLootDeck());
  const lootPiles: LootCard[][] = [];
  for (let r = 0; r < 8; r++) lootPiles.push(deck.slice(r * 8, r * 8 + 8));

  const bulletIds = shuffle(rng, Array.from({ length: newPlayers.length * 8 }, (_, i) => i));
  const players: Player[] = newPlayers.map((np, seat) => ({
    id: np.id, seat, name: np.name, avatar: np.avatar, isBot: !!np.isBot,
    hand: makeHand(bulletIds.slice(seat * 8, seat * 8 + 8)), loaded: null, target: null, stance: null,
    wounds: 0, alive: true, loot: [], power: null,
    publicBangsRevealed: 0, stats: freshStats(),
    hitThisRound: 0, revealedCard: null, inSplit: false,
    greedyUsed: false, dictatorUsed: false, junkUsed: false, splitPicks: [],
  }));

  const s: GameState = {
    seed: opts.seed, rng, settings, round: 0, phase: 'LOOT_REVEAL',
    players, bossId: '', nextBossId: null,
    lootPiles: lootPiles.slice(0, settings.rounds), table: [], tokenAvailable: true,
    discard: [], redirect: null, splitOrder: [], splitTurnIndex: 0,
    pending: null, dictate: null, log: [], scores: null, winners: null, phaseSeq: 0,
  };

  if (settings.powers) powers.dealPowers(s);
  s.bossId = opts.bossId ?? pick(s.rng, players).id;
  startRound(s);
  return s;
}

function startRound(s: GameState) {
  s.round += 1;
  const pile = s.lootPiles.shift() ?? [];
  s.table = [...s.table, ...pile]; // s.table holds any rolled-over loot
  s.tokenAvailable = true;
  s.nextBossId = null;
  s.redirect = null;
  s.pending = null;
  s.dictate = null;
  s.splitOrder = [];
  s.splitTurnIndex = 0;
  for (const p of s.players) {
    p.loaded = null; p.target = null; p.stance = null;
    p.hitThisRound = 0; p.revealedCard = null; p.inSplit = false;
    p.greedyUsed = false; p.dictatorUsed = false; p.junkUsed = false; p.splitPicks = [];
  }
  setPhase(s, 'LOOT_REVEAL');
  s.log.push({ t: 'ROUND_START', round: s.round, bossId: s.bossId, table: [...s.table] });
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function reduce(prev: GameState, action: Action): GameState {
  const s = structuredClone(prev);
  apply(s, action);
  return s;
}

/** Mutating version used internally (and by replays for speed). */
export function apply(s: GameState, a: Action): void {
  if (s.phase === 'GAME_OVER' && a.type !== 'REPLACE_WITH_BOT') throw new GameError('WRONG_PHASE', 'game is over');

  switch (a.type) {
    case 'TIMEOUT':
      if (a.phaseSeq !== s.phaseSeq) throw new GameError('STALE_TIMEOUT');
      return onTimeout(s);

    case 'REPLACE_WITH_BOT':
      getPlayer(s, a.playerId).isBot = a.isBot;
      return;

    case 'LOAD': {
      need(s, 'LOAD');
      // Bullet and target are chosen together, secretly, and can be changed until the countdown ends.
      const p = livePlayer(s, a.playerId);
      const i = p.hand.findIndex(c => c.id === a.cardId);
      if (i < 0) throw new GameError('NOT_IN_HAND');
      const card = p.hand.splice(i, 1)[0];
      if (p.loaded) p.hand.push(p.loaded); // swap back the previously chosen bullet
      p.loaded = card;
      maybeLockEarly(s);
      return;
    }

    case 'AIM': {
      need(s, 'LOAD');
      const p = livePlayer(s, a.playerId);
      if (hasPower(s, p, 'KID')) throw new GameError('NOT_ALLOWED', 'the Kid aims after everyone else');
      if (a.target !== null) validTarget(s, p, a.target);
      p.target = a.target;
      maybeLockEarly(s);
      return;
    }

    case 'KID_AIM': {
      need(s, 'KID_AIM');
      const p = livePlayer(s, a.playerId);
      if (!hasPower(s, p, 'KID')) throw new GameError('NOT_ALLOWED');
      if (a.target !== null) validTarget(s, p, a.target);
      p.target = a.target;
      s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'KID',
        text: a.target ? `aimed at ${getPlayer(s, a.target).name}` : 'did not aim' });
      afterKid(s);
      return;
    }

    case 'CUNNING_SWAP': {
      need(s, 'CUNNING_SWAP');
      const p = livePlayer(s, a.playerId);
      if (!hasPower(s, p, 'CUNNING')) throw new GameError('NOT_ALLOWED');
      if (a.cardId) {
        const i = p.hand.findIndex(c => c.id === a.cardId);
        if (i < 0) throw new GameError('NOT_IN_HAND');
        const swapped = p.hand.splice(i, 1, p.loaded!)[0];
        p.loaded = swapped;
        s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'CUNNING', text: 'swapped their loaded bullet… or did they?' });
      } else {
        s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'CUNNING', text: 'swapped their loaded bullet… or did they?' });
      }
      enterBossPrivilege(s);
      return;
    }

    case 'BOSS_REDIRECT': {
      need(s, 'BOSS_PRIVILEGE');
      if (a.playerId !== s.bossId) throw new GameError('NOT_BOSS');
      const ordered = livePlayer(s, a.target);
      if (!redirectCandidates(s).includes(ordered.id)) throw new GameError('BAD_TARGET', 'that player cannot be redirected');
      s.redirect = { by: s.bossId, player: ordered.id, from: ordered.target };
      s.log.push({ t: 'REDIRECT_ORDER', round: s.round, by: s.bossId, player: ordered.id });
      setPhase(s, 'REDIRECT');
      return;
    }

    case 'BOSS_PASS': {
      need(s, 'BOSS_PRIVILEGE');
      if (a.playerId !== s.bossId) throw new GameError('NOT_BOSS');
      s.log.push({ t: 'BOSS_PASSED', round: s.round });
      enterCourage(s);
      return;
    }

    case 'RETARGET': {
      need(s, 'REDIRECT');
      if (!s.redirect || a.playerId !== s.redirect.player) throw new GameError('NOT_YOUR_TURN');
      const p = livePlayer(s, a.playerId);
      if (a.target === s.redirect.from) throw new GameError('SAME_TARGET');
      validTarget(s, p, a.target);
      p.target = a.target;
      s.log.push({ t: 'REDIRECTED', round: s.round, player: p.id, to: a.target, auto: false });
      enterCourage(s);
      return;
    }

    case 'DECIDE': {
      need(s, 'COURAGE');
      const p = livePlayer(s, a.playerId);
      p.stance = a.stance;
      return;
    }

    case 'PICK': return doPick(s, a.playerId, a.itemId, a.secondItemId, false);

    case 'CHOOSE_DISCARD': return chooseDiscard(s, a.playerId, a.cardId);

    case 'DICTATE': {
      need(s, 'SPLIT');
      const p = livePlayer(s, a.playerId);
      if (!hasPower(s, p, 'DICTATOR') || !p.inSplit) throw new GameError('NOT_ALLOWED');
      if (p.dictatorUsed) throw new GameError('NOT_ALLOWED', 'already used this split');
      if (s.pending) throw new GameError('NOT_ALLOWED', 'wait for the pending choice');
      const picker = currentPicker(s);
      if (!picker || picker === p.id) throw new GameError('NOT_ALLOWED', 'you cannot ban yourself');
      p.dictatorUsed = true;
      s.dictate = { by: p.id, on: picker, kind: a.kind };
      s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'DICTATOR',
        text: `forbids ${getPlayer(s, picker).name} from taking ${a.kind.toLowerCase().replace('_', ' ')}` });
      return;
    }

    case 'JUNK_SWAP': {
      need(s, 'SPLIT');
      const p = livePlayer(s, a.playerId);
      if (!hasPower(s, p, 'JUNK_DEALER') || !p.inSplit || p.junkUsed) throw new GameError('NOT_ALLOWED');
      if (!p.splitPicks.includes(a.lootId)) throw new GameError('NO_SUCH_ITEM', 'only an item you picked this split');
      const victim = getPlayer(s, a.victimId);
      if (victim.id === p.id || !victim.alive || victim.loot.length === 0) throw new GameError('BAD_TARGET');
      const mine = p.loot.findIndex(c => c.id === a.lootId);
      if (mine < 0) throw new GameError('NO_SUCH_ITEM');
      const j = int(s.rng, victim.loot.length);
      const theirs = victim.loot.splice(j, 1)[0];
      const given = p.loot.splice(mine, 1)[0];
      p.loot.push(theirs);
      victim.loot.push(given);
      p.junkUsed = true;
      p.splitPicks = p.splitPicks.filter(id => id !== a.lootId);
      s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'JUNK_DEALER', text: `swapped an item with ${victim.name}` });
      return;
    }
  }
}


function need(s: GameState, phase: GameState['phase']) {
  if (s.phase !== phase) throw new GameError('WRONG_PHASE', `expected ${phase}, in ${s.phase}`);
}

function livePlayer(s: GameState, id: PlayerId): Player {
  const p = getPlayer(s, id);
  if (!p.alive) throw new GameError('DEAD');
  return p;
}

function validTarget(s: GameState, shooter: Player, targetId: PlayerId) {
  if (targetId === shooter.id) throw new GameError('BAD_TARGET', 'cannot aim at yourself');
  const t = s.players.find(p => p.id === targetId);
  if (!t) throw new GameError('BAD_TARGET', 'no such player');
  if (!t.alive) throw new GameError('BAD_TARGET', 'target is dead');
}

/** Players the Boss may order to switch target (the Boss may pick himself): alive, aiming, with an alternative. */
export function redirectCandidates(s: GameState): PlayerId[] {
  return alive(s)
    .filter(p => p.target !== null)
    .filter(p => retargetOptions(s, p.id, p.target).length > 0)
    .map(p => p.id);
}

export function retargetOptions(s: GameState, playerId: PlayerId, from: PlayerId | null): PlayerId[] {
  return alive(s).filter(o => o.id !== playerId && o.id !== from).map(o => o.id);
}

// ─── Phase transitions ─────────────────────────────────────────────────────

function onTimeout(s: GameState) {
  switch (s.phase) {
    case 'LOOT_REVEAL':
      setPhase(s, 'LOAD');
      powers.onRoundStart(s);
      return;
    case 'LOAD':
    case 'HOLD_UP': // legacy phase, no longer entered
      return lockLoadAndAim(s);
    case 'KID_AIM': {
      const kid = alive(s).find(p => hasPower(s, p, 'KID'));
      if (kid) s.log.push({ t: 'POWER', round: s.round, playerId: kid.id, power: 'KID', text: 'was too slow to aim' });
      return afterKid(s);
    }
    case 'CUNNING_SWAP':
      return enterBossPrivilege(s);
    case 'BOSS_PRIVILEGE':
      s.log.push({ t: 'BOSS_PASSED', round: s.round });
      return enterCourage(s);
    case 'REDIRECT': {
      const r = s.redirect!;
      const p = getPlayer(s, r.player);
      const to = pick(s.rng, retargetOptions(s, p.id, r.from));
      p.target = to;
      s.log.push({ t: 'REDIRECTED', round: s.round, player: p.id, to, auto: true });
      return enterCourage(s);
    }
    case 'COURAGE':
      return resolveCourage(s);
    case 'SHOWDOWN':
      if (s.pending) autoResolvePending(s);
      return enterSplit(s);
    case 'SPLIT':
      if (s.pending) return autoResolvePending(s);
      return autoPick(s);
    case 'ROUND_END':
      return endRound(s);
  }
}

/** Countdown over (or everyone ready): fix every bullet and aim, then reveal all aims at once. */
function lockLoadAndAim(s: GameState) {
  for (const p of alive(s)) {
    if (!p.loaded && p.hand.length > 0) {
      // Too slow to choose a bullet: a CLICK goes in (and a late gun has no target anyway).
      const i = Math.max(0, p.hand.findIndex(c => c.kind === 'CLICK'));
      p.loaded = p.hand.splice(i, 1)[0];
    }
    if (p.loaded) s.log.push({ t: 'LOADED', round: s.round, playerId: p.id, card: p.loaded.kind, private: true });
  }
  lockAims(s);
}

/** Everyone alive has chosen both a bullet and a target: no need to wait for the clock. */
function maybeLockEarly(s: GameState) {
  const ready = alive(s).every(p => (p.loaded || p.hand.length === 0) && (p.target !== null || hasPower(s, p, 'KID')));
  if (ready) lockLoadAndAim(s);
}

function lockAims(s: GameState) {
  const aims: Record<PlayerId, PlayerId | null> = {};
  for (const p of alive(s)) {
    if (hasPower(s, p, 'KID')) continue;
    aims[p.id] = p.target;
  }
  s.log.push({ t: 'AIM_LOCKED', round: s.round, aims });
  const kid = alive(s).find(p => hasPower(s, p, 'KID'));
  if (kid) {
    kid.target = null;
    setPhase(s, 'KID_AIM');
    return;
  }
  afterKid(s);
}

function afterKid(s: GameState) {
  const cunning = alive(s).find(p => hasPower(s, p, 'CUNNING'));
  if (cunning && cunning.loaded && cunning.hand.length > 0) {
    setPhase(s, 'CUNNING_SWAP');
    return;
  }
  enterBossPrivilege(s);
}

function enterBossPrivilege(s: GameState) {
  if (redirectCandidates(s).length === 0) {
    s.log.push({ t: 'BOSS_PASSED', round: s.round });
    return enterCourage(s);
  }
  setPhase(s, 'BOSS_PRIVILEGE');
}

function enterCourage(s: GameState) {
  for (const p of alive(s)) p.stance = null;
  setPhase(s, 'COURAGE');
}

function hiddenDiscard(s: GameState, p: Player, card: BulletCard, reason: 'DUCK' | 'TARGET_DUCKED' | 'NO_TARGET' | 'CLIP' | 'SMART') {
  s.discard.push({ card, faceUp: false, by: p.id, round: s.round });
  s.log.push({ t: 'HIDDEN_DISCARD', round: s.round, playerId: p.id, card: card.kind, reason });
}

function resolveCourage(s: GameState) {
  const living = alive(s);
  const stances: Record<PlayerId, Stance> = {};
  for (const p of living) {
    if (!p.stance) p.stance = 'STAND'; // frozen = stays in
    stances[p.id] = p.stance;
  }
  s.log.push({ t: 'COURAGE', round: s.round, stances });

  // Duckers: hidden discard + duck powers.
  for (const p of living) {
    if (p.stance !== 'DUCK') continue;
    p.stats.ducks++;
    if (p.loaded) { hiddenDiscard(s, p, p.loaded, 'DUCK'); p.loaded = null; }
    powers.onDuck(s, p);
  }

  // Shooters.
  const incoming: Record<PlayerId, number> = {};
  const reveals: { playerId: PlayerId; target: PlayerId; card: 'BANG' | 'CLICK' }[] = [];
  let smartPending: PlayerId | null = null;
  for (const p of living) {
    if (p.stance === 'DUCK' || !p.loaded) continue;
    const card = p.loaded;
    if (!p.target) { hiddenDiscard(s, p, card, 'NO_TARGET'); p.loaded = null; continue; }
    const t = getPlayer(s, p.target);
    if (t.stance === 'DUCK') {
      if (card.kind === 'BANG' && hasPower(s, p, 'PROFESSIONAL')) {
        s.discard.push({ card, faceUp: true, by: p.id, round: s.round });
        p.publicBangsRevealed++;
        p.revealedCard = 'BANG';
        powers.professionalSteal(s, p, t);
      } else if (hasPower(s, p, 'SMART')) {
        p.hand.push(card);
        smartPending = p.id;
        s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'SMART', text: 'took their bullet back' });
      } else {
        if (card.kind === 'CLICK') p.stats.bluffs++;
        hiddenDiscard(s, p, card, 'TARGET_DUCKED');
      }
      p.loaded = null;
      continue;
    }
    // Both standing: reveal.
    s.discard.push({ card, faceUp: true, by: p.id, round: s.round });
    p.revealedCard = card.kind;
    reveals.push({ playerId: p.id, target: t.id, card: card.kind });
    if (card.kind === 'BANG') {
      p.publicBangsRevealed++;
      p.stats.bangsFired++;
      incoming[t.id] = (incoming[t.id] ?? 0) + 1;
    }
    p.loaded = null;
  }

  // Apply wounds simultaneously.
  const woundMap: Record<PlayerId, number> = {};
  for (const [tid, n] of Object.entries(incoming)) {
    const t = getPlayer(s, tid);
    // House rule: however many bullets land, a gangster takes at most one wound per round.
    const real = Math.min(1, powers.modifyIncomingWounds(s, t, n));
    if (real > 0) {
      t.wounds += real;
      t.hitThisRound = real;
      woundMap[tid] = real;
      for (const r of reveals) if (r.target === tid && r.card === 'BANG') getPlayer(s, r.playerId).stats.hits++;
    }
  }
  // Aims survived: stood with ≥1 gun revealed on you and took no wound.
  for (const p of living) {
    if (p.stance === 'STAND' && p.hitThisRound === 0 && reveals.some(r => r.target === p.id)) p.stats.aimsSurvived++;
  }

  const dead: PlayerId[] = [];
  for (const p of living) {
    if (p.wounds >= woundLimit(s, p)) { dead.push(p.id); }
  }
  s.log.push({ t: 'SHOWDOWN', round: s.round, reveals, wounds: woundMap, dead });
  for (const id of dead) eliminate(s, getPlayer(s, id));

  setPhase(s, 'SHOWDOWN');
  if (checkLastAlive(s)) return;
  if (smartPending && getPlayer(s, smartPending).alive) {
    s.pending = { kind: 'SMART_DISCARD', playerId: smartPending };
  }
}

function eliminate(s: GameState, p: Player) {
  p.alive = false;
  p.target = null;
  s.log.push({ t: 'ELIMINATED', round: s.round, playerId: p.id });
  powers.onEliminate(s, p);
  if (s.bossId === p.id) passBossFromDead(s, p.id);
  if (s.nextBossId === p.id) s.nextBossId = null;
}

function passBossFromDead(s: GameState, deadId: PlayerId) {
  const next = clockwiseFrom(s, deadId).find(x => x.alive);
  if (next) {
    s.bossId = next.id;
    s.log.push({ t: 'BOSS_CHANGE', round: s.round, bossId: next.id, reason: 'BOSS_DIED' });
  }
}

/** Returns true if the game ended. */
function checkLastAlive(s: GameState): boolean {
  const living = alive(s);
  if (living.length === 1) {
    finishGame(s, [living[0].id], 'LAST_ALIVE');
    return true;
  }
  if (living.length === 0) {
    finishGame(s, [], 'NO_SURVIVORS');
    return true;
  }
  return false;
}

// ─── Split ──────────────────────────────────────────────────────────────────

function enterSplit(s: GameState) {
  for (const p of s.players) {
    p.inSplit = p.alive && p.stance === 'STAND' && p.hitThisRound === 0;
  }
  s.splitOrder = clockwiseFrom(s, s.bossId).filter(p => p.inSplit).map(p => p.id);
  s.splitTurnIndex = 0;
  s.dictate = null;
  setPhase(s, 'SPLIT');

  if (s.splitOrder.length === 0) {
    s.log.push({ t: 'NOBODY_STANDING', round: s.round, rule: s.settings.noStandRule });
    return toRoundEnd(s);
  }
  powers.beforeSplit(s);
  if (splitItems(s).length === 0) return toRoundEnd(s);
}

export function currentPicker(s: GameState): PlayerId | null {
  if (s.phase !== 'SPLIT' || s.splitOrder.length === 0) return null;
  return s.splitOrder[s.splitTurnIndex % s.splitOrder.length];
}

function activePickers(s: GameState) {
  return s.splitOrder.filter(id => !getPlayer(s, id).greedyUsed);
}

function doPick(s: GameState, playerId: PlayerId, itemId: string, second: string | undefined, auto: boolean) {
  need(s, 'SPLIT');
  if (s.pending) throw new GameError('NOT_ALLOWED', 'a choice is pending');
  const p = livePlayer(s, playerId);
  if (currentPicker(s) !== p.id) throw new GameError('NOT_YOUR_TURN');
  const items = splitItems(s);
  if (!items.includes(itemId)) throw new GameError('NO_SUCH_ITEM');
  const ban = s.dictate && s.dictate.on === p.id ? s.dictate.kind : null;
  if (ban && itemKind(s, itemId) === ban) throw new GameError('NOT_ALLOWED', 'the Dictator forbids that');

  if (second !== undefined) {
    if (!hasPower(s, p, 'GREEDY') || p.splitPicks.length > 0) throw new GameError('NOT_ALLOWED', 'only Greedy, on their first pick');
    if (second === itemId || !items.includes(second)) throw new GameError('NO_SUCH_ITEM');
    if (ban && itemKind(s, second) === ban) throw new GameError('NOT_ALLOWED', 'the Dictator forbids that');
  }

  const taken = [itemId, ...(second !== undefined ? [second] : [])];
  // Resolve each item; a Clip can create a pending choice which must be answered before the turn ends.
  for (const id of taken) takeItem(s, p, id, auto);
  if (second !== undefined) {
    p.greedyUsed = true;
    s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'GREEDY', text: 'grabbed two and walked away from the table' });
  }
  if (!s.pending) endTurn(s);
  else bumpStep(s);
}

function takeItem(s: GameState, p: Player, itemId: string, auto: boolean) {
  if (itemId === NEW_BOSS_TOKEN) {
    s.tokenAvailable = false;
    s.nextBossId = p.id;
    p.splitPicks.push(NEW_BOSS_TOKEN);
    s.log.push({ t: 'PICK', round: s.round, playerId: p.id, item: 'NEW_BOSS', auto });
    return;
  }
  const i = s.table.findIndex(c => c.id === itemId);
  const card = s.table.splice(i, 1)[0];
  let effect: string | undefined;
  p.splitPicks.push(card.id);
  if (card.kind === 'FIRST_AID') {
    effect = p.wounds > 0 ? `healed ${p.wounds} wound(s)` : 'wasted (no wounds)';
    p.wounds = 0;
  } else if (card.kind === 'CLIP') {
    effect = useClip(s, p);
  } else {
    p.loot.push(card);
  }
  s.log.push({ t: 'PICK', round: s.round, playerId: p.id, item: card, auto, ...(effect ? { effect } : {}) });
}

/** Take a BANG from the discard (face-up first), then the player must discard another card. */
function takeBangFromDiscard(s: GameState, p: Player): boolean {
  let i = s.discard.findIndex(d => d.card.kind === 'BANG' && d.faceUp);
  if (i < 0) i = s.discard.findIndex(d => d.card.kind === 'BANG');
  if (i < 0) return false;
  const entry = s.discard.splice(i, 1)[0];
  p.hand.push(entry.card);
  return true;
}

function useClip(s: GameState, p: Player): string {
  if (p.hand.length === 0) return 'lost (no cards left to swap)';
  if (s.pending) return 'lost (already reloading)';
  if (!takeBangFromDiscard(s, p)) return 'lost (no BANG in the discard)';
  const gf = s.players.find(o => o.id !== p.id && hasPower(s, o, 'GOOD_FRIEND') && o.hand.length > 0);
  const gfPending = gf && takeBangFromDiscard(s, gf)
    ? ({ kind: 'GOOD_FRIEND_DISCARD', playerId: gf.id, then: null } as const)
    : null;
  if (gfPending) s.log.push({ t: 'POWER', round: s.round, playerId: gf!.id, power: 'GOOD_FRIEND', text: 'also grabbed a BANG' });
  s.pending = { kind: 'CLIP_DISCARD', playerId: p.id };
  if (gfPending) s.pending = { ...gfPending, then: s.pending };
  return 'reloaded a BANG';
}

function chooseDiscard(s: GameState, playerId: PlayerId, cardId: string) {
  const pend = s.pending;
  if (!pend) throw new GameError('NOTHING_PENDING');
  if (pend.playerId !== playerId) throw new GameError('NOT_YOUR_TURN');
  const p = getPlayer(s, playerId);
  const i = p.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new GameError('NOT_IN_HAND');
  const card = p.hand.splice(i, 1)[0];
  hiddenDiscard(s, p, card, pend.kind === 'SMART_DISCARD' ? 'SMART' : 'CLIP');
  resolvePendingDone(s, pend);
}

function resolvePendingDone(s: GameState, pend: NonNullable<GameState['pending']>) {
  if (pend.kind === 'GOOD_FRIEND_DISCARD' && pend.then) {
    s.pending = pend.then;
    bumpStep(s);
    return;
  }
  s.pending = null;
  if (pend.kind === 'SMART_DISCARD') return; // showdown continues on its timer
  endTurn(s);
}

function autoResolvePending(s: GameState) {
  const pend = s.pending!;
  const p = getPlayer(s, pend.playerId);
  // Default: drop a CLICK if possible (keeps the BANG you just reloaded).
  let i = p.hand.findIndex(c => c.kind === 'CLICK');
  if (i < 0) i = 0;
  const card = p.hand.splice(i, 1)[0];
  hiddenDiscard(s, p, card, pend.kind === 'SMART_DISCARD' ? 'SMART' : 'CLIP');
  resolvePendingDone(s, pend);
}

/** Value of an item to a given player right now (used for timeouts and bots). */
export function immediateValue(s: GameState, p: Player, itemId: string): number {
  if (itemId === NEW_BOSS_TOKEN) return 0;
  const c = s.table.find(x => x.id === itemId);
  if (!c) return 0;
  if (c.kind === 'CASH' || c.kind === 'DIAMOND') return c.value;
  if (c.kind === 'PAINTING') {
    const n = p.loot.filter(x => x.kind === 'PAINTING').length + powers.paintingBonus(s, p);
    return paintingValue(n + 1) - paintingValue(n);
  }
  return 0;
}

function autoPick(s: GameState) {
  const pid = currentPicker(s);
  if (!pid) return toRoundEnd(s);
  const p = getPlayer(s, pid);
  const ban = s.dictate && s.dictate.on === pid ? s.dictate.kind : null;
  const items = splitItems(s).filter(id => !ban || itemKind(s, id) !== ban);
  if (items.length === 0) {
    // Nothing legal to take: skip this player's turn.
    return endTurn(s);
  }
  let best = items[0], bestV = -1;
  for (const id of items) {
    const v = immediateValue(s, p, id);
    if (v > bestV) { best = id; bestV = v; }
  }
  doPick(s, pid, best, undefined, true);
}

function endTurn(s: GameState) {
  s.dictate = null;
  if (splitItems(s).length === 0 || activePickers(s).length === 0) return toRoundEnd(s);
  // advance to next non-greedy-finished player
  for (let k = 0; k < s.splitOrder.length; k++) {
    s.splitTurnIndex = (s.splitTurnIndex + 1) % s.splitOrder.length;
    if (!getPlayer(s, s.splitOrder[s.splitTurnIndex]).greedyUsed) break;
  }
  bumpStep(s);
}

function toRoundEnd(s: GameState) {
  setPhase(s, 'ROUND_END');
}

function endRound(s: GameState) {
  // Leftover loot (nobody standing, or everyone walked away greedy)
  if (s.table.length > 0 && (s.settings.noStandRule === 'DISCARD' || s.lootPiles.length === 0)) s.table = [];
  if (s.nextBossId && getPlayer(s, s.nextBossId).alive && s.nextBossId !== s.bossId) {
    s.bossId = s.nextBossId;
    s.log.push({ t: 'BOSS_CHANGE', round: s.round, bossId: s.bossId, reason: 'TOKEN' });
  }
  if (s.round >= s.settings.rounds) {
    finishGame(s, null, 'ROUNDS');
    return;
  }
  startRound(s);
}

// ─── Scoring ────────────────────────────────────────────────────────────────

export function computeScores(s: GameState) {
  const lines = s.players.map(p => {
    const cash = p.loot.filter(c => c.kind === 'CASH').reduce((a, c) => a + c.value, 0);
    const dia = p.loot.filter(c => c.kind === 'DIAMOND');
    const paintings = p.loot.filter(c => c.kind === 'PAINTING').length + powers.paintingBonus(s, p);
    return {
      playerId: p.id, alive: p.alive, cash,
      diamonds: dia.reduce((a, c) => a + c.value, 0), diamondCount: dia.length,
      paintings, paintingValue: paintingValue(paintings), diamondBonus: 0, total: 0, wounds: p.wounds,
    };
  });
  const living = lines.filter(l => l.alive);
  const maxD = Math.max(0, ...living.map(l => l.diamondCount));
  const leaders = living.filter(l => l.diamondCount === maxD);
  if (maxD > 0 && leaders.length === 1) leaders[0].diamondBonus = DIAMOND_BONUS;
  for (const l of lines) l.total = l.alive ? l.cash + l.diamonds + l.paintingValue + l.diamondBonus : 0;
  return lines;
}

export function determineWinners(lines: ReturnType<typeof computeScores>): PlayerId[] {
  const living = lines.filter(l => l.alive);
  if (living.length === 0) return [];
  const top = Math.max(...living.map(l => l.total));
  let cands = living.filter(l => l.total === top);
  if (cands.length > 1) {
    const w = Math.max(...cands.map(l => l.wounds));
    cands = cands.filter(l => l.wounds === w);
  }
  return cands.map(l => l.playerId);
}

function finishGame(s: GameState, winners: PlayerId[] | null, reason: 'LAST_ALIVE' | 'ROUNDS' | 'NO_SURVIVORS') {
  s.scores = computeScores(s);
  s.winners = winners ?? determineWinners(s.scores);
  s.pending = null;
  setPhase(s, 'GAME_OVER');
  s.log.push({ t: 'GAME_OVER', winners: s.winners, reason });
}

// ─── Replay ─────────────────────────────────────────────────────────────────

export function replay(players: NewPlayer[], opts: CreateOptions, actions: Action[]): GameState {
  const s = createGame(players, opts);
  for (const a of actions) apply(s, a);
  return s;
}
