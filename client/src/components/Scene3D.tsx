import { useEffect, useRef } from 'react';
import type { ClientView } from '@standoff/engine';
import { BarScene, type SceneUI } from '../three/scene';
import { serverNow, useApp } from '../net';
import { t, type Key } from '../i18n';
import { chatText } from './Chat';

/** Mounts the 3D bar once and feeds it every new view. */
export function Scene3D({ v, ui, phaseEndsAt }: { v: ClientView; ui: SceneUI; phaseEndsAt: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BarScene | null>(null);
  useEffect(() => {
    scene.current = new BarScene(host.current!);
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
  // Each new heist opens with the crew hitting the bank (leaves ~1.2 s to look at the loot after).
  const cutRound = useRef(0);
  useEffect(() => {
    if (v.phase !== 'LOOT_REVEAL' || cutRound.current === v.round || ui.reducedMotion) return;
    cutRound.current = v.round;
    const left = phaseEndsAt - serverNow();
    // A stale or missing deadline still gets a full cutscene; the phase change cuts it short anyway.
    const ms = Math.min(9000, left > 3000 && left < 20000 ? left - 1200 : 8000);
    const crew = [...v.players].filter(p => p.alive).sort((a, b) => (a.id === v.viewerId ? -1 : b.id === v.viewerId ? 1 : a.seat - b.seat)).map(p => p.avatar);
    let tries = 0;
    let id = 0 as unknown as ReturnType<typeof setTimeout>;
    const go = () => {
      if (scene.current) scene.current.playCutscene(v.round, crew, ms - tries * 100);
      else if (++tries < 15) id = setTimeout(go, 100);   // 3D scene still booting
    };
    go();
    return () => clearTimeout(id);
  }, [v.round, v.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = useApp(s => s.chat[s.chat.length - 1]);
  useEffect(() => {
    if (!last?.from || Date.now() - last.at > 4000) return;
    scene.current?.say(last.from, last.taunt ? t(`taunt_${last.taunt}` as Key) : chatText(last.text));
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const top = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
    const bottom = document.querySelector('.tray')?.getBoundingClientRect().height ?? 0;
    scene.current?.setInsets(top, bottom);
    scene.current?.update(v, ui);
  });
  return <div className="bar-host" ref={host} />;
}
