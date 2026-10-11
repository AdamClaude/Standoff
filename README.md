# STANDOFF

A real-time online party game for 3–8 players (bots fill empty spots). Eight heists, a crate of loot, and every gangster holding a pistol with a secret round chambered. Stay in for a share, or hit the floor and walk away with nothing.

The rules engine follows the 2nd-edition ruleset of the well-known gangster bluffing board game exactly, but the presentation is an action game: a top-down warehouse standoff with pistols that swing toward targets, laser sights, muzzle flashes, screen shake, health bars and an ammo belt. All names, characters, art, sounds and rules text are original.

## Run it

```bash
npm install
npm run dev          # server on :8080 + Vite client on :5173 (open http://localhost:5173)
```

Production (one process serves the built client and the websocket server):

```bash
npm run build        # builds client/dist
npm start            # http://localhost:8080
```

### Online with friends: Netlify + Render

- **Render** runs the game server from `render.yaml` (New → Blueprint → this repo). Free plan: sleeps after ~15 min idle, wakes in ~1 min.
- **Netlify** hosts the page from `netlify.toml`. Set the environment variable `VITE_SERVER_URL` to the Render URL (e.g. `https://standoff-server.onrender.com`) and redeploy.
- Both redeploy automatically on every push to `main`.

Docker / Fly.io / Railway / Render: the `Dockerfile` builds one container listening on `$PORT` (default 8080). Use sticky sessions if you run more than one instance (rooms live in memory).

## Test it

```bash
npm test                                   # engine (56 tests) + server integration (4 tests)
npm run sim -- --games 300 --players 6     # bot-vs-bot simulator, verifies every replay
npm run sim -- --games 200 --players 5 --powers --levels SHARK,EASY,NORMAL,NORMAL,EASY
```

## How to play (in our words)

1. **The haul.** Eight items drop into the crate each heist, plus the Boss crown.
2. **Chamber a round.** Everyone secretly picks one round from their belt: BANG or CLICK. You get 3 BANGs and 5 CLICKs for the whole game — one round per heist.
3. **Draw!** A 3-2-1 countdown. Tap a rival to point your gun at them. Everyone sees every gun swing. Still holstered when the count ends? You don't shoot this heist.
4. **Boss's call.** The Boss may order one gangster to point elsewhere.
5. **Hold or hit the floor.** A second countdown. Hit the floor and you're safe but get nothing. Freeze and you're holding.
6. **Showdown.** Anyone holding who is aimed at by someone holding gets shot at. Every BANG is a wound; three wounds and you're out. Rounds of people who hit the floor (and of anyone aiming at them) are never shown.
7. **The split.** Starting with the Boss and going clockwise, everyone still holding and unhurt grabs one item at a time until the crate is empty. The Boss crown makes you Boss next heist; first aid heals all wounds; a clip swaps a spent BANG back into your belt.

After eight heists, survivors count their stash. Most diamonds (by count) earns $60k; paintings score as a set (1→$4k … 10→$500k). Richest survivor wins; ties go to whoever took more wounds.

**House rules**: the Boss cigar is in the loot — grab it in the split to be Boss next heist; one wound per heist at most; the Boss may switch his own aim; if nobody makes the split, the loot is lost; if everyone left dies in the same showdown, nobody wins.

## Layout

```
engine/   pure TypeScript rules: (state, action) → state. No framework, no I/O.
  src/engine.ts    state machine, all base rules, split, scoring, replay
  src/powers.ts    16 advanced-mode powers as hooks
  src/view.ts      per-client filtered views (the only thing sent to clients)
  src/bot.ts       Easy / Normal / Shark bots that play from filtered views only
  src/driver.ts    headless bot game runner; src/sim.ts is the CLI
  test/            acceptance tests from the spec + power tests + leak tests
shared/   wire protocol, timer presets, original characters
server/   Express + Socket.IO room manager: codes, timers, bots, reconnection, spectators, replays
client/   React + Vite. Action-game UI, Web Audio sound, EN/AR with RTL
```

## Engineering notes

- **Server-authoritative.** Clients send intents (`LOAD`, `AIM`, `BOSS_REDIRECT`, `RETARGET`, `DECIDE`, `PICK`, `CHOOSE_DISCARD`, power actions). The server fills in the player id, validates through the engine, and rejects late inputs.
- **No hidden-info leaks.** `filterView` strips other players' rounds, chambered round, pre-reveal stance, private loot, future loot and RNG state. Round ids are opaque (`k17`) so an id never reveals its kind or owner. Tests walk every intermediate state of bot games and assert nothing leaks, for every viewer.
- **Deterministic replays.** Seed (from `crypto.randomBytes`) + action log reproduces a game exactly; finished games are written to `server/replays/`.
- **Synced countdowns.** The server sends `phaseEndsAt`; clients estimate clock offset with ping/pong and render locally.
- **Reconnection.** Seats are held by a secret token in localStorage. Drop and come back within 60 s and you're back; after that a bot takes over (host setting) until you return.
- **Deviations from the suggested stack:** Socket.IO instead of Colyseus (simpler custom filtered views), plain CSS instead of Tailwind, CSS animation instead of Framer Motion, synthesised Web Audio instead of Howler (no sound files to license). Redis/Postgres are not wired yet — rooms are in memory.
