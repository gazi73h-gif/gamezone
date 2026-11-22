export type TileColor = 'red' | 'blue' | 'black' | 'orange';
export interface RummyTile { id: string; number: number; color: TileColor; isJoker?: boolean; }
export interface RummyMeld { id: string; ownerName: string; tiles: RummyTile[]; type: 'group' | 'run'; }
export interface RummyPlayer { id: string; nickname: string; hand: RummyTile[]; hasOpened: boolean; }
export interface RummyGameState {
  deck: RummyTile[];
  discardPile: RummyTile[];
  indicatorTile?: RummyTile;
  jokerNumber?: number;
  jokerColor?: TileColor;
  melds: RummyMeld[];
  players: Record<string, RummyPlayer>;
  playerOrder: string[];
  currentTurn: string;
  hasDrawn: boolean;
  lastDrawnTileId?: string | null;
  status: 'playing' | 'finished';
  winnerId: string | null;
  winnerName: string | null;
  lastActionText: string;
}

export function createRummyDeck(): RummyTile[] {
  const colors: TileColor[] = Array.of('red', 'blue', 'black', 'orange');
  const deck: RummyTile[] = Array.of();
  let uid = 1;
  for (let copy = 0; copy < 2; copy++) {
    for (const color of colors) {
      for (let num = 1; num <= 13; num++) deck.push({ id: `t_${uid++}`, number: num, color });
    }
  }
  deck.push({ id: `t_${uid++}`, number: 0, color: 'red', isJoker: true });
  deck.push({ id: `t_${uid++}`, number: 0, color: 'black', isJoker: true });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp; }
  return deck;
}
export function validateMeld(tiles: RummyTile[]): { valid: boolean; type?: 'group' | 'run'; points: number; sorted?: RummyTile[] } {
  if (tiles.length < 3) return { valid: false, points: 0 };
  const nonJokers = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);
  if (nonJokers.length === 0) return { valid: false, points: 0 };

  // 1. Kontrollo Grup (p.sh. 7-7-7 me ngjyra te ndryshme, max 4 gure)
  const firstNum = nonJokers.at(0)!.number;
  if (tiles.length <= 4 && nonJokers.every((t) => t.number === firstNum)) {
    const uniqueColors = new Set(nonJokers.map((t) => t.color));
    if (uniqueColors.size === nonJokers.length) {
      return { valid: true, type: 'group', points: firstNum * tiles.length, sorted: tiles };
    }
  }

  // 2. Kontrollo Seri (p.sh. 4-5-6-7 te se njejtes ngjyre)
  const firstColor = nonJokers.at(0)!.color;
  if (nonJokers.every((t) => t.color === firstColor)) {
    const sorted = nonJokers.slice().sort((a, b) => a.number - b.number);
    let neededJokers = 0;
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i].number - sorted[i - 1].number;
      if (diff === 0) return { valid: false, points: 0 };
      neededJokers += diff - 1;
    }
    if (neededJokers <= jokers.length) {
      const rem = jokers.length - neededJokers;
      let startVal = sorted.at(0)!.number;
      let endVal = sorted.at(-1)!.number;
      let extraBefore = Math.min(rem, startVal - 1);
      startVal -= extraBefore;
      endVal += rem - extraBefore;
      if (endVal <= 13) {
        let pts = 0;
        for (let v = startVal; v <= endVal; v++) pts += v;
        const arranged: RummyTile[] = Array.of();
        const jPool = jokers.slice();
        for (let x = 0; x < extraBefore; x++) arranged.push(jPool.pop()!);
        for (let i = 0; i < sorted.length; i++) {
          if (i > 0) for (let g = 1; g < sorted[i].number - sorted[i - 1].number; g++) arranged.push(jPool.pop()!);
          arranged.push(sorted[i]);
        }
        while (jPool.length > 0) arranged.push(jPool.pop()!);
        return { valid: true, type: 'run', points: pts, sorted: arranged };
      }
    }
  }
  return { valid: false, points: 0 };
}

export function initRummyGame(players: { id: string; nickname: string }[]): RummyGameState {
  const deck = createRummyDeck();
  const list = players.length >= 2 ? players.slice(0, 4) : Array.of(players.at(0) || { id: 'p1', nickname: 'Lojtari 1' }, { id: 'BOT_RUMMY', nickname: '🤖 Bot Rummy' });
  const indicator = deck.pop()!;
  const jokerNumber = indicator.isJoker ? 1 : indicator.number === 13 ? 1 : indicator.number + 1;
  const jokerColor = indicator.color;
  deck.forEach((t) => { if (!t.isJoker && t.number === jokerNumber && t.color === jokerColor) t.isJoker = true; });
  const playersMap: Record<string, RummyPlayer> = {};
  const order: string[] = Array.of();
  list.forEach((pl, idx) => {
    order.push(pl.id);
    playersMap[pl.id] = { id: pl.id, nickname: pl.nickname, hand: deck.splice(0, idx === 0 ? 15 : 14), hasOpened: false };
  });
  return {
    deck,
    discardPile: Array.of(), indicatorTile: indicator, jokerNumber, jokerColor,
    melds: Array.of(),
    players: playersMap,
    playerOrder: order,
    currentTurn: order.at(0)!,
    hasDrawn: true,
    lastDrawnTileId: drawn.id,
    status: 'playing',
    winnerId: null,
    winnerName: null,
    lastActionText: `${list.at(0)!.nickname} ka 15 gurë dhe fillon lojën!`,
  };
}
export const BOT_RUMMY_ID = 'BOT_RUMMY';

export function drawRummyTile(state: RummyGameState, playerId: string, source: 'deck' | 'discard'): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.hasDrawn) return state;
  const p = state.players[playerId];
  if (!p) return state;
  const deck = state.deck.slice();
  const discard = state.discardPile.slice();
  let drawn: RummyTile | undefined;
  if (source === 'discard' && discard.length > 0) drawn = discard.pop();
  else if (deck.length > 0) drawn = deck.pop();
  if (!drawn) return state;
  return {
    ...state,
    deck,
    discardPile: discard,
    hasDrawn: true,
    lastDrawnTileId: drawn.id,
    players: { ...state.players, [playerId]: { ...p, hand: p.hand.concat(drawn) } },
    lastActionText: `${p.nickname} tërhoqi një gur ${source === 'discard' ? 'nga hedhja' : 'nga pakoja'}.`,
  };
}

export function playRummyMeld(state: RummyGameState, playerId: string, tileIds: string[]): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Tërhiq një gur fillimisht!' };
  const p = state.players[playerId];
  if (!p) return { state };
  const selected = p.hand.filter((t) => tileIds.includes(t.id));
  const check = validateMeld(selected);
  if (!check.valid || !check.type) return { state, error: 'Kombinim i pavlefshëm! Duhen min. 3 gurë (seri 4-5-6 ose grup 7-7-7).' };
  const remHand = p.hand.filter((t) => !tileIds.includes(t.id));
  if (remHand.length === 0) return { state, error: 'Duhet të të mbetet 1 gur për ta hedhur dhe mbyllur!' };
  const newMeld: RummyMeld = { id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ownerName: p.nickname, tiles: check.sorted || selected, type: check.type };
  return {
    state: {
      ...state,
      melds: state.melds.concat(newMeld),
      players: { ...state.players, [playerId]: { ...p, hand: remHand, hasOpened: true } },
      lastActionText: `✨ ${p.nickname} hapi ${check.type === 'run' ? 'një seri' : 'një grup'} (${check.points} pikë)!`,
    },
  };
}

export function addToRummyMeld(state: RummyGameState, playerId: string, tileIds: string[], meldId: string): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Tërhiq një gur fillimisht!' };
  const p = state.players[playerId];
  const meld = state.melds.find((m) => m.id === meldId);
  if (!p || !meld) return { state };
  if (!p.hasOpened) return { state, error: 'Duhet të hapësh një kombinim tëndin përpara se të shtosh te të tjerët!' };
  const selected = p.hand.filter((t) => tileIds.includes(t.id));
  if (selected.length === 0) return { state, error: 'Zgjidh gurët që do të shtosh!' };
  const check = validateMeld(meld.tiles.concat(selected));
  if (!check.valid) return { state, error: 'Këta gurë nuk përshtaten me këtë kombinim!' };
  const remHand = p.hand.filter((t) => !tileIds.includes(t.id));
  if (remHand.length === 0) return { state, error: 'Duhet të të mbetet 1 gur për ta hedhur dhe mbyllur!' };
  return {
    state: {
      ...state,
      melds: state.melds.map((m) => (m.id === meldId ? { ...m, tiles: check.sorted || meld.tiles.concat(selected) } : m)),
      players: { ...state.players, [playerId]: { ...p, hand: remHand } },
      lastActionText: `➕ ${p.nickname} shtoi ${selected.length} gur(ë) në tavolinë!`,
    },
  };
}

export function discardRummyTile(state: RummyGameState, playerId: string, tileId: string): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return state;
  const p = state.players[playerId];
  const tile = p?.hand.find((t) => t.id === tileId);
  if (!p || !tile) return state;
  const remHand = p.hand.filter((t) => t.id !== tileId);
  const nextDiscard = state.discardPile.concat(tile);
  if (remHand.length === 0) {
    return { ...state, discardPile: nextDiscard, players: { ...state.players, [playerId]: { ...p, hand: Array.of() } }, status: 'finished', winnerId: playerId, winnerName: p.nickname, lastActionText: `👑 JOL! ${p.nickname} mbylli lojën dhe fitoi (+150 pikë)!` };
  }
  const idx = state.playerOrder.indexOf(playerId);
  const nextId = state.playerOrder.at((idx + 1) % state.playerOrder.length)!;
  let deck = state.deck.slice();
  let discard = nextDiscard;
  if (deck.length === 0 && discard.length > 1) {
    const top = discard.pop()!;
    deck = discard.reverse();
    discard = Array.of(top);
  }
  return {
    ...state,
    deck,
    discardPile: discard,
    players: { ...state.players, [playerId]: { ...p, hand: remHand } },
    currentTurn: nextId,
    hasDrawn: false,
    lastDrawnTileId: null,
    lastActionText: `${p.nickname} hodhi ${tile.isJoker ? 'Xholin' : tile.number}. Radha e ${state.players[nextId]?.nickname}!`,
  };
}

export function runBotRummyTurn(state: RummyGameState): RummyGameState {
  let s = state;
  const botId = s.currentTurn;
  if (!s.hasDrawn) s = drawRummyTile(s, botId, 'deck');
  const bot = s.players[botId];
  if (!bot) return s;
  const byNum: Record<number, RummyTile[]> = {};
  bot.hand.filter((t) => !t.isJoker).forEach((t) => { if (!byNum[t.number]) byNum[t.number] = Array.of(); if (!byNum[t.number].some((x) => x.color === t.color)) byNum[t.number].push(t); });
  for (const grp of Object.values(byNum)) {
    if (grp.length >= 3 && s.players[botId].hand.length - grp.length >= 1) {
      const res = playRummyMeld(s, botId, grp.map((x) => x.id));
      if (!res.error) s = res.state;
    }
  }
  const curHand = s.players[botId].hand.slice().sort((a, b) => (a.isJoker ? -1 : b.isJoker ? 1 : b.number - a.number));
  const toDrop = curHand.find((t) => !t.isJoker) || curHand.at(0);
  return toDrop ? discardRummyTile(s, botId, toDrop.id) : s;
}