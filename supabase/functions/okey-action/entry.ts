// Funksioni Supabase "okey-action" (Deno). Ky skedar bashkohet me rregullat e Okey-t
// (src/server/okeyServer.ts) në një skedar të vetëm: supabase/functions/okey-action/index.ts
// — ai është skedari që ngjitet te Supabase → Edge Functions.
import { handleOkey, type OkeyDeps, type FullState } from '../../../src/server/okeyServer';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
// çelësi i serverit: emri i vjetër (SERVICE_ROLE) ose i riu (SECRET_KEYS = {"default":"sb_secret_..."})
function serverKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return '';
  }
}
const KEY = serverKey();
const H: Record<string, string> = { apikey: KEY, 'content-type': 'application/json' };
if (!KEY.startsWith('sb_')) H.Authorization = `Bearer ${KEY}`;

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
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

const deps: OkeyDeps = {
  async auth(player, secret, code) {
    return (await rpc('game_auth', { p_player: player, p_secret: secret, p_code: code })) === true;
  },
  async load(code) {
    const r = await rpc('okey_load', { p_code: code });
    return r ? { game_type: r.game_type, status: r.status, host_id: r.host_id, full: (r.full ?? null) as FullState | null } : null;
  },
  async players(code) {
    return (await rest(`room_players?room_code=eq.${code}&select=player_id,nickname&order=seat_order.asc`)) ?? [];
  },
  async save(code, full, pub, prevRev, status) {
    return (await rpc('okey_save', { p_code: code, p_prev_rev: prevRev, p_full: full, p_public: pub, p_status: status ?? null })) === true;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('{"ok":false}', { status: 405, headers: { ...CORS, 'content-type': 'application/json' } });
  try {
    const reply = await handleOkey(deps, await req.json());
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { ...CORS, 'content-type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});
