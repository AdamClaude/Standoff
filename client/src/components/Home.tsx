import { useState } from 'react';
import { CHARACTERS } from '@standoff/shared';
import { api, OFFLINE, profile } from '../net';
import { getLang, t, useLang } from '../i18n';
import { sound } from '../audio';
import { Avatar } from './Avatar';

export function Home() {
  useLang();
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState((params.get('room') ?? '').toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = () => {
    sound.unlock();
    if (!name.trim()) { setError(t('nameNeeded')); return false; }
    profile.name = name.trim();
    profile.avatar = avatar;
    setError(null);
    return true;
  };

  const create = async (tutorial = false) => {
    if (!ready()) return;
    setBusy(true);
    await api.create(name.trim(), avatar, tutorial);
    setBusy(false);
  };
  const join = async (spectate = false) => {
    if (!ready()) return;
    setBusy(true);
    const r = await api.join(code.trim(), name.trim(), avatar, spectate);
    setBusy(false);
    if (!r.ok) setError(t('noRoom'));
  };
  const c = CHARACTERS.find(x => x.id === avatar)!;

  return (
    <main className="home">
      <header className="home-hero">
        <div className="lamp" aria-hidden="true" />
        <h1 className="wordmark">{t('title')}</h1>
        <p className="tagline">{t('tagline')}</p>
      </header>

      <section className="home-card">
        <label className="field">
          <span>{t('yourName')}</span>
          <input value={name} maxLength={20} onChange={e => setName(e.target.value)} autoComplete="nickname" />
        </label>

        <fieldset className="char-picker">
          <legend>{t('pickCharacter')}</legend>
          <div className="char-row">
            {CHARACTERS.map(ch => (
              <button
                key={ch.id} type="button"
                className={`char${ch.id === avatar ? ' is-picked' : ''}`}
                aria-pressed={ch.id === avatar}
                aria-label={ch.name}
                onClick={() => setAvatar(ch.id)}
              >
                <Avatar id={ch.id} size={56} />
              </button>
            ))}
          </div>
          <p className="char-caption"><strong>{getLang() === 'ar' ? c.nameAr : c.name}</strong> — {c.tagline}</p>
        </fieldset>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="home-actions">
          {OFFLINE && <p className="muted small">{t('practiceNote')}</p>}
          <button className="btn btn-primary" disabled={busy} onClick={() => create(false)}>{OFFLINE ? t('startPractice') : t('createRoom')}</button>
          {!OFFLINE && <div className="join-row">
            <input
              aria-label={t('roomCode')} placeholder={t('roomCode')} value={code} maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              className="code-input"
            />
            <button className="btn" disabled={busy || code.length !== 6} onClick={() => join(false)}>{t('joinRoom')}</button>
          </div>}
          {!OFFLINE && code.length === 6 && <button className="btn-link" onClick={() => join(true)}>{t('watch')}</button>}
          <button className="btn btn-ghost" disabled={busy} onClick={() => create(true)}>
            {t('tutorial')}
            <small>{t('tutorialHint')}</small>
          </button>
        </div>
      </section>
    </main>
  );
}
