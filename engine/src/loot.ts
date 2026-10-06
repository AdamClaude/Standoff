import type { LootCard, LootKind } from './types.js';

/** Painting set values by number of paintings held (index = count). */
export const PAINTING_VALUES = [0, 4000, 12000, 30000, 60000, 100000, 150000, 200000, 300000, 400000, 500000];

export function paintingValue(count: number): number {
  if (count <= 0) return 0;
  if (count >= PAINTING_VALUES.length) return PAINTING_VALUES[PAINTING_VALUES.length - 1];
  return PAINTING_VALUES[count];
}

export const DIAMOND_BONUS = 60000;

export function buildLootDeck(): LootCard[] {
  const deck: LootCard[] = [];
  let n = 0;
  const add = (kind: LootKind, value: number, count: number) => {
    for (let i = 0; i < count; i++) deck.push({ id: `L${String(n++).padStart(2, '0')}`, kind, value });
  };
  add('CASH', 5000, 15);
  add('CASH', 10000, 15);
  add('CASH', 20000, 10);
  add('DIAMOND', 1000, 5);
  add('DIAMOND', 5000, 3);
  add('DIAMOND', 10000, 1);
  add('PAINTING', 0, 10);
  add('CLIP', 0, 3);
  add('FIRST_AID', 0, 2);
  return deck;
}

export function lootLabel(c: LootCard): string {
  switch (c.kind) {
    case 'CASH': return `$${c.value / 1000}k cash`;
    case 'DIAMOND': return `$${c.value / 1000}k diamond`;
    case 'PAINTING': return 'painting';
    case 'CLIP': return 'clip';
    case 'FIRST_AID': return 'first aid kit';
  }
}
