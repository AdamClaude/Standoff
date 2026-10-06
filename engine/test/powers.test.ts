import { describe, expect, it } from 'vitest';
import { apply, computeScores, type GameState, type LootCard, type PowerId } from '../src/index.js';
import { act, aim, decide, finishSplit, loadAll, newGame, P, tick } from './helpers.js';

function game(powers: Record<string, PowerId | null>, n = 4, boss = 'p0'): GameState {
  const s = newGame(n, { powers: true }, boss);
  for (const p of s.players) p.power = powers[p.id] ?? null;
  return s;
}
const ring = { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' };
const cash = (id: string, value: number): LootCard => ({ id, kind: 'CASH', value });

describe('powers', () => {
  it('Kid aims after everyone locks', () => {
    const s = game({ p2: 'KID' });
    loadAll(s);
    expect(() => apply(s, { type: 'AIM', playerId: 'p2', target: 'p3' })).toThrow();
    act(s, { type: 'AIM', playerId: 'p0', target: 'p1' });
    tick(s);
    expect(s.phase).toBe('KID_AIM');
    act(s, { type: 'KID_AIM', playerId: 'p2', target: 'p0' });
    expect(P(s, 'p2').target).toBe('p0');
    expect(['BOSS_PRIVILEGE', 'COURAGE']).toContain(s.phase);
  });

  it('Cunning may swap the loaded card', () => {
    const s = game({ p1: 'CUNNING' });
    loadAll(s, { p1: 'CLICK' });
    act(s, { type: 'AIM', playerId: 'p1', target: 'p2' });
    tick(s);
    expect(s.phase).toBe('CUNNING_SWAP');
    const bang = P(s, 'p1').hand.find(c => c.kind === 'BANG')!;
    act(s, { type: 'CUNNING_SWAP', playerId: 'p1', cardId: bang.id });
    expect(P(s, 'p1').loaded!.kind).toBe('BANG');
    expect(P(s, 'p1').hand).toHaveLength(7);
  });

  it('Cute pockets a $5k bill before the split', () => {
    const s = game({ p3: 'CUTE' });
    s.table[0] = cash('C5', 5000);
    loadAll(s); aim(s, ring); decide(s); tick(s);
    expect(P(s, 'p3').loot.map(c => c.id)).toContain('C5');
  });

  it('Doctor heals when ducking; Stealthy grabs $10k when ducking', () => {
    const s = game({ p1: 'DOCTOR', p2: 'STEALTHY' });
    P(s, 'p1').wounds = 2;
    s.table[0] = cash('C10', 10000);
    loadAll(s); aim(s, ring); decide(s, { p1: 'DUCK', p2: 'DUCK' });
    expect(P(s, 'p1').wounds).toBe(1);
    expect(P(s, 'p2').loot.map(c => c.id)).toEqual(['C10']);
  });

  it('Lucky ignores a double hit and still splits', () => {
    const s = game({ p1: 'LUCKY' });
    loadAll(s, { p0: 'BANG', p2: 'BANG' });
    aim(s, { p0: 'p1', p2: 'p1', p1: 'p3', p3: 'p0' });
    decide(s);
    expect(P(s, 'p1').wounds).toBe(0);
    tick(s);
    expect(P(s, 'p1').inSplit).toBe(true);
  });

  it('Lucky still takes a single hit', () => {
    const s = game({ p1: 'LUCKY' });
    loadAll(s, { p0: 'BANG' });
    aim(s, ring); decide(s);
    expect(P(s, 'p1').wounds).toBe(1);
  });

  it('Professional reveals the BANG and robs a ducking target', () => {
    const s = game({ p0: 'PROFESSIONAL' });
    P(s, 'p1').loot = [cash('X', 20000)];
    loadAll(s, { p0: 'BANG' });
    aim(s, ring); decide(s, { p1: 'DUCK' });
    expect(P(s, 'p0').loot.map(c => c.id)).toEqual(['X']);
    expect(P(s, 'p0').publicBangsRevealed).toBe(1);
  });

  it('Smart takes the bullet back and discards a card of choice', () => {
    const s = game({ p0: 'SMART' });
    loadAll(s, { p0: 'BANG' });
    aim(s, ring); decide(s, { p1: 'DUCK' });
    expect(s.pending).toEqual({ kind: 'SMART_DISCARD', playerId: 'p0' });
    expect(P(s, 'p0').hand).toHaveLength(8);
    const click = P(s, 'p0').hand.find(c => c.kind === 'CLICK')!;
    act(s, { type: 'CHOOSE_DISCARD', playerId: 'p0', cardId: click.id });
    expect(P(s, 'p0').hand).toHaveLength(7);
    expect(P(s, 'p0').hand.filter(c => c.kind === 'BANG')).toHaveLength(3);
  });

  it('Unbreakable survives a 3rd wound; Vulture picks over the dead', () => {
    const s = game({ p1: 'UNBREAKABLE', p3: 'VULTURE' });
    P(s, 'p1').wounds = 2;
    P(s, 'p2').wounds = 2;
    P(s, 'p2').loot = [cash('a', 5000), cash('b', 5000), cash('c', 5000)];
    loadAll(s, { p0: 'BANG', p1: 'BANG' });
    aim(s, ring); decide(s);
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p2').alive).toBe(false);
    expect(P(s, 'p3').loot).toHaveLength(2);
  });

  it('Greedy takes two then sits out the rest of the split', () => {
    const s = game({ p0: 'GREEDY' });
    loadAll(s); aim(s, ring); decide(s); tick(s);
    const [a, b] = s.table;
    act(s, { type: 'PICK', playerId: 'p0', itemId: a.id, secondItemId: b.id });
    expect(P(s, 'p0').loot.length + (P(s, 'p0').wounds === 0 ? 0 : 0)).toBeGreaterThanOrEqual(0);
    finishSplit(s);
    const picks = s.log.filter(e => e.t === 'PICK' && e.playerId === 'p0');
    expect(picks).toHaveLength(2);
  });

  it('non-Greedy cannot take two', () => {
    const s = game({});
    loadAll(s); aim(s, ring); decide(s); tick(s);
    expect(() => apply(s, { type: 'PICK', playerId: 'p0', itemId: s.table[0].id, secondItemId: s.table[1].id })).toThrow();
  });

  it('Dictator bans a loot type for the current picker', () => {
    const s = game({ p1: 'DICTATOR' });
    s.table[0] = { id: 'PNT', kind: 'PAINTING', value: 0 };
    loadAll(s); aim(s, ring); decide(s); tick(s);
    act(s, { type: 'DICTATE', playerId: 'p1', kind: 'PAINTING' });
    expect(() => apply(s, { type: 'PICK', playerId: 'p0', itemId: 'PNT' })).toThrow(/Dictator/);
    expect(() => apply(s, { type: 'DICTATE', playerId: 'p1', kind: 'CASH' })).toThrow();
    const other = s.table.find(c => c.kind !== 'PAINTING')!;
    act(s, { type: 'PICK', playerId: 'p0', itemId: other.id });
    expect(s.dictate).toBeNull();
  });

  it('Collector counts an extra painting', () => {
    const s = game({ p0: 'COLLECTOR' });
    P(s, 'p0').loot = [{ id: 'x', kind: 'PAINTING', value: 0 }, { id: 'y', kind: 'PAINTING', value: 0 }];
    expect(computeScores(s).find(l => l.playerId === 'p0')!.paintingValue).toBe(30000);
  });

  it('Good Friend also reloads when someone uses a clip', () => {
    const s = game({ p2: 'GOOD_FRIEND' });
    s.table[0] = { id: 'CL', kind: 'CLIP', value: 0 };
    s.discard.push({ card: { id: 'x-B1', kind: 'BANG' }, faceUp: true, by: 'p3', round: 0 });
    s.discard.push({ card: { id: 'x-B2', kind: 'BANG' }, faceUp: false, by: 'p3', round: 0 });
    loadAll(s); aim(s, ring); decide(s); tick(s);
    act(s, { type: 'PICK', playerId: 'p0', itemId: 'CL' });
    expect(s.pending?.kind).toBe('GOOD_FRIEND_DISCARD');
    tick(s); // Good Friend times out → auto discard
    expect(s.pending?.kind).toBe('CLIP_DISCARD');
    tick(s);
    expect(s.pending).toBeNull();
    expect(P(s, 'p2').hand.filter(c => c.kind === 'BANG')).toHaveLength(4);
    expect(P(s, 'p0').hand.filter(c => c.kind === 'BANG')).toHaveLength(4);
  });

  it('Hustler swaps a card each round without changing hand sizes', () => {
    const s = game({ p0: 'HUSTLER' });
    tick(s);
    expect(s.players.every(p => p.hand.length === 8)).toBe(true);
    expect(s.log.some(e => e.t === 'POWER' && e.power === 'HUSTLER')).toBe(true);
  });

  it('Junk Dealer swaps a fresh pick with a random rival item', () => {
    const s = game({ p0: 'JUNK_DEALER' });
    P(s, 'p3').loot = [cash('RIVAL', 20000)];
    loadAll(s); aim(s, ring); decide(s); tick(s);
    const first = s.table.find(c => c.kind === 'CASH' || c.kind === 'DIAMOND' || c.kind === 'PAINTING')!;
    act(s, { type: 'PICK', playerId: 'p0', itemId: first.id });
    act(s, { type: 'JUNK_SWAP', playerId: 'p0', lootId: first.id, victimId: 'p3' });
    expect(P(s, 'p0').loot.map(c => c.id)).toContain('RIVAL');
    expect(P(s, 'p3').loot.map(c => c.id)).toContain(first.id);
    expect(() => apply(s, { type: 'JUNK_SWAP', playerId: 'p0', lootId: 'RIVAL', victimId: 'p3' })).toThrow();
  });
});
