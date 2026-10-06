// Practice mode: runs the real server Room (same engine, timers and bots) inside the
// browser and talks to it through a socket-shaped object, so the UI code is identical.
import { Room, type RoomHooks } from '../../server/src/room';
import type { TauntKey } from '@standoff/shared';

type Handler = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export function createLocalSocket() {
  const handlers = new Map<string, Handler[]>();
  const fire = (ev: string, ...args: unknown[]) => (handlers.get(ev) ?? []).forEach(h => h(...args));
  const SID = 'local';
  let room: Room | null = null;

  const hooks: RoomHooks = {
    timeScale: 1,
    now: () => Date.now(),
    sendView: (_sid, msg) => fire('game:view', structuredClone(msg)),
    sendLobby: l => fire('room:update', l),
    sendChat: m => fire('chat', m),
    onGameOver: r => fire('room:update', r.lobby()),
  };
  const lobby = () => room && fire('room:update', room.lobby());
  const seat = () => room?.seatBySocket(SID) ?? null;
  const ok = { ok: true };

  function handle(ev: string, a?: any, b?: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const ack: Handler = typeof b === 'function' ? b : typeof a === 'function' ? a : () => {};
    switch (ev) {
      case 'time:ping': return ack(Date.now());
      case 'room:create': {
        room?.clearTimers();
        room = new Room('PRACTICE', hooks);
        const s = room.addHuman(a?.name, a?.avatar);
        room.connect(s, SID);
        fire('chat:history', []);
        lobby();
        return ack({ ok: true, code: room.code, playerId: s.playerId, token: s.token });
      }
      case 'room:join': {
        const s = room?.seats.find(x => x.token && x.token === a?.token);
        if (!room || !s) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
        room.connect(s, SID);
        lobby();
        room.broadcast();
        return ack({ ok: true, code: room.code, playerId: s.playerId, token: s.token });
      }
      case 'room:settings': room?.updateSettings(a ?? {}); lobby(); return ack(ok);
      case 'room:addBot':
        if (room && room.seats.length < room.settings.maxPlayers) room.addBot();
        lobby(); return ack(ok);
      case 'room:removeSeat': room?.removeSeat(a); lobby(); return ack(ok);
      case 'room:start':
      case 'room:rematch': {
        if (!room) return ack({ ok: false, error: 'NO_ROOM' });
        const err = room.start(ev === 'room:rematch' ? room.tutorial : !!a?.tutorial);
        lobby();
        return ack(err ? { ok: false, error: 'CANNOT_START', message: err } : ok);
      }
      case 'room:leave': room?.clearTimers(); room = null; return;
      case 'game:action': {
        const s = seat();
        if (!room || !s) return ack({ ok: false, error: 'NOT_A_PLAYER' });
        const err = room.intent(s.playerId, a);
        return ack(err ? { ok: false, error: err } : ok);
      }
      case 'chat:send': {
        if (!room) return;
        const taunt = a?.taunt as TauntKey | undefined;
        if (!taunt && !String(a?.text ?? '').trim()) return;
        fire('chat', room.addChat(seat(), String(a?.text ?? ''), taunt));
        return;
      }
      case 'react': { const s = seat(); if (s) fire('react', { playerId: s.playerId, emoji: a }); return; }
    }
  }

  const sock = {
    connected: true,
    on(ev: string, h: Handler) { handlers.set(ev, [...(handlers.get(ev) ?? []), h]); return sock; },
    off(ev: string, h: Handler) { handlers.set(ev, (handlers.get(ev) ?? []).filter(x => x !== h)); return sock; },
    once(ev: string, h: Handler) { const w: Handler = (...x) => { sock.off(ev, w); h(...x); }; return sock.on(ev, w); },
    emit(ev: string, a?: unknown, b?: unknown) { setTimeout(() => handle(ev, a, b), 0); return sock; },
  };
  setTimeout(() => fire('connect'), 0);
  return sock;
}
