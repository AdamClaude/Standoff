import express from 'express';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { REACTIONS, TAUNTS, type ClientToServer, type ServerToClient, type TauntKey } from '@standoff/shared';
import { Room } from './room.js';

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient>;

export interface ServerOptions {
  port?: number;
  timeScale?: number;   // tests use a tiny scale so a full game takes seconds
  staticDir?: string | null;
  replayDir?: string | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function startServer(opts: ServerOptions = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  const app = express();
  const http = createServer(app);
  const io: IO = new Server(http, { cors: { origin: true } });
  const rooms = new Map<string, Room>();
  const socketRoom = new Map<string, string>();
  const timeScale = opts.timeScale ?? 1;
  const replayDir = opts.replayDir === undefined ? resolve(here, '../replays') : opts.replayDir;

  app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
  app.get('/api/room/:code', (req, res) => {
    const r = rooms.get(String(req.params.code).toUpperCase());
    res.json(r ? { exists: true, inGame: !!r.state && r.state.phase !== 'GAME_OVER', seats: r.seats.length, max: r.settings.maxPlayers } : { exists: false });
  });

  const staticDir = opts.staticDir === undefined ? resolve(here, '../../client/dist') : opts.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  function newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function makeRoom(): Room {
    const code = newCode();
    const room: Room = new Room(code, {
      timeScale,
      now: () => Date.now(),
      sendView: (sid, msg) => io.to(sid).emit('game:view', msg),
      sendLobby: lobby => io.to(code).emit('room:update', lobby),
      sendChat: msg => io.to(code).emit('chat', msg),
      onGameOver: r => {
        io.to(code).emit('room:update', r.lobby());
        if (replayDir) {
          try {
            mkdirSync(replayDir, { recursive: true });
            writeFileSync(join(replayDir, `${code}-${Date.now()}.json`), JSON.stringify(r.replayRecord()));
          } catch { /* replays are best-effort */ }
        }
      },
    });
    rooms.set(code, room);
    return room;
  }

  const pushLobby = (room: Room) => io.to(room.code).emit('room:update', room.lobby());

  io.on('connection', (socket: Sock) => {
    const roomOf = () => {
      const code = socketRoom.get(socket.id);
      return code ? rooms.get(code) ?? null : null;
    };
    const seatOf = () => roomOf()?.seatBySocket(socket.id) ?? null;
    const isHost = () => {
      const r = roomOf(), s = seatOf();
      return !!r && !!s && r.hostId === s.playerId;
    };

    function enter(room: Room) {
      socketRoom.set(socket.id, room.code);
      socket.join(room.code);
      socket.emit('chat:history', room.chat.slice(-50));
      pushLobby(room);
      const v = room.viewFor(socket.id);
      if (v) socket.emit('game:view', v);
    }

    socket.on('time:ping', (_t, ack) => typeof ack === 'function' && ack(Date.now()));

    socket.on('room:create', (p, ack) => {
      if (typeof ack !== 'function') return;
      leave();
      const room = makeRoom();
      const seat = room.addHuman(p?.name, p?.avatar);
      room.connect(seat, socket.id);
      enter(room);
      ack({ ok: true, code: room.code, playerId: seat.playerId, token: seat.token });
    });

    socket.on('room:join', (p, ack) => {
      if (typeof ack !== 'function') return;
      const room = rooms.get(String(p?.code ?? '').toUpperCase().trim());
      if (!room) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      leave();
      // Reconnect with token
      if (p.token) {
        const seat = room.seats.find(s => s.token && s.token === p.token);
        if (seat) {
          room.connect(seat, socket.id);
          enter(room);
          return ack({ ok: true, code: room.code, playerId: seat.playerId, token: seat.token });
        }
      }
      const inGame = !!room.state && room.state.phase !== 'GAME_OVER';
      if (p.spectate || inGame || room.seats.length >= room.settings.maxPlayers) {
        room.spectators.add(socket.id);
        enter(room);
        return ack({ ok: true, code: room.code, spectator: true });
      }
      const seat = room.addHuman(p.name, p.avatar);
      room.connect(seat, socket.id);
      enter(room);
      ack({ ok: true, code: room.code, playerId: seat.playerId, token: seat.token });
    });

    socket.on('room:settings', (p, ack) => {
      const room = roomOf();
      if (!room || !isHost()) return ack?.({ ok: false, error: 'NOT_HOST' });
      if (room.state && room.state.phase !== 'GAME_OVER') return ack?.({ ok: false, error: 'IN_GAME' });
      room.updateSettings(p ?? {});
      pushLobby(room);
      ack?.({ ok: true });
    });

    socket.on('room:addBot', ack => {
      const room = roomOf();
      if (!room || !isHost()) return ack?.({ ok: false, error: 'NOT_HOST' });
      if (room.state && room.state.phase !== 'GAME_OVER') return ack?.({ ok: false, error: 'IN_GAME' });
      if (room.seats.length >= room.settings.maxPlayers) return ack?.({ ok: false, error: 'ROOM_FULL' });
      room.addBot();
      pushLobby(room);
      ack?.({ ok: true });
    });

    socket.on('room:removeSeat', (pid, ack) => {
      const room = roomOf();
      if (!room || !isHost()) return ack?.({ ok: false, error: 'NOT_HOST' });
      if (room.state && room.state.phase !== 'GAME_OVER') return ack?.({ ok: false, error: 'IN_GAME' });
      if (pid === room.hostId) return ack?.({ ok: false, error: 'NOT_ALLOWED' });
      const seat = room.seats.find(s => s.playerId === pid);
      if (seat) for (const sid of seat.socketIds) {
        io.to(sid).emit('room:closed', 'KICKED');
        socketRoom.delete(sid);
        io.sockets.sockets.get(sid)?.leave(room.code);
      }
      room.removeSeat(pid);
      pushLobby(room);
      ack?.({ ok: true });
    });

    socket.on('room:start', (p, ack) => {
      const room = roomOf();
      if (!room || !isHost()) return ack?.({ ok: false, error: 'NOT_HOST' });
      const err = room.start(!!p?.tutorial);
      pushLobby(room);
      ack?.(err ? { ok: false, error: 'CANNOT_START', message: err } : { ok: true });
    });

    socket.on('room:rematch', ack => {
      const room = roomOf();
      if (!room || !isHost()) return ack?.({ ok: false, error: 'NOT_HOST' });
      if (room.state && room.state.phase !== 'GAME_OVER') return ack?.({ ok: false, error: 'IN_GAME' });
      // drop seats whose humans are gone
      for (const s of [...room.seats]) if (!s.isBot && s.socketIds.size === 0) room.removeSeat(s.playerId);
      for (const s of room.seats) s.takenOverByBot = false;
      const err = room.start(room.tutorial);
      pushLobby(room);
      ack?.(err ? { ok: false, error: 'CANNOT_START', message: err } : { ok: true });
    });

    socket.on('game:action', (intent, ack) => {
      const room = roomOf(), seat = seatOf();
      if (!room || !seat) return ack?.({ ok: false, error: 'NOT_A_PLAYER' });
      if (!intent || typeof intent !== 'object' || typeof (intent as { type?: unknown }).type !== 'string') return ack?.({ ok: false, error: 'BAD_INTENT' });
      const err = room.intent(seat.playerId, intent);
      ack?.(err ? { ok: false, error: err } : { ok: true });
    });

    socket.on('chat:send', p => {
      const room = roomOf();
      if (!room) return;
      const seat = seatOf();
      const taunt = p?.taunt && (TAUNTS as readonly string[]).includes(p.taunt) ? (p.taunt as TauntKey) : undefined;
      const text = String(p?.text ?? '');
      if (!taunt && !text.trim()) return;
      const msg = room.addChat(seat, text, taunt);
      io.to(room.code).emit('chat', msg);
    });

    socket.on('react', emoji => {
      const room = roomOf(), seat = seatOf();
      if (!room || !seat || !(REACTIONS as readonly string[]).includes(emoji)) return;
      io.to(room.code).emit('react', { playerId: seat.playerId, emoji });
    });

    function leave() {
      const room = roomOf();
      if (!room) return;
      socket.leave(room.code);
      socketRoom.delete(socket.id);
      room.disconnect(socket.id);
      pushLobby(room);
    }

    socket.on('room:leave', () => {
      const room = roomOf();
      const seat = seatOf();
      leave();
      // explicit leave during a game: hand the seat to a bot straight away
      if (room && seat && room.state && room.state.phase !== 'GAME_OVER' && seat.socketIds.size === 0) {
        seat.takenOverByBot = true;
        room.dispatch({ type: 'REPLACE_WITH_BOT', playerId: seat.playerId, isBot: true });
        pushLobby(room);
      }
    });

    socket.on('disconnect', () => {
      leave();
    });
  });

  // Reap idle rooms.
  const reaper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const anyone = room.seats.some(s => s.socketIds.size > 0) || room.spectators.size > 0;
      const idle = now - room.lastActivity;
      if ((!anyone && idle > 5 * 60_000) || idle > 3 * 3600_000) {
        room.clearTimers();
        rooms.delete(code);
      }
    }
  }, 60_000);
  reaper.unref();

  return new Promise<{ port: number; close: () => Promise<void>; rooms: Map<string, Room> }>(res => {
    http.listen(opts.port ?? 0, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port ?? 0;
      res({
        port,
        rooms,
        close: () => new Promise<void>(r => {
          for (const room of rooms.values()) room.clearTimers();
          io.close(() => r());
        }),
      });
    });
  });
}
