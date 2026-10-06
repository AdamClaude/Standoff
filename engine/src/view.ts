// Per-client filtered views. This is the ONLY thing the server ever sends to
// clients — it must never contain another player's hand, loaded card,
// pre-reveal stance, hidden loot, future loot piles or the RNG state.

import type {
  BulletCard, BulletKind, GameEvent, GameSettings, GameState, LootCard, LootKind, PendingChoice,
  Phase, PlayerId, PlayerStats, PowerId, RedirectOrder, ScoreLine, Stance,
} from './types.js';
import { currentPicker, redirectCandidates, retargetOptions, splitItems } from './engine.js';
import { woundLimit } from './powers.js';

export interface PublicPlayer {
  id: PlayerId;
  seat: number;
  name: string;
  avatar: string;
  isBot: boolean;
  alive: boolean;
  wounds: number;
  woundLimit: number;
  power: PowerId | null;
  shotsFired: number;          // public BANGs revealed
  handCount: number;
  hasLoaded: boolean;
  target: PlayerId | null;
  stance: Stance | null;       // only once revealed (or your own)
  revealedCard: BulletKind | null;
  hitThisRound: number;
  inSplit: boolean;
  lootCount: number;
  picksThisSplit: number;
  powerUsedThisSplit: boolean; // Dictator / Junk Dealer once-per-split
  loot: LootCard[] | null;     // null = hidden from this viewer
  stats: PlayerStats | null;   // only at game over
}

export interface ClientView {
  viewerId: PlayerId | null;
  round: number;
  rounds: number;
  phase: Phase;
  phaseSeq: number;
  settings: GameSettings;
  bossId: PlayerId;
  nextBossId: PlayerId | null;
  table: LootCard[];
  tokenAvailable: boolean;
  players: PublicPlayer[];
  redirect: RedirectOrder | null;
  redirectCandidates: PlayerId[];
  retargetOptions: PlayerId[];
  splitOrder: PlayerId[];
  currentPicker: PlayerId | null;
  splitItems: string[];
  pending: PendingChoice | null;
  dictate: { by: PlayerId; on: PlayerId; kind: LootKind | 'NEW_BOSS' } | null;
  discardSummary: { faceUpBang: number; faceUpClick: number; faceDown: number };
  me: { hand: BulletCard[]; loaded: BulletCard | null; stance: Stance | null; target: PlayerId | null } | null;
  log: GameEvent[];
  scores: ScoreLine[] | null;
  winners: PlayerId[] | null;
}

const STANCE_PUBLIC: Phase[] = ['SHOWDOWN', 'SPLIT', 'ROUND_END', 'GAME_OVER'];

export function filterView(s: GameState, viewerId: PlayerId | null): ClientView {
  const over = s.phase === 'GAME_OVER';
  const viewer = viewerId ? s.players.find(p => p.id === viewerId) ?? null : null;

  const players: PublicPlayer[] = s.players.map(p => {
    const self = viewer?.id === p.id;
    const lootVisible = self || over || s.settings.openVaults;
    return {
      id: p.id, seat: p.seat, name: p.name, avatar: p.avatar, isBot: p.isBot,
      alive: p.alive, wounds: p.wounds, woundLimit: woundLimit(s, p),
      power: s.settings.powers ? p.power : null,
      shotsFired: p.publicBangsRevealed,
      handCount: p.hand.length,
      hasLoaded: p.loaded !== null,
      target: p.target,
      stance: self || STANCE_PUBLIC.includes(s.phase) ? p.stance : null,
      revealedCard: p.revealedCard,
      hitThisRound: p.hitThisRound,
      inSplit: p.inSplit,
      lootCount: p.loot.length,
      picksThisSplit: s.phase === 'SPLIT' ? p.splitPicks.length : 0,
      powerUsedThisSplit: p.dictatorUsed || p.junkUsed,
      loot: lootVisible ? p.loot.map(c => ({ ...c })) : null,
      stats: over ? { ...p.stats } : null,
    };
  });

  const log = over ? s.log : s.log.filter(e => visibleEvent(e, viewerId));

  return {
    viewerId: viewer ? viewer.id : null,
    round: s.round,
    rounds: s.settings.rounds,
    phase: s.phase,
    phaseSeq: s.phaseSeq,
    settings: { ...s.settings },
    bossId: s.bossId,
    nextBossId: s.nextBossId,
    table: s.table.map(c => ({ ...c })),
    tokenAvailable: s.tokenAvailable,
    players,
    redirect: s.redirect,
    redirectCandidates: s.phase === 'BOSS_PRIVILEGE' ? redirectCandidates(s) : [],
    retargetOptions: s.phase === 'REDIRECT' && s.redirect ? retargetOptions(s, s.redirect.player, s.redirect.from) : [],
    splitOrder: s.splitOrder,
    currentPicker: currentPicker(s),
    splitItems: s.phase === 'SPLIT' ? splitItems(s) : [],
    pending: s.pending,
    dictate: s.dictate,
    discardSummary: {
      faceUpBang: s.discard.filter(d => d.faceUp && d.card.kind === 'BANG').length,
      faceUpClick: s.discard.filter(d => d.faceUp && d.card.kind === 'CLICK').length,
      faceDown: s.discard.filter(d => !d.faceUp).length,
    },
    me: viewer ? {
      hand: viewer.hand.map(c => ({ ...c })),
      loaded: viewer.loaded ? { ...viewer.loaded } : null,
      stance: viewer.stance,
      target: viewer.target,
    } : null,
    log: structuredClone(log),
    scores: s.scores,
    winners: s.winners,
  };
}

function visibleEvent(e: GameEvent, viewerId: PlayerId | null): boolean {
  switch (e.t) {
    case 'LOADED': return e.playerId === viewerId;
    case 'HIDDEN_DISCARD': return e.playerId === viewerId;
    case 'POWER': return !e.private || (viewerId !== null && e.private.includes(viewerId));
    default: return true;
  }
}
