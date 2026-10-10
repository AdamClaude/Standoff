import type { ClientView, GameEvent, LootCard, PublicPlayer } from '@standoff/engine';
import { NEW_BOSS_TOKEN, paintingValue } from '@standoff/engine';
import { t, powerName } from './i18n';

export const nameOf = (v: ClientView, id: string | null | undefined) =>
  (id && v.players.find(p => p.id === id)?.name) || '?';

export function me(v: ClientView): PublicPlayer | null {
  return v.viewerId ? v.players.find(p => p.id === v.viewerId) ?? null : null;
}

export function itemLabel(c: LootCard | 'NEW_BOSS'): string {
  if (c === 'NEW_BOSS') return t('newBossToken');
  return t(`item_${c.kind}` as const, { v: c.value / 1000 });
}

export function lootById(v: ClientView, id: string): LootCard | 'NEW_BOSS' | null {
  if (id === NEW_BOSS_TOKEN) return 'NEW_BOSS';
  return v.table.find(c => c.id === id) ?? null;
}

/** "This painting would be your 3rd → +$18k" */
export function paintingHint(v: ClientView): string | null {
  const m = me(v);
  if (!m?.loot) return null;
  const n = m.loot.filter(c => c.kind === 'PAINTING').length + (m.power === 'COLLECTOR' ? 1 : 0);
  return t('wouldBe', { n: n + 1, v: (paintingValue(n + 1) - paintingValue(n)) / 1000 });
}

/** Seats rotated so the viewer sits at the bottom. */
export function seatOrder(v: ClientView): PublicPlayer[] {
  const ps = [...v.players].sort((a, b) => a.seat - b.seat);
  const i = v.viewerId ? ps.findIndex(p => p.id === v.viewerId) : 0;
  return i <= 0 ? ps : [...ps.slice(i), ...ps.slice(0, i)];
}

/** Ring position (percent) for seat index k of n, index 0 at the bottom, going clockwise on screen. */
export function seatPos(k: number, n: number): { x: number; y: number } {
  const a = Math.PI / 2 + (2 * Math.PI * k) / n;
  return { x: 50 + 39 * Math.cos(a), y: 50 + 39 * Math.sin(a) };
}

export function gunsOn(v: ClientView, id: string): PublicPlayer[] {
  return v.players.filter(p => p.alive && p.target === id && p.id !== id);
}

export function describe(e: GameEvent, v: ClientView): string | string[] | null {
  const n = (id: string) => nameOf(v, id);
  switch (e.t) {
    case 'ROUND_START': return t('ev_round', { n: e.round, boss: n(e.bossId) });
    case 'REDIRECT_ORDER': return e.player === e.by ? t('bossSelfOther') : t('ev_redirect', { name: n(e.player) });
    case 'REDIRECTED': return t('ev_redirected', { name: n(e.player), to: n(e.to) });
    case 'BOSS_PASSED': return null;
    case 'COURAGE': {
      const d = Object.entries(e.stances).filter(([, s]) => s === 'DUCK').map(([id]) => n(id));
      return d.length ? t('ev_ducks', { names: d.join(', ') }) : t('ev_nobodyDucks');
    }
    case 'SHOWDOWN': {
      // BANGs first: they are what everyone wants to read
      const sorted = [...e.reveals].sort((a, b) => (a.card === b.card ? 0 : a.card === 'BANG' ? -1 : 1));
      const parts = sorted.map(r => t(r.card === 'BANG' ? 'ev_bang' : 'ev_click', { a: n(r.playerId), b: n(r.target) }));
      return parts.length ? parts : null;
    }
    case 'ELIMINATED': return t('ev_dead', { name: n(e.playerId) });
    case 'PICK': return e.item === 'NEW_BOSS' ? t('ev_pickBoss', { name: n(e.playerId) }) : t('ev_pick', { name: n(e.playerId), item: itemLabel(e.item) }) + (e.effect ? ` (${e.effect})` : '');
    case 'NOBODY_STANDING': return t('ev_nobody');
    case 'BOSS_CHANGE': return t('ev_newBoss', { name: n(e.bossId) });
    case 'POWER': return t('ev_power', { name: n(e.playerId), power: powerName(e.power), text: e.text });
    case 'HIDDEN_DISCARD': return null;
    case 'LOADED': return null;
    case 'AIM_LOCKED': return null;
    case 'GAME_OVER': return null;
  }
}

export const money = (n: number) => '$' + n.toLocaleString('en-US');
