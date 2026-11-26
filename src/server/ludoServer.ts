// Rregullat e Ludos në server. I njëjti kod (ludoLogic) që përdor faqja, por këtu:
// • zari hidhet nga serveri (Math.random në server, jo në shfletues);
// • lëvizja pranohet vetëm kur është radha jote dhe guri mund të lëvizë vërtet;
// • botët i drejton vetëm krijuesi i dhomës; vendet sinkronizohen nga lista e serverit.
// Përdoret nga funksioni Supabase "ludo-action" (supabase/functions/ludo-action).
import {
  LudoGameState, normalizeLudoState, initLudoGame, rollAndAutoMove, moveLudoToken,
  getMovableTokenIndices, isLudoBot,
} from '../lib/ludoLogic';
import { syncSeats } from '../lib/seats';

export type LudoAction =
  | { type: 'start' }
  | { type: 'roll'; bot?: string }
  | { type: 'move'; token: number; bot?: string }
  | { type: 'sync' };

export type Room = { game_type: string; status: string; host_id: string; game_state: unknown };

export interface LudoDeps {
  /** a është ky lojtar (çelësi i saktë) dhe a është ulur në dhomë? */
  auth(player: string, secret: string, code: string): Promise<boolean>;
  load(code: string): Promise<Room | null>;
  players(code: string): Promise<{ player_id: string; nickname: string }[]>;
  /** ruan vetëm kur në server është ende prevRev (null = pa kontroll); kthen false kur dikush e ndryshoi ndërkohë */
  save(code: string, state: LudoGameState, prevRev: number | null, status?: string): Promise<boolean>;
}

export type Reply = { status: number; body: { ok: boolean; reason?: string; state?: LudoGameState } };

const isLudoState = (s: unknown): s is LudoGameState =>
  !!s && typeof s === 'object' && Array.isArray((s as LudoGameState).playerOrder) && !!(s as LudoGameState).players;

export async function handleLudo(deps: LudoDeps, input: unknown): Promise<Reply> {
  const b = (input ?? {}) as { code?: unknown; player?: unknown; secret?: unknown; action?: LudoAction };
  const code = typeof b.code === 'string' && /^\d{4}$/.test(b.code) ? b.code : '';
  const player = typeof b.player === 'string' ? b.player.slice(0, 64) : '';
  const secret = typeof b.secret === 'string' ? b.secret.slice(0, 128) : '';
  const a = b.action;
  if (!code || !player || !a || !['start', 'roll', 'move', 'sync'].includes(a.type)) return { status: 400, body: { ok: false, reason: 'bad_request' } };
  if (!(await deps.auth(player, secret, code))) return { status: 403, body: { ok: false, reason: 'not_allowed' } };

  const room = await deps.load(code);
  if (!room || room.game_type !== 'ludo') return { status: 404, body: { ok: false, reason: 'no_room' } };

  /* nis lojën (edhe "Luaj përsëri") */
  if (a.type === 'start') {
    const current = isLudoState(room.game_state) ? normalizeLudoState(room.game_state) : null;
    if (room.status === 'playing' && current && current.status === 'playing') return { status: 409, body: { ok: false, reason: 'already_playing', state: current } };
    const seated = (await deps.players(code)).filter((p) => !p.player_id.startsWith('BOT'));
    if (seated.length === 0) return { status: 409, body: { ok: false, reason: 'empty' } };
    const fresh = initLudoGame(seated.map((p) => ({ id: p.player_id, nickname: p.nickname })));
    if (!(await deps.save(code, fresh, null, 'playing'))) return { status: 409, body: { ok: false, reason: 'stale' } };
    return { status: 200, body: { ok: true, state: fresh } };
  }

  if (room.status !== 'playing' || !isLudoState(room.game_state)) return { status: 409, body: { ok: false, reason: 'not_playing' } };
  const state = normalizeLudoState(room.game_state);
  const rev = state.rev ?? 0;
  let next: LudoGameState | null = null;

  if (a.type === 'sync') {
    if (player !== room.host_id) return { status: 403, body: { ok: false, reason: 'host_only' } };
    const synced = syncSeats('ludo', state, await deps.players(code)) as LudoGameState | null;
    if (!synced) return { status: 200, body: { ok: true, state } };
    next = synced;
  } else {
    // kush luan: vetë lojtari, ose një bot (vetëm krijuesi i dhomës i drejton botët)
    let actor = player;
    if (a.bot !== undefined) {
      if (player !== room.host_id || typeof a.bot !== 'string' || !isLudoBot(a.bot)) return { status: 403, body: { ok: false, reason: 'host_only' } };
      actor = a.bot;
    }
    if (state.status !== 'playing' || state.currentTurn !== actor || !state.players[actor]) {
      return { status: 409, body: { ok: false, reason: 'not_your_turn', state } };
    }
    if (a.type === 'roll') {
      if (state.hasRolled) return { status: 409, body: { ok: false, reason: 'already_rolled', state } };
      next = rollAndAutoMove(state, actor);
    } else {
      const token = Number(a.token);
      if (!state.hasRolled || state.diceValue === null || !getMovableTokenIndices(state.players[actor], state.diceValue).includes(token)) {
        return { status: 409, body: { ok: false, reason: 'invalid_move', state } };
      }
      next = moveLudoToken(state, actor, token);
    }
    if (next === state) return { status: 409, body: { ok: false, reason: 'invalid_move', state } };
  }

  const saved = { ...next, rev: rev + 1 };
  if (!(await deps.save(code, saved, rev))) {
    const latest = await deps.load(code);
    return { status: 409, body: { ok: false, reason: 'stale', state: isLudoState(latest?.game_state) ? normalizeLudoState(latest.game_state) : undefined } };
  }
  return { status: 200, body: { ok: true, state: saved } };
}
