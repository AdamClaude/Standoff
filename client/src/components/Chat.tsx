import { useEffect, useRef, useState } from 'react';
import { REACTIONS, TAUNTS, type TauntKey } from '@standoff/shared';
import { api, useApp } from '../net';
import { t, type Key } from '../i18n';

/** System lines arrive as "@key" so each client can show them in its own language. */
export const chatText = (text: string) => (text.startsWith('@') ? t(`sys_${text.slice(1)}` as Key) : text);

export function Chat({ onClose }: { onClose: () => void }) {
  const chat = useApp(s => s.chat);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [chat.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    api.chat(text);
    setText('');
  };

  return (
    <aside className="sheet chat" role="dialog" aria-label={t('chat')}>
      <div className="sheet-body">
        <header className="sheet-head">
          <h2>{t('chat')}</h2>
          <button className="btn-link" onClick={onClose}>{t('close')}</button>
        </header>
        <ol className="chat-list" ref={list}>
          {chat.map(m => (
            <li key={m.id} className={m.from ? '' : 'is-system'}>
              {m.from && <b>{m.name}</b>}
              <span className={m.taunt ? 'taunt-text' : ''}>{m.taunt ? t(`taunt_${m.taunt}` as Key) : chatText(m.text)}</span>
            </li>
          ))}
        </ol>
        <div className="taunts">
          {TAUNTS.map(k => <button key={k} className="chip" onClick={() => api.taunt(k as TauntKey)}>{t(`taunt_${k}` as Key)}</button>)}
        </div>
        <div className="reactions-row">
          {REACTIONS.map(e => <button key={e} className="emoji-btn" onClick={() => api.react(e)} aria-label={e}>{e}</button>)}
        </div>
        <form className="chat-form" onSubmit={send}>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder={t('say')} aria-label={t('say')} />
          <button className="btn btn-small" type="submit">{t('send')}</button>
        </form>
      </div>
    </aside>
  );
}

/** Small always-visible strip of the latest table talk and quick taunts. */
export function ChatTicker() {
  const chat = useApp(s => s.chat);
  const last = chat[chat.length - 1];
  if (!last) return null;
  return <p className="chat-ticker">{last.from ? <b>{last.name}: </b> : null}{last.taunt ? t(`taunt_${last.taunt}` as Key) : chatText(last.text)}</p>;
}
