// Të gjitha veprimet me dhomat kalojnë nga funksionet e sigurta në server
// (supabase/migrations/20261128_secure_rooms.sql). Çdo lojtar ka një çelës sekret në këtë shfletues,
// që askush tjetër të mos veprojë në emër të tij.
// Derisa të ekzekutohet migrimi, faqja punon si më parë (shkrim direkt në tabela).
import { supabase } from './supabase';

const SECRET_KEY = 'gamezone_player_secret';

export function playerSecret(): string {
  try {
    let s = window.localStorage.getItem(SECRET_KEY);
    if (!s) {
      const a = new Uint8Array(20);
      window.crypto.getRandomValues(a);
      s = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      window.localStorage.setItem(SECRET_KEY, s);
    }
    return s;
  } catch {
    return '';
  }
}

export class RoomError extends Error {
  constructor(public reason: string) { super(reason); this.name = 'RoomError'; }
}

type PgError = { code?: string; message?: string } | null;
let secure: boolean | null = null; // null = ende s'dihet; false = migrimi s'është ekzekutuar
const missingFn = (e: PgError) => e?.code === 'PGRST202' || /could not find the function/i.test(e?.message ?? '');

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: () => Promise<T>): Promise<T> {
  if (secure !== false) {
    const { data, error } = await supabase.rpc(fn, { ...args, p_secret: playerSecret() });
    if (!error) { secure = true; return data as T; }
    if (!missingFn(error)) {
      const reason = ['no_room', 'room_full', 'slow_down', 'not_allowed', 'not_in_room', 'bad_game'].find((r) => error.message?.includes(r));
      throw new RoomError(reason ?? (error.message || 'error'));
    }
    secure = false;
  }
  return fallback();
}

/** Krijon dhomë dhe e ul lojtarin; kthen kodin. */
export function createRoom(player: string, game: string, nickname: string, avatar?: string | null): Promise<string> {
  return rpc('create_room', { p_player: player, p_game: game, p_nickname: nickname, p_avatar: avatar ?? null }, async () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const { error: re } = await supabase.from('rooms').insert([{ code, game_type: game, host_id: player, status: 'waiting' }]);
    if (re) throw re;
    const seat = { room_code: code, player_id: player, nickname, seat_order: 1 };
    let { error: pe } = await supabase.from('room_players').insert([{ ...seat, ...(avatar ? { avatar_url: avatar } : {}) }]);
    if (pe?.code === 'PGRST204') ({ error: pe } = await supabase.from('room_players').insert([seat]));
    if (pe) throw pe;
    return code;
  });
}

/** Hyn në dhomë me kod. Hedh RoomError('no_room') kur dhoma s'ekziston. */
export function joinRoom(player: string, code: string, nickname: string, avatar?: string | null): Promise<void> {
  return rpc('join_room', { p_player: player, p_code: code, p_nickname: nickname, p_avatar: avatar ?? null }, async () => {
    const { data: room, error: fe } = await supabase.from('rooms').select('code').eq('code', code).single();
    if (fe || !room) throw new RoomError('no_room');
    const { data: players } = await supabase.from('room_players').select('player_id').eq('room_code', code);
    const seat = { room_code: code, player_id: player, nickname, seat_order: (players?.length || 0) + 1 };
    let { error: je } = await supabase.from('room_players').upsert({ ...seat, ...(avatar ? { avatar_url: avatar } : {}) }, { onConflict: 'room_code,player_id' });
    if (je?.code === 'PGRST204') ({ error: je } = await supabase.from('room_players').upsert(seat, { onConflict: 'room_code,player_id' }));
    if (je) throw je;
  }).then(() => undefined);
}

/** Del nga dhoma (dhoma fshihet kur s'mbetet askush; kur del krijuesi, i kalon tjetrit). */
export function leaveRoom(player: string, code: string, others: string[], isHost: boolean): Promise<void> {
  return rpc('leave_room', { p_player: player, p_code: code }, async () => {
    await supabase.from('room_players').delete().eq('room_code', code).eq('player_id', player);
    if (others.length === 0) await supabase.from('rooms').delete().eq('code', code);
    else if (isHost) await supabase.from('rooms').update({ host_id: others[0] }).eq('code', code);
  }).then(() => undefined);
}

/**
 * Ndryshon gjendjen e lojës dhe/ose statusin e dhomës. Me prevRev ruhet vetëm nëse në server
 * është ende ai version; kthen false kur dikush tjetër e ka ndryshuar ndërkohë.
 */
export function updateRoom(player: string, code: string, opts: { state?: unknown; status?: string; prevRev?: number }): Promise<boolean> {
  const setState = 'state' in opts;
  return rpc<boolean>('update_room', {
    p_player: player, p_code: code, p_state: setState ? opts.state : null,
    p_status: opts.status ?? null, p_prev_rev: opts.prevRev ?? null, p_set_state: setState,
  }, async () => {
    const patch: Record<string, unknown> = {};
    if (setState) patch.game_state = opts.state;
    if (opts.status) patch.status = opts.status;
    let q = supabase.from('rooms').update(patch).eq('code', code);
    if (opts.prevRev !== undefined) {
      q = opts.prevRev === 0 ? q.or('game_state->>rev.is.null,game_state->>rev.eq.0') : q.eq('game_state->>rev', String(opts.prevRev));
    }
    const { data, error } = await q.select('code');
    if (error) throw error;
    return !!data && data.length > 0;
  });
}

/** Mbyll dhomën (p.sh. pas 5 minutash pa aktivitet). */
export function closeRoom(player: string, code: string): Promise<void> {
  return rpc('close_room', { p_player: player, p_code: code }, async () => {
    await supabase.from('room_players').delete().eq('room_code', code);
    await supabase.from('rooms').delete().eq('code', code);
  }).then(() => undefined);
}

/** Pastron dhomat në pritje mbi 5 minuta pa asnjë lojtar. */
export async function cleanupRooms(): Promise<void> {
  const { error } = await supabase.rpc('cleanup_rooms');
  if (!error || !missingFn(error)) return;
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data } = await supabase.from('rooms').select('code').eq('status', 'waiting').lt('created_at', cutoff).limit(50);
  const old = (data || []).map((r) => r.code);
  if (old.length === 0) return;
  const { data: seated } = await supabase.from('room_players').select('room_code').in('room_code', old);
  const busy = new Set((seated || []).map((p) => p.room_code));
  const codes = old.filter((c) => !busy.has(c));
  if (codes.length) await supabase.from('rooms').delete().in('code', codes);
}
