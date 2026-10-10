import { useEffect, useRef } from 'react';
import type { ClientView } from '@standoff/engine';
import { BarScene, type SceneUI } from '../three/scene';
import { useApp } from '../net';
import { t, type Key } from '../i18n';
import { chatText } from './Chat';

/** Mounts the 3D bar once and feeds it every new view. */
export function Scene3D({ v, ui }: { v: ClientView; ui: SceneUI }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BarScene | null>(null);
  useEffect(() => {
    scene.current = new BarScene(host.current!);
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
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
