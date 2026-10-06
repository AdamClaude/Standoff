import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { botAction, type ClientView } from '@standoff/engine';
import type { ClientToServer, GameMessage, Intent, JoinReply, LobbyView, ServerToClient } from '@standoff/shared';
import { startServer } from '../src/server.js';

type C = Socket<ServerToClient, ClientToServer>;
let srv: Awaited<ReturnType<typeof startServer>>;
const url = () => `http://localhost:${srv.port}`;

beforeAll(async () => { srv = await startServer({ port: 0, timeScale: 0.06, staticDir: null, replayDir: null }); });
afterAll(async () => { await srv.close(); });

function client(): Promise<C> {
  return new Promise(res => {
    const c: C = connect(url(), { transports: ['websocket'], forceNew: true });
    c.on('connect', () => res(c));
  });
}
const call = <T>(fn: (ack: (r: T) => void) => void) => new Promise<T>(res => fn(res));

/** Plays automatically using bot logic, recording every view received. */
function autopilot(c: C, views: ClientView[]) {
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  c.on('game:view', (m: GameMessage) => {
    views.push(m.view);
    const a = botAction(m.view, 'NORMAL', rand);
    if (a) {
      const { playerId: _p, ...intent } = a as { playerId: string } & Record<string, unknown>;
      c.emit('game:action', intent as unknown as Intent, () => {});
    }
  });
}

describe('server', () => {
  it('rooms, bots and two humans play a full game with no hidden-info leaks', async () => {
    const host = await client();
    const created = await call<JoinReply>(ack => host.emit('room:create', { name: 'Aadam', avatar: 'rico' }, ack));
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);

    const guest = await client();
    const joined = await call<JoinReply>(ack => guest.emit('room:join', { code: created.code!.toLowerCase(), name: 'Guest', avatar: 'mags' }, ack));
    expect(joined.ok).toBe(true);
    expect(joined.spectator).toBeFalsy();

    // guest is not host
    const notHost = await call<{ ok: boolean; error?: string }>(ack => guest.emit('room:addBot', ack));
    expect(notHost.error).toBe('NOT_HOST');

    for (let i = 0; i < 3; i++) expect((await call<{ ok: boolean }>(ack => host.emit('room:addBot', ack))).ok).toBe(true);
    await call(ack => host.emit('room:settings', { powers: true }, ack));

    const hostViews: ClientView[] = [], guestViews: ClientView[] = [];
    autopilot(host, hostViews);
    autopilot(guest, guestViews);

    const over = new Promise<void>(res => {
      host.on('game:view', m => { if (m.view.phase === 'GAME_OVER') res(); });
    });
    const started = await call<{ ok: boolean; message?: string }>(ack => host.emit('room:start', {}, ack));
    expect(started.ok).toBe(true);
    await over;

    const last = hostViews[hostViews.length - 1];
    expect(last.phase).toBe('GAME_OVER');
    expect(last.scores).not.toBeNull();

    // No leaks: before game over, the guest never sees the host's cards/loot, and vice-versa.
    const leaks = (views: ClientView[], other: string) => {
      for (const v of views) {
        if (v.phase === 'GAME_OVER') continue;
        // bullet ids ("k12") may only appear in the viewer's own `me` block
        expect(JSON.stringify({ ...v, me: null })).not.toMatch(/"k\d+"/);
        const op = v.players.find(p => p.id === other)!;
        expect(op.loot).toBeNull();
        if (v.phase === 'COURAGE') expect(op.stance).toBeNull();
      }
    };
    leaks(guestViews, created.playerId!);
    leaks(hostViews, joined.playerId!);

    // Rematch keeps the room together.
    const rematch = await call<{ ok: boolean }>(ack => host.emit('room:rematch', ack));
    expect(rematch.ok).toBe(true);

    host.disconnect();
    guest.disconnect();
  }, 120_000);

  it('reconnects with a token and restores the seat', async () => {
    const a = await client();
    const r = await call<JoinReply>(ack => a.emit('room:create', { name: 'A', avatar: 'sal' }, ack));
    for (let i = 0; i < 3; i++) await call(ack => a.emit('room:addBot', ack));
    await call(ack => a.emit('room:start', {}, ack));
    a.disconnect();

    const b = await client();
    const gotView = new Promise<GameMessage>(res => b.once('game:view', res));
    const re = await call<JoinReply>(ack => b.emit('room:join', { code: r.code!, name: 'A', avatar: 'sal', token: r.token }, ack));
    expect(re.playerId).toBe(r.playerId);
    const m = await gotView;
    expect(m.view.viewerId).toBe(r.playerId);
    expect(m.view.me).not.toBeNull();
    b.disconnect();
  });

  it('strangers joining mid-game become spectators with no private info', async () => {
    const a = await client();
    const r = await call<JoinReply>(ack => a.emit('room:create', { name: 'A', avatar: 'sal' }, ack));
    for (let i = 0; i < 3; i++) await call(ack => a.emit('room:addBot', ack));
    await call(ack => a.emit('room:start', {}, ack));
    const s = await client();
    const gotView = new Promise<GameMessage>(res => s.once('game:view', res));
    const j = await call<JoinReply>(ack => s.emit('room:join', { code: r.code!, name: 'S', avatar: 'sal' }, ack));
    expect(j.spectator).toBe(true);
    const m = await gotView;
    expect(m.view.me).toBeNull();
    expect(m.view.players.every(p => p.loot === null)).toBe(true);
    const bad = await call<{ ok: boolean; error?: string }>(ack => s.emit('game:action', { type: 'DECIDE', stance: 'DUCK' }, ack));
    expect(bad.error).toBe('NOT_A_PLAYER');
    a.disconnect(); s.disconnect();
  });

  it('cannot start with fewer than 3 seats; lobby reflects settings', async () => {
    const a = await client();
    const lobbies: LobbyView[] = [];
    a.on('room:update', l => lobbies.push(l));
    await call<JoinReply>(ack => a.emit('room:create', { name: 'A', avatar: 'sal' }, ack));
    const res = await call<{ ok: boolean; message?: string }>(ack => a.emit('room:start', {}, ack));
    expect(res.ok).toBe(false);
    await call(ack => a.emit('room:settings', { timers: 'FAST', openVaults: true }, ack));
    await new Promise(r => setTimeout(r, 50));
    expect(lobbies[lobbies.length - 1].settings.timers).toBe('FAST');
    a.disconnect();
  });
});
