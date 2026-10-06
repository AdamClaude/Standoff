// Headless game driver: bots act from their filtered views, then the clock ticks.
// Used by the CLI simulator and tests.

import type { Action, GameSettings, GameState, NewPlayer } from './types.js';
import { createGame, apply } from './engine.js';
import { filterView } from './view.js';
import { botAction, type BotLevel } from './bot.js';
import { seedToState, next } from './rng.js';

export interface BotGameResult {
  state: GameState;
  actions: Action[];
}

export function runBotGame(
  n: number,
  seed: string,
  settings: Partial<GameSettings> = {},
  levels: BotLevel[] = [],
): BotGameResult {
  const players: NewPlayer[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `Bot${i}`, avatar: `a${i}`, isBot: true,
  }));
  const s = createGame(players, { seed, settings });
  const botRng = seedToState(seed + ':bots');
  const rand = () => next(botRng);
  const actions: Action[] = [];
  let guard = 0;
  const over = () => s.phase === 'GAME_OVER';

  while (!over()) {
    if (++guard > 20000) throw new Error('runaway game');
    let acted = true;
    while (acted && !over()) {
      acted = false;
      for (const p of s.players) {
        if (!p.alive && !(s.pending && 'playerId' in s.pending && s.pending.playerId === p.id)) continue;
        const a = botAction(filterView(s, p.id), levels[p.seat] ?? 'NORMAL', rand);
        if (!a) continue;
        apply(s, a);
        actions.push(a);
        acted = true;
        break;
      }
    }
    if (over()) break;
    const t: Action = { type: 'TIMEOUT', phaseSeq: s.phaseSeq };
    apply(s, t);
    actions.push(t);
  }
  return { state: s, actions };
}
