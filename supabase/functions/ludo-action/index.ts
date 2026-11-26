// GameZone · Ludo në server — SKEDAR I GJENERUAR nga entry.ts + src/server/ludoServer.ts (mos e ndrysho me dorë)

// src/lib/ludoLogic.ts
var LAST_MAIN = 50;
var FINISH = 56;
function normalizeLudoState(state) {
  if (state.v === 2) return state;
  const players = {};
  Object.entries(state.players).forEach(([id, p]) => {
    players[id] = { ...p, tokens: p.tokens.map((t) => t > LAST_MAIN + 1 ? t - 1 : t) };
  });
  return { ...state, players, v: 2 };
}
var COLORS_ORDER = ["red", "blue", "yellow", "green"];
var START_OFFSETS = {
  red: 0,
  blue: 13,
  yellow: 26,
  green: 39
};
var SAFE_GLOBAL_CELLS = Array.of(0, 8, 13, 21, 26, 34, 39, 47);
function toGlobalPos(color, relPos) {
  if (relPos < 0 || relPos > LAST_MAIN) return -1;
  return (relPos + START_OFFSETS[color]) % 52;
}
function initLudoGame(playersList) {
  const rawList = playersList.length < 2 ? [playersList[0], { id: "BOT_LUDO_blue", nickname: "\u{1F916} Bot" }] : playersList;
  const limited = rawList.slice(0, 4);
  const players = {};
  const playerOrder = [];
  limited.forEach((p, idx) => {
    const color = COLORS_ORDER[idx];
    players[p.id] = {
      id: p.id,
      nickname: p.nickname,
      color,
      tokens: [-1, -1, -1, -1]
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
    status: "playing",
    gameId: Date.now(),
    rev: 0,
    v: 2,
    winnerId: null,
    lastActionText: `Loja filloi! Hedh zarin ${players[firstId]?.nickname || ""}.`
  };
}
function getMovableTokenIndices(player, dice) {
  const indices = [];
  player.tokens.forEach((pos, idx) => {
    if (pos === -1 && dice === 6) {
      indices.push(idx);
    } else if (pos >= 0 && pos < FINISH && pos + dice <= FINISH) {
      indices.push(idx);
    }
  });
  return indices;
}
function getNextTurnId(state, currentId) {
  const idx = state.playerOrder.indexOf(currentId);
  return state.playerOrder[(idx + 1) % state.playerOrder.length];
}
function rollLudoDice(state, playerId) {
  const next = rollDiceInner(state, playerId);
  return next === state ? state : { ...next, rollId: (state.rollId ?? 0) + 1, rolledBy: playerId };
}
function rollDiceInner(state, playerId) {
  if (state.status !== "playing" || state.currentTurn !== playerId || state.hasRolled) {
    return state;
  }
  const dice = Math.floor(Math.random() * 6) + 1;
  const player = state.players[playerId];
  const newSixes = dice === 6 ? state.consecutiveSixes + 1 : 0;
  if (newSixes >= 3) {
    const nextId = getNextTurnId(state, playerId);
    return {
      ...state,
      diceValue: dice,
      hasRolled: false,
      consecutiveSixes: 0,
      currentTurn: nextId,
      lastActionText: `${player.nickname} hodhi tre 6-she radhazi! Radha kalon te ${state.players[nextId].nickname}.`
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
      lastActionText: `${player.nickname} hodhi ${dice}, s'ka l\xEBvizje. Radha e ${state.players[nextId].nickname}.`
    };
  }
  return {
    ...state,
    diceValue: dice,
    hasRolled: true,
    consecutiveSixes: newSixes,
    lastActionText: `${player.nickname} hodhi ${dice}! Zgjidh nj\xEB gur p\xEBr ta l\xEBvizur.`
  };
}
function moveLudoToken(state, playerId, tokenIndex) {
  if (state.status !== "playing" || state.currentTurn !== playerId || !state.hasRolled || state.diceValue === null) {
    return state;
  }
  const dice = state.diceValue;
  const player = state.players[playerId];
  const movable = getMovableTokenIndices(player, dice);
  if (!movable.includes(tokenIndex)) return state;
  const updatedPlayers = {};
  Object.keys(state.players).forEach((id) => {
    updatedPlayers[id] = {
      ...state.players[id],
      tokens: [...state.players[id].tokens]
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
  if (me.tokens.every((t) => t === FINISH)) {
    return {
      ...state,
      players: updatedPlayers,
      hasRolled: false,
      status: "finished",
      winnerId: playerId,
      lastActionText: `\u{1F3C6} ${me.nickname} futi t\xEB 4 gur\xEBt n\xEB sht\xEBpi dhe fitoi loj\xEBn!`
    };
  }
  const getsBonusRoll = dice === 6 || capturedSomeone || reachedHome;
  const nextTurnId = getsBonusRoll ? playerId : getNextTurnId(state, playerId);
  let actionMsg = `${me.nickname} l\xEBvizi gurin (+${dice}).`;
  if (capturedSomeone) actionMsg = `\u{1F4A5} ${me.nickname} h\xEBngri nj\xEB gur dhe fitoi hedhje bonus!`;
  else if (reachedHome) actionMsg = `\u{1F3E0} ${me.nickname} futi nj\xEB gur n\xEB sht\xEBpi dhe fitoi hedhje bonus!`;
  else if (dice === 6) actionMsg = `\u{1F3B2} ${me.nickname} hodhi 6 dhe ka p\xEBrs\xEBri radh\xEBn!`;
  else actionMsg += ` Radha e ${updatedPlayers[nextTurnId].nickname}.`;
  return {
    ...state,
    players: updatedPlayers,
    currentTurn: nextTurnId,
    hasRolled: false,
    consecutiveSixes: dice === 6 ? state.consecutiveSixes : 0,
    lastActionText: actionMsg
  };
}
function rollAndAutoMove(state, playerId) {
  const rolled = rollLudoDice(state, playerId);
  if (rolled === state || !rolled.hasRolled || rolled.diceValue === null) return rolled;
  const player = rolled.players[playerId];
  const movable = getMovableTokenIndices(player, rolled.diceValue);
  const choices = new Set(movable.map((i) => player.tokens[i]));
  return choices.size === 1 ? moveLudoToken(rolled, playerId, movable[0]) : rolled;
}
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

// src/lib/rummyLogic.ts
var isRummyBot = (id) => id.startsWith("BOT_RUMMY");
function isTileRummyState(s) {
  const st = s;
  return !!st && st.version === 5 && !!st.indicator;
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

// src/server/ludoServer.ts
var isLudoState = (s) => !!s && typeof s === "object" && Array.isArray(s.playerOrder) && !!s.players;
async function handleLudo(deps2, input) {
  const b = input ?? {};
  const code = typeof b.code === "string" && /^\d{4}$/.test(b.code) ? b.code : "";
  const player = typeof b.player === "string" ? b.player.slice(0, 64) : "";
  const secret = typeof b.secret === "string" ? b.secret.slice(0, 128) : "";
  const a = b.action;
  if (!code || !player || !a || !["start", "roll", "move", "sync"].includes(a.type)) return { status: 400, body: { ok: false, reason: "bad_request" } };
  if (!await deps2.auth(player, secret, code)) return { status: 403, body: { ok: false, reason: "not_allowed" } };
  const room = await deps2.load(code);
  if (!room || room.game_type !== "ludo") return { status: 404, body: { ok: false, reason: "no_room" } };
  if (a.type === "start") {
    const current = isLudoState(room.game_state) ? normalizeLudoState(room.game_state) : null;
    if (room.status === "playing" && current && current.status === "playing") return { status: 409, body: { ok: false, reason: "already_playing", state: current } };
    const seated = (await deps2.players(code)).filter((p) => !p.player_id.startsWith("BOT"));
    if (seated.length === 0) return { status: 409, body: { ok: false, reason: "empty" } };
    const fresh = initLudoGame(seated.map((p) => ({ id: p.player_id, nickname: p.nickname })));
    if (!await deps2.save(code, fresh, null, "playing")) return { status: 409, body: { ok: false, reason: "stale" } };
    return { status: 200, body: { ok: true, state: fresh } };
  }
  if (room.status !== "playing" || !isLudoState(room.game_state)) return { status: 409, body: { ok: false, reason: "not_playing" } };
  const state = normalizeLudoState(room.game_state);
  const rev = state.rev ?? 0;
  let next = null;
  if (a.type === "sync") {
    if (player !== room.host_id) return { status: 403, body: { ok: false, reason: "host_only" } };
    const synced = syncSeats("ludo", state, await deps2.players(code));
    if (!synced) return { status: 200, body: { ok: true, state } };
    next = synced;
  } else {
    let actor = player;
    if (a.bot !== void 0) {
      if (player !== room.host_id || typeof a.bot !== "string" || !isLudoBot(a.bot)) return { status: 403, body: { ok: false, reason: "host_only" } };
      actor = a.bot;
    }
    if (state.status !== "playing" || state.currentTurn !== actor || !state.players[actor]) {
      return { status: 409, body: { ok: false, reason: "not_your_turn", state } };
    }
    if (a.type === "roll") {
      if (state.hasRolled) return { status: 409, body: { ok: false, reason: "already_rolled", state } };
      next = rollAndAutoMove(state, actor);
    } else {
      const token = Number(a.token);
      if (!state.hasRolled || state.diceValue === null || !getMovableTokenIndices(state.players[actor], state.diceValue).includes(token)) {
        return { status: 409, body: { ok: false, reason: "invalid_move", state } };
      }
      next = moveLudoToken(state, actor, token);
    }
    if (next === state) return { status: 409, body: { ok: false, reason: "invalid_move", state } };
  }
  const saved = { ...next, rev: rev + 1 };
  if (!await deps2.save(code, saved, rev)) {
    const latest = await deps2.load(code);
    return { status: 409, body: { ok: false, reason: "stale", state: isLudoState(latest?.game_state) ? normalizeLudoState(latest.game_state) : void 0 } };
  }
  return { status: 200, body: { ok: true, state: saved } };
}

// supabase/functions/ludo-action/entry.ts
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
var deps = {
  async auth(player, secret, code) {
    return await rest("rpc/game_auth", { method: "POST", body: JSON.stringify({ p_player: player, p_secret: secret, p_code: code }) }) === true;
  },
  async load(code) {
    const rows = await rest(`rooms?code=eq.${code}&select=game_type,status,host_id,game_state`);
    return rows?.[0] ?? null;
  },
  async players(code) {
    return await rest(`room_players?room_code=eq.${code}&select=player_id,nickname&order=seat_order.asc`) ?? [];
  },
  async save(code, state, prevRev, status) {
    let filter = `code=eq.${code}`;
    if (prevRev !== null) filter += prevRev === 0 ? "&or=(game_state->>rev.is.null,game_state->>rev.eq.0)" : `&game_state->>rev=eq.${prevRev}`;
    const rows = await rest(`rooms?${filter}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(status ? { game_state: state, status } : { game_state: state })
    });
    return Array.isArray(rows) && rows.length > 0;
  }
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response('{"ok":false}', { status: 405, headers: { ...CORS, "content-type": "application/json" } });
  try {
    const reply = await handleLudo(deps, await req.json());
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});
