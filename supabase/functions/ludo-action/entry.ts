// Funksioni Supabase "ludo-action" (Deno). Ky skedar bashkohet me rregullat e Ludos
// (src/server/ludoServer.ts) në një skedar të vetëm: supabase/functions/ludo-action/index.ts
// — ai është skedari që ngjitet te Supabase → Edge Functions.
import { handleLudo, type LudoDeps, type Room } from '../../../src/server/ludoServer';
import type { LudoGameState } from '../../../src/lib/ludoLogic';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const H: Record<string, string> = { apikey: KEY, 'content-type': 'application/json' };
if (!KEY.startsWith('sb_')) H.Authorization = `Bearer ${KEY}`; // çelësat e vjetër JWT

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers as Record<string, string> | undefined) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const deps: LudoDeps = {
  async auth(player, secret, code) {
    return (await rest('rpc/game_auth', { method: 'POST', body: JSON.stringify({ p_player: player, p_secret: secret, p_code: code }) })) === true;
  },
  async load(code) {
    const rows = await rest(`rooms?code=eq.${code}&select=game_type,status,host_id,game_state`);
    return (rows?.[0] ?? null) as Room | null;
  },
  async players(code) {
    return (await rest(`room_players?room_code=eq.${code}&select=player_id,nickname&order=seat_order.asc`)) ?? [];
  },
  async save(code, state: LudoGameState, prevRev, status) {
    let filter = `code=eq.${code}`;
    if (prevRev !== null) filter += prevRev === 0 ? '&or=(game_state->>rev.is.null,game_state->>rev.eq.0)' : `&game_state->>rev=eq.${prevRev}`;
    const rows = await rest(`rooms?${filter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(status ? { game_state: state, status } : { game_state: state }),
    });
    return Array.isArray(rows) && rows.length > 0;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('{"ok":false}', { status: 405, headers: { ...CORS, 'content-type': 'application/json' } });
  try {
    const reply = await handleLudo(deps, await req.json());
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { ...CORS, 'content-type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});
