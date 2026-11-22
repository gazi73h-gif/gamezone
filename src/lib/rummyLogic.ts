export type Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs';
export interface RummyTile { id: string; number: number; suit: Suit; isJoker?: boolean; }
export interface RummyMeld { id: string; ownerName: string; tiles: RummyTile[]; type: 'group' | 'run'; }
export interface RummyPlayer { id: string; nickname: string; hand: RummyTile[]; hasOpened: boolean; }
export interface RummyGameState { deck: RummyTile[]; discardPile: RummyTile[]; melds: RummyMeld[]; players: Record<string, RummyPlayer>; playerOrder: string[]; currentTurn: string; hasDrawn: boolean; lastDrawnTileId?: string | null; status: 'playing' | 'finished'; winnerId: string | null; winnerName: string | null; lastActionText: string; }
export const BOT_RUMMY_ID = 'BOT_RUMMY';

export function createRummyDeck(): RummyTile[] {
  const suits: Suit[] = Array.of('hearts', 'diamonds', 'spades', 'clubs');
  const deck: RummyTile[] = Array.of();
  let uid = 1;
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of suits) for (let num = 1; num <= 13; num++) deck.push({ id: `c_${uid++}`, number: num, suit });
    deck.push({ id: `c_${uid++}`, number: 0, suit: 'hearts', isJoker: true });
    deck.push({ id: `c_${uid++}`, number: 0, suit: 'spades', isJoker: true });
  }
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
  return deck;
}

export function validateMeld(tiles: RummyTile[]): { valid: boolean; type?: 'group' | 'run'; points: number; sorted?: RummyTile[] } {
  if (tiles.length < 3) return { valid: false, points: 0 };
  const nonJ = tiles.filter((t) => !t.isJoker); const jokers = tiles.filter((t) => t.isJoker);
  if (nonJ.length === 0) return { valid: false, points: 0 };
  const n0 = nonJ.at(0)!.number;
  if (tiles.length <= 4 && nonJ.every((t) => t.number === n0) && new Set(nonJ.map((t) => t.suit)).size === nonJ.length) {
    return { valid: true, type: 'group', points: (n0 === 1 ? 11 : Math.min(n0, 10)) * tiles.length, sorted: tiles };
  }
  const s0 = nonJ.at(0)!.suit;
  if (nonJ.every((t) => t.suit === s0)) {
    const sorted = nonJ.slice().sort((a, b) => a.number - b.number);
    let need = 0;
    for (let i = 1; i < sorted.length; i++) { const d = sorted[i].number - sorted[i - 1].number; if (d === 0) return { valid: false, points: 0 }; need += d - 1; }
    if (need <= jokers.length) {
      const rem = jokers.length - need; let st = sorted.at(0)!.number; let en = sorted.at(-1)!.number;
      const eb = Math.min(rem, st - 1); st -= eb; en += rem - eb;
      if (en <= 13) {
        const arr: RummyTile[] = Array.of(); const jp = jokers.slice();
        for (let x = 0; x < eb; x++) arr.push(jp.pop()!);
        for (let i = 0; i < sorted.length; i++) { if (i > 0) for (let g = 1; g < sorted[i].number - sorted[i - 1].number; g++) arr.push(jp.pop()!); arr.push(sorted[i]); }
        while (jp.length > 0) arr.push(jp.pop()!);
        return { valid: true, type: 'run', points: tiles.length * 10, sorted: arr };
      }
    }
  }
  return { valid: false, points: 0 };
}

export function initRummyGame(players: { id: string; nickname: string }[]): RummyGameState {
  const deck = createRummyDeck();
  const list = players.length >= 2 ? players.slice(0, 4) : Array.of(players.at(0) || { id: 'p1', nickname: 'Lojtari 1' }, { id: 'BOT_RUMMY', nickname: '🤖 Bot Rummy' });
  const map: Record<string, RummyPlayer> = {}; const order: string[] = Array.of();
  list.forEach((pl, idx) => { order.push(pl.id); map[pl.id] = { id: pl.id, nickname: pl.nickname, hand: deck.splice(0, idx === 0 ? 15 : 14), hasOpened: false }; });
  return { deck, discardPile: Array.of(), melds: Array.of(), players: map, playerOrder: order, currentTurn: order.at(0)!, hasDrawn: true, lastDrawnTileId: null, status: 'playing', winnerId: null, winnerName: null, lastActionText: `${list.at(0)!.nickname} ka 15 letra dhe fillon lojën!` };
}

export function drawRummyTile(state: RummyGameState, playerId: string, source: 'deck' | 'discard'): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.hasDrawn) return state;
  const p = state.players[playerId]; if (!p) return state;
  const deck = state.deck.slice(); const discard = state.discardPile.slice();
  const drawn = source === 'discard' && discard.length > 0 ? discard.pop() : deck.pop();
  if (!drawn) return state;
  return { ...state, deck, discardPile: discard, hasDrawn: true, lastDrawnTileId: drawn.id, players: { ...state.players, [playerId]: { ...p, hand: p.hand.concat(drawn) } }, lastActionText: `${p.nickname} tërhoqi një letër.` };
}

export function playRummyMeld(state: RummyGameState, playerId: string, tileIds: string[]): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Tërhiq një letër fillimisht!' };
  const p = state.players[playerId]; if (!p) return { state };
  const sel = p.hand.filter((t) => tileIds.includes(t.id));
  const chk = validateMeld(sel);
  if (!chk.valid || !chk.type) return { state, error: 'Kombinim i pavlefshëm! Duhen min. 3 letra.' };
  const rem = p.hand.filter((t) => !tileIds.includes(t.id));
  if (rem.length === 0) return { state, error: 'Duhet të të mbetet 1 letër për ta hedhur!' };
  return { state: { ...state, melds: state.melds.concat({ id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ownerName: p.nickname, tiles: chk.sorted || sel, type: chk.type }), players: { ...state.players, [playerId]: { ...p, hand: rem, hasOpened: true } }, lastActionText: `✨ ${p.nickname} hapi një kombinim!` } };
}

export function addToRummyMeld(state: RummyGameState, playerId: string, tileIds: string[], meldId: string): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Tërhiq një letër fillimisht!' };
  const p = state.players[playerId]; const meld = state.melds.find((m) => m.id === meldId);
  if (!p || !meld) return { state };
  if (!p.hasOpened) return { state, error: 'Hap një kombinim tëndin fillimisht!' };
  const sel = p.hand.filter((t) => tileIds.includes(t.id));
  const chk = validateMeld(meld.tiles.concat(sel));
  if (!chk.valid) return { state, error: 'Nuk përshtaten me këtë kombinim!' };
  const rem = p.hand.filter((t) => !tileIds.includes(t.id));
  if (rem.length === 0) return { state, error: 'Duhet të të mbetet 1 letër për ta hedhur!' };
  return { state: { ...state, melds: state.melds.map((m) => (m.id === meldId ? { ...m, tiles: chk.sorted || meld.tiles.concat(sel) } : m)), players: { ...state.players, [playerId]: { ...p, hand: rem } }, lastActionText: `➕ ${p.nickname} shtoi letra në tavolinë!` } };
}

export function discardRummyTile(state: RummyGameState, playerId: string, tileId: string): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return state;
  const p = state.players[playerId]; const tile = p?.hand.find((t) => t.id === tileId);
  if (!p || !tile) return state;
  const rem = p.hand.filter((t) => t.id !== tileId);
  const nextDisc = state.discardPile.concat(tile);
  if (rem.length === 0) return { ...state, discardPile: nextDisc, lastDrawnTileId: null, players: { ...state.players, [playerId]: { ...p, hand: Array.of() } }, status: 'finished', winnerId: playerId, winnerName: p.nickname, lastActionText: `👑 JOL! ${p.nickname} fitoi (+150 pikë)!` };
  const idx = state.playerOrder.indexOf(playerId);
  const nextId = state.playerOrder.at((idx + 1) % state.playerOrder.length)!;
  return { ...state, discardPile: nextDisc, players: { ...state.players, [playerId]: { ...p, hand: rem } }, currentTurn: nextId, hasDrawn: false, lastDrawnTileId: null, lastActionText: `Radha e ${state.players[nextId]?.nickname}!` };
}

export function runBotRummyTurn(state: RummyGameState): RummyGameState {
  let s = state; const botId = s.currentTurn;
  if (!s.hasDrawn) s = drawRummyTile(s, botId, 'deck');
  const bot = s.players[botId]; if (!bot) return s;
  const byNum: Record<number, RummyTile[]> = {};
  bot.hand.filter((t) => !t.isJoker).forEach((t) => { if (!byNum[t.number]) byNum[t.number] = Array.of(); if (!byNum[t.number].some((x) => x.suit === t.suit)) byNum[t.number].push(t); });
  for (const grp of Object.values(byNum)) if (grp.length >= 3 && s.players[botId].hand.length - grp.length >= 1) { const r = playRummyMeld(s, botId, grp.map((x) => x.id)); if (!r.error) s = r.state; }
  const drop = s.players[botId].hand.find((t) => !t.isJoker) || s.players[botId].hand.at(0);
  return drop ? discardRummyTile(s, botId, drop.id) : s;
}