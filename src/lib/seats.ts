// Vendet në tavolinë për Ludo dhe Rummy: lojtari që largohet zëvendësohet nga boti,
// lojtari i ri zë vendin e botit (ose një vend të lirë në Ludo) pa e rifilluar lojën.
import {
  LudoGameState, normalizeLudoState, isLudoBot, botifyLudoSeat, replaceLudoSeat, addLudoSeat, LUDO_SEATS,
} from './ludoLogic';
import { RummyGameState, isTileRummyState, isRummyBot, botifyRummySeat, replaceRummySeat } from './rummyLogic';

export const SEAT_GAMES = ['ludo', 'rummy'];

type RoomPlayer = { player_id: string; nickname: string };

export function syncSeats(gameType: string, state: unknown, roomPlayers: RoomPlayer[]): LudoGameState | RummyGameState | null {
  const inRoom = new Set(roomPlayers.map((p) => p.player_id));

  if (gameType === 'ludo' && state) {
    const start = normalizeLudoState(state as LudoGameState);
    let s = start;
    s.playerOrder.filter((id) => !isLudoBot(id) && !inRoom.has(id)).forEach((id) => { s = botifyLudoSeat(s, id); });
    for (const p of roomPlayers) {
      if (s.players[p.player_id]) continue;
      const bot = s.playerOrder.find(isLudoBot);
      s = bot ? replaceLudoSeat(s, bot, p.player_id, p.nickname) : addLudoSeat(s, p.player_id, p.nickname);
    }
    return s === start ? null : { ...s, rev: (start.rev ?? 0) + 1 };
  }

  if (gameType === 'rummy' && isTileRummyState(state)) {
    let s = state;
    s.playerOrder.filter((id) => !isRummyBot(id) && !inRoom.has(id)).forEach((id) => { s = botifyRummySeat(s, id); });
    for (const p of roomPlayers) {
      if (s.players[p.player_id]) continue;
      const bot = s.playerOrder.find(isRummyBot);
      if (bot) s = replaceRummySeat(s, bot, p.player_id, p.nickname);
    }
    return s === state ? null : { ...s, rev: state.rev + 1 };
  }
  return null;
}

// A ka vend për një lojtar të ri në lojën që po luhet?
export function hasFreeSeat(gameType: string, state: unknown): boolean {
  if (gameType === 'ludo' && state) {
    const s = state as LudoGameState;
    if (!Array.isArray(s.playerOrder)) return false;
    return s.playerOrder.length < LUDO_SEATS || s.playerOrder.some(isLudoBot);
  }
  if (gameType === 'rummy') return isTileRummyState(state) && state.playerOrder.some(isRummyBot);
  return false;
}
