export type LudoColor = 'red' | 'blue' | 'yellow' | 'green';

export interface LudoPlayer {
  id: string;
  nickname: string;
  color: LudoColor;
  tokens: number[]; // -1 = baze, 0..51 = rruga kryesore (relative), 52..56 = shtegu i shtepise, 57 = ne shtepi
}

export interface LudoGameState {
  players: Record<string, LudoPlayer>;
  playerOrder: string[];
  currentTurn: string;
  diceValue: number | null;
  hasRolled: boolean;
  consecutiveSixes: number;
  status: 'playing' | 'finished';
  winnerId: string | null;
  lastActionText: string;
}

const COLORS_ORDER: LudoColor[] = ['red', 'blue', 'yellow', 'green'];

const START_OFFSETS: Record<LudoColor, number> = {
  red: 0,
  blue: 13,
  yellow: 26,
  green: 39,
};

// Kutite e sigurta ne rrugen globale 0..51 (daljet + yjet)
export const SAFE_GLOBAL_CELLS: number[] = Array.of(0, 8, 13, 21, 26, 34, 39, 47);

export function toGlobalPos(color: LudoColor, relPos: number): number {
  if (relPos < 0 || relPos > 51) return -1;
  return (relPos + START_OFFSETS[color]) % 52;
}

export function initLudoGame(
  playersList: { id: string; nickname: string }[]
): LudoGameState {
  // Nëse ka vetëm 1 lojtar real, shto Bot-in automatikisht
  const rawList =
    playersList.length < 2
      ? [playersList[0], { id: 'BOT_LUDO', nickname: '🤖 Bot Ludo' }]
      : playersList;
  const limited = rawList.slice(0, 4);
  const players: Record<string, LudoPlayer> = {};
  const playerOrder: string[] = [];

  limited.forEach((p, idx) => {
    const color = COLORS_ORDER[idx];
    players[p.id] = {
      id: p.id,
      nickname: p.nickname,
      color,
      tokens: [-1, -1, -1, -1],
    };
    playerOrder.push(p.id);
  });

  const firstId = playerOrder[0];
  return {
    players,
    playerOrder,
    currentTurn: firstId,
    diceValue: null,
    hasRolled: false,
    consecutiveSixes: 0,
    status: 'playing',
    winnerId: null,
    lastActionText: `Loja filloi! Hedh zarin ${players[firstId]?.nickname || ''}.`,
  };
}

export function getMovableTokenIndices(player: LudoPlayer, dice: number): number[] {
  const indices: number[] = [];
  player.tokens.forEach((pos, idx) => {
    if (pos === -1 && dice === 6) {
      indices.push(idx);
    } else if (pos >= 0 && pos < 57 && pos + dice <= 57) {
      indices.push(idx);
    }
  });
  return indices;
}

function getNextTurnId(state: LudoGameState, currentId: string): string {
  const idx = state.playerOrder.indexOf(currentId);
  return state.playerOrder[(idx + 1) % state.playerOrder.length];
}

export function rollLudoDice(
  state: LudoGameState,
  playerId: string
): LudoGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.hasRolled) {
    return state;
  }

  const dice = Math.floor(Math.random() * 6) + 1;
  const player = state.players[playerId];
  const newSixes = dice === 6 ? state.consecutiveSixes + 1 : 0;

  // Tre 6-she radhazi djegin radhen
  if (newSixes >= 3) {
    const nextId = getNextTurnId(state, playerId);
    return {
      ...state,
      diceValue: dice,
      hasRolled: false,
      consecutiveSixes: 0,
      currentTurn: nextId,
      lastActionText: `${player.nickname} hodhi tre 6-she radhazi! Radha kalon te ${state.players[nextId].nickname}.`,
    };
  }

  const movable = getMovableTokenIndices(player, dice);

  if (movable.length === 0) {
    const nextId = getNextTurnId(state, playerId);
    return {
      ...state,
      diceValue: dice,
      hasRolled: false,
      consecutiveSixes: 0,
      currentTurn: nextId,
      lastActionText: `${player.nickname} hodhi ${dice}, s'ka lëvizje. Radha e ${state.players[nextId].nickname}.`,
    };
  }

  return {
    ...state,
    diceValue: dice,
    hasRolled: true,
    consecutiveSixes: newSixes,
    lastActionText: `${player.nickname} hodhi ${dice}! Zgjidh një gur për ta lëvizur.`,
  };
}

export function moveLudoToken(
  state: LudoGameState,
  playerId: string,
  tokenIndex: number
): LudoGameState {
  if (
    state.status !== 'playing' ||
    state.currentTurn !== playerId ||
    !state.hasRolled ||
    state.diceValue === null
  ) {
    return state;
  }

  const dice = state.diceValue;
  const player = state.players[playerId];
  const movable = getMovableTokenIndices(player, dice);
  if (!movable.includes(tokenIndex)) return state;

  const updatedPlayers: Record<string, LudoPlayer> = {};
  Object.keys(state.players).forEach((id) => {
    updatedPlayers[id] = {
      ...state.players[id],
      tokens: [...state.players[id].tokens],
    };
  });

  const me = updatedPlayers[playerId];
  const currentPos = me.tokens[tokenIndex];
  let newPos = currentPos;
  let capturedSomeone = false;
  let reachedHome = false;

  if (currentPos === -1 && dice === 6) {
    newPos = 0;
  } else {
    newPos = currentPos + dice;
  }

  me.tokens[tokenIndex] = newPos;
  if (newPos === 57) reachedHome = true;

  // Kontrollo ngrenien e kundershtarit nese eshte ne rrugen kryesore (0..50) dhe jo ne kuti te sigurt
  if (newPos >= 0 && newPos <= 50) {
    const myGlobal = toGlobalPos(me.color, newPos);
    if (!SAFE_GLOBAL_CELLS.includes(myGlobal)) {
      Object.values(updatedPlayers).forEach((other) => {
        if (other.id === playerId) return;
        other.tokens = other.tokens.map((otherPos) => {
          if (otherPos >= 0 && otherPos <= 50) {
            const otherGlobal = toGlobalPos(other.color, otherPos);
            if (otherGlobal === myGlobal) {
              capturedSomeone = true;
              return -1;
            }
          }
          return otherPos;
        });
      });
    }
  }

  // Kontrollo fitoren (te 4 guret ne 57)
  if (me.tokens.every((t) => t === 57)) {
    return {
      ...state,
      players: updatedPlayers,
      hasRolled: false,
      status: 'finished',
      winnerId: playerId,
      lastActionText: `🏆 ${me.nickname} futi të 4 gurët në shtëpi dhe fitoi lojën!`,
    };
  }

  // Bonus hedhje nese hodhi 6, hengri kundershtarin, ose futi gur ne shtepi
  const getsBonusRoll = dice === 6 || capturedSomeone || reachedHome;
  const nextTurnId = getsBonusRoll ? playerId : getNextTurnId(state, playerId);

  let actionMsg = `${me.nickname} lëvizi gurin (+${dice}).`;
  if (capturedSomeone) actionMsg = `💥 ${me.nickname} hëngri një gur dhe fitoi hedhje bonus!`;
  else if (reachedHome) actionMsg = `🏠 ${me.nickname} futi një gur në shtëpi dhe fitoi hedhje bonus!`;
  else if (dice === 6) actionMsg = `🎲 ${me.nickname} hodhi 6 dhe ka përsëri radhën!`;
  else actionMsg += ` Radha e ${updatedPlayers[nextTurnId].nickname}.`;

  return {
    ...state,
    players: updatedPlayers,
    currentTurn: nextTurnId,
    hasRolled: false,
    consecutiveSixes: dice === 6 ? state.consecutiveSixes : 0,
    lastActionText: actionMsg,
  };
}

