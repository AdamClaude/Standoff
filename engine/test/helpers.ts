import {
  apply, createGame, getPlayer, type Action, type BulletKind, type GameSettings, type GameState,
  type PlayerId, type Stance,
} from '../src/index.js';

export function newGame(n = 4, settings: Partial<GameSettings> = {}, bossId = 'p0'): GameState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: 'x' }));
  return createGame(players, { seed: 'test-seed', settings, bossId });
}

export const tick = (s: GameState) => apply(s, { type: 'TIMEOUT', phaseSeq: s.phaseSeq });

export function act(s: GameState, ...as: Action[]) {
  for (const a of as) apply(s, a);
}

/** LOOT_REVEAL → LOAD, then load the given kind for every alive player (default CLICK). */
export function loadAll(s: GameState, kinds: Record<PlayerId, BulletKind> = {}) {
  if (s.phase === 'LOOT_REVEAL') tick(s);
  for (const p of s.players.filter(x => x.alive)) {
    const want = kinds[p.id] ?? 'CLICK';
    const card = p.hand.find(c => c.kind === want) ?? p.hand[0];
    apply(s, { type: 'LOAD', playerId: p.id, cardId: card.id });
  }
}

/** HOLD_UP: set aims, lock (timeout). Boss passes unless keepBoss. */
export function aim(s: GameState, aims: Record<PlayerId, PlayerId | null>, opts: { bossPass?: boolean } = { bossPass: true }) {
  for (const [id, t] of Object.entries(aims)) apply(s, { type: 'AIM', playerId: id, target: t });
  tick(s);
  if (opts.bossPass && s.phase === 'BOSS_PRIVILEGE') apply(s, { type: 'BOSS_PASS', playerId: s.bossId });
}

export function decide(s: GameState, stances: Record<PlayerId, Stance> = {}) {
  for (const [id, st] of Object.entries(stances)) apply(s, { type: 'DECIDE', playerId: id, stance: st });
  tick(s); // reveal → SHOWDOWN
}

/** Run a whole round: loads, aims, stances, then let the split auto-pick to the end. */
export function playRound(
  s: GameState,
  kinds: Record<PlayerId, BulletKind>,
  aims: Record<PlayerId, PlayerId | null>,
  stances: Record<PlayerId, Stance> = {},
) {
  loadAll(s, kinds);
  aim(s, aims);
  decide(s, stances);
}

export function finishSplit(s: GameState) {
  if (s.phase === 'SHOWDOWN') tick(s);
  let guard = 0;
  while (s.phase === 'SPLIT') {
    if (++guard > 100) throw new Error('split loop');
    tick(s);
  }
}

export const P = getPlayer;
