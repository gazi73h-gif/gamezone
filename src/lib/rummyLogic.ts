// Rummy me gurë (pllaka): 4 ngjyra × 1..13 × 2 = 104 gurë.
// Në fillim të çdo raundi zbulohet guri tregues; Jokeri është numri pasues i së njëjtës ngjyrë
// (13 → 1). Të dy kopjet e atij guri janë Joker. Hapja e parë kërkon min. 51 pikë.
// Loja ka 4 raunde; pikët negative (gurët që mbeten në dorë) mblidhen, fiton më i ulëti.

export type TileColor = 'red' | 'blue' | 'black' | 'orange';
export const TILE_COLORS: TileColor[] = ['red', 'blue', 'black', 'orange'];

export interface RummyTile {
  id: string;
  number: number; // 1..13
  color: TileColor;
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
}

export interface RummyGameState {
  version: 2;
  gameId: number;
  rev: number;
  round: number;
  totalRounds: number;
  deck: RummyTile[];
  indicator: RummyTile;
  joker: { color: TileColor; number: number };
  discardPile: RummyTile[];
  melds: RummyMeld[];
  players: Record<string, RummyPlayer>;
  playerOrder: string[];
  currentTurn: string;
  hasDrawn: boolean;
  lastDrawnTileId: string | null;
  status: 'playing' | 'roundOver' | 'finished';
  scores: Record<string, number[]>; // pikët negative për çdo raund
  roundWinnerId: string | null;
  winnerId: string | null;
  winnerName: string | null;
  lastActionText: string;
}

export const RUMMY_SEATS = 4;
export const TOTAL_ROUNDS = 4;
export const OPEN_MIN = 51;
export const HAND_SIZE = 14;
export const JOKER_PENALTY = 30;
export const UNOPENED_PENALTY = 100;

export const isRummyBot = (id: string) => id.startsWith('BOT_RUMMY');

// Lojërat e vjetra me letra nuk kanë tregues; ato duhet të rifillojnë
export function isTileRummyState(s: unknown): s is RummyGameState {
  const st = s as Partial<RummyGameState> | null;
  return !!st && st.version === 2 && !!st.indicator;
}

/* ───────────── gurët ───────────── */

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createTiles(): RummyTile[] {
  const tiles: RummyTile[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const color of TILE_COLORS) {
      for (let n = 1; n <= 13; n++) tiles.push({ id: `${color}-${n}-${copy}`, number: n, color });
    }
  }
  return shuffle(tiles);
}

export const jokerFor = (indicator: RummyTile) => ({
  color: indicator.color,
  number: indicator.number === 13 ? 1 : indicator.number + 1,
});

/* ───────────── kombinimet ───────────── */

export interface MeldCheck {
  valid: boolean;
  type?: 'group' | 'run';
  points: number;
  sorted?: RummyTile[];
}

// Seri: e njëjta ngjyrë, numra radhazi (1..13, pa kalim 13→1). Grup: i njëjti numër, ngjyra të ndryshme.
export function validateSingleMeld(tiles: RummyTile[]): MeldCheck {
  const bad: MeldCheck = { valid: false, points: 0 };
  if (tiles.length < 3) return bad;
  const plain = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);
  if (plain.length === 0) return bad;

  const n0 = plain[0].number;
  if (
    tiles.length <= 4 &&
    plain.every((t) => t.number === n0) &&
    new Set(plain.map((t) => t.color)).size === plain.length
  ) {
    return { valid: true, type: 'group', points: n0 * tiles.length, sorted: [...plain, ...jokers] };
  }

  const c0 = plain[0].color;
  if (tiles.length <= 13 && plain.every((t) => t.color === c0)) {
    const sorted = plain.slice().sort((a, b) => a.number - b.number);
    let gaps = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i].number - sorted[i - 1].number;
      if (d <= 0) return bad;
      gaps += d - 1;
    }
    if (gaps > jokers.length) return bad;
    let spare = jokers.length - gaps;
    let start = sorted[0].number;
    let end = sorted[sorted.length - 1].number;
    const after = Math.min(spare, 13 - end);
    end += after;
    spare -= after;
    start -= spare;
    if (start < 1) return bad;

    const js = jokers.slice();
    const out: RummyTile[] = [];
    let points = 0;
    for (let n = start; n <= end; n++) {
      const t = sorted.find((x) => x.number === n);
      out.push(t ?? js.pop()!);
      points += n;
    }
    return { valid: true, type: 'run', points, sorted: out };
  }
  return bad;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [...combinations(tail, k - 1).map((c) => [head, ...c]), ...combinations(tail, k)];
}

type FoundMeld = { type: 'group' | 'run'; tiles: RummyTile[]; points: number };

function partition(tiles: RummyTile[]): FoundMeld[] | null {
  const single = validateSingleMeld(tiles);
  if (single.valid) return [{ type: single.type!, tiles: single.sorted!, points: single.points }];
  if (tiles.length < 6) return null;
  for (let size = 3; size <= tiles.length - 3; size++) {
    for (const a of combinations(tiles, size)) {
      const va = validateSingleMeld(a);
      if (!va.valid) continue;
      const ids = new Set(a.map((t) => t.id));
      const rest = partition(tiles.filter((t) => !ids.has(t.id)));
      if (rest) return [{ type: va.type!, tiles: va.sorted!, points: va.points }, ...rest];
    }
  }
  return null;
}

// Gurët e zgjedhur: një ose disa kombinime
export function evaluateSelectedMelds(tiles: RummyTile[]): { valid: boolean; melds: FoundMeld[]; totalPoints: number } {
  if (tiles.length < 3 || tiles.length > 15) return { valid: false, melds: [], totalPoints: 0 };
  const melds = partition(tiles);
  if (!melds) return { valid: false, melds: [], totalPoints: 0 };
  return { valid: true, melds, totalPoints: melds.reduce((s, m) => s + m.points, 0) };
}

// Gjen kombinimet me më shumë pikë në dorë (për botin dhe butonin "Gjej")
export function findAllMeldsInHand(hand: RummyTile[]): FoundMeld[] {
  const plain = hand.filter((t) => !t.isJoker);
  const jokers = hand.filter((t) => t.isJoker);
  const cands: (FoundMeld & { ids: Set<string> })[] = [];
  const push = (tiles: RummyTile[]) => {
    const v = validateSingleMeld(tiles);
    if (v.valid) cands.push({ type: v.type!, tiles: v.sorted!, points: v.points, ids: new Set(tiles.map((t) => t.id)) });
  };

  // grupe
  for (let n = 1; n <= 13; n++) {
    const byColor = new Map<TileColor, RummyTile>();
    plain.filter((t) => t.number === n).forEach((t) => { if (!byColor.has(t.color)) byColor.set(t.color, t); });
    const list = [...byColor.values()];
    if (list.length >= 3) {
      push(list);
      if (list.length === 4) list.forEach((_, i) => push(list.filter((__, j) => j !== i)));
    }
    if (list.length >= 2 && jokers.length >= 1) push([...list.slice(0, 3), jokers[0]]);
    if (list.length >= 1 && jokers.length >= 2) push([list[0], jokers[0], jokers[1]]);
  }

  // seri (me 0, 1 ose 2 jokera)
  for (const color of TILE_COLORS) {
    const uniq = [...new Map(plain.filter((t) => t.color === color).map((t) => [t.number, t])).values()]
      .sort((a, b) => a.number - b.number);
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const slice = uniq.slice(i, j + 1);
        const span = slice[slice.length - 1].number - slice[0].number + 1;
        const missing = span - slice.length;
        if (missing > jokers.length) break;
        if (span >= 3) push([...slice, ...jokers.slice(0, missing)]);
        else if (jokers.length > 0) push([...slice, jokers[0]]);
      }
      if (jokers.length >= 2) push([uniq[i], jokers[0], jokers[1]]);
    }
  }

  cands.sort((a, b) => b.points - a.points);
  let best: FoundMeld[] = [];
  let bestPts = 0;
  let steps = 0;
  const search = (from: number, chosen: typeof cands, used: Set<string>, pts: number) => {
    if (++steps > 20000) return;
    if (pts > bestPts) { bestPts = pts; best = chosen.map(({ type, tiles, points }) => ({ type, tiles, points })); }
    for (let i = from; i < cands.length; i++) {
      const c = cands[i];
      if ([...c.ids].some((id) => used.has(id))) continue;
      search(i + 1, [...chosen, c], new Set([...used, ...c.ids]), pts + c.points);
    }
  };
  search(0, [], new Set(), 0);
  return best;
}

/* ───────────── rrjedha e lojës ───────────── */

const nextSeat = (s: RummyGameState, id: string) =>
  s.playerOrder[(s.playerOrder.indexOf(id) + 1) % s.playerOrder.length];

function dealRound(
  seats: { id: string; nickname: string }[],
  round: number,
  base: Pick<RummyGameState, 'gameId' | 'rev' | 'scores'>,
): RummyGameState {
  const tiles = createTiles();
  const indicator = tiles.pop()!;
  const joker = jokerFor(indicator);
  const deck = tiles.map((t) => (t.color === joker.color && t.number === joker.number ? { ...t, isJoker: true } : t));
  const order = seats.map((p) => p.id);
  const starter = order[(round - 1) % order.length];
  const players: Record<string, RummyPlayer> = {};
  seats.forEach((p) => {
    players[p.id] = { id: p.id, nickname: p.nickname, hand: deck.splice(0, p.id === starter ? HAND_SIZE + 1 : HAND_SIZE), hasOpened: false };
  });
  return {
    version: 2,
    gameId: base.gameId,
    rev: base.rev,
    round,
    totalRounds: TOTAL_ROUNDS,
    deck,
    indicator,
    joker,
    discardPile: [],
    melds: [],
    players,
    playerOrder: order,
    currentTurn: starter,
    hasDrawn: true,
    lastDrawnTileId: null,
    status: 'playing',
    scores: base.scores,
    roundWinnerId: null,
    winnerId: null,
    winnerName: null,
    lastActionText: `Raundi ${round} filloi! ${players[starter].nickname} fillon — hidh një gur.`,
  };
}

// Vendet bosh mbushen me bot; lojtarët e rinj i zënë më vonë
export function initRummyGame(list: { id: string; nickname: string }[]): RummyGameState {
  const seats = list.slice(0, RUMMY_SEATS);
  for (let i = seats.length; i < RUMMY_SEATS; i++) seats.push({ id: `BOT_RUMMY_${i}`, nickname: `Bot ${i}` });
  const scores: Record<string, number[]> = {};
  seats.forEach((p) => { scores[p.id] = []; });
  return dealRound(seats, 1, { gameId: Date.now(), rev: 0, scores });
}

export function startNextRound(state: RummyGameState): RummyGameState {
  if (state.status !== 'roundOver') return state;
  const seats = state.playerOrder.map((id) => ({ id, nickname: state.players[id].nickname }));
  return dealRound(seats, state.round + 1, state);
}

export function handPenalty(p: RummyPlayer): number {
  if (p.hand.length === 0) return 0;
  if (!p.hasOpened) return UNOPENED_PENALTY;
  return p.hand.reduce((s, t) => s + (t.isJoker ? JOKER_PENALTY : t.number), 0);
}

export const totalScore = (s: RummyGameState, id: string) => (s.scores[id] ?? []).reduce((a, b) => a + b, 0);

export function standings(s: RummyGameState) {
  return s.playerOrder
    .map((id) => ({ id, nickname: s.players[id].nickname, total: totalScore(s, id) }))
    .sort((a, b) => a.total - b.total);
}

function endRound(state: RummyGameState, winnerId: string | null, players = state.players): RummyGameState {
  const scores: Record<string, number[]> = {};
  state.playerOrder.forEach((id) => {
    scores[id] = [...(state.scores[id] ?? []), id === winnerId ? 0 : handPenalty(players[id])];
  });
  const ended: RummyGameState = { ...state, players, scores, roundWinnerId: winnerId, hasDrawn: false, lastDrawnTileId: null };
  const who = winnerId ? players[winnerId].nickname : null;
  if (state.round >= state.totalRounds) {
    const [first] = standings(ended);
    return {
      ...ended,
      status: 'finished',
      winnerId: first.id,
      winnerName: first.nickname,
      lastActionText: `🏆 ${first.nickname} fitoi lojën pas ${state.totalRounds} raundeve!`,
    };
  }
  return {
    ...ended,
    status: 'roundOver',
    lastActionText: who ? `👑 ${who} mbaroi gurët dhe fitoi raundin ${state.round}!` : `Gurët mbaruan — raundi ${state.round} përfundoi.`,
  };
}

export function drawRummyTile(state: RummyGameState, playerId: string, source: 'deck' | 'discard'): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.hasDrawn) return state;
  const p = state.players[playerId];
  if (!p) return state;
  if (source === 'deck' && state.deck.length === 0) return endRound(state, null);
  const deck = state.deck.slice();
  const discard = state.discardPile.slice();
  const tile = source === 'discard' ? discard.pop() : deck.pop();
  if (!tile) return state;
  return {
    ...state,
    deck,
    discardPile: discard,
    hasDrawn: true,
    lastDrawnTileId: tile.id,
    players: { ...state.players, [playerId]: { ...p, hand: [...p.hand, tile] } },
    lastActionText: `${p.nickname} mori një gur${source === 'discard' ? ' nga toka' : ''}.`,
  };
}

export function playRummyMeld(state: RummyGameState, playerId: string, tileIds: string[]): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Merr një gur fillimisht!' };
  const p = state.players[playerId];
  if (!p) return { state };
  const chosen = p.hand.filter((t) => tileIds.includes(t.id));
  const ev = evaluateSelectedMelds(chosen);
  if (!ev.valid) return { state, error: 'Kombinim i pavlefshëm! Seri me ngjyrë të njëjtë ose grup me numër të njëjtë, min. 3 gurë.' };
  if (!p.hasOpened && ev.totalPoints < OPEN_MIN) return { state, error: `Për hapje duhen min. ${OPEN_MIN} pikë (ke ${ev.totalPoints}).` };
  const used = new Set(chosen.map((t) => t.id));
  const hand = p.hand.filter((t) => !used.has(t.id));
  if (hand.length === 0) return { state, error: 'Duhet të të mbetet një gur për ta hedhur.' };
  const melds: RummyMeld[] = ev.melds.map((m, i) => ({
    id: `m${state.round}_${state.melds.length + i}`,
    ownerId: playerId,
    ownerName: p.nickname,
    tiles: m.tiles,
    type: m.type,
    points: m.points,
  }));
  return {
    state: {
      ...state,
      melds: [...state.melds, ...melds],
      players: { ...state.players, [playerId]: { ...p, hand, hasOpened: true } },
      lastActionText: `✨ ${p.nickname} ${p.hasOpened ? 'vendosi' : 'u hap me'} ${ev.totalPoints} pikë!`,
    },
  };
}

export function addToRummyMeld(state: RummyGameState, playerId: string, tileIds: string[], meldId: string): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Merr një gur fillimisht!' };
  const p = state.players[playerId];
  const meld = state.melds.find((m) => m.id === meldId);
  if (!p || !meld) return { state };
  if (!p.hasOpened) return { state, error: `Duhet të hapesh vetë me min. ${OPEN_MIN} pikë.` };
  const chosen = p.hand.filter((t) => tileIds.includes(t.id));
  const v = validateSingleMeld([...meld.tiles, ...chosen]);
  if (!v.valid) return { state, error: 'Ky gur nuk përshtatet në këtë kombinim.' };
  const hand = p.hand.filter((t) => !tileIds.includes(t.id));
  if (hand.length === 0) return { state, error: 'Duhet të të mbetet një gur për ta hedhur.' };
  return {
    state: {
      ...state,
      melds: state.melds.map((m) => (m.id === meldId ? { ...m, tiles: v.sorted!, points: v.points } : m)),
      players: { ...state.players, [playerId]: { ...p, hand } },
      lastActionText: `➕ ${p.nickname} shtoi në tavolinë.`,
    },
  };
}

export function discardRummyTile(state: RummyGameState, playerId: string, tileId: string): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return state;
  const p = state.players[playerId];
  const tile = p?.hand.find((t) => t.id === tileId);
  if (!p || !tile) return state;
  const hand = p.hand.filter((t) => t.id !== tileId);
  const base = { ...state, discardPile: [...state.discardPile, tile] };
  const players = { ...state.players, [playerId]: { ...p, hand } };
  if (hand.length === 0) return endRound(base, playerId, players);
  const next = nextSeat(state, playerId);
  return {
    ...base,
    players,
    currentTurn: next,
    hasDrawn: false,
    lastDrawnTileId: null,
    lastActionText: `${p.nickname} hodhi ${tile.isJoker ? 'Jokerin' : tile.number}. Radha e ${state.players[next].nickname}.`,
  };
}

// Kur mbaron koha ose luan boti pa kombinime: merr nga stiva dhe hidh gurin më pak të dobishëm
function pickDiscard(hand: RummyTile[]): RummyTile {
  const useful = new Set(findAllMeldsInHand(hand).flatMap((m) => m.tiles.map((t) => t.id)));
  const pool = hand.filter((t) => !t.isJoker && !useful.has(t.id));
  const from = pool.length ? pool : hand.filter((t) => !t.isJoker).length ? hand.filter((t) => !t.isJoker) : hand;
  return from.reduce((a, b) => (b.number > a.number ? b : a));
}

export function autoPlayTurn(state: RummyGameState): RummyGameState {
  let s = state;
  const id = s.currentTurn;
  if (s.status !== 'playing') return s;
  if (!s.hasDrawn) s = drawRummyTile(s, id, 'deck');
  if (s.status !== 'playing') return s;
  const p = s.players[id];
  return discardRummyTile(s, id, pickDiscard(p.hand).id);
}

export function runBotRummyTurn(state: RummyGameState): RummyGameState {
  let s = state;
  const id = s.currentTurn;
  if (s.status !== 'playing' || !s.players[id]) return s;
  if (!s.hasDrawn) s = drawRummyTile(s, id, 'deck');
  if (s.status !== 'playing') return s;

  const bot = s.players[id];
  const found = findAllMeldsInHand(bot.hand);
  const pts = found.reduce((a, m) => a + m.points, 0);
  if (found.length && (bot.hasOpened || pts >= OPEN_MIN)) {
    const ids = found.flatMap((m) => m.tiles.map((t) => t.id));
    if (bot.hand.length - ids.length >= 1) {
      const r = playRummyMeld(s, id, ids);
      if (!r.error) s = r.state;
    }
  }
  // shto gurë te kombinimet në tavolinë
  if (s.players[id].hasOpened) {
    for (const t of s.players[id].hand.slice()) {
      if (s.players[id].hand.length <= 1) break;
      const meld = s.melds.find((m) => validateSingleMeld([...m.tiles, t]).valid);
      if (meld) {
        const r = addToRummyMeld(s, id, [t.id], meld.id);
        if (!r.error) s = r.state;
      }
    }
  }
  return discardRummyTile(s, id, pickDiscard(s.players[id].hand).id);
}

/* ───────────── vendet: hyrja dhe largimi i lojtarëve ───────────── */

export function replaceRummySeat(state: RummyGameState, oldId: string, newId: string, nickname: string): RummyGameState {
  const old = state.players[oldId];
  if (!old || state.players[newId]) return state;
  const swap = (id: string | null) => (id === oldId ? newId : id);
  const players: Record<string, RummyPlayer> = {};
  state.playerOrder.forEach((id) => {
    const p = state.players[id];
    players[swap(id)!] = id === oldId ? { ...p, id: newId, nickname } : p;
  });
  const scores: Record<string, number[]> = {};
  Object.entries(state.scores).forEach(([id, v]) => { scores[swap(id)!] = v; });
  return {
    ...state,
    players,
    scores,
    playerOrder: state.playerOrder.map((id) => swap(id)!),
    currentTurn: swap(state.currentTurn)!,
    roundWinnerId: swap(state.roundWinnerId),
    winnerId: swap(state.winnerId),
    winnerName: state.winnerId === oldId ? nickname : state.winnerName,
    melds: state.melds.map((m) => (m.ownerId === oldId ? { ...m, ownerId: newId, ownerName: nickname } : m)),
    lastActionText: `👋 ${nickname} zuri vendin e ${old.nickname}.`,
  };
}

export function botifyRummySeat(state: RummyGameState, id: string): RummyGameState {
  const seat = state.playerOrder.indexOf(id);
  if (seat < 0 || isRummyBot(id)) return state;
  let botId = `BOT_RUMMY_${seat}`;
  while (state.players[botId]) botId += 'x';
  const name = state.players[id].nickname;
  const next = replaceRummySeat(state, id, botId, `Bot ${seat}`);
  return { ...next, lastActionText: `${name} doli — boti luan në vend të tij.` };
}

/* ───────────── renditja e dorës ───────────── */

export function sortHand(hand: RummyTile[], by: 'runs' | 'groups'): RummyTile[] {
  const ci = (t: RummyTile) => TILE_COLORS.indexOf(t.color);
  return hand.slice().sort((a, b) => {
    if (!!a.isJoker !== !!b.isJoker) return a.isJoker ? 1 : -1;
    return by === 'runs' ? ci(a) - ci(b) || a.number - b.number : a.number - b.number || ci(a) - ci(b);
  });
}

// Hapja/vendosja nga rafti: çdo grup gurësh të vendosur njëri pas tjetrit kontrollohet veçmas
export function playRummyMeldGroups(state: RummyGameState, playerId: string, groups: string[][]): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Merr një gur fillimisht!' };
  const p = state.players[playerId];
  if (!p || groups.length === 0) return { state };
  const byId = new Map(p.hand.map((t) => [t.id, t]));
  const checked = groups.map((ids) => validateSingleMeld(ids.map((id) => byId.get(id)).filter((t): t is RummyTile => !!t)));
  if (checked.some((c) => !c.valid)) return { state, error: 'Një nga kombinimet në raft nuk është i vlefshëm.' };
  const total = checked.reduce((a, c) => a + c.points, 0);
  if (!p.hasOpened && total < OPEN_MIN) return { state, error: `Për hapje duhen min. ${OPEN_MIN} pikë (ke ${total}).` };
  const used = new Set(groups.flat());
  const hand = p.hand.filter((t) => !used.has(t.id));
  if (hand.length === 0) return { state, error: 'Duhet të të mbetet një gur për ta hedhur.' };
  const melds: RummyMeld[] = checked.map((c, i) => ({
    id: `m${state.round}_${state.melds.length + i}`,
    ownerId: playerId,
    ownerName: p.nickname,
    tiles: c.sorted!,
    type: c.type!,
    points: c.points,
  }));
  return {
    state: {
      ...state,
      melds: [...state.melds, ...melds],
      players: { ...state.players, [playerId]: { ...p, hand, hasOpened: true } },
      lastActionText: `✨ ${p.nickname} ${p.hasOpened ? 'vendosi' : 'u hap me'} ${total} pikë!`,
    },
  };
}
