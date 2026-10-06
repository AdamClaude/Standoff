// CLI: bot-vs-bot simulator.
//   npm run sim -- --games 200 --players 6 --powers
import { runBotGame } from './driver.js';
import { replay } from './engine.js';
import type { BotLevel } from './bot.js';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const games = Number(opt('games', '100'));
const players = Number(opt('players', '6'));
const powers = args.includes('--powers');
const verbose = args.includes('--verbose');
const levels = opt('levels', '').split(',').filter(Boolean) as BotLevel[];

let lastAlive = 0, survivorsTotal = 0, totalWinner = 0, noSurvivors = 0;
const winsBySeat = new Array(players).fill(0);
const winsByLevel: Record<string, number> = {};

for (let g = 0; g < games; g++) {
  const seed = `sim-${g}`;
  const { state, actions } = runBotGame(players, seed, { powers }, levels);
  // determinism check on every game
  const ps = state.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isBot: true }));
  const again = replay(ps, { seed, settings: { powers } }, actions);
  if (JSON.stringify(again.scores) !== JSON.stringify(state.scores)) throw new Error(`replay mismatch in ${seed}`);

  const reason = state.log.find(e => e.t === 'GAME_OVER');
  if (reason && reason.t === 'GAME_OVER' && reason.reason === 'LAST_ALIVE') lastAlive++;
  if (reason && reason.t === 'GAME_OVER' && reason.reason === 'NO_SURVIVORS') noSurvivors++;
  survivorsTotal += state.players.filter(p => p.alive).length;
  for (const w of state.winners ?? []) {
    const p = state.players.find(x => x.id === w)!;
    winsBySeat[p.seat]++;
    const lv = levels[p.seat] ?? 'NORMAL';
    winsByLevel[lv] = (winsByLevel[lv] ?? 0) + 1;
    totalWinner += state.scores!.find(s => s.playerId === w)!.total;
  }
  if (verbose) {
    console.log(`#${g} winners=${state.winners?.join(',')} ` + state.scores!.map(s => `${s.playerId}:${s.alive ? s.total : 'dead'}`).join(' '));
  }
}

console.log(`games=${games} players=${players} powers=${powers}`);
console.log(`avg survivors=${(survivorsTotal / games).toFixed(2)} lastAlive=${lastAlive} noSurvivors=${noSurvivors}`);
console.log(`avg winning total=$${Math.round(totalWinner / Math.max(1, games)).toLocaleString()}`);
console.log(`wins by seat=${winsBySeat.join(' ')}`);
if (levels.length) console.log('wins by level', winsByLevel);
console.log('all replays deterministic ✔');
