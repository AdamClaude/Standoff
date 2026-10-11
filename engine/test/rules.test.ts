import { describe, expect, it } from 'vitest';
import {
  apply, buildLootDeck, computeScores, determineWinners, filterView, NEW_BOSS_TOKEN, paintingValue,
  replay, runBotGame, GameError, type GameState, type LootCard,
} from '../src/index.js';
import { act, aim, decide, finishSplit, loadAll, newGame, P, playRound, tick } from './helpers.js';

const err = (fn: () => void) => {
  try { fn(); } catch (e) { return (e as GameError).code; }
  return null;
};

describe('setup', () => {
  it('deals 3 BANG + 5 CLICK to everyone', () => {
    const s = newGame(6);
    for (const p of s.players) {
      expect(p.hand.filter(c => c.kind === 'BANG')).toHaveLength(3);
      expect(p.hand.filter(c => c.kind === 'CLICK')).toHaveLength(5);
    }
  });

  it('bullet ids are opaque and unique', () => {
    const s = newGame(6);
    const ids = s.players.flatMap(p => p.hand.map(c => c.id));
    expect(new Set(ids).size).toBe(48);
    for (const id of ids) expect(id).toMatch(/^k\d+$/);
  });

  it('builds the exact 64-card loot deck, 8 piles of 8', () => {
    const deck = buildLootDeck();
    expect(deck).toHaveLength(64);
    const count = (k: string, v?: number) => deck.filter(c => c.kind === k && (v === undefined || c.value === v)).length;
    expect(count('CASH', 5000)).toBe(15);
    expect(count('CASH', 10000)).toBe(15);
    expect(count('CASH', 20000)).toBe(10);
    expect(count('DIAMOND', 1000)).toBe(5);
    expect(count('DIAMOND', 5000)).toBe(3);
    expect(count('DIAMOND', 10000)).toBe(1);
    expect(count('PAINTING')).toBe(10);
    expect(count('CLIP')).toBe(3);
    expect(count('FIRST_AID')).toBe(2);
    const s = newGame(4);
    expect(s.table).toHaveLength(8); // round 1 pile on the table
    expect(s.lootPiles).toHaveLength(7);
    for (const pile of s.lootPiles) expect(pile).toHaveLength(8);
    const all = [...s.table, ...s.lootPiles.flat()].map(c => c.id);
    expect(new Set(all).size).toBe(64);
  });

  it('painting set values are exact', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(paintingValue)).toEqual(
      [4000, 12000, 30000, 60000, 100000, 150000, 200000, 300000, 400000, 500000]);
  });
});

describe('load & hold-up', () => {
  it('rejects a card not in hand; choosing again swaps the bullet', () => {
    const s = newGame();
    tick(s);
    expect(err(() => apply(s, { type: 'LOAD', playerId: 'p0', cardId: P(s, 'p1').hand[0].id }))).toBe('NOT_IN_HAND');
    const bang = P(s, 'p0').hand.find(c => c.kind === 'BANG')!;
    const click = P(s, 'p0').hand.find(c => c.kind === 'CLICK')!;
    apply(s, { type: 'LOAD', playerId: 'p0', cardId: bang.id });
    apply(s, { type: 'LOAD', playerId: 'p0', cardId: click.id });
    expect(P(s, 'p0').loaded!.id).toBe(click.id);
    expect(P(s, 'p0').hand).toHaveLength(7);
    expect(P(s, 'p0').hand.filter(c => c.kind === 'BANG')).toHaveLength(3);
  });

  it('bullet and target are chosen in the same countdown; timeout auto-loads a CLICK and late players have no aim', () => {
    const s = newGame();
    tick(s);
    expect(s.phase).toBe('LOAD');
    apply(s, { type: 'AIM', playerId: 'p1', target: 'p2' });
    tick(s); // countdown ends
    expect(s.phase).toBe('BOSS_PRIVILEGE');
    for (const p of s.players) expect(p.hand).toHaveLength(7);
    expect(s.players.every(p => p.hand.filter(c => c.kind === 'BANG').length === 3)).toBe(true);
    expect(P(s, 'p1').target).toBe('p2');
    expect(P(s, 'p0').target).toBeNull();
    expect(err(() => apply(s, { type: 'AIM', playerId: 'p0', target: 'p1' }))).toBe('WRONG_PHASE');
  });

  it('keeps the full countdown even once everyone has chosen (players may change their minds)', () => {
    const s = newGame();
    loadAll(s);
    for (const [a, b] of [['p0', 'p1'], ['p1', 'p2'], ['p2', 'p3'], ['p3', 'p0']]) apply(s, { type: 'AIM', playerId: a, target: b });
    expect(s.phase).toBe('LOAD');
    apply(s, { type: 'AIM', playerId: 'p0', target: 'p2' });
    tick(s);
    expect(s.phase).not.toBe('LOAD');
    expect(s.players.find(p => p.id === 'p0')!.target).toBe('p2');
  });

  it('other players’ aims are hidden until the countdown ends, then all revealed at once', () => {
    const s = newGame();
    loadAll(s);
    apply(s, { type: 'AIM', playerId: 'p1', target: 'p2' });
    expect(filterView(s, 'p0').players.find(p => p.id === 'p1')!.target).toBeNull();
    expect(filterView(s, 'p1').players.find(p => p.id === 'p1')!.target).toBe('p2');
    tick(s);
    expect(filterView(s, 'p0').players.find(p => p.id === 'p1')!.target).toBe('p2');
  });

  it('cannot aim at yourself or the dead', () => {
    const s = newGame();
    loadAll(s);
    expect(err(() => apply(s, { type: 'AIM', playerId: 'p1', target: 'p1' }))).toBe('BAD_TARGET');
    s.players[2].alive = false;
    expect(err(() => apply(s, { type: 'AIM', playerId: 'p1', target: 'p2' }))).toBe('BAD_TARGET');
  });

  it('no target at lock → card discarded face down with no effect', () => {
    const s = newGame();
    playRound(s, { p1: 'BANG' }, { p0: 'p1', p2: 'p1', p3: 'p1' }); // p1 never aims
    expect(P(s, 'p1').publicBangsRevealed).toBe(0);
    const d = s.discard.find(x => x.by === 'p1')!;
    expect(d.faceUp).toBe(false);
    expect(d.card.kind).toBe('BANG');
    expect(s.players.every(p => p.wounds === 0)).toBe(true);
  });
});

describe('boss privilege', () => {
  it('redirected player cannot keep the same target', () => {
    const s = newGame(4, {}, 'p0');
    loadAll(s);
    aim(s, { p1: 'p0', p2: 'p3', p3: 'p2' }, { bossPass: false });
    expect(s.phase).toBe('BOSS_PRIVILEGE');
    expect(err(() => apply(s, { type: 'BOSS_REDIRECT', playerId: 'p1', target: 'p2' }))).toBe('NOT_BOSS');
    apply(s, { type: 'BOSS_REDIRECT', playerId: 'p0', target: 'p1' });
    expect(s.phase).toBe('REDIRECT');
    expect(err(() => apply(s, { type: 'RETARGET', playerId: 'p1', target: 'p0' }))).toBe('SAME_TARGET');
    expect(err(() => apply(s, { type: 'RETARGET', playerId: 'p1', target: 'p1' }))).toBe('BAD_TARGET');
    apply(s, { type: 'RETARGET', playerId: 'p1', target: 'p3' });
    expect(P(s, 'p1').target).toBe('p3');
    expect(s.phase).toBe('COURAGE');
  });

  it('the Boss may order himself to switch aim', () => {
    const s = newGame(4, {}, 'p0');
    loadAll(s);
    aim(s, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p2' }, { bossPass: false });
    apply(s, { type: 'BOSS_REDIRECT', playerId: 'p0', target: 'p0' });
    expect(s.phase).toBe('REDIRECT');
    expect(err(() => apply(s, { type: 'RETARGET', playerId: 'p0', target: 'p1' }))).toBe('SAME_TARGET');
    apply(s, { type: 'RETARGET', playerId: 'p0', target: 'p3' });
    expect(P(s, 'p0').target).toBe('p3');
    expect(s.phase).toBe('COURAGE');
  });

  it('redirect timeout picks a random valid target', () => {
    for (let i = 0; i < 10; i++) {
      const s = newGame(5, {}, 'p0');
      s.seed = 'x' + i;
      loadAll(s);
      aim(s, { p1: 'p0', p2: 'p0', p3: 'p0', p4: 'p0' }, { bossPass: false });
      apply(s, { type: 'BOSS_REDIRECT', playerId: 'p0', target: 'p2' });
      tick(s);
      const t = P(s, 'p2').target;
      expect(t).not.toBe('p0');
      expect(t).not.toBe('p2');
      expect(t).not.toBeNull();
    }
  });
});

describe('courage & showdown', () => {
  it('duck → hidden discard, no loot, no wound; shooters at them discard face down', () => {
    const s = newGame();
    playRound(s, { p0: 'BANG', p1: 'BANG' }, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' }, { p1: 'DUCK' });
    expect(P(s, 'p1').wounds).toBe(0);
    expect(P(s, 'p2').wounds).toBe(0);
    for (const id of ['p0', 'p1']) {
      const d = s.discard.find(x => x.by === id)!;
      expect(d.faceUp).toBe(false);
    }
    expect(P(s, 'p0').publicBangsRevealed).toBe(0);
    finishSplit(s);
    expect(P(s, 'p1').loot).toHaveLength(0);
    expect(P(s, 'p1').inSplit).toBe(false);
  });

  it('timeout at courage = stand', () => {
    const s = newGame();
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' });
    expect(s.players.every(p => p.stance === 'STAND')).toBe(true);
  });

  it('mutual BANGs wound both', () => {
    const s = newGame();
    playRound(s, { p0: 'BANG', p1: 'BANG' }, { p0: 'p1', p1: 'p0', p2: 'p3', p3: 'p2' });
    expect(P(s, 'p0').wounds).toBe(1);
    expect(P(s, 'p1').wounds).toBe(1);
    expect(P(s, 'p0').publicBangsRevealed).toBe(1);
  });

  it('two BANGs on one player → still one wound this round; wounded get no loot', () => {
    const s = newGame();
    playRound(s, { p0: 'BANG', p2: 'BANG' }, { p0: 'p1', p2: 'p1', p1: 'p3', p3: 'p0' });
    expect(P(s, 'p1').wounds).toBe(1);
    finishSplit(s);
    expect(P(s, 'p1').loot).toHaveLength(0);
  });

  it('third wound eliminates; one survivor wins instantly', () => {
    const s = newGame(2);
    P(s, 'p1').wounds = 2;
    playRound(s, { p0: 'BANG' }, { p0: 'p1', p1: 'p0' });
    expect(P(s, 'p1').alive).toBe(false);
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winners).toEqual(['p0']);
  });

  it('elimination with several left keeps the game going; dead cannot be targeted', () => {
    const s = newGame(4);
    P(s, 'p3').wounds = 2;
    playRound(s, { p0: 'BANG' }, { p0: 'p3', p1: 'p0', p2: 'p0', p3: 'p1' });
    expect(P(s, 'p3').alive).toBe(false);
    expect(s.phase).toBe('SHOWDOWN');
    finishSplit(s); tick(s); // round end → next round
    loadAll(s);
    expect(err(() => apply(s, { type: 'AIM', playerId: 'p0', target: 'p3' }))).toBe('BAD_TARGET');
  });

  it('when the Boss dies the desk passes clockwise', () => {
    const s = newGame(4, {}, 'p1');
    P(s, 'p1').wounds = 2;
    playRound(s, { p0: 'BANG' }, { p0: 'p1', p1: 'p2', p2: 'p0', p3: 'p0' });
    expect(P(s, 'p1').alive).toBe(false);
    expect(s.bossId).toBe('p2');
  });
});

describe('split', () => {
  const pickSeq = (s: GameState) => s.log.filter(e => e.t === 'PICK').map(e => (e as { playerId: string }).playerId);

  it('starts with the Boss and goes clockwise, multiple laps', () => {
    const s = newGame(4, {}, 'p2');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' });
    finishSplit(s);
    const seq = pickSeq(s);
    expect(seq).toHaveLength(9); // 8 loot + the Boss cigar
    expect(seq.slice(0, 5)).toEqual(['p2', 'p3', 'p0', 'p1', 'p2']);
  });

  it('if the Boss is down, the next standing player clockwise starts', () => {
    const s = newGame(4, {}, 'p1');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' }, { p1: 'DUCK', p2: 'DUCK' });
    finishSplit(s);
    expect(pickSeq(s).slice(0, 3)).toEqual(['p3', 'p0', 'p3']);
  });

  it('a lone survivor in the split takes all 9 items', () => {
    const s = newGame(4, {}, 'p0');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' }, { p0: 'DUCK', p1: 'DUCK', p2: 'DUCK' });
    finishSplit(s);
    expect(pickSeq(s)).toEqual(Array(9).fill('p3'));
    expect(s.nextBossId).toBe('p3');
  });

  it('rejects picks out of turn', () => {
    const s = newGame(4, {}, 'p0');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' });
    tick(s);
    expect(err(() => apply(s, { type: 'PICK', playerId: 'p1', itemId: s.table[0].id }))).toBe('NOT_YOUR_TURN');
  });

  it('Boss cigar: taker is Boss next round, order unchanged now', () => {
    const s = newGame(4, {}, 'p0');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' });
    tick(s);
    act(s, { type: 'PICK', playerId: 'p0', itemId: s.table[0].id });
    act(s, { type: 'PICK', playerId: 'p1', itemId: NEW_BOSS_TOKEN });
    expect(s.bossId).toBe('p0');
    act(s, { type: 'PICK', playerId: 'p2', itemId: s.table[0].id });
    expect(err(() => apply(s, { type: 'PICK', playerId: 'p3', itemId: NEW_BOSS_TOKEN }))).toBe('NO_SUCH_ITEM');
    finishSplit(s);
    tick(s);
    expect(s.bossId).toBe('p1');
    expect(s.round).toBe(2);
  });

  it('unclaimed cigar → the Boss keeps it; ROLLOVER (engine option) carries the loot over', () => {
    const s = newGame(4, { noStandRule: 'ROLLOVER' }, 'p0');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' }, { p0: 'DUCK', p1: 'DUCK', p2: 'DUCK', p3: 'DUCK' });
    tick(s); // showdown → split → (nobody) round end
    expect(s.phase).toBe('ROUND_END');
    tick(s);
    expect(s.bossId).toBe('p0');
    expect(s.table).toHaveLength(16);
  });

  it('nobody standing: the loot is thrown away (default)', () => {
    const s = newGame(4, {}, 'p0');
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' }, { p0: 'DUCK', p1: 'DUCK', p2: 'DUCK', p3: 'DUCK' });
    tick(s); tick(s);
    expect(s.table).toHaveLength(8);
  });

  function splitWithItem(item: LootCard, setup?: (s: GameState) => void) {
    const s = newGame(4, {}, 'p0');
    s.table[0] = item;
    setup?.(s);
    playRound(s, {}, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' });
    tick(s);
    return s;
  }

  it('First Aid heals all wounds; wasted with none', () => {
    const s = splitWithItem({ id: 'FA', kind: 'FIRST_AID', value: 0 }, x => { P(x, 'p0').wounds = 2; });
    act(s, { type: 'PICK', playerId: 'p0', itemId: 'FA' });
    expect(P(s, 'p0').wounds).toBe(0);
    const s2 = splitWithItem({ id: 'FA', kind: 'FIRST_AID', value: 0 });
    act(s2, { type: 'PICK', playerId: 'p0', itemId: 'FA' });
    expect(P(s2, 'p0').wounds).toBe(0);
    expect(P(s2, 'p0').loot.find(c => c.id === 'FA')).toBeUndefined();
    const ev = s2.log.find(e => e.t === 'PICK' && e.playerId === 'p0');
    expect(ev && 'effect' in ev ? ev.effect : '').toMatch(/wasted/);
  });

  it('Clip with a face-down BANG in discard: gain BANG, discard another, hand size unchanged', () => {
    const s = splitWithItem({ id: 'CL', kind: 'CLIP', value: 0 }, x => {
      x.discard.push({ card: { id: 'zz-B9', kind: 'BANG' }, faceUp: false, by: 'p3', round: 0 });
    });
    const before = P(s, 'p0').hand.length;
    const bangsBefore = P(s, 'p0').hand.filter(c => c.kind === 'BANG').length;
    act(s, { type: 'PICK', playerId: 'p0', itemId: 'CL' });
    expect(s.pending).toEqual({ kind: 'CLIP_DISCARD', playerId: 'p0' });
    expect(err(() => apply(s, { type: 'PICK', playerId: 'p0', itemId: s.table[0].id }))).toBe('NOT_ALLOWED');
    const click = P(s, 'p0').hand.find(c => c.kind === 'CLICK')!;
    act(s, { type: 'CHOOSE_DISCARD', playerId: 'p0', cardId: click.id });
    expect(P(s, 'p0').hand.length).toBe(before);
    expect(P(s, 'p0').hand.filter(c => c.kind === 'BANG').length).toBe(bangsBefore + 1);
    expect(s.pending).toBeNull();
  });

  it('Clip with no BANG in discard is lost', () => {
    const s = splitWithItem({ id: 'CL', kind: 'CLIP', value: 0 });
    s.discard = s.discard.filter(d => d.card.kind !== 'BANG');
    const hand = P(s, 'p0').hand.map(c => c.id);
    act(s, { type: 'PICK', playerId: 'p0', itemId: 'CL' });
    expect(s.pending).toBeNull();
    expect(P(s, 'p0').hand.map(c => c.id)).toEqual(hand);
  });
});

describe('scoring', () => {
  const card = (kind: LootCard['kind'], value = 0): LootCard => ({ id: Math.random().toString(), kind, value });

  it('diamond bonus by count; tie → nobody', () => {
    const s = newGame(3);
    P(s, 'p0').loot = [card('DIAMOND', 1000), card('DIAMOND', 1000)];
    P(s, 'p1').loot = [card('DIAMOND', 10000)];
    let sc = computeScores(s);
    expect(sc.find(l => l.playerId === 'p0')!.diamondBonus).toBe(60000);
    expect(sc.find(l => l.playerId === 'p1')!.diamondBonus).toBe(0);
    P(s, 'p1').loot.push(card('DIAMOND', 1000));
    sc = computeScores(s);
    expect(sc.every(l => l.diamondBonus === 0)).toBe(true);
  });

  it('dead players do not score (or compete for the diamond bonus)', () => {
    const s = newGame(3);
    P(s, 'p0').loot = [card('CASH', 20000), card('DIAMOND', 1000), card('DIAMOND', 1000)];
    P(s, 'p0').alive = false;
    P(s, 'p1').loot = [card('DIAMOND', 1000)];
    const sc = computeScores(s);
    expect(sc.find(l => l.playerId === 'p0')!.total).toBe(0);
    expect(sc.find(l => l.playerId === 'p1')!.diamondBonus).toBe(60000);
    expect(determineWinners(sc)).toEqual(['p1']);
  });

  it('tiebreak: most wounds wins; still tied → shared', () => {
    const s = newGame(3);
    P(s, 'p0').loot = [card('CASH', 20000)];
    P(s, 'p1').loot = [card('CASH', 20000)];
    P(s, 'p1').wounds = 2;
    expect(determineWinners(computeScores(s))).toEqual(['p1']);
    P(s, 'p0').wounds = 2;
    expect(determineWinners(computeScores(s))).toEqual(['p0', 'p1']);
  });

  it('paintings score as a set', () => {
    const s = newGame(3);
    P(s, 'p0').loot = [card('PAINTING'), card('PAINTING'), card('PAINTING')];
    expect(computeScores(s).find(l => l.playerId === 'p0')!.paintingValue).toBe(30000);
  });
});

describe('full games', () => {
  it('after 8 rounds without clips every hand is empty', () => {
    const s = newGame(4, {}, 'p0');
    // strip clips out of the deck so hands are untouched
    for (const pile of [s.table, ...s.lootPiles]) for (const c of pile) if (c.kind === 'CLIP') { c.kind = 'CASH'; c.value = 5000; }
    for (let r = 0; r < 8; r++) {
      playRound(s, {}, {}); // nobody aims, so the BANGs left at the end hurt no one
      finishSplit(s);
      tick(s);
    }
    expect(s.phase).toBe('GAME_OVER');
    for (const p of s.players) expect(p.hand).toHaveLength(0);
    expect(s.scores).not.toBeNull();
  });

  it('replaying seed + action log reproduces the identical final state', () => {
    for (const powers of [false, true]) {
      const { state, actions } = runBotGame(6, 'replay-' + powers, { powers });
      const players = state.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isBot: true }));
      const again = replay(players, { seed: state.seed, settings: { powers } }, actions);
      expect(JSON.stringify(again)).toBe(JSON.stringify(state));
    }
  });

  it('hundreds of bot games complete without errors', () => {
    for (let i = 0; i < 60; i++) {
      const { state } = runBotGame(3 + (i % 6), 'bulk-' + i, { powers: i % 2 === 0 });
      expect(state.phase).toBe('GAME_OVER');
    }
  });
});

describe('hidden information', () => {
  it('filtered views never leak hands, loaded cards, pre-reveal stances or hidden loot', () => {
    for (let g = 0; g < 6; g++) {
      const { state, actions } = runBotGame(5, 'leak-' + g, { powers: g % 2 === 0 });
      const players = state.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isBot: true }));
      // walk the game again, checking every intermediate view
      let s = replay(players, { seed: state.seed, settings: { powers: g % 2 === 0 } }, []);
      const check = (st: GameState) => {
        if (st.phase === 'GAME_OVER') return;
        for (const viewer of [...st.players.map(p => p.id), null]) {
          const v = filterView(st, viewer);
          const json = JSON.stringify(v);
          expect(json).not.toContain('"rng"');
          expect(json).not.toContain('lootPiles');
          for (const p of st.players) {
            if (p.id === viewer) continue;
            for (const c of p.hand) expect(json).not.toContain(`"${c.id}"`);
            if (p.loaded) expect(json).not.toContain(`"${p.loaded.id}"`);
            const pub = v.players.find(x => x.id === p.id)!;
            expect(pub.loot).toBeNull();
            if (st.phase === 'COURAGE') expect(pub.stance).toBeNull();
          }
          for (const e of v.log) {
            if (e.t === 'LOADED' || e.t === 'HIDDEN_DISCARD') expect(e.playerId).toBe(viewer);
          }
        }
      };
      check(s);
      for (const a of actions) {
        s = structuredClone(s);
        apply(s, a);
        check(s);
      }
    }
  });

  it('if everyone dies at once, there are no winners', () => {
    const s = newGame(2);
    for (const p of s.players) p.wounds = 2;
    playRound(s, { p0: 'BANG', p1: 'BANG' }, { p0: 'p1', p1: 'p0' });
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winners).toEqual([]);
  });

  it('a duck’s card is never revealed to others before game over', () => {
    const s = newGame();
    playRound(s, { p1: 'BANG' }, { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' }, { p1: 'DUCK' });
    const v = filterView(s, 'p0');
    expect(v.players.find(p => p.id === 'p1')!.revealedCard).toBeNull();
    expect(JSON.stringify(v.log)).not.toContain('"reason":"DUCK"');
    expect(v.discardSummary.faceDown).toBeGreaterThan(0);
  });

  it('open vaults shows everyone’s loot', () => {
    const s = newGame(4, { openVaults: true });
    expect(filterView(s, 'p0').players.every(p => p.loot !== null)).toBe(true);
  });
});

describe('aim/decide timing', () => {
  it('rejects actions in the wrong phase and stale timeouts', () => {
    const s = newGame();
    expect(err(() => apply(s, { type: 'AIM', playerId: 'p0', target: 'p1' }))).toBe('WRONG_PHASE');
    const old = s.phaseSeq;
    tick(s);
    expect(err(() => apply(s, { type: 'TIMEOUT', phaseSeq: old }))).toBe('STALE_TIMEOUT');
  });

  it('decide is only accepted during courage', () => {
    const s = newGame();
    loadAll(s);
    expect(err(() => apply(s, { type: 'DECIDE', playerId: 'p0', stance: 'DUCK' }))).toBe('WRONG_PHASE');
    aim(s, { p0: 'p1' });
    decide(s, { p0: 'DUCK' });
    expect(P(s, 'p0').stance).toBe('DUCK');
  });
});
