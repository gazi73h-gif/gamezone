// GameZone · Okey në server — SKEDAR I GJENERUAR nga entry.ts + src/server/okeyServer.ts (mos e ndrysho me dorë)

// src/lib/rummyLogic.ts
var TILE_COLORS = ["red", "blue", "black", "orange"];
var RUMMY_SEATS = 4;
var HAND_SIZE = 14;
var TOTAL_ROUNDS = 4;
var WIN_POINTS = -20;
var JOKER_PENALTY = 10;
var isRummyBot = (id) => id.startsWith("BOT_RUMMY");
function isTileRummyState(s) {
  const st = s;
  return !!st && st.version === 5 && !!st.indicator;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
var jokerFor = (indicator) => ({
  color: indicator.color,
  number: indicator.number === 13 ? 1 : indicator.number + 1
});
function runFits(values, jokers, high) {
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
  const out = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}
function validateSingleMeld(tiles) {
  const bad = { valid: false };
  if (tiles.length < 3) return bad;
  const plain = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);
  if (plain.length === 0) return { valid: true, type: "group", sorted: tiles };
  const n0 = plain[0].number;
  if (tiles.length <= 4 && plain.every((t) => t.number === n0) && new Set(plain.map((t) => t.color)).size === plain.length) {
    return { valid: true, type: "group", sorted: [...plain, ...jokers] };
  }
  const c0 = plain[0].color;
  if (tiles.length <= 14 && plain.every((t) => t.color === c0)) {
    for (const high of [false, true]) {
      if (high && !plain.some((t) => t.number === 1)) continue;
      const val = (t) => high && t.number === 1 ? 14 : t.number;
      const seq = runFits(plain.map(val), jokers.length, high);
      if (!seq) continue;
      const js = jokers.slice();
      const sorted = seq.map((n) => plain.find((t) => val(t) === n) ?? js.pop());
      return { valid: true, type: "run", sorted };
    }
  }
  return bad;
}
function solveMelds(tiles) {
  if (tiles.length === 0) return [];
  if (tiles.length < 3) return null;
  const plain = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);
  if (plain.length === 0) return tiles.length <= 4 ? [tiles] : null;
  const pivot = plain[0];
  const rest2 = plain.slice(1);
  const tried = /* @__PURE__ */ new Set();
  const attempt = (picked, usedJokers) => {
    const key = picked.map((t) => `${t.color}${t.number}`).sort().join() + "|" + usedJokers;
    if (tried.has(key)) return null;
    tried.add(key);
    const meld = [...picked, ...jokers.slice(0, usedJokers)];
    if (!validateSingleMeld(meld).valid) return null;
    const used = new Set(meld.map((t) => t.id));
    const sub = solveMelds(tiles.filter((t) => !used.has(t.id)));
    return sub ? [meld, ...sub] : null;
  };
  const others = TILE_COLORS.filter((c) => c !== pivot.color).map((c) => rest2.find((t) => t.color === c && t.number === pivot.number)).filter((t) => !!t);
  const subsets = (arr) => arr.reduce((acc, t) => [...acc, ...acc.map((s) => [...s, t])], [[]]);
  for (const sub of subsets(others)) {
    for (let j = 0; j <= jokers.length; j++) {
      const size = 1 + sub.length + j;
      if (size < 3 || size > 4) continue;
      const r = attempt([pivot, ...sub], j);
      if (r) return r;
    }
  }
  for (const high of [false, true]) {
    if (high && pivot.number !== 1 && !rest2.some((t) => t.color === pivot.color && t.number === 1)) continue;
    const val = (t) => high && t.number === 1 ? 14 : t.number;
    const pv = val(pivot);
    const max = high ? 14 : 13;
    for (let start = Math.max(1, pv - 13); start <= pv; start++) {
      for (let end = Math.max(pv, start + 2); end <= Math.min(max, start + 13); end++) {
        const picked = [pivot];
        const taken = /* @__PURE__ */ new Set([pivot.id]);
        let need = 0;
        for (let n = start; n <= end; n++) {
          if (n === pv) continue;
          const t = rest2.find((x) => !taken.has(x.id) && x.color === pivot.color && val(x) === n);
          if (t) {
            picked.push(t);
            taken.add(t.id);
          } else need++;
        }
        if (need > jokers.length) continue;
        const r = attempt(picked, need);
        if (r) return r;
      }
    }
  }
  return null;
}
function isSevenPairs(tiles) {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter((t) => t.isJoker).length;
  const counts = /* @__PURE__ */ new Map();
  tiles.filter((t) => !t.isJoker).forEach((t) => counts.set(`${t.color}${t.number}`, (counts.get(`${t.color}${t.number}`) ?? 0) + 1));
  let singles = 0;
  counts.forEach((c) => {
    singles += c % 2;
  });
  return singles <= jokers && (jokers - singles) % 2 === 0;
}
function finishWith(hand, tileId) {
  const tile = hand.find((t) => t.id === tileId);
  if (!tile || tile.isJoker || hand.length !== HAND_SIZE + 1) return null;
  const rest2 = hand.filter((t) => t.id !== tileId);
  const okey = !!tile.isJoker;
  if (solveMelds(rest2)) return okey ? "okey" : "normal";
  if (isSevenPairs(rest2)) return okey ? "pairs-okey" : "pairs";
  return null;
}
function finishOptions(hand) {
  if (hand.length !== HAND_SIZE + 1) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const t of hand) {
    const key = t.isJoker ? "J" : `${t.color}${t.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const how = finishWith(hand, t.id);
    if (how) out.push({ tileId: t.id, how });
  }
  return out;
}
function findAllMeldsInHand(hand) {
  const plain = hand.filter((t) => !t.isJoker);
  const jokers = hand.filter((t) => t.isJoker);
  const cands = [];
  const push = (tiles) => {
    const v = validateSingleMeld(tiles);
    if (v.valid) cands.push({ tiles: v.sorted, ids: new Set(tiles.map((t) => t.id)) });
  };
  for (let n = 1; n <= 13; n++) {
    const byColor = /* @__PURE__ */ new Map();
    plain.filter((t) => t.number === n).forEach((t) => {
      if (!byColor.has(t.color)) byColor.set(t.color, t);
    });
    const list = [...byColor.values()];
    if (list.length >= 3) {
      push(list);
      if (list.length === 4) list.forEach((_, i) => push(list.filter((__, j) => j !== i)));
    }
    if (list.length === 2 && jokers.length >= 1) push([...list, jokers[0]]);
  }
  for (const color of TILE_COLORS) {
    const uniq = [...new Map(plain.filter((t) => t.color === color).map((t) => [t.number, t])).values()];
    const ace = uniq.find((t) => t.number === 1);
    for (const high of [false, true]) {
      if (high && !ace) continue;
      const val = (t) => high && t.number === 1 ? 14 : t.number;
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
  let best = [];
  let bestCount = 0;
  let steps = 0;
  const search = (from, chosen, used, count) => {
    if (++steps > 2e4) return;
    if (count > bestCount) {
      bestCount = count;
      best = chosen.map((c) => ({ tiles: c.tiles }));
    }
    for (let i = from; i < cands.length; i++) {
      const c = cands[i];
      if ([...c.ids].some((id) => used.has(id))) continue;
      search(i + 1, [...chosen, c], /* @__PURE__ */ new Set([...used, ...c.ids]), count + c.tiles.length);
    }
  };
  search(0, [], /* @__PURE__ */ new Set(), 0);
  return best;
}
var prevSeat = (s, id) => s.playerOrder[(s.playerOrder.indexOf(id) - 1 + s.playerOrder.length) % s.playerOrder.length];
var nextSeat = (s, id) => s.playerOrder[(s.playerOrder.indexOf(id) + 1) % s.playerOrder.length];
function dealRound(seats, round, base) {
  const plain = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const color of TILE_COLORS) for (let n = 1; n <= 13; n++) plain.push({ id: `${color}-${n}-${copy}`, number: n, color });
  }
  const mixed = shuffle(plain);
  const indicator = mixed.pop();
  const joker = jokerFor(indicator);
  const falseJokers = [0, 1].map((i) => ({ id: `fake-${i}`, color: joker.color, number: joker.number, isFalse: true }));
  const deck = shuffle([
    ...mixed.map((t) => t.color === joker.color && t.number === joker.number ? { ...t, isJoker: true } : t),
    ...falseJokers
  ]);
  const order = seats.map((p) => p.id);
  const starter = order[(round - 1) % order.length];
  const players = {};
  const discardPiles = {};
  const discardedOnce = {};
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
    status: "playing",
    roundWinnerId: null,
    winnerId: null,
    winnerName: null,
    lastActionText: `Raundi ${round} filloi! ${players[starter].nickname} ka 15 gur\xEB dhe nis duke hedhur.`
  };
}
function initRummyGame(list) {
  const seats = list.slice(0, RUMMY_SEATS);
  for (let i = seats.length; i < RUMMY_SEATS; i++) seats.push({ id: `BOT_RUMMY_${i}`, nickname: `Bot ${i}` });
  const scores = {};
  seats.forEach((p) => {
    scores[p.id] = [];
  });
  return dealRound(seats, 1, { gameId: Date.now(), rev: 0, scores, history: [] });
}
function startNextRound(state) {
  if (state.status !== "roundOver") return state;
  const seats = state.playerOrder.map((id) => ({ id, nickname: state.players[id].nickname }));
  return dealRound(seats, state.round + 1, state);
}
var tileValue = (t) => t.isJoker ? JOKER_PENALTY : Math.min(t.number, 10);
function handPenalty(hand) {
  const inMelds = new Set(findAllMeldsInHand(hand).flatMap((m) => m.tiles.map((t) => t.id)));
  return hand.filter((t) => !inMelds.has(t.id)).reduce((a, t) => a + tileValue(t), 0);
}
var totalScore = (s, id) => (s.scores[id] ?? []).reduce((a, b) => a + b, 0);
function standings(s) {
  return s.playerOrder.map((id) => ({ id, nickname: s.players[id].nickname, total: totalScore(s, id) })).sort((a, b) => a.total - b.total || Number(b.id === s.roundWinnerId) - Number(a.id === s.roundWinnerId));
}
function endRound(state, winnerId, how, extra = {}) {
  const players = extra.players ?? state.players;
  const points = {};
  const scores = {};
  state.playerOrder.forEach((id) => {
    points[id] = id === winnerId ? WIN_POINTS : handPenalty(players[id].hand);
    scores[id] = [...state.scores[id] ?? [], points[id]];
  });
  const ended = {
    ...state,
    ...extra,
    scores,
    history: [...state.history, { round: state.round, winnerId, how, points }],
    roundWinnerId: winnerId,
    hasDrawn: false,
    lastDrawnTileId: null,
    status: "roundOver"
  };
  if (state.round >= TOTAL_ROUNDS) {
    const [first] = standings(ended);
    return { ...ended, status: "finished", winnerId: first.id, winnerName: first.nickname, lastActionText: `\u{1F3C6} ${first.nickname} fitoi loj\xEBn me ${first.total} pik\xEB!` };
  }
  const who = winnerId ? state.players[winnerId].nickname : "";
  const way = how === "pairs" || how === "pairs-okey" ? " me 7 \xE7ifte" : how === "okey" ? " duke hedhur Okey-n" : "";
  return {
    ...ended,
    lastActionText: winnerId ? `\u{1F451} ${who} e mbylli raundin${way} (${WIN_POINTS} pik\xEB)!` : "Stiva mbaroi \u2014 secili merr pik\xEBt e gur\xEBve jasht\xEB kombinimeve."
  };
}
function drawRummyTile(state, playerId, source) {
  if (state.status !== "playing" || state.currentTurn !== playerId || state.hasDrawn) return state;
  const p = state.players[playerId];
  if (!p) return state;
  if (source === "deck" && state.deck.length === 0) return endRound(state, null, "draw");
  const deck = state.deck.slice();
  const from = prevSeat(state, playerId);
  const pile = state.discardPiles[from].slice();
  const tile = source === "left" ? pile.pop() : deck.pop();
  if (!tile) return state;
  return {
    ...state,
    deck,
    discardPiles: { ...state.discardPiles, [from]: pile },
    hasDrawn: true,
    lastDrawnTileId: tile.id,
    players: { ...state.players, [playerId]: { ...p, hand: [...p.hand, tile] } },
    lastActionText: source === "left" ? `${p.nickname} mori gurin e ${state.players[from].nickname}.` : `${p.nickname} mori nj\xEB gur nga stiva.`
  };
}
function discardRummyTile(state, playerId, tileId) {
  if (state.status !== "playing" || state.currentTurn !== playerId || !state.hasDrawn) return state;
  const p = state.players[playerId];
  const tile = p?.hand.find((t) => t.id === tileId);
  if (!p || !tile || tile.isJoker) return state;
  const next = nextSeat(state, playerId);
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...p, hand: p.hand.filter((t) => t.id !== tileId) } },
    discardPiles: { ...state.discardPiles, [playerId]: [...state.discardPiles[playerId], tile] },
    discardedOnce: { ...state.discardedOnce, [playerId]: true },
    currentTurn: next,
    hasDrawn: false,
    lastDrawnTileId: null,
    lastActionText: `${p.nickname} hodhi ${tile.isJoker ? "Okey-n" : tile.number}. Radha e ${state.players[next].nickname}.`
  };
}
function finishRummyRound(state, playerId, tileId) {
  if (state.status !== "playing" || state.currentTurn !== playerId || !state.hasDrawn) return { state, error: "Merr nj\xEB gur fillimisht!" };
  const p = state.players[playerId];
  const how = p ? finishWith(p.hand, tileId) : null;
  if (!p || !how) return { state, error: "P\xEBr ta mbyllur, 14 gur\xEBt e tjer\xEB duhet t\xEB jen\xEB t\xEB gjith\xEB n\xEB kombinime ose 7 \xE7ifte." };
  const tile = p.hand.find((t) => t.id === tileId);
  return {
    state: endRound(state, playerId, how, {
      finishTile: tile,
      players: { ...state.players, [playerId]: { ...p, hand: p.hand.filter((t) => t.id !== tileId) } }
    })
  };
}
var usefulIds = (hand) => new Set(findAllMeldsInHand(hand).flatMap((m) => m.tiles.map((t) => t.id)));
var coverage = (hand) => usefulIds(hand).size;
function pickDiscard(hand) {
  const useful = usefulIds(hand);
  const counts = /* @__PURE__ */ new Map();
  hand.forEach((t) => counts.set(`${t.color}${t.number}`, (counts.get(`${t.color}${t.number}`) ?? 0) + 1));
  const pool = hand.filter((t) => !t.isJoker && !useful.has(t.id));
  const from = pool.length ? pool : hand.filter((t) => !t.isJoker);
  const lonely = (t) => (counts.get(`${t.color}${t.number}`) ?? 0) * 3 + hand.filter((x) => x.id !== t.id && x.color === t.color && Math.abs(x.number - t.number) <= 2).length;
  return from.reduce((a, b) => lonely(b) < lonely(a) ? b : a);
}
function autoPlayTurn(state) {
  let s = state;
  const id = s.currentTurn;
  if (s.status !== "playing") return s;
  if (!s.hasDrawn) s = drawRummyTile(s, id, "deck");
  if (s.status !== "playing") return s;
  return discardRummyTile(s, id, pickDiscard(s.players[id].hand).id);
}
function runBotRummyTurn(state) {
  let s = state;
  const id = s.currentTurn;
  if (s.status !== "playing" || !s.players[id]) return s;
  if (!s.hasDrawn) {
    const left = s.discardPiles[prevSeat(s, id)].at(-1);
    const hand = s.players[id].hand;
    const better = left && (left.isJoker || coverage([...hand, left]) > coverage(hand) + 1);
    s = drawRummyTile(s, id, better ? "left" : "deck");
    if (s.status !== "playing") return s;
  }
  const [best] = finishOptions(s.players[id].hand);
  if (best) return finishRummyRound(s, id, best.tileId).state;
  return discardRummyTile(s, id, pickDiscard(s.players[id].hand).id);
}
function replaceRummySeat(state, oldId, newId, nickname) {
  const old = state.players[oldId];
  if (!old || state.players[newId]) return state;
  const swap = (id) => id === oldId ? newId : id;
  const rekey = (rec) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [swap(k), v]));
  const players = {};
  state.playerOrder.forEach((id) => {
    players[swap(id)] = id === oldId ? { ...state.players[id], id: newId, nickname } : state.players[id];
  });
  return {
    ...state,
    players,
    discardPiles: rekey(state.discardPiles),
    discardedOnce: rekey(state.discardedOnce),
    scores: rekey(state.scores),
    history: state.history.map((h) => ({ ...h, winnerId: swap(h.winnerId), points: rekey(h.points) })),
    playerOrder: state.playerOrder.map((id) => swap(id)),
    currentTurn: swap(state.currentTurn),
    roundWinnerId: swap(state.roundWinnerId),
    winnerId: swap(state.winnerId),
    winnerName: state.winnerId === oldId ? nickname : state.winnerName,
    lastActionText: `\u{1F44B} ${nickname} zuri vendin e ${old.nickname}.`
  };
}
function botifyRummySeat(state, id) {
  const seat = state.playerOrder.indexOf(id);
  if (seat < 0 || isRummyBot(id)) return state;
  let botId = `BOT_RUMMY_${seat}`;
  while (state.players[botId]) botId += "x";
  const name = state.players[id].nickname;
  const next = replaceRummySeat(state, id, botId, `Bot ${seat}`);
  return { ...next, lastActionText: `${name} doli \u2014 boti luan n\xEB vend t\xEB tij.` };
}

// src/lib/ludoLogic.ts
var LAST_MAIN = 50;
function normalizeLudoState(state) {
  if (state.v === 2) return state;
  const players = {};
  Object.entries(state.players).forEach(([id, p]) => {
    players[id] = { ...p, tokens: p.tokens.map((t) => t > LAST_MAIN + 1 ? t - 1 : t) };
  });
  return { ...state, players, v: 2 };
}
var COLORS_ORDER = ["red", "blue", "yellow", "green"];
var SAFE_GLOBAL_CELLS = Array.of(0, 8, 13, 21, 26, 34, 39, 47);
var isLudoBot = (id) => id.startsWith("BOT_LUDO");
var LUDO_SEATS = 4;
function replaceLudoSeat(state, oldId, newId, nickname) {
  const old = state.players[oldId];
  if (!old || state.players[newId]) return state;
  const swap = (id) => id === oldId ? newId : id;
  const players = {};
  state.playerOrder.forEach((id) => {
    players[swap(id)] = id === oldId ? { ...old, id: newId, nickname } : state.players[id];
  });
  return {
    ...state,
    players,
    playerOrder: state.playerOrder.map((id) => swap(id)),
    currentTurn: swap(state.currentTurn),
    winnerId: swap(state.winnerId),
    lastActionText: `\u{1F44B} ${nickname} zuri vendin e ${old.nickname}.`
  };
}
function addLudoSeat(state, id, nickname) {
  if (state.players[id] || state.playerOrder.length >= LUDO_SEATS) return state;
  const used = new Set(Object.values(state.players).map((p) => p.color));
  const color = COLORS_ORDER.find((c) => !used.has(c));
  if (!color) return state;
  const players = { ...state.players, [id]: { id, nickname, color, tokens: [-1, -1, -1, -1] } };
  const playerOrder = [...state.playerOrder, id].sort(
    (a, b) => COLORS_ORDER.indexOf(players[a].color) - COLORS_ORDER.indexOf(players[b].color)
  );
  return { ...state, players, playerOrder, lastActionText: `\u{1F44B} ${nickname} u bashkua n\xEB loj\xEB!` };
}
function botifyLudoSeat(state, id) {
  const p = state.players[id];
  if (!p || isLudoBot(id)) return state;
  const next = replaceLudoSeat(state, id, `BOT_LUDO_${p.color}`, "\u{1F916} Bot");
  return { ...next, lastActionText: `${p.nickname} doli \u2014 boti luan n\xEB vend t\xEB tij.` };
}

// src/lib/seats.ts
function syncSeats(gameType, state, roomPlayers) {
  const inRoom = new Set(roomPlayers.map((p) => p.player_id));
  if (gameType === "ludo" && state) {
    const start = normalizeLudoState(state);
    let s = start;
    s.playerOrder.filter((id) => !isLudoBot(id) && !inRoom.has(id)).forEach((id) => {
      s = botifyLudoSeat(s, id);
    });
    for (const p of roomPlayers) {
      if (s.players[p.player_id]) continue;
      const bot = s.playerOrder.find(isLudoBot);
      s = bot ? replaceLudoSeat(s, bot, p.player_id, p.nickname) : addLudoSeat(s, p.player_id, p.nickname);
    }
    return s === start ? null : { ...s, rev: (start.rev ?? 0) + 1 };
  }
  if (gameType === "rummy" && isTileRummyState(state)) {
    let s = state;
    s.playerOrder.filter((id) => !isRummyBot(id) && !inRoom.has(id)).forEach((id) => {
      s = botifyRummySeat(s, id);
    });
    for (const p of roomPlayers) {
      if (s.players[p.player_id]) continue;
      const bot = s.playerOrder.find(isRummyBot);
      if (bot) s = replaceRummySeat(s, bot, p.player_id, p.nickname);
    }
    return s === state ? null : { ...s, rev: state.rev + 1 };
  }
  return null;
}

// src/server/okeyServer.ts
var TURN_MS = 3e4;
var BOT_MS = 900;
var NEXT_ROUND_MS = 9e3;
var cover = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, color: "black", number: 0 }));
function publicView(full) {
  const players = {};
  for (const id of full.playerOrder) {
    const p = full.players[id];
    players[id] = { ...p, hand: cover(p.hand.length, `h-${id}-`) };
  }
  const { turnStartedAt: _t, ...rest2 } = full;
  void _t;
  return { ...rest2, deck: cover(full.deck.length, "d"), players, lastDrawnTileId: null, hidden: true };
}
function viewFor(full, player) {
  const pub = publicView(full);
  const mine = full.players[player];
  if (!mine) return pub;
  return { ...pub, players: { ...pub.players, [player]: mine }, lastDrawnTileId: full.currentTurn === player ? full.lastDrawnTileId : null };
}
var turnKey = (s) => `${s.round}|${s.currentTurn}|${s.hasDrawn}|${s.status}`;
async function handleOkey(deps2, input) {
  const now = deps2.now ? deps2.now() : Date.now();
  const b = input ?? {};
  const code = typeof b.code === "string" && /^\d{4}$/.test(b.code) ? b.code : "";
  const player = typeof b.player === "string" ? b.player.slice(0, 64) : "";
  const secret = typeof b.secret === "string" ? b.secret.slice(0, 128) : "";
  const a = b.action;
  const types = ["view", "start", "draw", "discard", "finish", "tick", "next", "sync"];
  if (!code || !player || !a || !types.includes(a.type)) return { status: 400, body: { ok: false, reason: "bad_request" } };
  if (!await deps2.auth(player, secret, code)) return { status: 403, body: { ok: false, reason: "not_allowed" } };
  const room = await deps2.load(code);
  if (!room || room.game_type !== "rummy") return { status: 404, body: { ok: false, reason: "no_room" } };
  const full = room.full && isTileRummyState(room.full) ? room.full : null;
  const commit = async (next, status, prev = full ? full.rev : null) => {
    const stamped = { ...next, turnStartedAt: !full || turnKey(full) !== turnKey(next) ? now : full.turnStartedAt ?? now };
    if (!await deps2.save(code, stamped, publicView(stamped), prev, status)) {
      const latest = await deps2.load(code);
      const lf = latest?.full && isTileRummyState(latest.full) ? latest.full : null;
      return { status: 409, body: { ok: false, reason: "stale", state: lf ? viewFor(lf, player) : void 0 } };
    }
    return { status: 200, body: { ok: true, state: viewFor(stamped, player) } };
  };
  const refuse = (reason, status = 409) => ({ status, body: { ok: false, reason, state: full ? viewFor(full, player) : void 0 } });
  if (a.type === "start") {
    if (room.status === "playing" && full && full.status !== "finished") return refuse("already_playing");
    const seated = (await deps2.players(code)).filter((p) => !p.player_id.startsWith("BOT"));
    if (seated.length === 0) return refuse("empty");
    const fresh = initRummyGame(seated.map((p) => ({ id: p.player_id, nickname: p.nickname })));
    return commit({ ...fresh, rev: (full?.rev ?? 0) + 1 }, "playing", null);
  }
  if (!full || room.status !== "playing") return refuse("not_playing");
  if (a.type === "view") return { status: 200, body: { ok: true, state: viewFor(full, player) } };
  const rev = full.rev;
  const step = (next) => next === full ? refuse("invalid_move") : commit({ ...next, rev: rev + 1 });
  switch (a.type) {
    case "draw": {
      if (full.currentTurn !== player) return refuse("not_your_turn");
      if (a.from !== "deck" && a.from !== "left") return refuse("bad_request", 400);
      return step(drawRummyTile(full, player, a.from));
    }
    case "discard": {
      if (full.currentTurn !== player) return refuse("not_your_turn");
      const tile = full.players[player]?.hand.find((t) => t.id === a.tile);
      if (tile?.isJoker) return refuse("joker");
      return step(discardRummyTile(full, player, String(a.tile)));
    }
    case "finish": {
      if (full.currentTurn !== player) return refuse("not_your_turn");
      const r = finishRummyRound(full, player, String(a.tile));
      if (r.error) return refuse("cannot_finish");
      return step(r.state);
    }
    case "next": {
      if (full.status !== "roundOver") return refuse("not_round_over");
      return step(startNextRound(full));
    }
    case "sync": {
      if (player !== room.host_id) return refuse("host_only", 403);
      const synced = syncSeats("rummy", full, await deps2.players(code));
      return synced ? commit({ ...synced, rev: rev + 1 }) : { status: 200, body: { ok: true, state: viewFor(full, player) } };
    }
    case "tick": {
      const since = now - (full.turnStartedAt ?? now);
      if (full.status === "playing" && isRummyBot(full.currentTurn) && since >= BOT_MS) {
        let next = runBotRummyTurn(full);
        if (next === full) next = autoPlayTurn(full);
        return step(next);
      }
      if (full.status === "playing" && !isRummyBot(full.currentTurn) && since >= TURN_MS) return step(autoPlayTurn(full));
      if (full.status === "roundOver" && since >= NEXT_ROUND_MS) return step(startNextRound(full));
      return { status: 200, body: { ok: true, state: viewFor(full, player) } };
    }
  }
  return refuse("bad_request", 400);
}

// supabase/functions/okey-action/entry.ts
var URL_ = Deno.env.get("SUPABASE_URL") ?? "";
function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}
var KEY = serverKey();
var H = { apikey: KEY, "content-type": "application/json" };
if (!KEY.startsWith("sb_")) H.Authorization = `Bearer ${KEY}`;
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...init.headers } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
var rpc = (fn, args) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
var deps = {
  async auth(player, secret, code) {
    return await rpc("game_auth", { p_player: player, p_secret: secret, p_code: code }) === true;
  },
  async load(code) {
    const r = await rpc("okey_load", { p_code: code });
    return r ? { game_type: r.game_type, status: r.status, host_id: r.host_id, full: r.full ?? null } : null;
  },
  async players(code) {
    return await rest(`room_players?room_code=eq.${code}&select=player_id,nickname&order=seat_order.asc`) ?? [];
  },
  async save(code, full, pub, prevRev, status) {
    return await rpc("okey_save", { p_code: code, p_prev_rev: prevRev, p_full: full, p_public: pub, p_status: status ?? null }) === true;
  }
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response('{"ok":false}', { status: 405, headers: { ...CORS, "content-type": "application/json" } });
  try {
    const reply = await handleOkey(deps, await req.json());
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});
