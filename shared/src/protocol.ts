// Wire protocol shared by server and client.
import type { Action, BotLevel, ClientView, NoStandRule, Phase, PlayerId } from '@standoff/engine';

export type TimerPreset = 'FAST' | 'NORMAL' | 'CHILL';

export interface RoomSettings {
  maxPlayers: number;        // 3–8
  timers: TimerPreset;
  powers: boolean;
  openVaults: boolean;
  noStandRule: NoStandRule;
  botLevel: BotLevel;
  botTakeover: boolean;      // replace players gone > 60s with a bot
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  timers: 'NORMAL',
  powers: false,
  openVaults: false,
  noStandRule: 'ROLLOVER',
  botLevel: 'NORMAL',
  botTakeover: true,
};

/** Phase durations in ms. SPLIT is per pick; PENDING is any Clip/Smart choice. */
export type TimerKey = Exclude<Phase, 'GAME_OVER'> | 'PENDING';

const NORMAL: Record<TimerKey, number> = {
  LOOT_REVEAL: 5000,
  LOAD: 12000,      // pick a bullet AND a target, secretly; '3… 2… 1… DRAW!'
  HOLD_UP: 4500,       // "3… 2… 1… AIM!"
  KID_AIM: 6000,
  CUNNING_SWAP: 6000,
  BOSS_PRIVILEGE: 8000,
  REDIRECT: 6000,
  COURAGE: 4000,       // "3… 2… 1… DECIDE!"
  SHOWDOWN: 5000,
  SPLIT: 10000,
  PENDING: 8000,
  ROUND_END: 4000,
};

export function phaseDuration(preset: TimerPreset, key: TimerKey): number {
  const base = NORMAL[key];
  // Countdowns stay snappy in every preset — speed is part of the game.
  const countdown = key === 'COURAGE';
  const scale = preset === 'FAST' ? (countdown ? 0.85 : 0.65) : preset === 'CHILL' ? (countdown ? 1.25 : 1.7) : 1;
  return Math.round(base * scale);
}

export interface Seat {
  playerId: PlayerId;
  name: string;
  avatar: string;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface LobbyView {
  code: string;
  hostId: PlayerId;
  settings: RoomSettings;
  seats: Seat[];
  spectators: number;
  inGame: boolean;
}

export interface GameMessage {
  view: ClientView;
  phaseEndsAt: number;  // server clock ms
  serverNow: number;
}

export interface ChatMessage {
  id: number;
  from: PlayerId | null;
  name: string;
  text: string;
  taunt?: string;       // taunt key, localised on the client
  at: number;
}

export const TAUNTS = ['LOADED', 'TRY_ME', 'NOT_TODAY', 'BOSS_A_WORD', 'TRUCE', 'LIAR', 'NOTHING_PERSONAL', 'CAPISCE', 'BUSINESS', 'FORGET_IT', 'MY_MONEY', 'BADA_BING', 'FAMILY', 'BANZAI'] as const;
export type TauntKey = (typeof TAUNTS)[number];
export const REACTIONS = ['😂', '😱', '😈', '🤝', '💀', '💰', '🔫', '🙏'] as const;

/** Client → server game intent: the server fills in playerId. */
export type Intent = DistributiveOmit<Exclude<Action, { type: 'TIMEOUT' } | { type: 'REPLACE_WITH_BOT' }>, 'playerId'>;
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export interface JoinReply {
  ok: boolean;
  error?: string;
  code?: string;
  playerId?: PlayerId;
  token?: string;
  spectator?: boolean;
}

export interface Ack { ok: boolean; error?: string; message?: string }

export interface ClientToServer {
  'room:create': (p: { name: string; avatar: string }, ack: (r: JoinReply) => void) => void;
  'room:join': (p: { code: string; name: string; avatar: string; token?: string; spectate?: boolean }, ack: (r: JoinReply) => void) => void;
  'room:settings': (p: Partial<RoomSettings>, ack: (r: Ack) => void) => void;
  'room:addBot': (ack: (r: Ack) => void) => void;
  'room:removeSeat': (playerId: PlayerId, ack: (r: Ack) => void) => void;
  'room:start': (p: { tutorial?: boolean }, ack: (r: Ack) => void) => void;
  'room:rematch': (ack: (r: Ack) => void) => void;
  'room:leave': () => void;
  'game:action': (intent: Intent, ack: (r: Ack) => void) => void;
  'chat:send': (p: { text?: string; taunt?: TauntKey }) => void;
  'react': (emoji: string) => void;
  'time:ping': (clientSent: number, ack: (serverNow: number) => void) => void;
}

export interface ServerToClient {
  'room:update': (lobby: LobbyView) => void;
  'game:view': (msg: GameMessage) => void;
  'chat': (msg: ChatMessage) => void;
  'chat:history': (msgs: ChatMessage[]) => void;
  'react': (p: { playerId: PlayerId; emoji: string }) => void;
  'room:closed': (reason: string) => void;
}
