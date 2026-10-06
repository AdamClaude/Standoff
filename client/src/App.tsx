import { useEffect } from 'react';
import { api, useApp } from './net';
import { t, useLang, type Key } from './i18n';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Game } from './components/Game';
import { ChatTicker } from './components/Chat';

export function App() {
  useLang();
  const session = useApp(s => s.session);
  const game = useApp(s => s.game);
  const connected = useApp(s => s.connected);
  const toast = useApp(s => s.toast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => api.clearToast(), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const inGame = !!session && !!game;
  return (
    <>
      {!session && <Home />}
      {session && !game && <Lobby />}
      {inGame && <Game />}
      {session && game?.view.phase !== 'GAME_OVER' && <ChatTicker />}
      {!connected && <div className="banner" role="status">{t('reconnecting')}</div>}
      {toast && <div className="toast" role="alert">{toast in TOASTS ? t(TOASTS[toast]) : toast}</div>}
    </>
  );
}

const TOASTS: Record<string, Key> = { noRoom: 'noRoom' };
