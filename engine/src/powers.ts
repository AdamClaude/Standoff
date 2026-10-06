// Advanced-mode powers, implemented as hooks the core state machine calls.
// Powers that need their own decision step (Kid, Cunning, Greedy, Dictator,
// Junk Dealer, Smart) are wired in the core via `hasPower` + dedicated actions;
// everything that is a passive modifier lives here.

import type { GameState, LootCard, Player, PlayerId, PowerId } from './types.js';
import { int, pick, shuffle } from './rng.js';

export const ALL_POWERS: PowerId[] = [
  'COLLECTOR', 'CUNNING', 'CUTE', 'DICTATOR', 'DOCTOR', 'GOOD_FRIEND', 'GREEDY', 'HUSTLER',
  'JUNK_DEALER', 'KID', 'LUCKY', 'PROFESSIONAL', 'SMART', 'STEALTHY', 'UNBREAKABLE', 'VULTURE',
];

/** Short rules text, in our own words (used by the UI rules panel too). */
export const POWER_TEXT: Record<PowerId, string> = {
  COLLECTOR: 'Your collection counts one extra painting at the final count.',
  CUNNING: 'After all aims (and the Kid) lock, you may swap your loaded bullet for one in your hand.',
  CUTE: 'If you are in the split, you pocket a $5k bill before anyone picks.',
  DICTATOR: 'Once per split, ban the current picker from taking one loot type this turn.',
  DOCTOR: 'Every time you duck, heal one wound.',
  GOOD_FRIEND: 'Whenever anyone uses a clip, you also grab a BANG from the discard (and drop a card).',
  GREEDY: 'Your first pick of a split can grab two items — but then you are out of that split.',
  HUSTLER: 'Each round you swap a random bullet with a random rival (one of yours for one of theirs).',
  JUNK_DEALER: 'Once per split, trade one item you just picked for a random item from a rival\'s stash.',
  KID: 'You aim last — after everyone else has locked in.',
  LUCKY: 'If more than one bullet would hit you in a round, none do — and you still share the loot.',
  PROFESSIONAL: 'If your target ducks while you hold a BANG and stand, show it and steal a random item from them.',
  SMART: 'If your target ducks, take your bullet back and discard any card from your hand instead.',
  STEALTHY: 'Whenever you duck, you slip a $10k bill off the table on your way down.',
  UNBREAKABLE: 'You only die on your 5th wound.',
  VULTURE: 'When anyone dies, you grab two random items from their stash.',
};

export function hasPower(s: GameState, p: Player, power: PowerId): boolean {
  return s.settings.powers && p.alive && p.power === power;
}

export function woundLimit(s: GameState, p: Player): number {
  return s.settings.powers && p.power === 'UNBREAKABLE' ? 5 : 3;
}

export function dealPowers(s: GameState): void {
  const deck = shuffle(s.rng, [...ALL_POWERS]);
  s.players.forEach((p, i) => { p.power = deck[i % deck.length]; });
}

function powerLog(s: GameState, p: Player, text: string, priv?: PlayerId[]) {
  s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: p.power!, text, ...(priv ? { private: priv } : {}) });
}

function takeFromTable(s: GameState, pred: (c: LootCard) => boolean): LootCard | null {
  const i = s.table.findIndex(pred);
  if (i < 0) return null;
  return s.table.splice(i, 1)[0];
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/** LOAD phase start. Hustler swaps a random card with a random rival. */
export function onRoundStart(s: GameState): void {
  for (const p of s.players) {
    if (!hasPower(s, p, 'HUSTLER') || p.hand.length === 0) continue;
    const victims = s.players.filter(o => o.alive && o.id !== p.id && o.hand.length > 0);
    if (victims.length === 0) continue;
    const v = pick(s.rng, victims);
    const taken = v.hand.splice(int(s.rng, v.hand.length), 1)[0];
    const given = p.hand.splice(int(s.rng, p.hand.length), 1)[0];
    p.hand.push(taken);
    v.hand.push(given);
    powerLog(s, p, `swapped a bullet with ${v.name}`);
    s.log.push({ t: 'POWER', round: s.round, playerId: p.id, power: 'HUSTLER',
      text: `took a ${taken.kind}, gave a ${given.kind}`, private: [p.id, v.id] });
  }
}

/** Called for each player who ducks, when stances are revealed. */
export function onDuck(s: GameState, p: Player): void {
  if (hasPower(s, p, 'DOCTOR') && p.wounds > 0) {
    p.wounds -= 1;
    powerLog(s, p, 'patched up one wound while hiding');
  }
  if (hasPower(s, p, 'STEALTHY')) {
    const bill = takeFromTable(s, c => c.kind === 'CASH' && c.value === 10000);
    if (bill) {
      p.loot.push(bill);
      powerLog(s, p, 'slipped a $10k bill off the table');
    }
  }
}

/** Lucky: more than one hit in a round → no hits. */
export function modifyIncomingWounds(s: GameState, p: Player, count: number): number {
  if (count > 1 && hasPower(s, p, 'LUCKY')) {
    powerLog(s, p, `dodged ${count} bullets at once`);
    return 0;
  }
  return count;
}

/** Vulture: when someone is eliminated, grab two random items from their stash. */
export function onEliminate(s: GameState, victim: Player): void {
  for (const p of s.players) {
    if (p.id === victim.id || !hasPower(s, p, 'VULTURE')) continue;
    for (let i = 0; i < 2 && victim.loot.length > 0; i++) {
      const c = victim.loot.splice(int(s.rng, victim.loot.length), 1)[0];
      p.loot.push(c);
    }
    powerLog(s, p, `picked over ${victim.name}'s stash`);
  }
}

/** Cute: pocket a $5k bill before the split starts. */
export function beforeSplit(s: GameState): void {
  for (const p of s.players) {
    if (!p.inSplit || !hasPower(s, p, 'CUTE')) continue;
    const bill = takeFromTable(s, c => c.kind === 'CASH' && c.value === 5000);
    if (bill) {
      p.loot.push(bill);
      powerLog(s, p, 'pocketed a $5k bill before the split');
    }
  }
}

/** Collector: +1 painting at scoring. */
export function paintingBonus(s: GameState, p: Player): number {
  return s.settings.powers && p.power === 'COLLECTOR' ? 1 : 0;
}

export function professionalSteal(s: GameState, shooter: Player, target: Player): void {
  if (target.loot.length === 0) {
    powerLog(s, shooter, `flashed a BANG at ${target.name}, but their stash was empty`);
    return;
  }
  const c = target.loot.splice(int(s.rng, target.loot.length), 1)[0];
  shooter.loot.push(c);
  powerLog(s, shooter, `flashed a BANG and robbed ${target.name}`);
}
