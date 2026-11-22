export type Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs';

export interface RummyTile {
  id: string;
  number: number; // 1..13 (1=A, 11=J, 12=Q, 13=K), 0 for Joker
  suit: Suit;
  isJoker?: boolean;
}

export interface RummyMeld {
  id: string;
  ownerId: string;
  ownerName: string;
  tiles: RummyTile[];
  type: 'group' | 'run';
  points: number;
}

export interface RummyPlayer {
  id: string;
  nickname: string;
  hand: RummyTile[];
  hasOpened: boolean;
  rank?: string; // p.sh. "Bronz"
}

export interface RummyGameState {
  deck: RummyTile[];
  starterCard: RummyTile | null; // Karta e hapur horizontale pranë kuvertës
  discardPile: RummyTile[];
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

export const BOT_RUMMY_ID = 'BOT_RUMMY';

// Krijo kuvertën e dyfishtë (104 letra + 4 Xhokera / JOL)
export function createRummyDeck(): RummyTile[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'spades', 'clubs'];
  const deck: RummyTile[] = [];
  let uid = 1;

  for (let copy = 0; copy < 2; copy++) {
    for (const suit of suits) {
      for (let num = 1; num <= 13; num++) {
        deck.push({ id: `c_${uid++}`, number: num, suit });
      }
    }
    // Dy xhokera për çdo set
    deck.push({ id: `j_${uid++}`, number: 0, suit: 'hearts', isJoker: true });
    deck.push({ id: `j_${uid++}`, number: 0, suit: 'spades', isJoker: true });
  }

  // Përziej kartat (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  }
  return deck;
}

// Llogarit vlerën e pikëve të një letre
export function getTilePointValue(tile: RummyTile, context?: { isLowAce?: boolean; repNum?: number }): number {
  if (tile.isJoker) {
    if (context?.repNum !== undefined) {
      if (context.repNum === 1) return context.isLowAce ? 1 : 11;
      return Math.min(context.repNum, 10);
    }
    return 10;
  }
  if (tile.number === 1) {
    return context?.isLowAce ? 1 : 11;
  }
  if (tile.number >= 10) return 10;
  return tile.number; // 2..9
}

// Verifiko një kombinim të vetëm (Meld: Run ose Group)
export function validateSingleMeld(tiles: RummyTile[]): {
  valid: boolean;
  type?: 'group' | 'run';
  points: number;
  sorted?: RummyTile[];
} {
  if (tiles.length < 3) return { valid: false, points: 0 };
  const nonJ = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);

  // Duhet të paktën 1 letër jo-xhoker
  if (nonJ.length === 0) return { valid: false, points: 0 };

  // 1. Kontrollo për GRUP (vlera të njëjta, shenja të ndryshme, max 4 letra)
  const n0 = nonJ[0].number;
  if (
    tiles.length <= 4 &&
    nonJ.every((t) => t.number === n0) &&
    new Set(nonJ.map((t) => t.suit)).size === nonJ.length
  ) {
    const cardPts = n0 === 1 ? 11 : Math.min(n0, 10);
    const points = cardPts * tiles.length;
    return { valid: true, type: 'group', points, sorted: tiles };
  }

  // 2. Kontrollo për SEKUENCA (Run: e njëjta pezull, radhazi)
  const s0 = nonJ[0].suit;
  if (nonJ.every((t) => t.suit === s0)) {
    // Rendit jo-xhokerat sipas numrit
    const sorted = nonJ.slice().sort((a, b) => a.number - b.number);

    // Kontrollo sekuencë standarde (2..K ose A-2-3 ose 10-J-Q-K-A)
    // Rasti A: A si 1 (A-2-3-...)
    const resLow = testRunSequence(sorted, jokers, false);
    if (resLow.valid) return resLow;

    // Rasti B: A si 14 (10-J-Q-K-A)
    if (sorted.some((t) => t.number === 1)) {
      const highSorted = sorted
        .map((t) => (t.number === 1 ? { ...t, number: 14 } : t))
        .sort((a, b) => a.number - b.number);
      const resHigh = testRunSequence(highSorted, jokers, true);
      if (resHigh.valid) return resHigh;
    }
  }

  return { valid: false, points: 0 };
}

function testRunSequence(
  sorted: RummyTile[],
  jokers: RummyTile[],
  isAceHigh: boolean
): { valid: boolean; type?: 'group' | 'run'; points: number; sorted?: RummyTile[] } {
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].number - sorted[i - 1].number;
    if (diff <= 0) return { valid: false, points: 0 }; // Duplikata nuk lejohen në seri
    gaps += diff - 1;
  }

  if (gaps > jokers.length) return { valid: false, points: 0 };

  const unusedJokers = jokers.length - gaps;
  let startNum = sorted[0].number;
  let endNum = sorted[sorted.length - 1].number;

  // Vendos xhokerat e mbetur para ose pas nëse është e mundur
  const extendBefore = Math.min(unusedJokers, startNum - 1);
  startNum -= extendBefore;
  endNum += unusedJokers - extendBefore;

  const maxNum = isAceHigh ? 14 : 13;
  if (endNum > maxNum) return { valid: false, points: 0 };

  // Ndërto sekuencën e plotë të renditur
  const jp = jokers.slice();
  const fullArr: RummyTile[] = [];
  let totalPts = 0;

  for (let num = startNum; num <= endNum; num++) {
    const existing = sorted.find((t) => t.number === num);
    if (existing) {
      // Rivendos A si 1 nëse ishte 14
      const actualTile = existing.number === 14 ? { ...existing, number: 1 } : existing;
      fullArr.push(actualTile);
      totalPts += getTilePointValue(actualTile, { isLowAce: !isAceHigh });
    } else if (jp.length > 0) {
      const jTile = jp.pop()!;
      fullArr.push(jTile);
      const repNum = num === 14 ? 1 : num;
      totalPts += getTilePointValue(jTile, { isLowAce: !isAceHigh && repNum === 1, repNum });
    } else {
      return { valid: false, points: 0 };
    }
  }

  return { valid: true, type: 'run', points: totalPts, sorted: fullArr };
}

// Vlerëson një grup kartash të zgjedhura (mund të jetë 1 meld ose kombinim prej disa meldeve)
export function evaluateSelectedMelds(tiles: RummyTile[]): {
  valid: boolean;
  melds: { type: 'group' | 'run'; tiles: RummyTile[]; points: number }[];
  totalPoints: number;
} {
  if (tiles.length < 3) return { valid: false, melds: [], totalPoints: 0 };

  // Kontrollo nëse janë të gjitha një meld i vetëm
  const single = validateSingleMeld(tiles);
  if (single.valid && single.type && single.sorted) {
    return {
      valid: true,
      melds: [{ type: single.type, tiles: single.sorted, points: single.points }],
      totalPoints: single.points,
    };
  }

  // Përpjekje për të ndarë kartat në dy ose më shumë kombinime (partitioning)
  const partition = findMeldPartition(tiles);
  if (partition) {
    const totalPoints = partition.reduce((sum, m) => sum + m.points, 0);
    return { valid: true, melds: partition, totalPoints };
  }

  return { valid: false, melds: [], totalPoints: 0 };
}

// Gjen ndarjen në melde të vlefshme për shumë letra të përzgjedhura
function findMeldPartition(
  tiles: RummyTile[]
): { type: 'group' | 'run'; tiles: RummyTile[]; points: number }[] | null {
  if (tiles.length < 6) return null;

  // Provo ndarje në grupe me madhësi të paktën 3
  const n = tiles.length;
  for (let size = 3; size <= n - 3; size++) {
    const combinations = getCombinations(tiles, size);
    for (const groupA of combinations) {
      const setA = new Set(groupA.map((t) => t.id));
      const groupB = tiles.filter((t) => !setA.has(t.id));

      const vA = validateSingleMeld(groupA);
      if (!vA.valid || !vA.type || !vA.sorted) continue;

      const vB = validateSingleMeld(groupB);
      if (vB.valid && vB.type && vB.sorted) {
        return [
          { type: vA.type, tiles: vA.sorted, points: vA.points },
          { type: vB.type, tiles: vB.sorted, points: vB.points },
        ];
      }

      // Rikursivisht provo nëse groupB mund të ndahet më tej
      const sub = findMeldPartition(groupB);
      if (sub) {
        return [{ type: vA.type, tiles: vA.sorted, points: vA.points }, ...sub];
      }
    }
  }
  return null;
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = getCombinations(tail, k - 1).map((c) => [head, ...c]);
  const withoutHead = getCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

// Inicializimi i lojës Rummy
export function initRummyGame(players: { id: string; nickname: string }[]): RummyGameState {
  const deck = createRummyDeck();
  const list =
    players.length >= 2
      ? players.slice(0, 4)
      : [players[0] || { id: 'p1', nickname: 'Lojtari' }, { id: BOT_RUMMY_ID, nickname: 'sabajdin' }];

  const map: Record<string, RummyPlayer> = {};
  const order: string[] = [];

  list.forEach((pl, idx) => {
    order.push(pl.id);
    map[pl.id] = {
      id: pl.id,
      nickname: pl.nickname,
      hand: deck.splice(0, idx === 0 ? 15 : 14),
      hasOpened: false,
      rank: 'Bronz',
    };
  });

  // Karta e parë e hapur horizontale pranë kuvertës (Starter / Cut Card si në foto)
  const starterCard = deck.pop() || null;

  return {
    deck,
    starterCard,
    discardPile: [],
    melds: [],
    players: map,
    playerOrder: order,
    currentTurn: order[0],
    hasDrawn: true, // Lojtari i parë nis me 15 letra, kështu që tashmë ka tërhequr
    lastDrawnTileId: null,
    status: 'playing',
    winnerId: null,
    winnerName: null,
    lastActionText: `${map[order[0]].nickname} e ka radhën — hidh një letër.`,
  };
}

// Tërheqja e një letre (nga kuverta ose nga letra e hedhur)
export function drawRummyTile(
  state: RummyGameState,
  playerId: string,
  source: 'deck' | 'discard'
): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.hasDrawn) return state;
  const p = state.players[playerId];
  if (!p) return state;

  const deck = state.deck.slice();
  const discard = state.discardPile.slice();

  // Nëse tërheq nga discard por discard është bosh, merr nga deck
  const drawn = source === 'discard' && discard.length > 0 ? discard.pop() : deck.pop();
  if (!drawn) return state;

  return {
    ...state,
    deck,
    discardPile: discard,
    hasDrawn: true,
    lastDrawnTileId: drawn.id,
    players: {
      ...state.players,
      [playerId]: { ...p, hand: [...p.hand, drawn] },
    },
    lastActionText: `${p.nickname} tërhoqi një letër.`,
  };
}

// Vendos kombinimet e zgjedhura në tavolinë ("Vendos: min 51")
export function playRummyMeld(
  state: RummyGameState,
  playerId: string,
  tileIds: string[]
): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) {
    return { state, error: 'Tërhiq një letër fillimisht!' };
  }
  const p = state.players[playerId];
  if (!p) return { state };

  const selected = p.hand.filter((t) => tileIds.includes(t.id));
  const evalRes = evaluateSelectedMelds(selected);

  if (!evalRes.valid || evalRes.melds.length === 0) {
    return { state, error: 'Kombinim i pavlefshëm! Duhen sekuenca ose grupe me min. 3 letra.' };
  }

  // Rregulli: Hapja e parë kërkon të paktën 51 pikë
  if (!p.hasOpened && evalRes.totalPoints < 51) {
    return {
      state,
      error: `Kërkohen min. 51 pikë për t'u hapur! Aktualisht ke ${evalRes.totalPoints} pikë.`,
    };
  }

  const remainingHand = p.hand.filter((t) => !tileIds.includes(t.id));
  if (remainingHand.length === 0) {
    return { state, error: 'Duhet të të mbetet 1 letër në dorë për ta hedhur në fund!' };
  }

  const newMelds: RummyMeld[] = evalRes.melds.map((m, idx) => ({
    id: `m_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    ownerId: playerId,
    ownerName: p.nickname,
    tiles: m.tiles,
    type: m.type,
    points: m.points,
  }));

  return {
    state: {
      ...state,
      melds: [...state.melds, ...newMelds],
      players: {
        ...state.players,
        [playerId]: {
          ...p,
          hand: remainingHand,
          hasOpened: true,
        },
      },
      lastActionText: `✨ ${p.nickname} vendosi kombinim (${evalRes.totalPoints} PTS)!`,
    },
  };
}

// Shton letra në një kombinim ekzistues në tavolinë
export function addToRummyMeld(
  state: RummyGameState,
  playerId: string,
  tileIds: string[],
  meldId: string
): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) {
    return { state, error: 'Tërhiq një letër fillimisht!' };
  }
  const p = state.players[playerId];
  const meld = state.melds.find((m) => m.id === meldId);
  if (!p || !meld) return { state };

  if (!p.hasOpened) {
    return { state, error: 'Duhet të hapesh vetë me min. 51 pikë fillimisht!' };
  }

  const selected = p.hand.filter((t) => tileIds.includes(t.id));
  const combined = [...meld.tiles, ...selected];
  const chk = validateSingleMeld(combined);

  if (!chk.valid || !chk.sorted || !chk.type) {
    return { state, error: 'Këto letra nuk përshtaten me këtë kombinim!' };
  }

  const remHand = p.hand.filter((t) => !tileIds.includes(t.id));
  if (remHand.length === 0) {
    return { state, error: 'Duhet të të mbetet të paktën 1 letër për ta hedhur!' };
  }

  return {
    state: {
      ...state,
      melds: state.melds.map((m) =>
        m.id === meldId ? { ...m, tiles: chk.sorted!, points: chk.points } : m
      ),
      players: {
        ...state.players,
        [playerId]: { ...p, hand: remHand },
      },
      lastActionText: `➕ ${p.nickname} shtoi letra në tavolinë!`,
    },
  };
}

// Hedhja e letrës për të mbyllur radhën ("Hidh")
export function discardRummyTile(
  state: RummyGameState,
  playerId: string,
  tileId: string
): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return state;
  const p = state.players[playerId];
  const tile = p?.hand.find((t) => t.id === tileId);
  if (!p || !tile) return state;

  const rem = p.hand.filter((t) => t.id !== tileId);
  const nextDisc = [...state.discardPile, tile];

  // Nëse dora mbetet bosh (0 letra), lojtari ka fituar!
  if (rem.length === 0) {
    return {
      ...state,
      discardPile: nextDisc,
      lastDrawnTileId: null,
      players: { ...state.players, [playerId]: { ...p, hand: [] } },
      status: 'finished',
      winnerId: playerId,
      winnerName: p.nickname,
      lastActionText: `👑 JOL! ${p.nickname} fitoi lojën!`,
    };
  }

  const idx = state.playerOrder.indexOf(playerId);
  const nextId = state.playerOrder[(idx + 1) % state.playerOrder.length];

  return {
    ...state,
    discardPile: nextDisc,
    players: { ...state.players, [playerId]: { ...p, hand: rem } },
    currentTurn: nextId,
    hasDrawn: false,
    lastDrawnTileId: null,
    lastActionText: `Radha e ${state.players[nextId]?.nickname || 'lojtarit tjetër'}.`,
  };
}

// Llogarit pikët totale të vendosura në tavolinë për një lojtar
export function getPlayerMeldPoints(state: RummyGameState, playerId: string): number {
  return state.melds
    .filter((m) => m.ownerId === playerId)
    .reduce((sum, m) => sum + m.points, 0);
}

// Logjika e Botit (Luajtësi automatik)
export function runBotRummyTurn(state: RummyGameState): RummyGameState {
  let s = state;
  const botId = s.currentTurn;
  const bot = s.players[botId];
  if (!bot || s.status !== 'playing') return s;

  // 1. Tërheq letër nëse nuk ka tërhequr
  if (!s.hasDrawn) {
    s = drawRummyTile(s, botId, 'deck');
  }

  const curBot = s.players[botId];
  if (!curBot) return s;

  // 2. Kërko kombinime të mundshme
  const runsAndGroups = findPossibleMelds(curBot.hand);
  if (runsAndGroups.length > 0) {
    const totalPts = runsAndGroups.reduce((acc, m) => acc + m.points, 0);

    // Bot vendos nëse tashmë është hapur ose ka >= 51 pikë
    if (curBot.hasOpened || totalPts >= 51) {
      const allMeldTileIds = runsAndGroups.flatMap((m) => m.tiles.map((t) => t.id));
      // Sigurohu që i mbetet të paktën 1 letër për hedhje
      if (curBot.hand.length - allMeldTileIds.length >= 1) {
        const r = playRummyMeld(s, botId, allMeldTileIds);
        if (!r.error) s = r.state;
      }
    }
  }

  // 3. Zgjidh një letër për ta hedhur (prefero jo-xhoker dhe letrën më pak të lidhur)
  const updatedBot = s.players[botId];
  if (!updatedBot || updatedBot.hand.length === 0) return s;

  const drop =
    updatedBot.hand.find((t) => !t.isJoker && t.number > 7) ||
    updatedBot.hand.find((t) => !t.isJoker) ||
    updatedBot.hand[0];

  return drop ? discardRummyTile(s, botId, drop.id) : s;
}

// Gjetja e të gjitha meldeve nga dora e botit
function findPossibleMelds(
  hand: RummyTile[]
): { type: 'group' | 'run'; tiles: RummyTile[]; points: number }[] {
  const result: { type: 'group' | 'run'; tiles: RummyTile[]; points: number }[] = [];
  const usedIds = new Set<string>();

  // A. Kërko grupe sipas numrit (3 ose 4 shenja të ndryshme)
  const byNum: Record<number, RummyTile[]> = {};
  hand
    .filter((t) => !t.isJoker)
    .forEach((t) => {
      if (!byNum[t.number]) byNum[t.number] = [];
      if (!byNum[t.number].some((x) => x.suit === t.suit)) byNum[t.number].push(t);
    });

  for (const grp of Object.values(byNum)) {
    if (grp.length >= 3) {
      const v = validateSingleMeld(grp);
      if (v.valid && v.sorted && v.type) {
        result.push({ type: v.type, tiles: v.sorted, points: v.points });
        grp.forEach((t) => usedIds.add(t.id));
      }
    }
  }

  // B. Kërko sekuenca sipas shenjës
  const remHand = hand.filter((t) => !usedIds.has(t.id) && !t.isJoker);
  const bySuit: Record<Suit, RummyTile[]> = { hearts: [], diamonds: [], spades: [], clubs: [] };
  remHand.forEach((t) => bySuit[t.suit].push(t));

  for (const sList of Object.values(bySuit)) {
    if (sList.length < 3) continue;
    const sorted = sList.sort((a, b) => a.number - b.number);
    let run: RummyTile[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].number === sorted[i - 1].number + 1) {
        run.push(sorted[i]);
      } else {
        if (run.length >= 3) {
          const v = validateSingleMeld(run);
          if (v.valid && v.sorted && v.type) {
            result.push({ type: v.type, tiles: v.sorted, points: v.points });
            run.forEach((t) => usedIds.add(t.id));
          }
        }
        run = [sorted[i]];
      }
    }
    if (run.length >= 3) {
      const v = validateSingleMeld(run);
      if (v.valid && v.sorted && v.type) {
        result.push({ type: v.type, tiles: v.sorted, points: v.points });
      }
    }
  }

  return result;
}
