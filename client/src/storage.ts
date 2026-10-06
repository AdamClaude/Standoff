// localStorage can be missing or throw (private windows, sandboxed frames). Never let it break the game.
const mem = new Map<string, string>();
export const store = {
  get(k: string): string | null {
    try { const v = localStorage.getItem(k); if (v !== null) return v; } catch { /* fall through */ }
    return mem.get(k) ?? null;
  },
  set(k: string, v: string) {
    mem.set(k, v);
    try { localStorage.setItem(k, v); } catch { /* memory only */ }
  },
};
