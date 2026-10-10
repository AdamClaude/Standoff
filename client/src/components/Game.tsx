import { store } from '../storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientView, GameEvent, PublicPlayer } from '@standoff/engine';
import { api, getApp, serverNow, useApp } from '../net';
import { getLang, setLang, t, useLang, type Key } from '../i18n';
import { sfx, sound } from '../audio';
import { describe, gunsOn, me, nameOf } from '../game-utils';
import { Scene3D } from './Scene3D';
import type { LootCard } from '@standoff/engine';
import { itemLabel } from '../game-utils';
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
  const cut = useCutscene();
  const remaining = useRemaining(msg.phaseEndsAt, v.phaseSeq);
  const feed = useFeed(v);

  if (v.phase === 'GAME_OVER') return <EndScreen v={v} />;

  // What can be tapped on the table right now?
  let seatAction: { ids: string[]; onPick: (id: string) => void; label: (p: PublicPlayer) => string } | undefined;
  let lootAction: { ids: string[]; onPick: (id: string) => void; selected: string[] } | undefined;
  const others = (pred: (p: PublicPlayer) => boolean = () => true) =>
    v.players.filter(p => p.alive && p.id !== m?.id && pred(p)).map(p => p.id);

  if (m?.alive && v.me) {
    if (v.phase === 'LOAD' && remaining > 0 && !(m.power === 'KID' && v.settings.powers)) {
      seatAction = {
        ids: others(),
        onPick: id => { sfx.mark(); api.act({ type: 'AIM', target: v.me!.target === id ? null : id }); },
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

  const countdown = (v.phase === 'LOAD' || v.phase === 'COURAGE') ? Math.ceil(remaining / 1000) : null;
  const threat = m && v.phase === 'COURAGE' ? gunsOn(v, m.id).length : 0;

  return (
    <div className={`game phase-${v.phase.toLowerCase()}${threat ? ` threat-${Math.min(threat, 3)}` : ''}${cut ? ' in-cutscene' : ''}`}>
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
        <Scene3D
          v={v}
          phaseEndsAt={msg.phaseEndsAt}
          ui={{
            pickPlayers: seatAction?.ids ?? [],
            onPickPlayer: seatAction?.onPick,
            pickCards: !!(m?.alive && v.phase === 'LOAD' && remaining > 0),
            onPickCard: id => { sfx.cock(); api.act({ type: 'LOAD', cardId: id }); },
            pickLoot: lootAction?.ids ?? [],
            onPickLoot: lootAction?.onPick,
            selectedLoot: lootAction?.selected ?? [],
            reducedMotion: reduced,
            labels: { boss: t('boss'), out: t('dead'), you: t('you'), marked: t('marked'), whacked: t('whacked') },
            lootLabel: (c: LootCard | 'NEW_BOSS') => c === 'NEW_BOSS' ? t('newBossToken') : c.kind === 'CASH' || c.kind === 'DIAMOND' ? `$${c.value / 1000}k` : itemLabel(c),
          }}
        />
        {countdown !== null && countdown > 0 && countdown <= 3 && (
          <div key={`${v.phaseSeq}-${countdown}`} className="countdown" aria-live="assertive">{countdown}</div>
        )}
        <PhaseStamp v={v} />
        <ol className="feed" aria-live="polite">
          {feed.slice(-3).map(f => <li key={f.k}>{f.text}</li>)}
        </ol>
      </div>

      <Crew v={v} />
      <div className={`letterbox${v.phase === 'SHOWDOWN' ? ' is-on' : ''}`} aria-hidden="true"><i /><i /></div>
      <HitSplat />
      {cut ? <CutsceneOverlay cut={cut} rounds={v.rounds} /> : <StepBanner v={v} />}
      {v.phase === 'LOOT_REVEAL' && <p className="rotate-hint">{t('rotateHint')}</p>}
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
            <label className="setting toggle">
              <span className="setting-label">{t('musicLabel')}</span>
              <input type="checkbox" defaultChecked={sound.music} onChange={e => sound.setMusic(e.target.checked)} />
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

/** Blood running down your screen when you take a bullet. */
function HitSplat() {
  const [hits, setHits] = useState<number[]>([]);
  useEffect(() => {
    const on = () => {
      const id = Date.now();
      setHits(h => [...h, id]);
      setTimeout(() => setHits(h => h.filter(x => x !== id)), 2600);
    };
    window.addEventListener('standoff:hit-me', on);
    return () => window.removeEventListener('standoff:hit-me', on);
  }, []);
  if (!hits.length) return null;
  return (
    <div className="hit-splat" aria-hidden="true">
      {hits.map(h => (
        <svg key={h} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <g fill="#8a0b0b">
            <circle cx="120" cy="90" r="46" /><circle cx="300" cy="70" r="30" /><circle cx="230" cy="160" r="22" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <rect key={i} className="drip" x={70 + i * 38} y={60 + (i % 3) * 20} width={8 + (i % 3) * 4} height={70 + (i % 4) * 40} rx="6" style={{ animationDelay: `${i * 60}ms` }} />)}
            {[0, 1, 2, 3, 4, 5].map(i => <circle key={`d${i}`} cx={40 + i * 64} cy={30 + (i % 2) * 180} r={6 + (i % 3) * 5} />)}
          </g>
        </svg>
      ))}
    </div>
  );
}

/** Tracks the 3D cutscene so the HUD can step aside. */
function useCutscene() {
  const [cut, setCut] = useState<{ round: number; bank: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { active: boolean; round: number; bank: string };
      setCut(d.active ? { round: d.round, bank: d.bank } : null);
    };
    window.addEventListener('standoff:cutscene', on);
    return () => window.removeEventListener('standoff:cutscene', on);
  }, []);
  return cut;
}

function CutsceneOverlay({ cut, rounds }: { cut: { round: number; bank: string }; rounds: number }) {
  return (
    <button className="cutscene-overlay" onClick={() => window.dispatchEvent(new Event('standoff:skip-cutscene'))}>
      <span className="cut-bars" aria-hidden="true"><i /><i /></span>
      <span className="cut-title">
        <small>{t('heistWord')} {cut.round} {t('ofTotal', { total: rounds })}</small>
        <b>{cut.bank}</b>
      </span>
      <span className="cut-skip">{t('tapToSkip')}</span>
    </button>
  );
}

/** One short, direct instruction for the step you're in. */
function StepBanner({ v }: { v: ClientView }) {
  const m = me(v);
  const step = STEP_OF[v.phase];
  let text: Key = 'st_wait';
  let you = false;
  if (!m) text = 'st_watch';
  else if (!m.alive) text = 'st_out';
  else if (v.pending && v.pending.playerId === m.id) { text = 'st_discard'; you = true; }
  else switch (v.phase) {
    case 'LOOT_REVEAL': text = 'st_loot'; break;
    case 'LOAD': {
      const kid = m.power === 'KID' && v.settings.powers;
      const b = !!v.me?.loaded, tg = !!v.me?.target || kid;
      text = !b && !tg ? 'st_load_both' : !b ? 'st_load_bullet' : !tg ? 'st_load_target' : 'st_load_done';
      you = !(b && tg);
      break;
    }
    case 'KID_AIM': text = m.power === 'KID' ? 'st_kid' : 'st_wait_kid'; you = m.power === 'KID'; break;
    case 'CUNNING_SWAP': text = m.power === 'CUNNING' ? 'st_cunning' : 'st_wait'; you = m.power === 'CUNNING'; break;
    case 'BOSS_PRIVILEGE': text = v.bossId === m.id ? 'st_boss' : 'st_wait_boss'; you = v.bossId === m.id; break;
    case 'REDIRECT': text = v.redirect?.player === m.id ? 'st_redirect' : 'st_wait'; you = v.redirect?.player === m.id; break;
    case 'COURAGE': text = v.me?.stance ? 'st_courage_done' : 'st_courage'; you = !v.me?.stance; break;
    case 'SHOWDOWN': text = 'st_showdown'; break;
    case 'SPLIT': text = !m.inSplit ? 'st_split_out' : v.currentPicker === m.id ? 'st_split_you' : 'st_split_wait'; you = v.currentPicker === m.id && m.inSplit; break;
    case 'ROUND_END': text = 'st_round_end'; break;
  }
  return (
    <div className={`step-banner${you ? ' is-you' : ''}`} role="status" aria-live="polite">
      {step && <small>{t('stepOf', { n: step, total: 6 })}</small>}
      <b>{t(text)}</b>
    </div>
  );
}

const STEP_OF: Partial<Record<string, number>> = {
  LOOT_REVEAL: 1, LOAD: 2, KID_AIM: 2, CUNNING_SWAP: 2, BOSS_PRIVILEGE: 3, REDIRECT: 3, COURAGE: 4, SHOWDOWN: 5, SPLIT: 6,
};

/** Film-noir title card at the start of each heist. */
function TitleCard({ v }: { v: ClientView }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (v.phase !== 'LOOT_REVEAL') return;
    setShown(v.round);
    const id = setTimeout(() => setShown(null), 2200);
    return () => clearTimeout(id);
  }, [v.round, v.phase]);
  if (shown === null) return null;
  return (
    <div className="title-card" aria-hidden="true">
      <small>{t('heistWord')}</small>
      <b>{shown}</b>
      <small>{t('ofTotal', { total: v.rounds })}</small>
    </div>
  );
}

/** Compact roster for wide screens, where gangsters beside you sit outside the view. */
function Crew({ v }: { v: ClientView }) {
  const order = [...v.players].sort((a, b) => a.seat - b.seat);
  return (
    <ul className="crew" aria-label={t('seats')}>
      {order.map(p => (
        <li key={p.id} className={`${p.alive ? '' : 'is-out'}${p.id === v.viewerId ? ' is-me' : ''}${v.currentPicker === p.id ? ' is-picking' : ''}`}>
          <span className="crew-name">{p.id === v.bossId ? '♛ ' : ''}{p.name}</span>
          <span className="crew-hp">{Array.from({ length: p.woundLimit }, (_, i) => <i key={i} className={i < p.woundLimit - p.wounds ? 'ok' : ''} />)}</span>
          <span className="crew-shots" title={t('shotsFired', { n: p.shotsFired })}>{'▮'.repeat(p.shotsFired)}<em>{'▮'.repeat(Math.max(0, 3 - p.shotsFired))}</em></span>
          <span className="crew-loot">◆ {p.lootCount}</span>
        </li>
      ))}
    </ul>
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
    if (p === 'LOAD' && v.phase !== 'LOAD') s = 'DRAW!';
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
      if (e.t === 'PICK' && e.playerId !== v.viewerId) sfx.cash();
      if (e.t === 'ROUND_START') sfx.sting();
      if (e.t === 'COURAGE' && Object.values(e.stances).some(s => s === 'DUCK')) setTimeout(() => sfx.thud(), 60);
    }
  }, [v.log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // someone swings their gun onto me
  useEffect(() => {
    if (!v.viewerId) return;
    const on = gunsOn(v, v.viewerId).map(p => p.id);
    const newOnes = on.filter(id => !last.current.targetsOnMe.includes(id));
    if (newOnes.length && (v.phase === 'REDIRECT' || v.phase === 'KID_AIM')) sfx.swoosh();
    last.current.targetsOnMe = on;
  });

  // countdown ticks + heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      const left = msg.phaseEndsAt - serverNow();
      const sec = Math.ceil(left / 1000);
      const app = getApp().game?.view;
      if (!app) return;
      if ((app.phase === 'LOAD' || app.phase === 'COURAGE') && sec !== last.current.second && sec > 0 && sec <= 3) {
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
