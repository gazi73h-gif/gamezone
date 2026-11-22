export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface PishpirikPlayerState {
  id: string;
  nickname: string;
  hand: Array<Card>;
  captured: Array<Card>;
  pishpiriks: number;
  pishpirikPoints: number;
  score: number;
}

export interface PishpirikGameState {
  deck: Array<Card>;
  table: Array<Card>;
  players: Record<string, PishpirikPlayerState>;
  playerOrder: Array<string>;
  currentTurn: string;
  lastCapturerId: string | null;
  round: number;
  status: 'playing' | 'finished';
  lastActionText: string;
}

const SUITS: Array<Suit> = Array.of('spades', 'hearts', 'diamonds', 'clubs');
const RANKS: Array<Rank> = Array.of('A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K');

export function createDeck(): Array<Card> {
  const deck: Array<Card> = Array.of();
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}_${suit}`, suit, rank });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(cards: Array<Card>): Array<Card> {
  const shuffled = Array.from(cards);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled.at(i)!;
    shuffled.splice(i, 1, shuffled.at(j)!);
    shuffled.splice(j, 1, temp);
  }
  return shuffled;
}

export function initPishpirikGame(
  playerList: Array<{ id: string; nickname: string }>
): PishpirikGameState {
  // Nëse ka vetëm 1 lojtar real, shto Bot-in automatikisht
  const list =
    playerList.length < 2
      ? [playerList[0], { id: 'BOT_PISH', nickname: '🤖 Bot Pishpirik' }]
      : playerList;

  const deck = createDeck();
  const table = deck.splice(0, 4);
  const players: Record<string, PishpirikPlayerState> = {};
  const playerOrder = list.map((p) => p.id);

  for (const p of list) {
    players[p.id] = {
      id: p.id,
      nickname: p.nickname,
      hand: deck.splice(0, 4),
      captured: Array.of(),
      pishpiriks: 0,
      pishpirikPoints: 0,
      score: 0,
    };
  }

  return {
    deck,
    table,
    players,
    playerOrder,
    currentTurn: playerOrder.at(0) || '',
    lastCapturerId: null,
    round: 1,
    status: 'playing',
    lastActionText: 'Loja filloi! Janë hedhur 4 letra në tavolinë.',
  };
}
export function calculateCardPoints(cards: Array<Card>): number {
  let pts = 0;
  for (const c of cards) {
    if (c.rank === 'A' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K' || c.rank === '10') {
      pts += 1;
    }
    if (c.rank === '2' && c.suit === 'clubs') {
      pts += 2; // 2-shi i luleve (spathi) vlen 2 pikë
    }
    if (c.rank === '10' && c.suit === 'diamonds') {
      pts += 2; // 10-shi i bakllavasë (karo) vlen 3 pikë total (1 + 2 bonus)
    }
  }
  return pts;
}

export function playPishpirikCard(
  state: PishpirikGameState,
  playerId: string,
  cardId: string
): PishpirikGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return state;

  const nextState: PishpirikGameState = JSON.parse(JSON.stringify(state));
  const player = nextState.players[playerId];
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return state;

  const playedCard = player.hand.splice(cardIndex, 1).at(0)!;
  const topCard = nextState.table.at(nextState.table.length - 1);

  const isMatch = topCard && (topCard.rank === playedCard.rank || playedCard.rank === 'J');

  if (isMatch) {
    const isPishpirik = nextState.table.length === 1 && topCard.rank === playedCard.rank;
    const wonCards = Array.from(nextState.table);
    wonCards.push(playedCard);

    player.captured.push(...wonCards);
    nextState.table = Array.of();
    nextState.lastCapturerId = playerId;

    if (isPishpirik) {
      const bonus = playedCard.rank === 'J' ? 20 : 10;
      player.pishpiriks += 1;
      player.pishpirikPoints += bonus;
      nextState.lastActionText = `🔥 PISHPIRIK (+${bonus}) nga ${player.nickname} me ${playedCard.rank}!`;
    } else {
      nextState.lastActionText = `${player.nickname} mori letrat me ${playedCard.rank}.`;
    }
  } else {
    nextState.table.push(playedCard);
    nextState.lastActionText = `${player.nickname} hodhi ${playedCard.rank}.`;
  }

  // Kontrollo nëse të gjithë lojtarët kanë mbaruar letrat në dorë
  const allHandsEmpty = nextState.playerOrder.every(
    (id) => nextState.players[id].hand.length === 0
  );

  if (allHandsEmpty) {
    if (nextState.deck.length > 0) {
      // Ndaj nga 4 letra të reja
      for (const id of nextState.playerOrder) {
        nextState.players[id].hand = nextState.deck.splice(0, 4);
      }
      nextState.round += 1;
      nextState.lastActionText += ` | U ndanë 4 letra të reja (Raundi ${nextState.round}).`;
    } else {
      // Mbaroi pakoja: letrat e mbetura në tavolinë i merr i fundit që ka kapur
      if (nextState.table.length > 0 && nextState.lastCapturerId) {
        nextState.players[nextState.lastCapturerId].captured.push(...nextState.table);
        nextState.table = Array.of();
      }
      finalizeScores(nextState);
      nextState.status = 'finished';
      nextState.lastActionText = 'Loja përfundoi! Ja rezultatet përfundimtare.';
      return nextState;
    }
  }

  // Kalo radhën te lojtari tjetër
  const currentIdx = nextState.playerOrder.indexOf(playerId);
  const nextIdx = (currentIdx + 1) % nextState.playerOrder.length;
  nextState.currentTurn = nextState.playerOrder.at(nextIdx)!;

  return nextState;
}

function finalizeScores(state: PishpirikGameState) {
  let maxCards = -1;
  let maxCardPlayerId = '';

  for (const id of state.playerOrder) {
    const p = state.players[id];
    const cardPts = calculateCardPoints(p.captured);
    p.score = cardPts + p.pishpirikPoints;
    if (p.captured.length > maxCards) {
      maxCards = p.captured.length;
      maxCardPlayerId = id;
    }
  }

  // +3 pikë për shumicën e letrave
  if (maxCardPlayerId && maxCards > 0) {
    state.players[maxCardPlayerId].score += 3;
  }
}
