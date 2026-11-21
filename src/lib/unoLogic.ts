export type UnoColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type UnoValue =

  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface UnoCard {
  id: string;
  color: UnoColor;
  value: UnoValue;
}

export interface UnoPlayerState {
  id: string;
  nickname: string;
  hand: Array<UnoCard>;
  calledUno: boolean;
}

export interface UnoGameState {
  deck: Array<UnoCard>;
  discardPile: Array<UnoCard>;
  activeColor: Exclude<UnoColor, 'wild'>;
  players: Record<string, UnoPlayerState>;
  playerOrder: Array<string>;
  currentTurnIndex: number;
  direction: 1 | -1;
  status: 'playing' | 'finished';
  winnerId: string | null;
  lastActionText: string;
}

const COLORS: Array<Exclude<UnoColor, 'wild'>> = Array.of('red', 'blue', 'green', 'yellow');
const NUMBER_VALUES: Array<UnoValue> = Array.of('1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2');

export function createUnoDeck(): Array<UnoCard> {
  const deck: Array<UnoCard> = Array.of();
  let uid = 1;

  for (const color of COLORS) {
    deck.push({ id: `uno_${uid++}`, color, value: '0' });
    for (const val of NUMBER_VALUES) {
      deck.push({ id: `uno_${uid++}`, color, value: val });
      deck.push({ id: `uno_${uid++}`, color, value: val });
    }
  }

  for (let i = 0; i < 4; i++) {
    deck.push({ id: `uno_${uid++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `uno_${uid++}`, color: 'wild', value: 'wild4' });
  }

  return shuffleUno(deck);
}

export function shuffleUno(cards: Array<UnoCard>): Array<UnoCard> {
  const arr = Array.from(cards);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr.at(i)!;
    arr.splice(i, 1, arr.at(j)!);
    arr.splice(j, 1, tmp);
  }
  return arr;
}

export function initUnoGame(
  playerList: Array<{ id: string; nickname: string }>
): UnoGameState {
  const deck = createUnoDeck();
  const players: Record<string, UnoPlayerState> = {};
  const playerOrder = playerList.map((p) => p.id);

  for (const p of playerList) {
    players[p.id] = {
      id: p.id,
      nickname: p.nickname,
      hand: deck.splice(0, 7),
      calledUno: false,
    };
  }

  // Gjej një letër të parë me ngjyrë normale për tavolinën
  let firstIdx = deck.findIndex((c) => c.color !== 'wild');
  if (firstIdx === -1) firstIdx = 0;
  const firstCard = deck.splice(firstIdx, 1).at(0)!;
  const initialColor = firstCard.color === 'wild' ? 'red' : firstCard.color;

  return {
    deck,
    discardPile: Array.of(firstCard),
    activeColor: initialColor,
    players,
    playerOrder,
    currentTurnIndex: 0,
    direction: 1,
    status: 'playing',
    winnerId: null,
    lastActionText: 'Loja UNO filloi! Secili lojtar ka nga 7 letra.',
  };
}
export function canPlayUnoCard(card: UnoCard, topCard: UnoCard, activeColor: UnoColor): boolean {
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function drawFromDeckSafe(state: UnoGameState, count: number): Array<UnoCard> {
  const drawn: Array<UnoCard> = Array.of();
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discardPile.length <= 1) break;
      const top = state.discardPile.pop()!;
      state.deck = shuffleUno(state.discardPile);
      state.discardPile = Array.of(top);
    }
    const card = state.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

function getNextIndex(current: number, total: number, dir: 1 | -1, step = 1): number {
  return (((current + dir * step) % total) + total) % total;
}

export function playUnoCard(
  state: UnoGameState,
  playerId: string,
  cardId: string,
  chosenWildColor?: Exclude<UnoColor, 'wild'>
): UnoGameState {
  if (state.status !== 'playing') return state;
  const activePlayerId = state.playerOrder.at(state.currentTurnIndex);
  if (activePlayerId !== playerId) return state;

  const next: UnoGameState = JSON.parse(JSON.stringify(state));
  const player = next.players[playerId];
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return state;

  const card = player.hand.at(cardIdx)!;
  const topCard = next.discardPile.at(next.discardPile.length - 1)!;

  if (!canPlayUnoCard(card, topCard, next.activeColor)) return state;

  player.hand.splice(cardIdx, 1);
  next.discardPile.push(card);

  if (card.color === 'wild') {
    next.activeColor = chosenWildColor || 'red';
  } else {
    next.activeColor = card.color;
  }

  // Kontrollo nëse lojtari ka mbetur me 1 letër dhe nuk ka shtypur UNO
    if (player.hand.length === 1) {
    player.calledUno = false;
    next.lastActionText = `${player.nickname} hodhi ${formatCardLabel(card)} — i ka mbetur vetëm 1 letër!`;
  } else {
    next.lastActionText = `${player.nickname} hodhi ${formatCardLabel(card)}.`;
  }


  if (player.hand.length > 1) {
    player.calledUno = false;
  }

  // Kontrollo fitoren
  if (player.hand.length === 0) {
    next.status = 'finished';
    next.winnerId = playerId;
    next.lastActionText = `🏆 ${player.nickname} fitoi lojën UNO!`;
    return next;
  }

  const totalPlayers = next.playerOrder.length;
  let step = 1;

  if (card.value === 'reverse') {
    if (totalPlayers === 2) {
      step = 2; // Me 2 lojtarë, Kthehu vepron si Kalo radhën
    } else {
      next.direction = next.direction === 1 ? -1 : 1;
    }
  } else if (card.value === 'skip') {
    step = 2;
  } else if (card.value === 'draw2') {
    const victimIdx = getNextIndex(next.currentTurnIndex, totalPlayers, next.direction, 1);
    const victimId = next.playerOrder.at(victimIdx)!;
    const cards = drawFromDeckSafe(next, 2);
    next.players[victimId].hand.push(...cards);
    next.players[victimId].calledUno = false;
    next.lastActionText += ` (+2 letra për ${next.players[victimId].nickname})`;
    step = 2;
  } else if (card.value === 'wild4') {
    const victimIdx = getNextIndex(next.currentTurnIndex, totalPlayers, next.direction, 1);
    const victimId = next.playerOrder.at(victimIdx)!;
    const cards = drawFromDeckSafe(next, 4);
    next.players[victimId].hand.push(...cards);
    next.players[victimId].calledUno = false;
    next.lastActionText += ` (+4 letra për ${next.players[victimId].nickname})`;
    step = 2;
  }

  next.currentTurnIndex = getNextIndex(next.currentTurnIndex, totalPlayers, next.direction, step);
  return next;
}

export function drawUnoCardAction(state: UnoGameState, playerId: string): UnoGameState {
  if (state.status !== 'playing') return state;
  const activePlayerId = state.playerOrder.at(state.currentTurnIndex);
  if (activePlayerId !== playerId) return state;

  const next: UnoGameState = JSON.parse(JSON.stringify(state));
  const drawn = drawFromDeckSafe(next, 1);
  const player = next.players[playerId];
  player.hand.push(...drawn);
  player.calledUno = false;
  next.lastActionText = `${player.nickname} tërhoqi 1 letër dhe kaloi radhën.`;

  next.currentTurnIndex = getNextIndex(
    next.currentTurnIndex,
    next.playerOrder.length,
    next.direction,
    1
  );
  return next;
}

export function callUnoShout(state: UnoGameState, playerId: string): UnoGameState {
  const next: UnoGameState = JSON.parse(JSON.stringify(state));
  if (next.players[playerId]) {
    next.players[playerId].calledUno = true;
    next.lastActionText = `🔥 ${next.players[playerId].nickname} thirri: UNO!`;
  }
  return next;
}

function formatCardLabel(card: UnoCard): string {
  if (card.value === 'skip') return 'Kalo Radhën (🚫)';
  if (card.value === 'reverse') return 'Kthehu (🔄)';
  if (card.value === 'draw2') return '+2 Letra';
  if (card.value === 'wild') return 'Zgjidh Ngjyrën';
  if (card.value === 'wild4') return '+4 Zgjidh Ngjyrën';
  return card.value;
}
