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
const available: Record<string, boolean | undefined> = {}; // undefined = ende s'dihet

async function callGame<S>(fn: string, code: string, player: string, action: unknown): Promise<RemoteResult<S>> {
  if (available[fn] === false) return { ok: false, reason: 'unavailable' };
  let res: Response;
  try {
    res = await fetch(BASE + fn, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ code, player, secret: playerSecret(), action }),
    });
  } catch {
    available[fn] = false; // funksioni s'ekziston (CORS) ose s'ka lidhje
    return { ok: false, reason: 'unavailable' };
  }
  let body: { ok?: boolean; reason?: string; state?: S } = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed;
  } catch { /* përgjigje bosh */ }
  if (res.ok && body.ok && body.state) { available[fn] = true; return { ok: true, state: body.state }; }
  // përgjigje që s'vjen nga funksioni ynë (404 i Supabase, 401, 5xx) = funksioni s'është gati
  if (typeof body.ok !== 'boolean' || res.status >= 500 || res.status === 401) {
    available[fn] = false;
    return { ok: false, reason: 'unavailable' };
  }
  available[fn] = true;
  return { ok: false, reason: body.reason ?? `http_${res.status}`, state: body.state };
}

export const ludoAction = (code: string, player: string, action: LudoAction) =>
  callGame<LudoGameState>('ludo-action', code, player, action);

export const okeyAction = (code: string, player: string, action: OkeyAction) =>
  callGame<RummyGameState>('okey-action', code, player, action);
