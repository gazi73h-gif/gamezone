// Thirrja e rregullave të lojërave në server (Supabase Edge Functions "ludo-action", "okey-action").
// Shfletuesi dërgon vetëm veprimin ("hidh zarin", "hidh gurin X"); serveri e kryen dhe kontrollon
// rregullat. Kur funksioni s'është vendosur ende (ose s'përgjigjet), kthehet 'unavailable'
// dhe loja vazhdon si më parë.
import type { LudoGameState } from './ludoLogic';
import type { RummyGameState } from './rummyLogic';
import type { LudoAction } from '../server/ludoServer';
import type { OkeyAction } from '../server/okeyServer';
import { playerSecret } from './playerKey';

export type { LudoAction, OkeyAction };
export type RemoteResult<S> = { ok: true; state: S } | { ok: false; reason: string; state?: S };
export type LudoResult = RemoteResult<LudoGameState>;
export type OkeyResult = RemoteResult<RummyGameState>;

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/`;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const TIMEOUT_MS = 12000; // telefoni pas gjumit mund ta lërë kërkesën pa përgjigje: mos prit pafundësisht
const RECHECK_MS = 20000; // "s'është gati" vlen vetëm pak, pastaj provohet sërish
const available: Record<string, boolean | undefined> = {}; // true = funksioni është parë duke punuar
const offUntil: Record<string, number> = {};

async function callGame<S>(fn: string, code: string, player: string, action: unknown): Promise<RemoteResult<S>> {
  if ((offUntil[fn] ?? 0) > Date.now()) return { ok: false, reason: 'unavailable' };
  // Kur funksioni ka punuar një herë, një dështim është problem interneti, jo "funksioni s'ekziston":
  // atëherë s'kalohet në rrugën e vjetër (që serveri e refuzon) por thuhet "network" dhe provohet sërish.
  const notReady = (): RemoteResult<S> => {
    if (available[fn]) return { ok: false, reason: 'network' };
    offUntil[fn] = Date.now() + RECHECK_MS;
    return { ok: false, reason: 'unavailable' };
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(BASE + fn, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ code, player, secret: playerSecret(), action }),
        signal: ctrl.signal,
      });
    } catch {
      return notReady(); // funksioni s'ekziston (CORS), s'ka lidhje ose s'u përgjigj me kohë
    }
    let body: { ok?: boolean; reason?: string; state?: S } = {};
    try {
      const parsed = await res.json();
      if (parsed && typeof parsed === 'object') body = parsed;
    } catch { /* përgjigje bosh ose e ndërprerë */ }
    if (res.ok && body.ok && body.state) { available[fn] = true; delete offUntil[fn]; return { ok: true, state: body.state }; }
    // përgjigje që s'vjen nga funksioni ynë (404 i Supabase, 401, 5xx) = funksioni s'është gati
    if (typeof body.ok !== 'boolean' || res.status >= 500 || res.status === 401) return notReady();
    available[fn] = true;
    delete offUntil[fn];
    return { ok: false, reason: body.reason ?? `http_${res.status}`, state: body.state };
  } finally {
    clearTimeout(timer);
  }
}

export const ludoAction = (code: string, player: string, action: LudoAction) =>
  callGame<LudoGameState>('ludo-action', code, player, action);

export const okeyAction = (code: string, player: string, action: OkeyAction) =>
  callGame<RummyGameState>('okey-action', code, player, action);
