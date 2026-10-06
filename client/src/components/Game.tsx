import { store } from '../storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientView, GameEvent, PublicPlayer } from '@standoff/engine';
import { api, getApp, serverNow, useApp } from '../net';
import { getLang, setLang, t, useLang, type Key } from '../i18n';
import { sfx, sound } from '../audio';
import { describe, gunsOn, me, nameOf } from '../game-utils';
import { Table } from './Table';
import { Tray, doPick, type TrayState } from './Tray';
import { Chat } from './Chat';
import { Rules } from './Rules';
import { EndScreen } from './EndScreen';
import { Coach } from './Coach';

export function Game() {
  useLang();
  const msg = useApp(s => s.game)!;
  const v = msg.view;
  const m = me(v);
  const [greedyFirst, setGreedyFirst] = useState<string | null>(null);
  const [greedyMode, setGreedyMode] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const tray: TrayState = { greedyFirst, setGreedyFirst, greedyMode, setGreedyMode, armed, setArmed };
  const [panel, setPanel] = useState<'none' | 'rules' | 'chat' | 'menu'>('none');
  const [reduced, setReduced] = useState(() => store.get('standoff.reducedMotion') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', reduced); }, [reduced]);

  useGameSounds(v);
  const remaining = useRemaining(msg.phaseEndsAt, v.phaseSeq);
  const feed = useFeed(v);

  if (v.phase === 'GAME_OVER') return <EndScreen v={v} />;

  // What can be tapped on the table right now?
  let seatAction: Parameters<typeof Table>[0]['seatAction'];
  let lootAction: Parameters<typeof Table>[0]['lootAction'];
  const others = (pred: (p: PublicPlayer) => boolean = () => true) =>
    v.players.filter(p => p.alive && p.id !== m?.id && pred(p)).map(p => p.id);

  if (m?.alive && v.me) {
    if (v.phase === 'HOLD_UP' && !(m.power === 'KID' && v.settings.powers)) {
      seatAction = {
        ids: others(),
        onPick: id => api.act({ type: 'AIM', target: v.me!.target === id ? null : id }),
        label: p => t('aimingAt', { name: p.name }),
      };
    } else if (v.phase === 'KID_AIM' && m.power === 'KID') {
      seatAction = { ids: others(), onPick: id => api.act({ type: 'KID_AIM', target: id }), label: p => t('aimingAt', { name: p.name }) };
    } else if (v.phase === 'BOSS_PRIVILEGE' && v.bossId === m.id) {
      seatAction = { ids: v.redirectCandidates, onPick: id => api.act({ type: 'BOSS_REDIRECT', target: id }), label: p => t('bossOrder', { name: p.name }) };
    } else if (v.phase === 'REDIRECT' && v.redirect?.player === m.id) {
      seatAction = { ids: v.retargetOptions, onPick: id => api.act({ type: 'RETARGET', target: id }), label: p => t('aimingAt', { name: p.name }) };
    } else if (v.phase === 'SPLIT' && v.currentPicker === m.id && !v.pending) {
      const ban = v.dictate?.on === m.id ? v.dictate.kind : null;
      lootAction = {
        ids: v.splitItems.filter(id => {
          if (!ban) return true;
          const c = id === 'NEW_BOSS' ? 'NEW_BOSS' : v.table.find(x => x.id === id)?.kind;
          return c !== ban;
        }),
        onPick: id => doPick(v, id, tray),
        selected: greedyFirst ? [greedyFirst] : [],
      };
    }
  }

  const countdown = (v.phase === 'HOLD_UP' || v.phase === 'COURAGE') ? Math.ceil(remaining / 1000) : null;
  const threat = m && v.phase === 'COURAGE' ? gunsOn(v, m.id).length : 0;

  return (
    <div className={`game phase-${v.phase.toLowerCase()}${threat ? ` threat-${Math.min(threat, 3)}` : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <span className="round-tag">{t('round', { n: v.round, total: v.rounds })}</span>
          <span className="phase-name">{t(`phase_${v.phase}` as Key)}</span>
        </div>
        <div className={`timer${remaining < 3000 ? ' is-low' : ''}`} aria-live="off">
          <span className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, remaining / 15000))})` }} />
          <span className="timer-num">{Math.max(0, Math.ceil(remaining / 1000))}</span>
        </div>
        <nav className="topbar-right">
          <button className="icon-btn" onClick={() => setPanel(panel === 'chat' ? 'none' : 'chat')} aria-label={t('chat')}>💬</button>
          <button className="icon-btn" onClick={() => setPanel(panel === 'rules' ? 'none' : 'rules')} aria-label={t('rules')}>?</button>
          <button className="icon-btn" onClick={() => setPanel(panel === 'menu' ? 'none' : 'menu')} aria-label="menu">≡</button>
        </nav>
      </header>

      <div className="stage">
        <Table v={v} seatAction={seatAction} lootAction={lootAction} highlight={v.redirect?.player ?? null} />
        {countdown !== null && countdown > 0 && countdown <= 3 && (
          <div key={`${v.phaseSeq}-${countdown}`} className="countdown" aria-live="assertive">{countdown}</div>
        )}
        <PhaseStamp v={v} />
        <ol className="feed" aria-live="polite">
          {feed.slice(-3).map(f => <li key={f.k}>{f.text}</li>)}
        </ol>
      </div>

      <Tray v={v} tray={tray} />

      <Coach v={v} />

      {panel === 'chat' && <Chat onClose={() => setPanel('none')} />}
      {panel === 'rules' && <Rules v={v} onClose={() => setPanel('none')} />}
      {panel === 'menu' && (
        <div className="sheet" role="dialog">
          <div className="sheet-body menu">
            <label className="setting toggle">
              <span className="setting-label">{t('sound')}</span>
              <input type="checkbox" defaultChecked={!sound.muted} onChange={e => sound.setMuted(!e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
            <label className="setting">
              <span className="setting-label">Volume</span>
              <input type="range" min={0} max={1} step={0.05} defaultValue={sound.volume} onChange={e => sound.setVolume(Number(e.target.value))} />
            </label>
            <label className="setting toggle">
              <span className="setting-label">{t('motion')}</span>
              <input type="checkbox" checked={reduced} onChange={e => { setReduced(e.target.checked); store.set('standoff.reducedMotion', e.target.checked ? '1' : '0'); }} />
              <span className="switch" aria-hidden="true" />
            </label>
            <button className="btn" onClick={() => setLang(getLang() === 'ar' ? 'en' : 'ar')}>{t('language')}</button>
            <button className="btn btn-ghost" onClick={() => api.leave()}>{t('leave')}</button>
            <button className="btn-link" onClick={() => setPanel('none')}>{t('close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Big "AIM!" / "DECIDE!" stamp right after a countdown locks. */
function PhaseStamp({ v }: { v: ClientView }) {
  const [stamp, setStamp] = useState<string | null>(null);
  const prev = useRef(v.phase);
  useEffect(() => {
    const p = prev.current;
    prev.current = v.phase;
    let s: string | null = null;
    if (p === 'HOLD_UP' && v.phase !== 'HOLD_UP') s = 'AIM!';
    if (s) {
      setStamp(s);
      const id = setTimeout(() => setStamp(null), 900);
      return () => clearTimeout(id);
    }
  }, [v.phase]);
  return stamp ? <div className="stamp">{stamp}</div> : null;
}

function useRemaining(endsAt: number, seq: number) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    let raf = 0;
    const loop = () => { setNow(serverNow()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [seq]);
  return Math.max(0, endsAt - now);
}

function useFeed(v: ClientView) {
  return useMemo(() => {
    const out: { k: number; text: string }[] = [];
    v.log.forEach((e, i) => {
      if ('round' in e && e.round !== v.round) return;
      const text = describe(e, v);
      if (!text) return;
      (Array.isArray(text) ? text : [text]).forEach((tx, j) => out.push({ k: i * 100 + j, text: tx }));
    });
    return out;
  }, [v.log.length, v.round, getLang()]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Sound cues driven by state changes. */
function useGameSounds(v: ClientView) {
  const last = useRef<{ seq: number; logLen: number; targetsOnMe: string[]; second: number }>({ seq: v.phaseSeq, logLen: v.log.length, targetsOnMe: [], second: -1 });
  const msg = useApp(s => s.game)!;

  // log-driven sounds
  useEffect(() => {
    const prev = last.current.logLen;
    const fresh: GameEvent[] = v.log.slice(prev);
    last.current.logLen = v.log.length;
    if (prev === 0) return;
    for (const e of fresh) {
      if (e.t === 'SHOWDOWN') {
        const bangs = e.reveals.filter(r => r.card === 'BANG').length;
        if (bangs) { sfx.bang(); if (bangs > 1) setTimeout(() => sfx.bang(), 140); }
        else if (e.reveals.length) sfx.click();
      }
      if (e.t === 'PICK' && e.playerId !== v.viewerId) sfx.cash();
      if (e.t === 'ROUND_START') sfx.swoosh();
      if (e.t === 'ELIMINATED') sfx.sting();
      if (e.t === 'COURAGE' && Object.values(e.stances).some(s => s === 'STAND')) setTimeout(() => sfx.banzai(), 60);
    }
  }, [v.log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // someone swings their gun onto me
  useEffect(() => {
    if (!v.viewerId) return;
    const on = gunsOn(v, v.viewerId).map(p => p.id);
    const newOnes = on.filter(id => !last.current.targetsOnMe.includes(id));
    if (newOnes.length && (v.phase === 'HOLD_UP' || v.phase === 'REDIRECT' || v.phase === 'KID_AIM')) sfx.swoosh();
    last.current.targetsOnMe = on;
  });

  // countdown ticks + heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      const left = msg.phaseEndsAt - serverNow();
      const sec = Math.ceil(left / 1000);
      const app = getApp().game?.view;
      if (!app) return;
      if ((app.phase === 'HOLD_UP' || app.phase === 'COURAGE') && sec !== last.current.second && sec > 0 && sec <= 3) {
        last.current.second = sec;
        sfx.tick();
      }
      if (app.phase === 'COURAGE' && app.viewerId) {
        const n = gunsOn(app, app.viewerId).length;
        if (n > 0) sfx.heartbeat(n);
      }
    }, 650);
    return () => clearInterval(id);
  }, [msg.phaseEndsAt]);
}

export { nameOf };
