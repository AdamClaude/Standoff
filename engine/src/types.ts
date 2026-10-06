// ─── Core value types ────────────────────────────────────────────────────────

export type PlayerId = string;

export type BulletKind = 'BANG' | 'CLICK';
export interface BulletCard {
  id: string; // unique per game, e.g. "p1-b0"
  kind: BulletKind;
}

export type LootKind = 'CASH' | 'DIAMOND' | 'PAINTING' | 'CLIP' | 'FIRST_AID';
export interface LootCard {
  id: string; // "L00".."L63"
  kind: LootKind;
  value: number; // face value in $ (0 for painting/clip/first aid)
}

/** The New Boss token is drafted like loot; we address it with this id. */
export const NEW_BOSS_TOKEN = 'NEW_BOSS';

export type Stance = 'STAND' | 'DUCK';

export type PowerId =
  | 'COLLECTOR' | 'CUNNING' | 'CUTE' | 'DICTATOR' | 'DOCTOR' | 'GOOD_FRIEND'
  | 'GREEDY' | 'HUSTLER' | 'JUNK_DEALER' | 'KID' | 'LUCKY' | 'PROFESSIONAL'
  | 'SMART' | 'STEALTHY' | 'UNBREAKABLE' | 'VULTURE';

// ─── Phases ──────────────────────────────────────────────────────────────────

export type Phase =
  | 'LOOT_REVEAL'
  | 'LOAD'
  | 'HOLD_UP'
  | 'KID_AIM'          // powers: the Kid aims after everyone locks
  | 'CUNNING_SWAP'     // powers: Cunning may swap their loaded card
  | 'BOSS_PRIVILEGE'
  | 'REDIRECT'
  | 'COURAGE'
  | 'SHOWDOWN'
  | 'SPLIT'
  | 'ROUND_END'
  | 'GAME_OVER';

// ─── Settings ────────────────────────────────────────────────────────────────

export type NoStandRule = 'ROLLOVER' | 'DISCARD';

export interface GameSettings {
  powers: boolean;
  openVaults: boolean;
  noStandRule: NoStandRule;
  rounds: number; // always 8 in the real game; configurable for tests
}

export const DEFAULT_SETTINGS: GameSettings = {
  powers: false,
  openVaults: false,
  noStandRule: 'ROLLOVER',
  rounds: 8,
};

// ─── Player & state ──────────────────────────────────────────────────────────

export interface PlayerStats {
  bangsFired: number;      // BANGs revealed at showdown
  ducks: number;
  aimsSurvived: number;    // rounds stood with ≥1 gun on you and weren't hit
  bluffs: number;          // rounds you aimed a CLICK at someone who ducked
  hits: number;            // wounds you caused
}

export interface Player {
  id: PlayerId;
  seat: number;
  name: string;
  avatar: string;
  isBot: boolean;

  hand: BulletCard[];          // private
  loaded: BulletCard | null;   // private until revealed
  target: PlayerId | null;     // public (live during HOLD_UP)
  stance: Stance | null;       // private until COURAGE ends

  wounds: number;
  alive: boolean;
  loot: LootCard[];            // private unless openVaults
  power: PowerId | null;

  publicBangsRevealed: number; // public "shots fired"
  stats: PlayerStats;

  // per-round transient flags
  hitThisRound: number;         // wounds taken this round
  revealedCard: BulletKind | null; // set at showdown if the card was revealed
  inSplit: boolean;             // eligible for the current split
  greedyUsed: boolean;          // Greedy took 2 this split → done
  dictatorUsed: boolean;
  junkUsed: boolean;
  splitPicks: string[];          // loot ids picked during the current split
}

export interface DiscardEntry {
  card: BulletCard;
  faceUp: boolean;
  by: PlayerId;
  round: number;
}

/** A pending decision inside SPLIT (Clip discard, Junk Dealer, Dictator…) */
export type PendingChoice =
  | { kind: 'CLIP_DISCARD'; playerId: PlayerId }
  | { kind: 'GOOD_FRIEND_DISCARD'; playerId: PlayerId; then: PendingChoice | null }
  | { kind: 'SMART_DISCARD'; playerId: PlayerId };

export interface RedirectOrder {
  by: PlayerId;
  player: PlayerId;
  from: PlayerId | null;
}

export type GameEvent =
  | { t: 'ROUND_START'; round: number; bossId: PlayerId; table: LootCard[] }
  | { t: 'LOADED'; round: number; playerId: PlayerId; card?: BulletKind; private?: true }
  | { t: 'AIM_LOCKED'; round: number; aims: Record<PlayerId, PlayerId | null> }
  | { t: 'REDIRECT_ORDER'; round: number; by: PlayerId; player: PlayerId }
  | { t: 'REDIRECTED'; round: number; player: PlayerId; to: PlayerId; auto: boolean }
  | { t: 'BOSS_PASSED'; round: number }
  | { t: 'COURAGE'; round: number; stances: Record<PlayerId, Stance> }
  | { t: 'SHOWDOWN'; round: number; reveals: { playerId: PlayerId; target: PlayerId; card: BulletKind }[];
      wounds: Record<PlayerId, number>; dead: PlayerId[] }
  | { t: 'HIDDEN_DISCARD'; round: number; playerId: PlayerId; card: BulletKind; reason: 'DUCK' | 'TARGET_DUCKED' | 'NO_TARGET' | 'CLIP' | 'SMART' }
  | { t: 'PICK'; round: number; playerId: PlayerId; item: LootCard | 'NEW_BOSS'; auto: boolean; effect?: string }
  | { t: 'NOBODY_STANDING'; round: number; rule: NoStandRule }
  | { t: 'ELIMINATED'; round: number; playerId: PlayerId }
  | { t: 'BOSS_CHANGE'; round: number; bossId: PlayerId; reason: 'TOKEN' | 'BOSS_DIED' }
  | { t: 'POWER'; round: number; playerId: PlayerId; power: PowerId; text: string; private?: PlayerId[] }
  | { t: 'GAME_OVER'; winners: PlayerId[]; reason: 'LAST_ALIVE' | 'ROUNDS' | 'NO_SURVIVORS' };

export interface ScoreLine {
  playerId: PlayerId;
  alive: boolean;
  cash: number;
  diamonds: number;       // face value
  diamondCount: number;
  paintings: number;      // count (incl. Collector bonus)
  paintingValue: number;
  diamondBonus: number;
  total: number;
  wounds: number;
}

export interface GameState {
  seed: string;
  rng: number[];               // serialisable RNG state
  settings: GameSettings;
  round: number;               // 1-based
  phase: Phase;
  players: Player[];           // sorted by seat; "clockwise" = increasing seat
  bossId: PlayerId;
  nextBossId: PlayerId | null; // set when someone drafts the New Boss token
  lootPiles: LootCard[][];     // remaining piles (index 0 = next round)
  table: LootCard[];           // loot on the table this round
  tokenAvailable: boolean;     // New Boss token still on the table
  discard: DiscardEntry[];
  redirect: RedirectOrder | null;
  splitOrder: PlayerId[];
  splitTurnIndex: number;
  pending: PendingChoice | null;
  /** Dictator's ban on the current picker's turn. */
  dictate: { by: PlayerId; on: PlayerId; kind: LootKind | 'NEW_BOSS' } | null;
  log: GameEvent[];
  scores: ScoreLine[] | null;
  winners: PlayerId[] | null;
  /** Bumped every time the phase changes; timers tag themselves with it. */
  phaseSeq: number;
}

// ─── Actions (client intents + server ticks) ────────────────────────────────

export type Action =
  | { type: 'LOAD'; playerId: PlayerId; cardId: string }
  | { type: 'AIM'; playerId: PlayerId; target: PlayerId | null }
  | { type: 'BOSS_REDIRECT'; playerId: PlayerId; target: PlayerId } // target = the player ordered to switch
  | { type: 'BOSS_PASS'; playerId: PlayerId }
  | { type: 'RETARGET'; playerId: PlayerId; target: PlayerId }
  | { type: 'KID_AIM'; playerId: PlayerId; target: PlayerId | null }
  | { type: 'CUNNING_SWAP'; playerId: PlayerId; cardId: string | null } // null = keep
  | { type: 'DECIDE'; playerId: PlayerId; stance: Stance }
  | { type: 'PICK'; playerId: PlayerId; itemId: string; secondItemId?: string } // secondItemId: Greedy
  | { type: 'CHOOSE_DISCARD'; playerId: PlayerId; cardId: string }
  | { type: 'DICTATE'; playerId: PlayerId; kind: LootKind | 'NEW_BOSS' }
  | { type: 'JUNK_SWAP'; playerId: PlayerId; lootId: string; victimId: PlayerId }
  | { type: 'TIMEOUT'; phaseSeq: number }
  | { type: 'REPLACE_WITH_BOT'; playerId: PlayerId; isBot: boolean };

export type ErrorCode =
  | 'WRONG_PHASE' | 'NOT_A_PLAYER' | 'DEAD' | 'NOT_IN_HAND' | 'ALREADY_LOADED'
  | 'BAD_TARGET' | 'NOT_BOSS' | 'NOT_YOUR_TURN' | 'NO_SUCH_ITEM' | 'SAME_TARGET'
  | 'NO_TARGET' | 'STALE_TIMEOUT' | 'NOT_ALLOWED' | 'NOTHING_PENDING';

export class GameError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface NewPlayer {
  id: PlayerId;
  name: string;
  avatar: string;
  isBot?: boolean;
}
