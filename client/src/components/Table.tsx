// The arena: a warehouse standoff seen from above. Gangsters stand in a ring
// around the loot crate, pistols physically swinging toward their targets.
import { useEffect, useRef, useState } from 'react';
import type { ClientView, LootCard, PublicPlayer } from '@standoff/engine';
import { NEW_BOSS_TOKEN, POWER_TEXT } from '@standoff/engine';
import { useApp } from '../net';
import { t, powerName } from '../i18n';
import { itemLabel, paintingHint, seatOrder, seatPos } from '../game-utils';
import { Avatar } from './Avatar';

export interface TableProps {
  v: ClientView;
  seatAction?: { ids: string[]; onPick: (id: string) => void; label: (p: PublicPlayer) => string };
  lootAction?: { ids: string[]; onPick: (id: string) => void; selected?: string[] };
  highlight?: string | null;
}

const LIVE = new Set(['LOAD', 'HOLD_UP', 'KID_AIM', 'CUNNING_SWAP', 'BOSS_PRIVILEGE', 'REDIRECT', 'COURAGE']);
const REVEAL = new Set(['SHOWDOWN', 'SPLIT', 'ROUND_END']);

export function Table({ v, seatAction, lootAction, highlight }: TableProps) {
  const order = seatOrder(v);
  const pos = new Map(order.map((p, k) => [p.id, seatPos(k, order.length)]));
  const reactions = useApp(s => s.reactions);
  const [zoom, setZoom] = useState<LootCard | 'NEW_BOSS' | null>(null);
  const [powerInfo, setPowerInfo] = useState<string | null>(null);
  const revealPhase = REVEAL.has(v.phase);
  const live = LIVE.has(v.phase);
  const shake = useShake(v);
  const ar = useArenaRatio(); // width / height of the arena

  const aimAngle = (p: PublicPlayer): number | null => {
    if (!p.alive || !p.target || !(live || v.phase === 'SHOWDOWN')) return null;
    const a = pos.get(p.id), b = pos.get(p.target);
    if (!a || !b) return null;
    return (Math.atan2((b.y - a.y) / ar, b.x - a.x) * 180) / Math.PI;
  };

  // Laser sights / tracers
  const beams = v.players.flatMap(p => {
    const ang = aimAngle(p);
    if (ang === null) return [];
    const a = pos.get(p.id)!, b = pos.get(p.target!)!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const s = 8.5 / len, e = 4.5 / len; // in % of the ring
    const kind = revealPhase ? p.revealedCard : null;
    return [{
      id: p.id, target: p.target!, x1: a.x + dx * s, y1: a.y + dy * s, x2: b.x - dx * e, y2: b.y - dy * e,
      cls: `beam${kind === 'BANG' ? ' is-bang' : kind === 'CLICK' ? ' is-click' : ''}${revealPhase && !kind ? ' is-void' : ''}${p.target === v.viewerId ? ' at-me' : ''}${v.phase === 'REDIRECT' && v.redirect?.player === p.id ? ' is-ordered' : ''}`,
    }];
  });
  const dots = live ? [...new Set(beams.map(b => b.target))] : [];

  const items: (LootCard | 'NEW_BOSS')[] = [...v.table, ...(v.tokenAvailable ? ['NEW_BOSS' as const] : [])];

  return (
    <div className="arena-wrap" style={{ aspectRatio: String(ar) }}>
      <div className={`arena${shake ? ' is-shaking' : ''}`} role="group" aria-label="standoff">
        <div className="floor" aria-hidden="true">
          <span className="crate c1" /><span className="crate c2" /><span className="crate c3" />
          <span className="lightcone" />
        </div>

        <svg className="beams" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {beams.map(l => (
            <g key={l.id}>
              <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`${l.cls} glow`} vectorEffect="non-scaling-stroke" />
              <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.cls} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>

        {/* reticles on whoever is being aimed at */}
        {dots.map(id => {
          const p = pos.get(id)!;
          const n = beams.filter(b => b.target === id).length;
          return <span key={id} className={`reticle${id === v.viewerId ? ' on-me' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} data-n={n > 1 ? `×${n}` : ''} aria-hidden="true" />;
        })}

        <div className={`stash${lootAction ? ' is-grabbing' : ''}`}>
          <span className="stash-crate" aria-hidden="true" />
          <div className="stash-items">
            {items.map((c, i) => {
              const id = c === 'NEW_BOSS' ? NEW_BOSS_TOKEN : c.id;
              const can = lootAction?.ids.includes(id);
              const sel = lootAction?.selected?.includes(id);
              return (
                <button
                  key={id}
                  className={`item ${c === 'NEW_BOSS' ? 'item-boss' : `item-${c.kind.toLowerCase()}`}${can ? ' can-grab' : ''}${sel ? ' is-selected' : ''}`}
                  style={{ animationDelay: `${i * 60}ms`, rotate: `${((i * 37) % 17) - 8}deg` }}
                  onClick={() => (can ? lootAction!.onPick(id) : setZoom(c))}
                  aria-label={itemLabel(c)}
                >
                  <ItemArt c={c} />
                  <span className="item-tag">{c === 'NEW_BOSS' ? t('newBossToken') : c.kind === 'CASH' || c.kind === 'DIAMOND' ? `$${c.value / 1000}k` : itemLabel(c)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {order.map(p => {
          const { x, y } = pos.get(p.id)!;
          const tappable = seatAction?.ids.includes(p.id);
          const isMe = p.id === v.viewerId;
          const down = (p.stance === 'DUCK' && revealPhase) || p.hitThisRound > 0;
          const ang = aimAngle(p);
          const fired = revealPhase && p.revealedCard === 'BANG' && v.phase === 'SHOWDOWN';
          return (
            <div
              key={p.id}
              className={`fighter${isMe ? ' is-me' : ''}${!p.alive ? ' is-dead' : ''}${p.id === v.bossId ? ' is-boss' : ''}${tappable ? ' is-tappable' : ''}${highlight === p.id ? ' is-highlight' : ''}${v.phase === 'SPLIT' && v.currentPicker === p.id ? ' is-picking' : ''}${p.hitThisRound > 0 && revealPhase ? ' is-hit' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className="hp" aria-label={`${t('wounds')} ${p.wounds}/${p.woundLimit}`}>
                {Array.from({ length: p.woundLimit }, (_, i) => <i key={i} className={i < p.woundLimit - p.wounds ? 'full' : ''} />)}
              </div>
              <button
                className="fighter-btn" disabled={!tappable}
                onClick={() => tappable && seatAction!.onPick(p.id)}
                aria-label={tappable ? seatAction!.label(p) : p.name}
              >
                <span className="fighter-body">
                  <span className="spot" aria-hidden="true" />
                  {p.alive && (
                    <span
                      className={`pistol${ang === null ? ' is-lowered' : ''}${fired ? ' is-firing' : ''}`}
                      style={{ '--ang': `${ang ?? 100}deg`, '--flip': ang !== null && Math.abs(ang) > 90 ? -1 : 1 } as React.CSSProperties}
                      aria-hidden="true"
                    >
                      <Pistol />
                    </span>
                  )}
                  <Avatar id={p.avatar} size={58} down={down} dead={!p.alive} wounds={p.wounds} />
                  {p.hasLoaded && p.alive && !revealPhase && <span className="chambered" title="loaded" aria-hidden="true" />}
                  {v.phase === 'SHOWDOWN' && p.revealedCard && <span className={`fx-word is-${p.revealedCard.toLowerCase()}`}>{p.revealedCard === 'BANG' ? 'BANG!' : 'click'}</span>}
                  {revealPhase && p.stance === 'DUCK' && <span className="fx-duck">{t('ducked')}</span>}
                  {p.id === v.bossId && <span className="crown" title={t('boss')} aria-label={t('boss')}><Crown /></span>}
                </span>
                <span className="nameplate">{p.name}{isMe ? ` · ${t('you')}` : ''}</span>
                <span className="fighter-hud">
                  <span className="casings" title={t('shotsFired', { n: p.shotsFired })}>
                    {Array.from({ length: 3 }, (_, i) => <i key={i} className={i < p.shotsFired ? 'spent' : ''} />)}
                  </span>
                  <span className="bag" title={t('loot', { n: p.lootCount })}>{p.lootCount}</span>
                </span>
                {!p.alive && <span className="ko">{t('dead')}</span>}
              </button>
              {p.power && (
                <button className="perk" onClick={() => setPowerInfo(powerInfo === p.id ? null : p.id)} aria-expanded={powerInfo === p.id}>
                  {powerName(p.power)}
                </button>
              )}
              {powerInfo === p.id && p.power && <div className="perk-pop" role="note">{POWER_TEXT[p.power]}</div>}
              {reactions.filter(r => r.playerId === p.id).map(r => <span key={r.id} className="reaction">{r.emoji}</span>)}
            </div>
          );
        })}
      </div>

      {zoom && (
        <div className="zoom" role="dialog" onClick={() => setZoom(null)}>
          <div className="zoom-card">
            <ItemArt c={zoom} big />
            <b>{itemLabel(zoom)}</b>
            {zoom !== 'NEW_BOSS' && zoom.kind === 'PAINTING' && <p>{paintingHint(v)}</p>}
            {zoom === 'NEW_BOSS' && <p>{t('newBossDesc')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Portrait phones get a taller arena so the ring uses the screen. */
function useArenaRatio() {
  const calc = () => (window.innerWidth < 640 && window.innerHeight > window.innerWidth * 1.55 ? 0.78 : 1);
  const [ar, setAr] = useState(calc);
  useEffect(() => {
    const f = () => setAr(calc());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return ar;
}

/** Shake the arena whenever BANGs land. */
function useShake(v: ClientView) {
  const [on, setOn] = useState(false);
  const seen = useRef(v.log.length);
  useEffect(() => {
    const fresh = v.log.slice(seen.current);
    seen.current = v.log.length;
    if (fresh.some(e => e.t === 'SHOWDOWN' && e.reveals.some(r => r.card === 'BANG'))) {
      setOn(true);
      const id = setTimeout(() => setOn(false), 500);
      return () => clearTimeout(id);
    }
  }, [v.log.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return on;
}

const Pistol = () => (
  <svg viewBox="0 0 60 24" width="44" height="18">
    <path d="M4 6h40l4-2h8v7H24l-3 3h-6l-3 9H4l3-10z" fill="#2b2731" stroke="#0d0b10" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M22 11h-4l-2 5" stroke="#0d0b10" strokeWidth="1.5" fill="none" />
    <rect x="10" y="7" width="22" height="2" fill="#4a4452" />
    <circle className="muzzle" cx="58" cy="7.5" r="7" />
  </svg>
);

/** The Boss cigar (the Boss is whoever holds it). */
export const Crown = () => (
  <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true"><rect x="2" y="2.5" width="20" height="5" rx="2.5" fill="#6b3a1c" stroke="#0d0b10" strokeWidth="1" /><rect x="6" y="2.5" width="3" height="5" fill="#e2b23a" /><rect x="20" y="2.5" width="3" height="5" fill="#8d8a86" /><circle cx="23.5" cy="5" r="1.6" fill="#ff5a1a" /></svg>
);

export function ItemArt({ c, big }: { c: LootCard | 'NEW_BOSS'; big?: boolean }) {
  const s = big ? 120 : 40;
  if (c === 'NEW_BOSS') return <svg viewBox="0 0 40 40" width={s} height={s}><circle cx="20" cy="20" r="17" fill="#3a2a22" stroke="#0d0b10" strokeWidth="2" /><g transform="rotate(-25 20 20)"><rect x="7" y="17" width="24" height="7" rx="3.5" fill="#6b3a1c" stroke="#0d0b10" strokeWidth="1.2" /><rect x="11" y="17" width="4" height="7" fill="#e2b23a" /><rect x="29" y="17" width="3" height="7" fill="#8d8a86" /><circle cx="32.5" cy="20.5" r="2" fill="#ff5a1a" /></g></svg>;
  switch (c.kind) {
    case 'CASH': {
      const stacks = c.value === 20000 ? 3 : c.value === 10000 ? 2 : 1;
      return (
        <svg viewBox="0 0 40 40" width={s} height={s}>
          {Array.from({ length: stacks }, (_, i) => (
            <g key={i} transform={`translate(${i * 3} ${-i * 6})`}>
              <rect x="5" y="22" width="28" height="12" rx="1.5" fill="#7fae6b" stroke="#0d0b10" strokeWidth="1.5" />
              <rect x="16" y="22" width="6" height="12" fill="#e7d8b0" stroke="#0d0b10" strokeWidth="1" />
            </g>
          ))}
        </svg>
      );
    }
    case 'DIAMOND': {
      const k = c.value >= 10000 ? 1.25 : c.value >= 5000 ? 1.08 : 0.9;
      return <svg viewBox="0 0 40 40" width={s} height={s}><g transform={`translate(20 22) scale(${k}) translate(-20 -22)`}><path d="M11 12h18l6 8-15 15L5 20z" fill="#a8ecf7" stroke="#0d0b10" strokeWidth="1.8" /><path d="M5 20h30M15 12l5 23 5-23" stroke="#0d0b10" strokeWidth="1" fill="none" /><path d="M13 14l-3 5" stroke="#fff" strokeWidth="1.5" /></g></svg>;
    }
    case 'PAINTING':
      return <svg viewBox="0 0 40 40" width={s} height={s}><rect x="4" y="7" width="32" height="26" fill="#e2b23a" stroke="#0d0b10" strokeWidth="2" /><rect x="8" y="11" width="24" height="18" fill="#2f5d62" /><path d="M8 29l8-9 5 5 3-3 8 7z" fill="#c9d8a2" /><circle cx="25" cy="16" r="2.5" fill="#f3e6c4" /></svg>;
    case 'CLIP':
      return <svg viewBox="0 0 40 40" width={s} height={s}><path d="M14 5h12l2 30H12z" fill="#5a5560" stroke="#0d0b10" strokeWidth="2" /><path d="M16 9h8" stroke="#c78b2a" strokeWidth="3" /><path d="M16 9 q4 -5 8 0" fill="#d9372b" /></svg>;
    case 'FIRST_AID':
      return <svg viewBox="0 0 40 40" width={s} height={s}><rect x="5" y="11" width="30" height="22" rx="3" fill="#f4efe6" stroke="#0d0b10" strokeWidth="2" /><path d="M15 11V7h10v4" stroke="#0d0b10" strokeWidth="2" fill="none" /><path d="M20 15v14M13 22h14" stroke="#d9372b" strokeWidth="4" /></svg>;
  }
}
