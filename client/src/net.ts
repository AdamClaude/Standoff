// Socket connection + app store (tiny external store, no framework).
import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type {
  Ack, ChatMessage, ClientToServer, GameMessage, Intent, JoinReply, LobbyView, RoomSettings, ServerToClient, TauntKey,
} from '@standoff/shared';

export interface Session { code: string; playerId: string | null; token: string | null; spectator: boolean }

export interface AppState {
  connected: boolean;
  session: Session | null;
  lobby: LobbyView | null;
  game: GameMessage | null;
  clockOffset: number;          // serverNow ≈ Date.now() + clockOffset
  chat: ChatMessage[];
  reactions: { id: number; playerId: string; emoji: string }[];
  toast: string | null;
  tutorial: boolean;
}

let state: AppState = {
  connected: false, session: null, lobby: null, game: null, clockOffset: 0,
  chat: [], reactions: [], toast: null, tutorial: false,
};
const subs = new Set<() => void>();
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  subs.forEach(f => f());
}
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}
export const getApp = () => state;

const socket: Socket<ServerToClient, ClientToServer> = io({ transports: ['websocket', 'polling'] });

// ── persistence of seats for reconnection ──
const SEATS_KEY = 'standoff.seats';
function savedSeat(code: string): { token: string } | null {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY) || '{}')[code] ?? null; } catch { return null; }
}
function saveSeat(code: string, token: string | undefined) {
  try {
    const all = JSON.parse(localStorage.getItem(SEATS_KEY) || '{}');
    if (token) all[code] = { token, at: Date.now() }; else delete all[code];
    localStorage.setItem(SEATS_KEY, JSON.stringify(all));
    localStorage.setItem('standoff.lastRoom', code);
  } catch { /* ignore */ }
}

export const profile = {
  get name() { return localStorage.getItem('standoff.name') || ''; },
  set name(v: string) { localStorage.setItem('standoff.name', v); },
  get avatar() { return localStorage.getItem('standoff.avatar') || 'rico'; },
  set avatar(v: string) { localStorage.setItem('standoff.avatar', v); },
};

// ── clock sync: keep the best (lowest RTT) offset sample ──
let bestRtt = Infinity;
function syncClock(samples = 5) {
  bestRtt = Infinity;
  for (let i = 0; i < samples; i++) {
    setTimeout(() => {
      const sent = Date.now();
      socket.emit('time:ping', sent, serverNow => {
        const recv = Date.now();
        const rtt = recv - sent;
        if (rtt < bestRtt) {
          bestRtt = rtt;
          set({ clockOffset: serverNow + rtt / 2 - recv });
        }
      });
    }, i * 150);
  }
}
setInterval(() => syncClock(3), 30_000);

export const serverNow = () => Date.now() + state.clockOffset;

socket.on('connect', () => {
  set({ connected: true });
  syncClock();
  // auto-rejoin after a drop
  const s = state.session;
  if (s) {
    const seat = savedSeat(s.code);
    socket.emit('room:join', { code: s.code, name: profile.name, avatar: profile.avatar, token: seat?.token, spectate: s.spectator }, r => {
      if (!r.ok) set({ session: null, lobby: null, game: null, toast: 'noRoom' });
    });
  }
});
socket.on('disconnect', () => set({ connected: false }));
socket.on('room:update', lobby => set({ lobby }));
socket.on('game:view', msg => set({ game: msg }));
socket.on('chat:history', msgs => set({ chat: msgs }));
socket.on('chat', msg => set({ chat: [...state.chat.slice(-99), msg] }));
let reactId = 0;
socket.on('react', r => {
  const id = ++reactId;
  set({ reactions: [...state.reactions, { id, ...r }] });
  setTimeout(() => set({ reactions: state.reactions.filter(x => x.id !== id) }), 2600);
});
socket.on('room:closed', () => {
  if (state.session) saveSeat(state.session.code, undefined);
  set({ session: null, lobby: null, game: null });
});

function onJoined(r: JoinReply) {
  if (!r.ok || !r.code) return false;
  saveSeat(r.code, r.token);
  set({ session: { code: r.code, playerId: r.playerId ?? null, token: r.token ?? null, spectator: !!r.spectator }, game: null });
  const url = new URL(location.href);
  url.searchParams.set('room', r.code);
  history.replaceState(null, '', url);
  return true;
}

export const api = {
  create(name: string, avatar: string, tutorial = false): Promise<boolean> {
    return new Promise(res => socket.emit('room:create', { name, avatar }, r => {
      const ok = onJoined(r);
      set({ tutorial });
      if (ok && tutorial) socket.emit('room:start', { tutorial: true }, () => {});
      res(ok);
    }));
  },
  join(code: string, name: string, avatar: string, spectate = false): Promise<JoinReply> {
    const seat = savedSeat(code.toUpperCase());
    return new Promise(res => socket.emit('room:join', { code, name, avatar, token: seat?.token, spectate }, r => {
      onJoined(r);
      set({ tutorial: false });
      res(r);
    }));
  },
  leave() {
    socket.emit('room:leave');
    if (state.session) saveSeat(state.session.code, undefined);
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    set({ session: null, lobby: null, game: null, chat: [], tutorial: false });
  },
  settings(p: Partial<RoomSettings>) { socket.emit('room:settings', p, () => {}); },
  addBot() { socket.emit('room:addBot', () => {}); },
  removeSeat(id: string) { socket.emit('room:removeSeat', id, () => {}); },
  start(): Promise<Ack> { return new Promise(res => socket.emit('room:start', {}, res)); },
  rematch() { socket.emit('room:rematch', () => {}); },
  act(intent: Intent): Promise<Ack> {
    return new Promise(res => socket.emit('game:action', intent, r => {
      if (!r.ok && r.error !== 'WRONG_PHASE' && r.error !== 'STALE_TIMEOUT') set({ toast: r.error ?? 'error' });
      res(r);
    }));
  },
  chat(text: string) { socket.emit('chat:send', { text }); },
  taunt(taunt: TauntKey) { socket.emit('chat:send', { taunt }); },
  react(emoji: string) { socket.emit('react', emoji); },
  clearToast() { set({ toast: null }); },
};
