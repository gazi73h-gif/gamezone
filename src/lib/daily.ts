'use client';
// Misionet ditore dhe "zjarri" i ditëve radhazi — arsyeja për t'u kthyer çdo ditë.
// Ruhen në këtë shfletues (lojtarët luajnë me nofkë, pa llogari).
import { useSyncExternalStore } from 'react';

export type Mission = { id: string; title: string; target: number; reward: number; progress: number; claimed: boolean };

type Day = { date: string; played: number; won: number; games: string[]; claimed: string[]; seen: string[] };
type Streak = { last: string; count: number };

const DAY_KEY = 'gz_daily';
const STREAK_KEY = 'gz_streak';
const TOKENS_KEY = 'gamezone_tokens';

const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayOf(d); };

const subs = new Set<() => void>();
let version = 0;
const emit = () => { version++; subs.forEach((fn) => fn()); };

function read<T>(key: string, fallback: T): T {
  try { const v = window.localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* s'ka rëndësi */ }
}
function today(): Day {
  const empty: Day = { date: dayOf(), played: 0, won: 0, games: [], claimed: [], seen: [] };
  const d = read<Day>(DAY_KEY, empty);
  return d.date === empty.date ? d : { ...empty, seen: d.seen ?? [] };
}

/** Ditët radhazi me të paktën një lojë (0 nëse ka humbur një ditë). */
export function streakCount(): number {
  const s = read<Streak>(STREAK_KEY, { last: '', count: 0 });
  return s.last === dayOf() || s.last === yesterday() ? s.count : 0;
}

/** Thirret kur nis një lojë për këtë lojtar (një herë për lojë, edhe pas rifreskimit të faqes). */
export function trackGame(game: string, key: string) {
  if (typeof window === 'undefined') return;
  const d = today();
  if (d.seen.includes(key)) return;
  d.seen = [...d.seen, key].slice(-30);
  d.played += 1;
  if (!d.games.includes(game)) d.games = [...d.games, game];
  write(DAY_KEY, d);
  const s = read<Streak>(STREAK_KEY, { last: '', count: 0 });
  if (s.last !== d.date) write(STREAK_KEY, { last: d.date, count: s.last === yesterday() ? s.count + 1 : 1 });
  emit();
}

/** Thirret kur ky lojtar fiton një lojë. */
export function trackWin() {
  if (typeof window === 'undefined') return;
  const d = today();
  d.won += 1;
  write(DAY_KEY, d);
  emit();
}

export function missions(): Mission[] {
  const d = today();
  const list = [
    { id: 'play3', title: 'Luaj 3 lojëra', target: 3, reward: 100, progress: d.played },
    { id: 'win1', title: 'Fito 1 lojë', target: 1, reward: 150, progress: d.won },
    { id: 'try2', title: 'Provo 2 lojëra të ndryshme', target: 2, reward: 100, progress: d.games.length },
  ];
  return list.map((m) => ({ ...m, progress: Math.min(m.progress, m.target), claimed: d.claimed.includes(m.id) }));
}

/** Merr shpërblimin e misionit; kthen tokens e reja (ose null). */
export function claimMission(id: string): number | null {
  const d = today();
  const m = missions().find((x) => x.id === id);
  if (!m || m.claimed || m.progress < m.target) return null;
  d.claimed = [...d.claimed, id];
  write(DAY_KEY, d);
  let tokens = 1000;
  try { tokens = parseInt(window.localStorage.getItem(TOKENS_KEY) || '1000', 10) || 1000; } catch { /* s'ka rëndësi */ }
  tokens += m.reward;
  try { window.localStorage.setItem(TOKENS_KEY, String(tokens)); } catch { /* s'ka rëndësi */ }
  emit();
  return tokens;
}

/** Rifreskohet kur ndryshon progresi (edhe nga një skedë tjetër). */
export function useDaily() {
  const v = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      const onStorage = (e: StorageEvent) => { if (e.key === DAY_KEY || e.key === STREAK_KEY) emit(); };
      window.addEventListener('storage', onStorage);
      return () => { subs.delete(cb); window.removeEventListener('storage', onStorage); };
    },
    () => version,
    () => -1,
  );
  const ready = v >= 0;
  return { ready, missions: ready ? missions() : [], streak: ready ? streakCount() : 0 };
}
