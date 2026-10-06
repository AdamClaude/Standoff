import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { RoomSettings } from '@standoff/shared';
import { api, OFFLINE, useApp } from '../net';
import { t, useLang, type Key } from '../i18n';
import { Avatar } from './Avatar';

export function Lobby() {
  useLang();
  const lobby = useApp(s => s.lobby);
  const session = useApp(s => s.session);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const link = lobby ? `${location.origin}/?room=${lobby.code}` : '';

  useEffect(() => {
    if (link && !OFFLINE) QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#16131a', light: '#f3e6c4' } }).then(setQr);
  }, [link]);

  if (!lobby) return <main className="lobby"><p className="muted">…</p></main>;
  const isHost = session?.playerId === lobby.hostId;
  const s = lobby.settings;
  const set = (p: Partial<RoomSettings>) => api.settings(p);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const start = async () => {
    const r = await api.start();
    setErr(r.ok ? null : t('needThree'));
  };

  return (
    <main className="lobby">
      <header className="lobby-head">
        <h1 className="lobby-code">{t('lobbyTitle', { code: lobby.code })}</h1>
        <button className="btn-link" onClick={() => api.leave()}>{t('leave')}</button>
      </header>

      {OFFLINE ? <p className="muted">{t('practiceNote')}</p> : <section className="invite">
        {qr && <img src={qr} alt="" width={132} height={132} className="qr" />}
        <div>
          <p>{t('invite')}</p>
          <p className="big-code" aria-label={t('roomCode')}>{lobby.code}</p>
          <button className="btn btn-small" onClick={copy}>{copied ? t('copied') : t('copyLink')}</button>
        </div>
      </section>}

      <section className="seats">
        <h2>{t('seats')} <span className="muted">{lobby.seats.length}/{s.maxPlayers}</span></h2>
        <ul>
          {lobby.seats.map(seat => (
            <li key={seat.playerId} className={seat.connected ? '' : 'is-away'}>
              <Avatar id={seat.avatar} size={44} />
              <span className="seat-name">{seat.name}{seat.playerId === session?.playerId ? ` (${t('you')})` : ''}</span>
              <span className="seat-tags">
                {seat.isHost && <em>{t('host')}</em>}
                {seat.isBot && <em>{t('bot')}</em>}
                {!seat.connected && <em>{t('away')}</em>}
              </span>
              {isHost && !seat.isHost && <button className="btn-link" onClick={() => api.removeSeat(seat.playerId)}>{t('remove')}</button>}
            </li>
          ))}
        </ul>
        {isHost && lobby.seats.length < s.maxPlayers && <button className="btn btn-small" onClick={() => api.addBot()}>{t('addBot')}</button>}
      </section>

      <section className="house-rules">
        <h2>{t('settings')}</h2>
        <Setting label="timers" disabled={!isHost} value={s.timers} options={['FAST', 'NORMAL', 'CHILL']} onChange={v => set({ timers: v as RoomSettings['timers'] })} />
        <Setting label="maxPlayers" disabled={!isHost} value={String(s.maxPlayers)} options={['3', '4', '5', '6', '7', '8']} raw onChange={v => set({ maxPlayers: Number(v) })} />
        <Setting label="botLevel" disabled={!isHost} value={s.botLevel} options={['EASY', 'NORMAL', 'SHARK']} onChange={v => set({ botLevel: v as RoomSettings['botLevel'] })} />
        <Setting label="noStandRule" disabled={!isHost} value={s.noStandRule} options={['ROLLOVER', 'DISCARD']} onChange={v => set({ noStandRule: v as RoomSettings['noStandRule'] })} />
        <Toggle label="powers" disabled={!isHost} value={s.powers} onChange={v => set({ powers: v })} />
        <Toggle label="openVaults" disabled={!isHost} value={s.openVaults} onChange={v => set({ openVaults: v })} />
        <Toggle label="botTakeover" disabled={!isHost} value={s.botTakeover} onChange={v => set({ botTakeover: v })} />
      </section>

      <footer className="lobby-foot">
        {err && <p className="form-error" role="alert">{err}</p>}
        {isHost
          ? <button className="btn btn-primary btn-wide" onClick={start} disabled={lobby.seats.length < 3}>{t('start')}</button>
          : <p className="muted">{session?.spectator ? t('spectating') : t('waitingHost')}</p>}
        {isHost && lobby.seats.length < 3 && <p className="muted small">{t('needThree')}</p>}
      </footer>
    </main>
  );
}

function Setting({ label, value, options, onChange, disabled, raw }: {
  label: Key; value: string; options: string[]; onChange: (v: string) => void; disabled: boolean; raw?: boolean;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{t(label)}</span>
      <div className="segmented" role="radiogroup" aria-label={t(label)}>
        {options.map(o => (
          <button key={o} role="radio" aria-checked={o === value} disabled={disabled} className={o === value ? 'is-on' : ''} onClick={() => onChange(o)}>
            {raw ? o : t(o as Key)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: Key; value: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <label className="setting toggle">
      <span className="setting-label">{t(label)}</span>
      <input type="checkbox" checked={value} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
