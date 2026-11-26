// Thirrja e rregullave të Ludos në server (Supabase Edge Function "ludo-action").
// Shfletuesi dërgon vetëm veprimin ("hidh zarin", "lëviz gurin 2"); serveri e hedh zarin
// dhe kontrollon rregullat. Kur funksioni s'është vendosur ende (ose s'përgjigjet),
// kthehet 'unavailable' dhe loja vazhdon si më parë.
import type { LudoGameState } from './ludoLogic';
import type { LudoAction } from '../server/ludoServer';
import { playerSecret } from './playerKey';

export type { LudoAction };
export type LudoResult =
  | { ok: true; state: LudoGameState }
  | { ok: false; reason: string; state?: LudoGameState };

const URL_ = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ludo-action`;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
let available: boolean | null = null; // null = ende s'dihet

export async function ludoAction(code: string, player: string, action: LudoAction): Promise<LudoResult> {
  if (available === false) return { ok: false, reason: 'unavailable' };
  let res: Response;
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ code, player, secret: playerSecret(), action }),
    });
  } catch {
    available = false; // funksioni s'ekziston (CORS) ose s'ka lidhje
    return { ok: false, reason: 'unavailable' };
  }
  let body: { ok?: boolean; reason?: string; state?: LudoGameState } = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed;
  } catch { /* përgjigje bosh */ }
  if (res.ok && body.ok && body.state) { available = true; return { ok: true, state: body.state }; }
  // përgjigje që s'vjen nga funksioni ynë (404 i Supabase, 401, 5xx) = funksioni s'është gati
  if (typeof body.ok !== 'boolean' || res.status >= 500 || res.status === 401) {
    available = false;
    return { ok: false, reason: 'unavailable' };
  }
  available = true;
  return { ok: false, reason: body.reason ?? `http_${res.status}`, state: body.state };
}
