'use client';
// Dyqani: me tokens blihen pamje të reja (zari i Ludos, ngjyra e tavolinës së Okey-t dhe Pishpirikut).
// Ruhet në këtë shfletues, si edhe tokens (lojtarët luajnë me nofkë).
import { useSyncExternalStore } from 'react';

export type DiceSkin = { id: string; name: string; price: number; face: string; pip: string; one: string };
export type TableSkin = { id: string; name: string; price: number; felt: [string, string, string] };

export const DICE: DiceSkin[] = [
  { id: 'classic', name: 'Klasik', price: 0, face: 'radial-gradient(circle at 30% 25%, #ffffff, #f2ede0 60%, #ddd3bb)', pip: '#231942', one: '#e53935' },
  { id: 'gold', name: 'Ari', price: 600, face: 'radial-gradient(circle at 30% 25%, #fff3b0, #ffc83d 55%, #c98d17)', pip: '#4a2c00', one: '#4a2c00' },
  { id: 'ruby', name: 'Rubin', price: 800, face: 'radial-gradient(circle at 30% 25%, #ff8a9a, #e11d48 55%, #8f0f2c)', pip: '#ffffff', one: '#ffe08a' },
  { id: 'ocean', name: 'Oqean', price: 800, face: 'radial-gradient(circle at 30% 25%, #a5f3fc, #22b8cf 55%, #0b6b84)', pip: '#ffffff', one: '#ffffff' },
  { id: 'galaxy', name: 'Galaktik', price: 1500, face: 'radial-gradient(circle at 30% 25%, #c4b5fd, #6d28d9 50%, #1e1047)', pip: '#ffe08a', one: '#ff8fd8' },
];

export const TABLES: TableSkin[] = [
  { id: 'green', name: 'Jeshile', price: 0, felt: ['#2f9a72', '#1d7457', '#12503d'] },
  { id: 'blue', name: 'Blu mbretërore', price: 700, felt: ['#3b7dd8', '#25569e', '#163668'] },
  { id: 'wine', name: 'Burgundi', price: 700, felt: ['#b0415a', '#7d2a3f', '#4f1727'] },
  { id: 'violet', name: 'Vjollcë', price: 900, felt: ['#8b5cf6', '#6237b8', '#3b1f7a'] },
  { id: 'night', name: 'Natë', price: 1200, felt: ['#3a4256', '#252b3b', '#141824'] },
];

type Cat = 'dice' | 'table';
type State = { owned: string[]; dice: string; table: string };
const KEY = 'gz_shop';
const TOKENS_KEY = 'gamezone_tokens';
const FREE = ['dice:classic', 'table:green'];

const subs = new Set<() => void>();
let version = 0;
const emit = () => { version++; subs.forEach((fn) => fn()); };

function read(): State {
  const base: State = { owned: [...FREE], dice: 'classic', table: 'green' };
  try { const v = window.localStorage.getItem(KEY); return v ? { ...base, ...JSON.parse(v) } : base; } catch { return base; }
}
function write(s: State) { try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* s'ka rëndësi */ } emit(); }
function tokens(): number {
  try { return parseInt(window.localStorage.getItem(TOKENS_KEY) || '1000', 10) || 0; } catch { return 0; }
}

const list = (cat: Cat) => (cat === 'dice' ? DICE : TABLES);

/** Blen dhe vendos një pamje; kthen tokens e mbetura, ose null kur s'mjaftojnë. */
export function buy(cat: Cat, id: string): number | null {
  const item = list(cat).find((x) => x.id === id);
  const s = read();
  if (!item) return null;
  const key = `${cat}:${id}`;
  if (s.owned.includes(key)) { equip(cat, id); return tokens(); }
  const have = tokens();
  if (have < item.price) return null;
  const left = have - item.price;
  try { window.localStorage.setItem(TOKENS_KEY, String(left)); } catch { /* s'ka rëndësi */ }
  write({ ...s, owned: [...s.owned, key], [cat]: id });
  return left;
}

export function equip(cat: Cat, id: string) {
  const s = read();
  if (!s.owned.includes(`${cat}:${id}`)) return;
  write({ ...s, [cat]: id });
}

function useVersion() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      const onStorage = (e: StorageEvent) => { if (e.key === KEY) emit(); };
      window.addEventListener('storage', onStorage);
      return () => { subs.delete(cb); window.removeEventListener('storage', onStorage); };
    },
    () => version,
    () => -1,
  );
}

/** Gjendja e dyqanit (për faqen kryesore). */
export function useShop() {
  const v = useVersion();
  const s = v >= 0 ? read() : { owned: [...FREE], dice: 'classic', table: 'green' };
  return { ready: v >= 0, ...s };
}

/** Zari që ka zgjedhur lojtari (Ludo). */
export function useDiceSkin(): DiceSkin {
  const { dice } = useShop();
  return DICE.find((d) => d.id === dice) ?? DICE[0];
}

/** Ngjyra e tavolinës që ka zgjedhur lojtari (Okey, Pishpirik). */
export function useTableSkin(): TableSkin {
  const { table } = useShop();
  return TABLES.find((t) => t.id === table) ?? TABLES[0];
}

export const feltBackground = (t: TableSkin) => `radial-gradient(70% 60% at 50% 45%, ${t.felt[0]} 0%, ${t.felt[1]} 45%, ${t.felt[2]} 100%)`;
