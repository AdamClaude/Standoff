// Bots play from the same filtered view a human gets — no peeking.

import type { Action, LootKind, PlayerId } from './types.js';
import { NEW_BOSS_TOKEN } from './types.js';
import type { ClientView, PublicPlayer } from './view.js';
import { paintingValue } from './loot.js';

export type BotLevel = 'EASY' | 'NORMAL' | 'SHARK';
export type Rand = () => number;

/** Rough wealth estimate for a player as seen from the table. */
function wealth(v: ClientView, p: PublicPlayer): number {
  if (p.loot) return p.loot.reduce((a, c) => a + (c.kind === 'PAINTING' ? 15000 : c.value), 0);
  return p.lootCount * 9000;
}

function tableValue(v: ClientView): number {
  return v.table.reduce((a, c) => a + (c.kind === 'PAINTING' ? 15000 : c.kind === 'CASH' || c.kind === 'DIAMOND' ? c.value : 6000), 0);
}

/** Chance a given opponent's loaded card is a BANG, from public info only. */
export function bangChance(v: ClientView, p: PublicPlayer): number {
  // cards they had before loading = handCount + 1; BANGs they could still hold ≈ 3 - shotsFired
  const remainingBangs = Math.max(0, 3 - p.shotsFired);
  const cards = p.handCount + 1;
  return Math.min(1, remainingBangs / Math.max(1, cards));
}

function duckRate(v: ClientView, id: PlayerId): number {
  let ducks = 0, rounds = 0;
  for (const e of v.log) {
    if (e.t !== 'COURAGE' || !(id in e.stances)) continue;
    rounds++;
    if (e.stances[id] === 'DUCK') ducks++;
  }
  return rounds ? ducks / rounds : 0.3;
}

export function botAction(v: ClientView, level: BotLevel, rand: Rand): Action | null {
  const meId = v.viewerId;
  if (!meId || !v.me) return null;
  const me = v.players.find(p => p.id === meId)!;
  if (!me.alive) return null;
  const others = v.players.filter(p => p.alive && p.id !== meId);

  // Pending choices (Clip / Smart / Good Friend) come first.
  if (v.pending && v.pending.playerId === meId && 'playerId' in v.pending) {
    const hand = v.me.hand;
    const drop = hand.find(c => c.kind === 'CLICK') ?? hand[0];
    return drop ? { type: 'CHOOSE_DISCARD', playerId: meId, cardId: drop.id } : null;
  }

  switch (v.phase) {
    case 'LOAD': {
      // Choose the bullet first, then the target (both stay secret until the countdown ends).
      if (v.me.loaded || v.me.hand.length === 0) {
        if (v.me.target || (me.power === 'KID' && v.settings.powers)) return null;
        return { type: 'AIM', playerId: meId, target: chooseTarget(v, me, others, level, rand) };
      }
      const bangs = v.me.hand.filter(c => c.kind === 'BANG');
      const clicks = v.me.hand.filter(c => c.kind === 'CLICK');
      const roundsLeft = v.rounds - v.round + 1;
      let pBang = bangs.length / Math.max(1, roundsLeft);
      if (level === 'EASY') pBang = bangs.length / v.me.hand.length;
      else {
        const tv = tableValue(v);
        pBang *= tv > 70000 ? 1.4 : tv < 40000 ? 0.6 : 1;
        if (level === 'SHARK' && v.round === v.rounds) pBang = 1; // no point saving bullets
      }
      const wantBang = bangs.length > 0 && (clicks.length === 0 || rand() < pBang);
      return { type: 'LOAD', playerId: meId, cardId: (wantBang ? bangs : clicks)[0].id };
    }

    case 'KID_AIM': {
      if (me.power !== 'KID') return null;
      return { type: 'KID_AIM', playerId: meId, target: chooseTarget(v, me, others, level, rand) };
    }

    case 'CUNNING_SWAP': {
      if (me.power !== 'CUNNING') return null;
      const loaded = v.me.loaded;
      const bang = v.me.hand.find(c => c.kind === 'BANG');
      const aimedAtMe = others.filter(o => o.target === meId).length;
      if (loaded?.kind === 'CLICK' && bang && (aimedAtMe > 0 || rand() < 0.3)) return { type: 'CUNNING_SWAP', playerId: meId, cardId: bang.id };
      return { type: 'CUNNING_SWAP', playerId: meId, cardId: null };
    }

    case 'BOSS_PRIVILEGE': {
      if (v.bossId !== meId) return null;
      const threats = v.redirectCandidates
        .map(id => v.players.find(p => p.id === id)!)
        .filter(p => p.target === meId)
        .sort((a, b) => bangChance(v, b) - bangChance(v, a));
      if (threats.length > 0 && (level !== 'EASY' || rand() < 0.6)) return { type: 'BOSS_REDIRECT', playerId: meId, target: threats[0].id };
      return { type: 'BOSS_PASS', playerId: meId };
    }

    case 'REDIRECT': {
      if (!v.redirect || v.redirect.player !== meId) return null;
      const opts = v.retargetOptions.map(id => v.players.find(p => p.id === id)!);
      const t = opts.sort((a, b) => wealth(v, b) - wealth(v, a))[0];
      return { type: 'RETARGET', playerId: meId, target: t.id };
    }

    case 'COURAGE': {
      if (v.me.stance) return null;
      return { type: 'DECIDE', playerId: meId, stance: courage(v, me, others, level, rand) };
    }

    case 'SPLIT': {
      // Dictator interjection
      if (me.power === 'DICTATOR' && v.settings.powers && me.inSplit && v.currentPicker && v.currentPicker !== meId
          && !me.powerUsedThisSplit && !v.dictate && !v.pending && level !== 'EASY' && rand() < 0.25) {
        const kinds = v.table.map(c => c.kind);
        const kind: LootKind | 'NEW_BOSS' = kinds.includes('PAINTING') ? 'PAINTING' : kinds.includes('DIAMOND') ? 'DIAMOND' : 'CASH';
        return { type: 'DICTATE', playerId: meId, kind };
      }
      if (v.currentPicker !== meId || v.pending) return null;
      const ban = v.dictate && v.dictate.on === meId ? v.dictate.kind : null;
      const scored = v.splitItems
        .filter(id => !ban || kindOf(v, id) !== ban)
        .map(id => ({ id, val: itemValueForBot(v, me, id, level) + (level === 'EASY' ? rand() * 8000 : 0) }))
        .sort((a, b) => b.val - a.val);
      if (scored.length === 0) return null;
      if (me.power === 'GREEDY' && v.settings.powers && me.picksThisSplit === 0 && scored.length > 1 && v.splitOrder.length > 2
          && scored[0].val + scored[1].val > 45000 && level !== 'EASY') {
        return { type: 'PICK', playerId: meId, itemId: scored[0].id, secondItemId: scored[1].id };
      }
      return { type: 'PICK', playerId: meId, itemId: scored[0].id };
    }
  }
  return null;
}

function kindOf(v: ClientView, id: string): LootKind | 'NEW_BOSS' {
  if (id === NEW_BOSS_TOKEN) return 'NEW_BOSS';
  return v.table.find(c => c.id === id)!.kind;
}

function chooseTarget(v: ClientView, me: PublicPlayer, others: PublicPlayer[], level: BotLevel, rand: Rand): PlayerId {
  if (level === 'EASY') return others[Math.floor(rand() * others.length)].id;
  const loadedBang = v.me?.loaded?.kind === 'BANG';
  const scored = others.map(o => {
    let s = wealth(v, o) / 10000;
    if (o.id === v.bossId) s += 1;
    if (o.wounds === o.woundLimit - 1 && loadedBang) s += 3; // finish them
    if (o.target === me.id) s += 2;                           // shoot back
    if (!loadedBang && level === 'SHARK') s += duckRate(v, o.id) * 4; // bluff the jumpy ones
    s += rand() * 2;
    return { id: o.id, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].id;
}

function courage(v: ClientView, me: PublicPlayer, others: PublicPlayer[], level: BotLevel, rand: Rand): 'STAND' | 'DUCK' {
  const aimers = others.filter(o => o.target === me.id);
  if (aimers.length === 0) return 'STAND';
  if (level === 'EASY') return rand() < 0.25 * aimers.length ? 'DUCK' : 'STAND';
  let pSafe = 1;
  for (const a of aimers) pSafe *= 1 - bangChance(v, a);
  const pHit = 1 - pSafe;
  const fatal = me.wounds + 1 >= me.woundLimit;
  const standing = Math.max(1, (others.length + 1) * 0.6);
  const gain = tableValue(v) / standing;
  const woundCost = fatal ? 300000 : 4000 + me.wounds * 14000;
  const evStand = (1 - pHit) * gain - pHit * woundCost;
  const evDuck = 0;
  const noise = level === 'SHARK' ? 0 : (rand() - 0.5) * 15000;
  return evStand + noise >= evDuck ? 'STAND' : 'DUCK';
}

function itemValueForBot(v: ClientView, me: PublicPlayer, id: string, level: BotLevel): number {
  if (id === NEW_BOSS_TOKEN) return v.bossId === me.id ? 4000 : 6000;
  const c = v.table.find(x => x.id === id)!;
  const myLoot = me.loot ?? [];
  switch (c.kind) {
    case 'CASH': return c.value;
    case 'DIAMOND': {
      const bonusHope = level === 'SHARK' ? 9000 : 4000;
      return c.value + bonusHope;
    }
    case 'PAINTING': {
      const n = myLoot.filter(x => x.kind === 'PAINTING').length + (me.power === 'COLLECTOR' && v.settings.powers ? 1 : 0);
      const marginal = paintingValue(n + 1) - paintingValue(n);
      return level === 'SHARK' ? marginal + 6000 : marginal;
    }
    case 'FIRST_AID': return me.wounds * 18000;
    case 'CLIP': {
      const bangsInDiscard = v.discardSummary.faceUpBang + (v.discardSummary.faceDown > 0 ? 1 : 0);
      const roundsLeft = v.rounds - v.round;
      return bangsInDiscard > 0 && roundsLeft > 0 && (v.me?.hand.length ?? 0) > 0 ? 7000 : 0;
    }
  }
}
