import { useEffect, useState } from 'react';
import type { BulletCard, ClientView, LootKind } from '@standoff/engine';
import { NEW_BOSS_TOKEN } from '@standoff/engine';
import { api } from '../net';
import { t } from '../i18n';
import { sfx } from '../audio';
import { gunsOn, itemLabel, lootById, me, nameOf } from '../game-utils';

export interface TrayState {
  greedyFirst: string | null;
  setGreedyFirst: (id: string | null) => void;
  greedyMode: boolean;
  setGreedyMode: (b: boolean) => void;
  armed: string | null;            // item tapped once after a 'this would be wasted' warning
  setArmed: (id: string | null) => void;
}

export function Tray({ v, tray }: { v: ClientView; tray: TrayState }) {
  const m = me(v);
  const hand = v.me?.hand ?? [];
  if (!m || !v.me) return <div className="tray"><p className="tray-msg">{t('spectating')}</p></div>;
  if (!m.alive) return <div className="tray"><p className="tray-msg">{t('you_are_out')}</p></div>;

  // Pending choices (Clip / Smart / Good Friend) take over the tray for that player.
  if (v.pending && v.pending.playerId === m.id) {
    return (
      <div className="tray">
        <p className="tray-msg">{v.pending.kind === 'SMART_DISCARD' ? t('smartPrompt') : t('clipPrompt')}</p>
        <Hand cards={hand} onPick={c => api.act({ type: 'CHOOSE_DISCARD', cardId: c.id })} />
      </div>
    );
  }

  switch (v.phase) {
    case 'LOOT_REVEAL':
      return <div className="tray"><p className="tray-msg">{t('lootReveal', { n: v.round })}</p><HandSummary hand={hand} /></div>;

    case 'LOAD':
      if (v.me.loaded) return (
        <div className="tray">
          <p className="tray-msg">{t('loaded')}</p>
          <div className="hand"><Bullet card={v.me.loaded} chosen /></div>
        </div>
      );
      return (
        <div className="tray">
          <p className="tray-msg">{t('loadPrompt')}</p>
          <Hand cards={hand} onPick={c => { sfx.cock(); api.act({ type: 'LOAD', cardId: c.id }); }} />
        </div>
      );

    case 'HOLD_UP': {
      if (m.power === 'KID' && v.settings.powers) return <div className="tray"><p className="tray-msg">{t('kidWait')}</p></div>;
      return (
        <div className="tray">
          <p className="tray-msg">{v.me.target ? t('aimingAt', { name: nameOf(v, v.me.target) }) : t('aimPrompt')}</p>
          <LoadedChip card={v.me.loaded} />
        </div>
      );
    }

    case 'KID_AIM':
      return <div className="tray"><p className="tray-msg">{m.power === 'KID' ? t('kidPrompt') : t('kidOther')}</p></div>;

    case 'CUNNING_SWAP':
      if (m.power !== 'CUNNING') return <div className="tray"><p className="tray-msg">{t('cunningOther')}</p></div>;
      return (
        <div className="tray">
          <p className="tray-msg">{t('cunningPrompt')}</p>
          <div className="hand">
            {v.me.loaded && <Bullet card={v.me.loaded} chosen />}
            <button className="btn btn-small" onClick={() => api.act({ type: 'CUNNING_SWAP', cardId: null })}>{t('keep')}</button>
          </div>
          <Hand cards={hand} onPick={c => api.act({ type: 'CUNNING_SWAP', cardId: c.id })} label={t('swapFor')} />
        </div>
      );

    case 'BOSS_PRIVILEGE':
      if (v.bossId !== m.id) return <div className="tray"><p className="tray-msg">{t('bossOther')}</p></div>;
      return (
        <div className="tray">
          <p className="tray-msg">{t('bossPrompt')}</p>
          <button className="btn" onClick={() => api.act({ type: 'BOSS_PASS' })}>{t('bossPass')}</button>
        </div>
      );

    case 'REDIRECT':
      return (
        <div className="tray">
          <p className="tray-msg">{v.redirect?.player === m.id ? t('redirectPrompt') : t('redirectOther', { name: nameOf(v, v.redirect?.player) })}</p>
        </div>
      );

    case 'COURAGE':
      return <Courage v={v} />;

    case 'SHOWDOWN':
      return <div className="tray"><p className="tray-msg">{t('showdownPrompt')}</p><HandSummary hand={hand} /></div>;

    case 'SPLIT':
      return <SplitTray v={v} tray={tray} />;

    case 'ROUND_END':
      return <div className="tray"><p className="tray-msg">{t('roundEnd')}</p><HandSummary hand={hand} /></div>;
  }
  return <div className="tray" />;
}

function Courage({ v }: { v: ClientView }) {
  const m = me(v)!;
  const guns = gunsOn(v, m.id);
  const [chosen, setChosen] = useState<'STAND' | 'DUCK' | null>(v.me?.stance ?? null);
  useEffect(() => setChosen(v.me?.stance ?? null), [v.round, v.me?.stance]);
  const choose = (s: 'STAND' | 'DUCK') => {
    setChosen(s);
    if (s === 'STAND') sfx.banzai(); else sfx.thud();
    api.act({ type: 'DECIDE', stance: s });
  };
  return (
    <div className="tray courage">
      <p className={`threat threat-${Math.min(guns.length, 3)}`} role="status">
        <strong>{guns.length === 0 ? t('noGuns') : guns.length === 1 ? t('oneGunOnYou') : t('gunsOnYou', { n: guns.length })}</strong>
        {guns.length > 0 && <span>{guns.map(g => g.name).join(', ')}</span>}
      </p>
      <div className="courage-btns">
        <button className={`btn btn-stand${chosen === 'STAND' ? ' is-on' : ''}`} onClick={() => choose('STAND')} aria-pressed={chosen === 'STAND'}>
          {t('stand')}<small>{t('battleCry')}</small>
        </button>
        <button className={`btn btn-duck${chosen === 'DUCK' ? ' is-on' : ''}`} onClick={() => choose('DUCK')} aria-pressed={chosen === 'DUCK'}>
          {t('duck')}
        </button>
      </div>
      <LoadedChip card={v.me?.loaded ?? null} />
    </div>
  );
}

function SplitTray({ v, tray }: { v: ClientView; tray: TrayState }) {
  const m = me(v)!;
  const myTurn = v.currentPicker === m.id && !v.pending;
  const kinds: (LootKind | 'NEW_BOSS')[] = ['CASH', 'DIAMOND', 'PAINTING', 'CLIP', 'FIRST_AID', 'NEW_BOSS'];
  const canDictate = v.settings.powers && m.power === 'DICTATOR' && m.inSplit && !m.powerUsedThisSplit
    && !!v.currentPicker && v.currentPicker !== m.id && !v.dictate && !v.pending;
  const canJunk = v.settings.powers && m.power === 'JUNK_DEALER' && m.inSplit && !m.powerUsedThisSplit && !v.pending;
  const [junkFrom, setJunkFrom] = useState<string | null>(null);
  const myPicks = (m.loot ?? []).filter(c => v.me?.splitPicks.includes(c.id));
  const canGreedy = v.settings.powers && m.power === 'GREEDY' && m.picksThisSplit === 0 && myTurn && v.splitItems.length > 1;

  const ban = v.dictate?.on === m.id ? v.dictate.kind : null;

  return (
    <div className="tray">
      {!m.inSplit && <p className="tray-msg">{t('splitOut')}</p>}
      {m.inSplit && (
        <p className="tray-msg">
          {myTurn ? t('splitYourTurn') : t('splitWaiting', { name: nameOf(v, v.currentPicker) })}
        </p>
      )}
      {v.dictate && <p className="tray-note">{t('dictated', { by: nameOf(v, v.dictate.by), name: nameOf(v, v.dictate.on), kind: t(`kind_${v.dictate.kind}`) })}</p>}
      {myTurn && ban && <p className="tray-note">⛔ {t(`kind_${ban}`)}</p>}
      {canGreedy && (
        <label className="greedy-toggle">
          <input type="checkbox" checked={tray.greedyMode} onChange={e => { tray.setGreedyMode(e.target.checked); tray.setGreedyFirst(null); }} />
          {t('greedy')} <small>{t('greedyHint')}</small>
        </label>
      )}
      {canDictate && (
        <div className="power-row">
          <span>{t('dictate', { name: nameOf(v, v.currentPicker) })}</span>
          <div className="chips">
            {kinds.map(k => <button key={k} className="chip" onClick={() => api.act({ type: 'DICTATE', kind: k })}>{t(`kind_${k}`)}</button>)}
          </div>
        </div>
      )}
      {canJunk && myPicks.length > 0 && (
        <div className="power-row">
          <span>{t('junkSwap')}</span>
          <div className="chips">
            {myPicks.map(c => <button key={c.id} className={`chip${junkFrom === c.id ? ' is-on' : ''}`} onClick={() => setJunkFrom(c.id)}>{itemLabel(c)}</button>)}
          </div>
          {junkFrom && (
            <div className="chips">
              {v.players.filter(p => p.alive && p.id !== m.id && p.lootCount > 0).map(p => (
                <button key={p.id} className="chip" onClick={() => { api.act({ type: 'JUNK_SWAP', lootId: junkFrom, victimId: p.id }); setJunkFrom(null); }}>
                  {t('junkWith', { name: p.name })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <HandSummary hand={v.me?.hand ?? []} />
    </div>
  );
}

/** Picks a loot item; returns a warning string if the pick would be wasted. */
export function pickWarning(v: ClientView, id: string): string | null {
  const m = me(v);
  const c = lootById(v, id);
  if (!m || !c || c === 'NEW_BOSS') return null;
  if (c.kind === 'FIRST_AID' && m.wounds === 0) return t('firstAidWarn');
  if (c.kind === 'CLIP' && v.discardSummary.faceUpBang === 0 && v.discardSummary.faceDown === 0) return t('clipWarn');
  return null;
}

export function doPick(v: ClientView, id: string, tray: TrayState) {
  if (tray.greedyMode) {
    if (!tray.greedyFirst) { tray.setGreedyFirst(id); return; }
    if (tray.greedyFirst === id) { tray.setGreedyFirst(null); return; }
    api.act({ type: 'PICK', itemId: tray.greedyFirst, secondItemId: id });
    tray.setGreedyFirst(null); tray.setGreedyMode(false);
    sfx.cash();
    return;
  }
  const warn = pickWarning(v, id);
  if (warn && tray.armed !== id) { tray.setArmed(id); api.toast(warn + ' ' + t('tapAgain')); return; }
  tray.setArmed(null);
  sfx.cash();
  api.act({ type: 'PICK', itemId: id });
}

export { NEW_BOSS_TOKEN };

function Hand({ cards, onPick, label }: { cards: BulletCard[]; onPick: (c: BulletCard) => void; label?: string }) {
  // Show BANGs first, then CLICKs; one button per card.
  const sorted = [...cards].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'BANG' ? -1 : 1));
  return (
    <div className="hand">
      {sorted.map(c => <Bullet key={c.id} card={c} onClick={() => onPick(c)} label={label} />)}
    </div>
  );
}

/** A cartridge: BANG = live round with a copper slug, CLICK = crimped blank. */
function Bullet({ card, onClick, chosen, label }: { card: BulletCard; onClick?: () => void; chosen?: boolean; label?: string }) {
  const Tag = onClick ? 'button' : 'span';
  const live = card.kind === 'BANG';
  return (
    <Tag className={`round is-${card.kind.toLowerCase()}${chosen ? ' is-chosen' : ''}`} onClick={onClick} aria-label={label ? `${label}: ${card.kind}` : card.kind}>
      <svg viewBox="0 0 20 56" width="22" height="60" aria-hidden="true">
        {live
          ? <path d="M4 18 Q4 4 10 2 Q16 4 16 18 Z" fill="#c8693a" stroke="#0d0b10" strokeWidth="1.5" />
          : <path d="M4 18 L7 9 L10 12 L13 9 L16 18 Z" fill="#c9a14a" stroke="#0d0b10" strokeWidth="1.5" />}
        <rect x="4" y="18" width="12" height="32" fill="#d8b04e" stroke="#0d0b10" strokeWidth="1.5" />
        <rect x="3" y="50" width="14" height="4" fill="#b88c32" stroke="#0d0b10" strokeWidth="1.5" />
        <rect x="6" y="20" width="2" height="26" fill="#f3dc94" />
      </svg>
      <span className="round-word">{card.kind}</span>
    </Tag>
  );
}

function LoadedChip({ card }: { card: BulletCard | null }) {
  if (!card) return null;
  return <p className={`loaded-chip is-${card.kind.toLowerCase()}`}>⦿ {card.kind}</p>;
}

function HandSummary({ hand }: { hand: BulletCard[] }) {
  const b = hand.filter(c => c.kind === 'BANG').length;
  return <p className="hand-summary">{t('bangsLeft', { b, c: hand.length - b })}</p>;
}
