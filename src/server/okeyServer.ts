// Rregullat e Okey-t në server. I njëjti kod (rummyLogic) që përdor faqja, por këtu:
// • gurët i përzien dhe i ndan serveri; dora e secilit dhe stiva ruhen të fshehura
//   (tabela game_secrets), kurse te "rooms" shkon vetëm pamja publike me gurë të mbuluar;
// • çdo lojtar merr vetëm gurët e vet;
// • marrja, hedhja dhe mbyllja kontrollohen këtu; botët, koha e radhës dhe raundi tjetër
//   llogariten me orën e serverit.
// Përdoret nga funksioni Supabase "okey-action" (supabase/functions/okey-action).
import {
  RummyGameState, RummyTile, isTileRummyState, isRummyBot, initRummyGame, startNextRound,
  drawRummyTile, discardRummyTile, finishRummyRound, autoPlayTurn, runBotRummyTurn,
} from '../lib/rummyLogic';
import { syncSeats } from '../lib/seats';

export const TURN_MS = 30000;
export const BOT_MS = 900;
export const NEXT_ROUND_MS = 9000;

export type OkeyAction =
  | { type: 'view' }
  | { type: 'start' }
  | { type: 'draw'; from: 'deck' | 'left' }
  | { type: 'discard'; tile: string }
  | { type: 'finish'; tile: string }
  | { type: 'tick' }
  | { type: 'next' }
  | { type: 'sync' };

/** gjendja e plotë në server + koha kur nisi radha e tanishme */
export type FullState = RummyGameState & { turnStartedAt?: number };
/** pamja që shohin të tjerët: gurët e mbuluar, numri i tyre i saktë */
export type PublicState = RummyGameState & { hidden: true };

export interface OkeyDeps {
  auth(player: string, secret: string, code: string): Promise<boolean>;
  /** dhoma + gjendja e plotë e fshehur (null kur s'ka lojë Okey në server) */
  load(code: string): Promise<{ game_type: string; status: string; host_id: string; full: FullState | null } | null>;
  players(code: string): Promise<{ player_id: string; nickname: string }[]>;
  /** ruan gjendjen e plotë (e fshehur) + pamjen publike, vetëm kur në server është ende prevRev */
  save(code: string, full: FullState, pub: PublicState, prevRev: number | null, status?: string): Promise<boolean>;
  now?(): number;
}

export type OkeyReply = { status: number; body: { ok: boolean; reason?: string; state?: RummyGameState } };

const cover = (n: number, tag: string): RummyTile[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, color: 'black', number: 0 }));

/** pamja publike: asnjë dorë dhe asnjë gur i stivës nuk zbulohet */
export function publicView(full: FullState): PublicState {
  const players: RummyGameState['players'] = {};
  for (const id of full.playerOrder) {
    const p = full.players[id];
    players[id] = { ...p, hand: cover(p.hand.length, `h-${id}-`) };
  }
  const { turnStartedAt: _t, ...rest } = full;
  void _t;
  // lastDrawnTileId zbulon gurin (id = ngjyra-numri), prandaj e di vetëm ai që e mori
  return { ...rest, deck: cover(full.deck.length, 'd'), players, lastDrawnTileId: null, hidden: true };
}

/** pamja e një lojtari: publike + gurët e vet */
export function viewFor(full: FullState, player: string): RummyGameState {
  const pub = publicView(full);
  const mine = full.players[player];
  if (!mine) return pub;
  return { ...pub, players: { ...pub.players, [player]: mine }, lastDrawnTileId: full.currentTurn === player ? full.lastDrawnTileId : null };
}

const turnKey = (s: RummyGameState) => `${s.round}|${s.currentTurn}|${s.hasDrawn}|${s.status}`;

export async function handleOkey(deps: OkeyDeps, input: unknown): Promise<OkeyReply> {
  const now = deps.now ? deps.now() : Date.now();
  const b = (input ?? {}) as { code?: unknown; player?: unknown; secret?: unknown; action?: OkeyAction };
  const code = typeof b.code === 'string' && /^\d{4}$/.test(b.code) ? b.code : '';
  const player = typeof b.player === 'string' ? b.player.slice(0, 64) : '';
  const secret = typeof b.secret === 'string' ? b.secret.slice(0, 128) : '';
  const a = b.action;
  const types = ['view', 'start', 'draw', 'discard', 'finish', 'tick', 'next', 'sync'];
  if (!code || !player || !a || !types.includes(a.type)) return { status: 400, body: { ok: false, reason: 'bad_request' } };
  if (!(await deps.auth(player, secret, code))) return { status: 403, body: { ok: false, reason: 'not_allowed' } };

  const room = await deps.load(code);
  if (!room || room.game_type !== 'rummy') return { status: 404, body: { ok: false, reason: 'no_room' } };
  const full = room.full && isTileRummyState(room.full) ? room.full : null;

  const commit = async (next: FullState, status?: string, prev: number | null = full ? full.rev : null): Promise<OkeyReply> => {
    const stamped: FullState = { ...next, turnStartedAt: !full || turnKey(full) !== turnKey(next) ? now : full.turnStartedAt ?? now };
    if (!(await deps.save(code, stamped, publicView(stamped), prev, status))) {
      const latest = await deps.load(code);
      const lf = latest?.full && isTileRummyState(latest.full) ? latest.full : null;
      return { status: 409, body: { ok: false, reason: 'stale', state: lf ? viewFor(lf, player) : undefined } };
    }
    return { status: 200, body: { ok: true, state: viewFor(stamped, player) } };
  };
  const refuse = (reason: string, status = 409): OkeyReply => ({ status, body: { ok: false, reason, state: full ? viewFor(full, player) : undefined } });

  /* nis lojën (edhe "Luaj përsëri") */
  if (a.type === 'start') {
    if (room.status === 'playing' && full && full.status !== 'finished') return refuse('already_playing');
    const seated = (await deps.players(code)).filter((p) => !p.player_id.startsWith('BOT'));
    if (seated.length === 0) return refuse('empty');
    const fresh = initRummyGame(seated.map((p) => ({ id: p.player_id, nickname: p.nickname })));
    return commit({ ...fresh, rev: (full?.rev ?? 0) + 1 }, 'playing', null);
  }

  if (!full || room.status !== 'playing') return refuse('not_playing');
  if (a.type === 'view') return { status: 200, body: { ok: true, state: viewFor(full, player) } };
  const rev = full.rev;
  const step = (next: RummyGameState) => (next === full ? refuse('invalid_move') : commit({ ...next, rev: rev + 1 }));

  switch (a.type) {
    case 'draw': {
      if (full.currentTurn !== player) return refuse('not_your_turn');
      if (a.from !== 'deck' && a.from !== 'left') return refuse('bad_request', 400);
      return step(drawRummyTile(full, player, a.from));
    }
    case 'discard': {
      if (full.currentTurn !== player) return refuse('not_your_turn');
      const tile = full.players[player]?.hand.find((t) => t.id === a.tile);
      if (tile?.isJoker) return refuse('joker');
      return step(discardRummyTile(full, player, String(a.tile)));
    }
    case 'finish': {
      if (full.currentTurn !== player) return refuse('not_your_turn');
      const r = finishRummyRound(full, player, String(a.tile));
      if (r.error) return refuse('cannot_finish');
      return step(r.state);
    }
    case 'next': {
      if (full.status !== 'roundOver') return refuse('not_round_over');
      return step(startNextRound(full));
    }
    case 'sync': {
      if (player !== room.host_id) return refuse('host_only', 403);
      const synced = syncSeats('rummy', full, await deps.players(code)) as RummyGameState | null;
      return synced ? commit({ ...synced, rev: rev + 1 }) : { status: 200, body: { ok: true, state: viewFor(full, player) } };
    }
    case 'tick': {
      // ora e serverit vendos: boti luan, koha mbaroi, apo fillon raundi tjetër
      const since = now - (full.turnStartedAt ?? now);
      if (full.status === 'playing' && isRummyBot(full.currentTurn) && since >= BOT_MS) {
        let next = runBotRummyTurn(full);
        if (next === full) next = autoPlayTurn(full);
        return step(next);
      }
      if (full.status === 'playing' && !isRummyBot(full.currentTurn) && since >= TURN_MS) return step(autoPlayTurn(full));
      if (full.status === 'roundOver' && since >= NEXT_ROUND_MS) return step(startNextRound(full));
      return { status: 200, body: { ok: true, state: viewFor(full, player) } };
    }
  }
  return refuse('bad_request', 400);
}
