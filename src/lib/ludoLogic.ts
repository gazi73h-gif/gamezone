export type LudoColor = 'red' | 'blue' | 'yellow' | 'green';

export interface LudoPlayer {
  id: string;
  nickname: string;
  color: LudoColor;
  tokens: number[]; // -1 = bazë, 0..50 = rruga kryesore (relative), 51..55 = shtegu i shtëpisë, 56 = në shtëpi
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
  gameId?: number; // ndryshon me çdo lojë të re
  rev?: number; // rritet me çdo ruajtje, që të injorohen përgjigjet e vjetra nga serveri
  v?: number; // 2 = rruga pa fushën e tepërt para shtëpisë
}

export const LAST_MAIN = 50; // fusha e fundit e rrugës kryesore, para kthesës në shtëpi
export const FINISH = 56;

// Lojërat e nisura me versionin e vjetër kishin një fushë më shumë (52..57); i kthen në numërimin e ri
export function normalizeLudoState(state: LudoGameState): LudoGameState {
  if (state.v === 2) return state;
  const players: Record<string, LudoPlayer> = {};
  Object.entries(state.players).forEach(([id, p]) => {
    players[id] = { ...p, tokens: p.tokens.map((t) => (t > LAST_MAIN + 1 ? t - 1 : t)) };
  });
  return { ...state, players, v: 2 };
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
  if (relPos < 0 || relPos > LAST_MAIN) return -1;
  return (relPos + START_OFFSETS[color]) % 52;
}

export function initLudoGame(
  playersList: { id: string; nickname: string }[]
): LudoGameState {
  // Nëse ka vetëm 1 lojtar real, shto Bot-in automatikisht
  const rawList =
    playersList.length < 2
      ? [playersList[0], { id: 'BOT_LUDO_blue', nickname: '🤖 Bot' }]
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
    gameId: Date.now(),
    rev: 0,
    v: 2,
    winnerId: null,
    lastActionText: `Loja filloi! Hedh zarin ${players[firstId]?.nickname || ''}.`,
  };
}

export function getMovableTokenIndices(player: LudoPlayer, dice: number): number[] {
  const indices: number[] = [];
  player.tokens.forEach((pos, idx) => {
    if (pos === -1 && dice === 6) {
      indices.push(idx);
    } else if (pos >= 0 && pos < FINISH && pos + dice <= FINISH) {
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
  if (newPos === FINISH) reachedHome = true;

  // Kontrollo ngrenien e kundershtarit nese eshte ne rrugen kryesore (0..50) dhe jo ne kuti te sigurt
  if (newPos >= 0 && newPos <= LAST_MAIN) {
    const myGlobal = toGlobalPos(me.color, newPos);
    if (!SAFE_GLOBAL_CELLS.includes(myGlobal)) {
      Object.values(updatedPlayers).forEach((other) => {
        if (other.id === playerId) return;
        other.tokens = other.tokens.map((otherPos) => {
          if (otherPos >= 0 && otherPos <= LAST_MAIN) {
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

  // Kontrollo fitoren (të 4 gurët në shtëpi)
  if (me.tokens.every((t) => t === FINISH)) {
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

// Hedh zarin dhe, kur s'ka çka të zgjidhet, e lëviz gurin në të njëjtën ruajtje
export function rollAndAutoMove(state: LudoGameState, playerId: string): LudoGameState {
  const rolled = rollLudoDice(state, playerId);
  if (rolled === state || !rolled.hasRolled || rolled.diceValue === null) return rolled;

  const player = rolled.players[playerId];
  const movable = getMovableTokenIndices(player, rolled.diceValue);
  // Gurët në të njëjtin vend (p.sh. të gjithë në bazë) janë e njëjta lëvizje
  const choices = new Set(movable.map((i) => player.tokens[i]));
  return choices.size === 1 ? moveLudoToken(rolled, playerId, movable[0]) : rolled;
}

/* ───────────── vendet: hyrja dhe largimi i lojtarëve ───────────── */

export const isLudoBot = (id: string) => id.startsWith('BOT_LUDO');
export const LUDO_SEATS = 4;

// Lojtari i ri merr vendin (ngjyrën dhe figurat) e lojtarit/botit që largohet
export function replaceLudoSeat(state: LudoGameState, oldId: string, newId: string, nickname: string): LudoGameState {
  const old = state.players[oldId];
  if (!old || state.players[newId]) return state;
  const swap = (id: string | null) => (id === oldId ? newId : id);
  const players: Record<string, LudoPlayer> = {};
  state.playerOrder.forEach((id) => {
    players[swap(id)!] = id === oldId ? { ...old, id: newId, nickname } : state.players[id];
  });
  return {
    ...state,
    players,
    playerOrder: state.playerOrder.map((id) => swap(id)!),
    currentTurn: swap(state.currentTurn)!,
    winnerId: swap(state.winnerId),
    lastActionText: `👋 ${nickname} zuri vendin e ${old.nickname}.`,
  };
}

// Lojtari i ri merr një ngjyrë të lirë; të tjerët i ruajnë figurat dhe radhën
export function addLudoSeat(state: LudoGameState, id: string, nickname: string): LudoGameState {
  if (state.players[id] || state.playerOrder.length >= LUDO_SEATS) return state;
  const used = new Set(Object.values(state.players).map((p) => p.color));
  const color = COLORS_ORDER.find((c) => !used.has(c));
  if (!color) return state;
  const players = { ...state.players, [id]: { id, nickname, color, tokens: [-1, -1, -1, -1] } };
  const playerOrder = [...state.playerOrder, id].sort(
    (a, b) => COLORS_ORDER.indexOf(players[a].color) - COLORS_ORDER.indexOf(players[b].color)
  );
  return { ...state, players, playerOrder, lastActionText: `👋 ${nickname} u bashkua në lojë!` };
}

// Kur lojtari largohet, boti vazhdon me figurat e tij derisa të vijë dikush tjetër
export function botifyLudoSeat(state: LudoGameState, id: string): LudoGameState {
  const p = state.players[id];
  if (!p || isLudoBot(id)) return state;
  const next = replaceLudoSeat(state, id, `BOT_LUDO_${p.color}`, '🤖 Bot');
  return { ...next, lastActionText: `${p.nickname} doli — boti luan në vend të tij.` };
}

// Renditja: fituesi, pastaj sipas gurëve në shtëpi dhe rrugës së bërë
export function ludoStandings(state: LudoGameState) {
  return state.playerOrder
    .map((id) => {
      const p = state.players[id];
      const home = p.tokens.filter((t) => t === FINISH).length;
      const progress = p.tokens.reduce((s, t) => s + Math.max(t + 1, 0), 0);
      return { id, nickname: p.nickname, color: p.color, home, progress };
    })
    .sort((a, b) =>
      Number(b.id === state.winnerId) - Number(a.id === state.winnerId) || b.home - a.home || b.progress - a.progress);
}
