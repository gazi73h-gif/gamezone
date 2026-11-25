// OKEY KLASIK (si në Okey Plus)
// - 106 gurë: 4 ngjyra × 1..13 × 2 + 2 Jokerë të rremë (sahte okey)
// - treguesi (gösterge) zbulohet; OKEY-u është numri pasues me të njëjtën ngjyrë (13 → 1).
//   Dy kopjet e Okey-t zëvendësojnë çdo gur; Jokerët e rremë vlejnë si vetë guri i Okey-t.
// - krijuesi i radhës merr 15 gurë dhe nis duke hedhur; të tjerët 14
// - radha: merr gurin e stivës ose gurin që sapo hodhi lojtari në të majtë → hidh një gur
// - nuk ka kombinime në tavolinë: lojën e mbyll kush i ka 14 gurë në kombinime (ose 7 çifte)
//   dhe hedh të 15-in mbi stivë
// - seri: e njëjta ngjyrë radhazi (lejohet 12-13-1, jo 13-1-2); grup: i njëjti numër, ngjyra të ndryshme
// - pikët: fituesi i raundit merr −20; të tjerët marrin pikët e gurëve që s'i kanë në kombinime
//   (1–9 sa numri, 10–13 = 10, Okey-u = 10). Pikët mblidhen; pas 4 raundeve fiton kush ka më pak.

export type TileColor = 'red' | 'blue' | 'black' | 'orange';
export const TILE_COLORS: TileColor[] = ['red', 'blue', 'black', 'orange'];

export interface RummyTile {
  id: string;
  number: number; // 1..13 (Jokeri i rremë merr numrin e Okey-t)
  color: TileColor;
  isJoker?: boolean; // Okey: zëvendëson çdo gur
  isFalse?: boolean; // Joker i rremë: vlen si guri i Okey-t
}

export interface RummyPlayer {
  id: string;
  nickname: string;
  hand: RummyTile[];
}

export type FinishHow = 'normal' | 'pairs' | 'okey' | 'pairs-okey';

export interface RoundResult {
  round: number;
  winnerId: string | null; // null = stiva mbaroi, barazim
  how: FinishHow | 'draw';
  points: Record<string, number>; // pikët e secilit lojtar në këtë raund
}

export interface RummyGameState {
  version: 5;
  gameId: number;
  rev: number;
  round: number;
  deck: RummyTile[];
  indicator: RummyTile;
  joker: { color: TileColor; number: number };
  discardPiles: Record<string, RummyTile[]>; // secili hedh në grumbullin e vet; i radhës e merr
  players: Record<string, RummyPlayer>;
  playerOrder: string[];
  currentTurn: string;
  hasDrawn: boolean;
  lastDrawnTileId: string | null;
  discardedOnce: Record<string, boolean>;
  scores: Record<string, number[]>; // pikët e çdo raundi për secilin lojtar
  history: RoundResult[];
  finishTile: RummyTile | null; // guri me të cilin u mbyll loja (mbi stivë)
  status: 'playing' | 'roundOver' | 'finished';
  roundWinnerId: string | null;
  winnerId: string | null;
  winnerName: string | null;
  lastActionText: string;
}

export const RUMMY_SEATS = 4;
export const HAND_SIZE = 14;
export const TOTAL_ROUNDS = 4;
export const WIN_POINTS = -20;
export const JOKER_PENALTY = 10;

export const isRummyBot = (id: string) => id.startsWith('BOT_RUMMY');

// Lojërat me rregullat e mëparshme duhet të fillojnë nga e para
export function isTileRummyState(s: unknown): s is RummyGameState {
  const st = s as Partial<RummyGameState> | null;
  return !!st && st.version === 5 && !!st.indicator;
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

export const jokerFor = (indicator: { color: TileColor; number: number }) => ({
  color: indicator.color,
  number: indicator.number === 13 ? 1 : indicator.number + 1,
});


/* ───────────── kombinimet ───────────── */

export interface MeldCheck {
  valid: boolean;
  type?: 'group' | 'run';
  sorted?: RummyTile[];
}

// vlerat e serisë: 1..13, ose 1 si "14" pas 13-shit (12-13-1); pa kalim 13-1-2
function runFits(values: number[], jokers: number, high: boolean): number[] | null {
  const v = values.slice().sort((a, b) => a - b);
  for (let i = 1; i < v.length; i++) if (v[i] === v[i - 1]) return null;
  let gaps = 0;
  for (let i = 1; i < v.length; i++) gaps += v[i] - v[i - 1] - 1;
  if (gaps > jokers) return null;
  const max = high ? 14 : 13;
  let spare = jokers - gaps;
  let start = v[0];
  let end = v[v.length - 1];
  const after = Math.min(spare, max - end);
  end += after;
  spare -= after;
  start -= spare;
  if (start < 1 || end > max) return null;
  const out: number[] = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

export function validateSingleMeld(tiles: RummyTile[]): MeldCheck {
  const bad: MeldCheck = { valid: false };
  if (tiles.length < 3) return bad;
  const plain = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);
  if (plain.length === 0) return { valid: true, type: 'group', sorted: tiles };

  const n0 = plain[0].number;
  if (tiles.length <= 4 && plain.every((t) => t.number === n0) && new Set(plain.map((t) => t.color)).size === plain.length) {
    return { valid: true, type: 'group', sorted: [...plain, ...jokers] };
  }

  const c0 = plain[0].color;
  if (tiles.length <= 14 && plain.every((t) => t.color === c0)) {
    for (const high of [false, true]) {
      if (high && !plain.some((t) => t.number === 1)) continue;
      const val = (t: RummyTile) => (high && t.number === 1 ? 14 : t.number);
      // 1-shi i lartë s'mund të jetë në të njëjtën seri me 1-shin e ulët
      const seq = runFits(plain.map(val), jokers.length, high);
      if (!seq) continue;
      const js = jokers.slice();
      const sorted = seq.map((n) => plain.find((t) => val(t) === n) ?? js.pop()!);
      return { valid: true, type: 'run', sorted };
    }
  }
  return bad;
}

// Mbulim i plotë: a mund të ndahen të gjithë gurët në kombinime? (kthen kombinimet ose null)
export function solveMelds(tiles: RummyTile[]): RummyTile[][] | null {
  if (tiles.length === 0) return [];
  if (tiles.length < 3) return null;
  const plain = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);
  if (plain.length === 0) return tiles.length <= 4 ? [tiles] : null;
  const pivot = plain[0];
  const rest = plain.slice(1);
  const tried = new Set<string>();

  const attempt = (picked: RummyTile[], usedJokers: number): RummyTile[][] | null => {
    const key = picked.map((t) => `${t.color}${t.number}`).sort().join() + '|' + usedJokers;
    if (tried.has(key)) return null;
    tried.add(key);
    const meld = [...picked, ...jokers.slice(0, usedJokers)];
    if (!validateSingleMeld(meld).valid) return null;
    const used = new Set(meld.map((t) => t.id));
    const sub = solveMelds(tiles.filter((t) => !used.has(t.id)));
    return sub ? [meld, ...sub] : null;
  };

  // grupe me pivotin
  const others = TILE_COLORS.filter((c) => c !== pivot.color)
    .map((c) => rest.find((t) => t.color === c && t.number === pivot.number))
    .filter((t): t is RummyTile => !!t);
  const subsets = (arr: RummyTile[]): RummyTile[][] => arr.reduce<RummyTile[][]>((acc, t) => [...acc, ...acc.map((s) => [...s, t])], [[]]);
  for (const sub of subsets(others)) {
    for (let j = 0; j <= jokers.length; j++) {
      const size = 1 + sub.length + j;
      if (size < 3 || size > 4) continue;
      const r = attempt([pivot, ...sub], j);
      if (r) return r;
    }
  }

  // seri me pivotin (1 i ulët ose i lartë)
  for (const high of [false, true]) {
    if (high && pivot.number !== 1 && !rest.some((t) => t.color === pivot.color && t.number === 1)) continue;
    const val = (t: RummyTile) => (high && t.number === 1 ? 14 : t.number);
    const pv = val(pivot);
    const max = high ? 14 : 13;
    for (let start = Math.max(1, pv - 13); start <= pv; start++) {
      for (let end = Math.max(pv, start + 2); end <= Math.min(max, start + 13); end++) {
        const picked: RummyTile[] = [pivot];
        const taken = new Set([pivot.id]);
        let need = 0;
        for (let n = start; n <= end; n++) {
          if (n === pv) continue;
          const t = rest.find((x) => !taken.has(x.id) && x.color === pivot.color && val(x) === n);
          if (t) { picked.push(t); taken.add(t.id); } else need++;
        }
        if (need > jokers.length) continue;
        const r = attempt(picked, need);
        if (r) return r;
      }
    }
  }
  return null;
}

// 7 çifte: dy gurë identikë (Okey-u bën çift me çdo gur)
export function isSevenPairs(tiles: RummyTile[]): boolean {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter((t) => t.isJoker).length;
  const counts = new Map<string, number>();
  tiles.filter((t) => !t.isJoker).forEach((t) => counts.set(`${t.color}${t.number}`, (counts.get(`${t.color}${t.number}`) ?? 0) + 1));
  let singles = 0;
  counts.forEach((c) => { singles += c % 2; });
  return singles <= jokers && (jokers - singles) % 2 === 0;
}

// A mbyllet loja nëse hidhet ky gur? Kthen mënyrën e mbylljes ose null
export function finishWith(hand: RummyTile[], tileId: string): FinishHow | null {
  const tile = hand.find((t) => t.id === tileId);
  if (!tile || tile.isJoker || hand.length !== HAND_SIZE + 1) return null; // Okey-u s'hidhet kurrë
  const rest = hand.filter((t) => t.id !== tileId);
  const okey = !!tile.isJoker;
  if (solveMelds(rest)) return okey ? 'okey' : 'normal';
  if (isSevenPairs(rest)) return okey ? 'pairs-okey' : 'pairs';
  return null;
}

// Të gjithë gurët me të cilët mund të mbyllet (renditur: më shumë pikë së pari)
export function finishOptions(hand: RummyTile[]): { tileId: string; how: FinishHow }[] {
  if (hand.length !== HAND_SIZE + 1) return [];
  const out: { tileId: string; how: FinishHow }[] = [];
  const seen = new Set<string>();
  for (const t of hand) {
    const key = t.isJoker ? 'J' : `${t.color}${t.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const how = finishWith(hand, t.id);
    if (how) out.push({ tileId: t.id, how });
  }
  return out;
}

// Kombinimet më të mira në dorë (për botin dhe butonin "Kombinime")
export function findAllMeldsInHand(hand: RummyTile[]): { tiles: RummyTile[] }[] {
  const plain = hand.filter((t) => !t.isJoker);
  const jokers = hand.filter((t) => t.isJoker);
  const cands: { tiles: RummyTile[]; ids: Set<string> }[] = [];
  const push = (tiles: RummyTile[]) => {
    const v = validateSingleMeld(tiles);
    if (v.valid) cands.push({ tiles: v.sorted!, ids: new Set(tiles.map((t) => t.id)) });
  };
  for (let n = 1; n <= 13; n++) {
    const byColor = new Map<TileColor, RummyTile>();
    plain.filter((t) => t.number === n).forEach((t) => { if (!byColor.has(t.color)) byColor.set(t.color, t); });
    const list = [...byColor.values()];
    if (list.length >= 3) { push(list); if (list.length === 4) list.forEach((_, i) => push(list.filter((__, j) => j !== i))); }
    if (list.length === 2 && jokers.length >= 1) push([...list, jokers[0]]);
  }
  for (const color of TILE_COLORS) {
    const uniq = [...new Map(plain.filter((t) => t.color === color).map((t) => [t.number, t])).values()];
    const ace = uniq.find((t) => t.number === 1);
    for (const high of [false, true]) {
      if (high && !ace) continue;
      const val = (t: RummyTile) => (high && t.number === 1 ? 14 : t.number);
      const list = uniq.slice().sort((a, b) => val(a) - val(b));
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const slice = list.slice(i, j + 1);
          const missing = val(slice[slice.length - 1]) - val(slice[0]) + 1 - slice.length;
          if (missing > jokers.length) break;
          if (slice.length + missing >= 3) push([...slice, ...jokers.slice(0, missing)]);
          else if (jokers.length) push([...slice, jokers[0]]);
        }
      }
    }
  }
  cands.sort((a, b) => b.tiles.length - a.tiles.length);
  let best: { tiles: RummyTile[] }[] = [];
  let bestCount = 0;
  let steps = 0;
  const search = (from: number, chosen: typeof cands, used: Set<string>, count: number) => {
    if (++steps > 20000) return;
    if (count > bestCount) { bestCount = count; best = chosen.map((c) => ({ tiles: c.tiles })); }
    for (let i = from; i < cands.length; i++) {
      const c = cands[i];
      if ([...c.ids].some((id) => used.has(id))) continue;
      search(i + 1, [...chosen, c], new Set([...used, ...c.ids]), count + c.tiles.length);
    }
  };
  search(0, [], new Set(), 0);
  return best;
}

/* ───────────── rrjedha e lojës ───────────── */

export const prevSeat = (s: Pick<RummyGameState, 'playerOrder'>, id: string) =>
  s.playerOrder[(s.playerOrder.indexOf(id) - 1 + s.playerOrder.length) % s.playerOrder.length];
const nextSeat = (s: Pick<RummyGameState, 'playerOrder'>, id: string) =>
  s.playerOrder[(s.playerOrder.indexOf(id) + 1) % s.playerOrder.length];

function dealRound(
  seats: { id: string; nickname: string }[],
  round: number,
  base: Pick<RummyGameState, 'gameId' | 'rev' | 'scores' | 'history'>,
): RummyGameState {
  const plain: RummyTile[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const color of TILE_COLORS) for (let n = 1; n <= 13; n++) plain.push({ id: `${color}-${n}-${copy}`, number: n, color });
  }
  const mixed = shuffle(plain);
  const indicator = mixed.pop()!; // treguesi s'është kurrë Joker i rremë
  const joker = jokerFor(indicator);
  const falseJokers: RummyTile[] = [0, 1].map((i) => ({ id: `fake-${i}`, color: joker.color, number: joker.number, isFalse: true }));
  const deck = shuffle([
    ...mixed.map((t) => (t.color === joker.color && t.number === joker.number ? { ...t, isJoker: true } : t)),
    ...falseJokers,
  ]);
  const order = seats.map((p) => p.id);
  const starter = order[(round - 1) % order.length];
  const players: Record<string, RummyPlayer> = {};
  const discardPiles: Record<string, RummyTile[]> = {};
  const discardedOnce: Record<string, boolean> = {};
  seats.forEach((p) => {
    players[p.id] = { id: p.id, nickname: p.nickname, hand: deck.splice(0, p.id === starter ? HAND_SIZE + 1 : HAND_SIZE) };
    discardPiles[p.id] = [];
    discardedOnce[p.id] = false;
  });
  return {
    version: 5,
    gameId: base.gameId,
    rev: base.rev,
    round,
    deck,
    indicator,
    joker,
    discardPiles,
    players,
    playerOrder: order,
    currentTurn: starter,
    hasDrawn: true,
    lastDrawnTileId: null,
    discardedOnce,
    scores: base.scores,
    history: base.history,
    finishTile: null,
    status: 'playing',
    roundWinnerId: null,
    winnerId: null,
    winnerName: null,
    lastActionText: `Raundi ${round} filloi! ${players[starter].nickname} ka 15 gurë dhe nis duke hedhur.`,
  };
}

// Vendet bosh mbushen me bot; lojtarët e rinj i zënë më vonë
export function initRummyGame(list: { id: string; nickname: string }[]): RummyGameState {
  const seats = list.slice(0, RUMMY_SEATS);
  for (let i = seats.length; i < RUMMY_SEATS; i++) seats.push({ id: `BOT_RUMMY_${i}`, nickname: `Bot ${i}` });
  const scores: Record<string, number[]> = {};
  seats.forEach((p) => { scores[p.id] = []; });
  return dealRound(seats, 1, { gameId: Date.now(), rev: 0, scores, history: [] });
}

export function startNextRound(state: RummyGameState): RummyGameState {
  if (state.status !== 'roundOver') return state;
  const seats = state.playerOrder.map((id) => ({ id, nickname: state.players[id].nickname }));
  return dealRound(seats, state.round + 1, state);
}

// Vlera e gurit që mbetet jashtë kombinimeve: 1–9 sa numri, 10–13 = 10, Okey-u = 10
export const tileValue = (t: RummyTile) => (t.isJoker ? JOKER_PENALTY : Math.min(t.number, 10));

// Pikët e dorës: vetëm gurët që s'hyjnë në kombinimet më të mira (loja i rendit vetë)
export function handPenalty(hand: RummyTile[]): number {
  const inMelds = new Set(findAllMeldsInHand(hand).flatMap((m) => m.tiles.map((t) => t.id)));
  return hand.filter((t) => !inMelds.has(t.id)).reduce((a, t) => a + tileValue(t), 0);
}

export const totalScore = (s: RummyGameState, id: string) => (s.scores[id] ?? []).reduce((a, b) => a + b, 0);

// Më pak pikë = më mirë
export function standings(s: RummyGameState) {
  return s.playerOrder
    .map((id) => ({ id, nickname: s.players[id].nickname, total: totalScore(s, id) }))
    .sort((a, b) => a.total - b.total || Number(b.id === s.roundWinnerId) - Number(a.id === s.roundWinnerId));
}

// Fundi i raundit: fituesi −20, të tjerët pikët e gurëve jashtë kombinimeve; pas raundit të 4-t mbaron loja
function endRound(state: RummyGameState, winnerId: string | null, how: FinishHow | 'draw', extra: Partial<RummyGameState> = {}): RummyGameState {
  const players = extra.players ?? state.players;
  const points: Record<string, number> = {};
  const scores: Record<string, number[]> = {};
  state.playerOrder.forEach((id) => {
    points[id] = id === winnerId ? WIN_POINTS : handPenalty(players[id].hand);
    scores[id] = [...(state.scores[id] ?? []), points[id]];
  });
  const ended: RummyGameState = {
    ...state, ...extra, scores,
    history: [...state.history, { round: state.round, winnerId, how, points }],
    roundWinnerId: winnerId, hasDrawn: false, lastDrawnTileId: null, status: 'roundOver',
  };
  if (state.round >= TOTAL_ROUNDS) {
    const [first] = standings(ended);
    return { ...ended, status: 'finished', winnerId: first.id, winnerName: first.nickname, lastActionText: `🏆 ${first.nickname} fitoi lojën me ${first.total} pikë!` };
  }
  const who = winnerId ? state.players[winnerId].nickname : '';
  const way = how === 'pairs' || how === 'pairs-okey' ? ' me 7 çifte' : how === 'okey' ? ' duke hedhur Okey-n' : '';
  return {
    ...ended,
    lastActionText: winnerId ? `👑 ${who} e mbylli raundin${way} (${WIN_POINTS} pikë)!` : 'Stiva mbaroi — secili merr pikët e gurëve jashtë kombinimeve.',
  };
}

export function drawRummyTile(state: RummyGameState, playerId: string, source: 'deck' | 'left'): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.hasDrawn) return state;
  const p = state.players[playerId];
  if (!p) return state;
  if (source === 'deck' && state.deck.length === 0) return endRound(state, null, 'draw');
  const deck = state.deck.slice();
  const from = prevSeat(state, playerId);
  const pile = state.discardPiles[from].slice();
  const tile = source === 'left' ? pile.pop() : deck.pop();
  if (!tile) return state;
  return {
    ...state,
    deck,
    discardPiles: { ...state.discardPiles, [from]: pile },
    hasDrawn: true,
    lastDrawnTileId: tile.id,
    players: { ...state.players, [playerId]: { ...p, hand: [...p.hand, tile] } },
    lastActionText: source === 'left'
      ? `${p.nickname} mori gurin e ${state.players[from].nickname}.`
      : `${p.nickname} mori një gur nga stiva.`,
  };
}

export function discardRummyTile(state: RummyGameState, playerId: string, tileId: string): RummyGameState {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return state;
  const p = state.players[playerId];
  const tile = p?.hand.find((t) => t.id === tileId);
  if (!p || !tile || tile.isJoker) return state; // Okey-u (Jokeri) nuk mund të hidhet në tavolinë
  const next = nextSeat(state, playerId);
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...p, hand: p.hand.filter((t) => t.id !== tileId) } },
    discardPiles: { ...state.discardPiles, [playerId]: [...state.discardPiles[playerId], tile] },
    discardedOnce: { ...state.discardedOnce, [playerId]: true },
    currentTurn: next,
    hasDrawn: false,
    lastDrawnTileId: null,
    lastActionText: `${p.nickname} hodhi ${tile.isJoker ? 'Okey-n' : tile.number}. Radha e ${state.players[next].nickname}.`,
  };
}

// Mbyllja: 14 gurë në kombinime (ose 7 çifte), i 15-i hidhet mbi stivë
export function finishRummyRound(state: RummyGameState, playerId: string, tileId: string): { state: RummyGameState; error?: string } {
  if (state.status !== 'playing' || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: 'Merr një gur fillimisht!' };
  const p = state.players[playerId];
  const how = p ? finishWith(p.hand, tileId) : null;
  if (!p || !how) return { state, error: 'Për ta mbyllur, 14 gurët e tjerë duhet të jenë të gjithë në kombinime ose 7 çifte.' };
  const tile = p.hand.find((t) => t.id === tileId)!;
  return {
    state: endRound(state, playerId, how, {
      finishTile: tile,
      players: { ...state.players, [playerId]: { ...p, hand: p.hand.filter((t) => t.id !== tileId) } },
    }),
  };
}

/* ───────────── loja automatike: koha mbaroi / boti ───────────── */

const usefulIds = (hand: RummyTile[]) => new Set(findAllMeldsInHand(hand).flatMap((m) => m.tiles.map((t) => t.id)));
const coverage = (hand: RummyTile[]) => usefulIds(hand).size;

function pickDiscard(hand: RummyTile[]): RummyTile {
  const useful = usefulIds(hand);
  const counts = new Map<string, number>();
  hand.forEach((t) => counts.set(`${t.color}${t.number}`, (counts.get(`${t.color}${t.number}`) ?? 0) + 1));
  const pool = hand.filter((t) => !t.isJoker && !useful.has(t.id));
  const from = pool.length ? pool : hand.filter((t) => !t.isJoker);
  // ruaj çiftet dhe gurët afër njëri-tjetrit; hidh gurin më të vetmuar
  const lonely = (t: RummyTile) => (counts.get(`${t.color}${t.number}`) ?? 0) * 3 +
    hand.filter((x) => x.id !== t.id && x.color === t.color && Math.abs(x.number - t.number) <= 2).length;
  return from.reduce((a, b) => (lonely(b) < lonely(a) ? b : a));
}

export function autoPlayTurn(state: RummyGameState): RummyGameState {
  let s = state;
  const id = s.currentTurn;
  if (s.status !== 'playing') return s;
  if (!s.hasDrawn) s = drawRummyTile(s, id, 'deck');
  if (s.status !== 'playing') return s;
  return discardRummyTile(s, id, pickDiscard(s.players[id].hand).id);
}

export function runBotRummyTurn(state: RummyGameState): RummyGameState {
  let s = state;
  const id = s.currentTurn;
  if (s.status !== 'playing' || !s.players[id]) return s;
  if (!s.hasDrawn) {
    const left = s.discardPiles[prevSeat(s, id)].at(-1);
    const hand = s.players[id].hand;
    const better = left && (left.isJoker || coverage([...hand, left]) > coverage(hand) + 1);
    s = drawRummyTile(s, id, better ? 'left' : 'deck');
    if (s.status !== 'playing') return s;
  }
  const [best] = finishOptions(s.players[id].hand);
  if (best) return finishRummyRound(s, id, best.tileId).state;
  return discardRummyTile(s, id, pickDiscard(s.players[id].hand).id);
}

/* ───────────── vendet: hyrja dhe largimi i lojtarëve ───────────── */

export function replaceRummySeat(state: RummyGameState, oldId: string, newId: string, nickname: string): RummyGameState {
  const old = state.players[oldId];
  if (!old || state.players[newId]) return state;
  const swap = (id: string | null) => (id === oldId ? newId : id);
  const rekey = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [swap(k)!, v]));
  const players: Record<string, RummyPlayer> = {};
  state.playerOrder.forEach((id) => {
    players[swap(id)!] = id === oldId ? { ...state.players[id], id: newId, nickname } : state.players[id];
  });
  return {
    ...state,
    players,
    discardPiles: rekey(state.discardPiles),
    discardedOnce: rekey(state.discardedOnce),
    scores: rekey(state.scores),
    history: state.history.map((h) => ({ ...h, winnerId: swap(h.winnerId), points: rekey(h.points) })),
    playerOrder: state.playerOrder.map((id) => swap(id)!),
    currentTurn: swap(state.currentTurn)!,
    roundWinnerId: swap(state.roundWinnerId),
    winnerId: swap(state.winnerId),
    winnerName: state.winnerId === oldId ? nickname : state.winnerName,
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

// Çiftet bashkë (për mbylljen me 7 çifte)
export function pairGroups(hand: RummyTile[]): RummyTile[][] {
  const map = new Map<string, RummyTile[]>();
  sortHand(hand, 'runs').forEach((t) => {
    const k = t.isJoker ? 'J' : `${t.color}${t.number}`;
    map.set(k, [...(map.get(k) ?? []), t]);
  });
  const pairs: RummyTile[][] = [];
  const singles: RummyTile[] = [];
  map.forEach((ts, k) => {
    if (k === 'J') { singles.push(...ts); return; }
    for (let i = 0; i + 1 < ts.length; i += 2) pairs.push([ts[i], ts[i + 1]]);
    if (ts.length % 2) singles.push(ts[ts.length - 1]);
  });
  return [...pairs, singles];
}
