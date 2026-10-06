import { useEffect, useState } from 'react';
import type { ClientView, GameEvent } from '@standoff/engine';
import { api, useApp } from '../net';
import { t, type Key } from '../i18n';
import { sfx } from '../audio';
import { describe, money, nameOf } from '../game-utils';
import { Avatar } from './Avatar';

type Award = 'TRIGGER' | 'CHICKEN' | 'BULLETPROOF' | 'BLUFF' | 'ART';

export function EndScreen({ v }: { v: ClientView }) {
  const lobby = useApp(s => s.lobby);
  const session = useApp(s => s.session);
  const isHost = lobby?.hostId === session?.playerId;
  const scores = [...(v.scores ?? [])].sort((a, b) => (b.alive ? b.total : -1) - (a.alive ? a.total : -1));
  const max = Math.max(1, ...scores.map(s => s.total));
  const [k, setK] = useState(0);
  useEffect(() => {
    sfx.sting();
    const start = performance.now();
    let raf = 0;
    const loop = (n: number) => {
      const p = Math.min(1, (n - start) / 2200);
      setK(1 - (1 - p) ** 3);
      if (p < 1) raf = requestAnimationFrame(loop); else sfx.cash();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const winners = v.winners ?? [];
  const headline = winners.length === 0 ? t('noWinner')
    : t(winners.length === 1 ? 'winner' : 'winners', { names: winners.map(id => nameOf(v, id)).join(' & ') });

  const awards: { key: Award; id: string | null }[] = (() => {
    const best = (f: (id: string) => number) => {
      let top: string | null = null, val = 0, tie = false;
      for (const p of v.players) {
        const x = f(p.id);
        if (x > val) { top = p.id; val = x; tie = false; } else if (x === val && x > 0) tie = true;
      }
      return tie ? null : top;
    };
    const st = (id: string) => v.players.find(p => p.id === id)!.stats!;
    return [
      { key: 'TRIGGER', id: best(id => st(id).bangsFired) },
      { key: 'CHICKEN', id: best(id => st(id).ducks) },
      { key: 'BULLETPROOF', id: best(id => st(id).aimsSurvived) },
      { key: 'BLUFF', id: best(id => st(id).bluffs) },
      { key: 'ART', id: best(id => scores.find(s => s.playerId === id)?.paintings ?? 0) },
    ];
  })();

  // Timeline grouped by round, with hidden discards revealed.
  const byRound = new Map<number, GameEvent[]>();
  for (const e of v.log) {
    if (!('round' in e)) continue;
    if (!byRound.has(e.round)) byRound.set(e.round, []);
    byRound.get(e.round)!.push(e);
  }

  return (
    <main className="endscreen">
      <h1 className="end-head">{headline}</h1>

      <ol className="vaults">
        {scores.map(s => {
          const p = v.players.find(x => x.id === s.playerId)!;
          return (
            <li key={s.playerId} className={`${winners.includes(s.playerId) ? 'is-winner' : ''}${s.alive ? '' : ' is-dead'}`}>
              <Avatar id={p.avatar} size={52} dead={!s.alive} wounds={s.wounds} />
              <div className="vault-body">
                <div className="vault-name">{p.name}</div>
                <div className="vault-bar"><span style={{ width: `${(s.total / max) * 100 * k}%` }} /></div>
                <div className="vault-detail">
                  {s.alive ? (
                    <>
                      <span>{t('cash')} {money(s.cash)}</span>
                      <span>{t('diamonds')} {money(s.diamonds)} ({s.diamondCount})</span>
                      <span>{t('paintings')} {money(s.paintingValue)} ({s.paintings})</span>
                      {s.diamondBonus > 0 && <span>{t('bonus')} {money(s.diamondBonus)}</span>}
                    </>
                  ) : <span>{t('dead')}</span>}
                </div>
              </div>
              <div className="vault-total">{s.alive ? money(Math.round(s.total * k / 1000) * 1000) : '—'}</div>
            </li>
          );
        })}
      </ol>

      <section className="awards">
        {awards.filter(a => a.id).map(a => (
          <div key={a.key} className="award">
            <b>{t(`award_${a.key}` as Key)}</b>
            <span>{nameOf(v, a.id)}</span>
            <small>{t(`awardDesc_${a.key}` as Key)}</small>
          </div>
        ))}
      </section>

      <div className="end-actions">
        {isHost && <button className="btn btn-primary" onClick={() => api.rematch()}>{t('rematch')}</button>}
        <button className="btn btn-ghost" onClick={() => api.leave()}>{t('backHome')}</button>
      </div>

      <details className="timeline">
        <summary>{t('timeline')}</summary>
        {[...byRound.entries()].map(([r, evs]) => (
          <section key={r}>
            <h3>{t('round', { n: r, total: v.rounds })}</h3>
            <ul>
              {evs.map((e, i) => {
                if (e.t === 'HIDDEN_DISCARD') return <li key={i} className="secret">🂠 {nameOf(v, e.playerId)}: {e.card} ({e.reason.toLowerCase().replace('_', ' ')})</li>;
                if (e.t === 'LOADED') return <li key={i} className="secret">🔫 {nameOf(v, e.playerId)} loaded {e.card}</li>;
                const d = describe(e, v);
                return d ? <li key={i}>{Array.isArray(d) ? d.join(' ') : d}</li> : null;
              })}
            </ul>
          </section>
        ))}
      </details>
    </main>
  );
}
