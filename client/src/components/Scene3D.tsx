import { useEffect, useRef } from 'react';
import type { ClientView } from '@standoff/engine';
import { BarScene, type SceneUI } from '../three/scene';

/** Mounts the 3D bar once and feeds it every new view. */
export function Scene3D({ v, ui }: { v: ClientView; ui: SceneUI }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BarScene | null>(null);
  useEffect(() => {
    scene.current = new BarScene(host.current!);
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => {
    const top = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
    const bottom = document.querySelector('.tray')?.getBoundingClientRect().height ?? 0;
    scene.current?.setInsets(top, bottom);
    scene.current?.update(v, ui);
  });
  return <div className="bar-host" ref={host} />;
}
