'use client';

import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  RummyGameState, RummyTile, TileColor, FinishHow, LOSS, START_POINTS,
  autoPlayTurn, canShowIndicator, discardRummyTile, drawRummyTile, finishOptions, finishRummyRound,
  findAllMeldsInHand, isRummyBot, isTileRummyState, pairGroups, prevSeat, runBotRummyTurn,
  showIndicator, sortHand, standings, startNextRound, validateSingleMeld,
} from '@/lib/rummyLogic';
import { StaleStateError } from '@/lib/roomSync';
import { recordWin } from '@/lib/supabase';
import { ArrowLeft, BookOpen, Eye, ListOrdered, RotateCcw, Sparkles, Wand2, X } from 'lucide-react';

interface RummyGameProps {
  gameState: RummyGameState;
  currentPlayerId: string;
  isHost: boolean;
  roomCode: string;
  onUpdateState: (newState: RummyGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
  onLeaveRoom?: () => void;
}

const TURN_MS = 30000; // 30 sekonda për radhë
const HOST_GRACE_MS = 3000; // hosti e kryen vetëm nëse lojtari s'e ka bërë vetë
const BOT_MS = 1100;
const NEXT_ROUND_MS = 9000;
const ROW = 13;
const RACK_SLOTS = ROW * 2;

const INK: Record<TileColor, string> = { red: '#d62828', blue: '#0b84a5', black: '#1f1d1b', orange: '#ea7a00' };
const SEAT_COLORS = ['#ffc83d', '#4dabf7', '#ff6b6b', '#51cf66'];
const HOW_TEXT: Record<FinishHow, string> = { normal: '', pairs: ' me 7 çifte', okey: ' duke hedhur Okey-n', 'pairs-okey': ' me çifte dhe Okey' };

/* ───────────── gurët ───────────── */

function Tile({ tile, small, selected, isNew, ghost, inMeld }: {
  tile: RummyTile; small?: boolean; selected?: boolean; isNew?: boolean; ghost?: boolean; inMeld?: boolean;
}) {
  return (
    <div
      className={`rk-tile ${small ? 'rk-small' : ''} ${selected ? 'rk-selected' : ''} ${isNew ? 'rk-new' : ''} ${ghost ? 'rk-ghost' : ''} ${inMeld ? 'rk-in-meld' : ''}`}
      style={{ color: INK[tile.color] }}
    >
      {tile.isFalse ? (
        <span className="rk-false" title="Joker i rremë: vlen si Okey-u">★</span>
      ) : (
        <>
          <span className="rk-num">{tile.number}</span>
          <span className="rk-suit">♥</span>
        </>
      )}
      {tile.isJoker && <span className="rk-star" title="Okey">★</span>}
    </div>
  );
}

const TileBack = ({ small }: { small?: boolean }) => <div className={`rk-tile rk-back ${small ? 'rk-small' : ''}`} />;

/* ───────────── lojtarët ───────────── */

function Avatar({ name, bot, color, active, progress, seconds }: {
  name: string; bot: boolean; color: string; active: boolean; progress: number; seconds: number;
}) {
  const C = 2 * Math.PI * 21;
  return (
    <div className={`rk-avatar relative shrink-0 ${active ? 'rk-active' : ''}`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="4" />
        {active && (
          <circle cx="24" cy="24" r="21" fill="none" stroke={progress > 0.25 ? color : '#ff5d73'} strokeWidth="4"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset .25s linear' }} />
        )}
      </svg>
      <div className="absolute inset-[11%] rounded-full grid place-items-center font-display font-bold text-white text-sm"
        style={{ background: `radial-gradient(circle at 35% 30%, ${color}, #1b1340)` }}>
        {bot ? '🤖' : name.slice(0, 2).toUpperCase()}
      </div>
      {active && <span className="absolute -bottom-1 -right-1 grid place-items-center min-w-5 h-5 px-1 rounded-full bg-night text-gold text-[10px] font-extrabold border border-gold/60">{seconds}</span>}
    </div>
  );
}

function Seat({ name, count, points, active, progress, seconds, bot, color, vertical }: {
  name: string; count: number; points: number; active: boolean; progress: number; seconds: number; bot: boolean; color: string; vertical: boolean;
}) {
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} items-center gap-1`}>
      <Avatar name={name} bot={bot} color={color} active={active} progress={progress} seconds={seconds} />
      <div className={`flex flex-col ${vertical ? 'items-center' : 'items-start'} gap-0.5`}>
        <span className={`rk-name ${active ? 'rk-name-active' : ''}`} style={{ maxWidth: vertical ? 72 : 120 }}>{name}</span>
        <div className="flex items-center gap-1">
          <span className="rk-mini-rack" aria-label={`${count} gurë`}>
            {Array.from({ length: Math.min(count, vertical ? 5 : 8) }).map((_, i) => <i key={i} />)}
          </span>
          <span className="rk-pts" title="Pikët">{points}</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────── rafti im (ruhet në shfletues, që të mbetet pas refresh-it) ───────────── */

function reconcile(slots: (string | null)[], hand: RummyTile[]): (string | null)[] {
  const ids = new Set(hand.map((t) => t.id));
  const out = slots.length === RACK_SLOTS ? slots.map((id) => (id && ids.has(id) ? id : null)) : Array<string | null>(RACK_SLOTS).fill(null);
  const placed = new Set(out.filter(Boolean));
  for (const t of sortHand(hand, 'runs')) {
    if (placed.has(t.id)) continue;
    const i = out.indexOf(null);
    if (i >= 0) { out[i] = t.id; placed.add(t.id); }
  }
  return out;
}

// grupet në raft me një vend bosh midis, pa e ndarë një grup në dy rreshta
function packGroups(groups: string[][]): (string | null)[] {
  const out: (string | null)[] = Array(RACK_SLOTS).fill(null);
  let pos = 0;
  const overflow: string[] = [];
  for (const g of groups) {
    if (pos < ROW && pos + g.length > ROW) pos = ROW;
    if (pos + g.length > RACK_SLOTS) { overflow.push(...g); continue; }
    g.forEach((id) => { out[pos++] = id; });
    if (pos !== ROW) pos++;
  }
  overflow.forEach((id) => { const i = out.indexOf(null); if (i >= 0) out[i] = id; });
  return out;
}

function arrange(hand: RummyTile[], by: 'runs' | 'groups'): (string | null)[] {
  const groups: string[][] = [];
  const key = (t: RummyTile) => (t.isJoker ? 'J' : by === 'runs' ? t.color : String(t.number));
  sortHand(hand, by).forEach((t, i, arr) => {
    if (i === 0 || key(t) !== key(arr[i - 1])) groups.push([]);
    groups[groups.length - 1].push(t.id);
  });
  return packGroups(groups);
}

function arrangeMelds(hand: RummyTile[]): (string | null)[] {
  const found = findAllMeldsInHand(hand);
  const used = new Set(found.flatMap((m) => m.tiles.map((t) => t.id)));
  const rest = sortHand(hand.filter((t) => !used.has(t.id)), 'runs').map((t) => t.id);
  return packGroups([...found.map((m) => m.tiles.map((t) => t.id)), rest].filter((g) => g.length));
}

// çiftet në raft pa vend bosh midis tyre (7 çifte zënë 14 vende)
function arrangePairs(hand: RummyTile[]): (string | null)[] {
  const out: (string | null)[] = Array(RACK_SLOTS).fill(null);
  pairGroups(hand).flat().forEach((t, i) => { out[i] = t.id; });
  return out;
}

// gurët njëri pas tjetrit në të njëjtin rresht (3+) që formojnë kombinim të vlefshëm
function rackMelds(layout: (string | null)[], byId: Map<string, RummyTile>) {
  const found: string[][] = [];
  for (const start of [0, ROW]) {
    let seg: string[] = [];
    for (let i = start; i <= start + ROW; i++) {
      const id = i < start + ROW ? layout[i] : null;
      if (id) { seg.push(id); continue; }
      if (seg.length >= 3 && validateSingleMeld(seg.map((x) => byId.get(x)!)).valid) found.push(seg);
      seg = [];
    }
  }
  return found;
}

const readRack = (key: string): (string | null)[] => {
  try { return JSON.parse(window.localStorage.getItem(key) || '[]'); } catch { return []; }
};

/* ───────────── gjendja: vetëm versionet më të reja nga serveri ───────────── */

const signatureOf = (s: RummyGameState) => JSON.stringify([
  s.playerOrder, s.currentTurn, s.hasDrawn, s.status, s.round, s.deck.length,
  s.playerOrder.map((id) => [s.players[id].nickname, s.players[id].hand.length, s.discardPiles[id]?.length, s.points[id]]),
]);

function shouldAccept(incoming: RummyGameState, local: RummyGameState) {
  if (incoming.gameId !== local.gameId) return true;
  const d = incoming.rev - local.rev;
  return d > 0 || (d === 0 && signatureOf(incoming) !== signatureOf(local));
}

type Press = { kind: 'tile' | 'deck' | 'left'; id?: string; x0: number; y0: number; moved: boolean };
type Drag = { kind: Press['kind']; id?: string; x: number; y: number; over: string | null };

/* ───────────── loja ───────────── */

export default function RummyGame(props: RummyGameProps) {
  if (!isTileRummyState(props.gameState)) {
    return (
      <div className="rk-room h-full flex items-center justify-center p-4">
        <div className="gz-panel rounded-[28px] p-7 text-center max-w-sm">
          <h2 className="font-display font-bold text-2xl mb-2">Tani luhet Okey klasik!</h2>
          <p className="text-mute text-sm mb-5">Kjo lojë u nis me rregullat e mëparshme. Fillo një lojë të re në të njëjtën dhomë.</p>
          {props.onRestartGame && (
            <button onClick={props.onRestartGame} className="gz-btn inline-flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
              <RotateCcw className="w-5 h-5" /> Lojë e re
            </button>
          )}
        </div>
        <RummyStyles />
      </div>
    );
  }
  return <OkeyTable {...props} />;
}

function OkeyTable({ gameState: serverState, currentPlayerId, isHost, roomCode, onUpdateState, onRestartGame, onLeaveRoom }: RummyGameProps) {
  const [gameState, setGameState] = useState(serverState);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [banner, setBanner] = useState<{ id: string; text: string; mine: boolean } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [modal, setModal] = useState<'scores' | 'rules' | null>(null);
  const [msLeft, setMsLeft] = useState(TURN_MS);
  const serverRef = useRef(serverState);
  const pressRef = useRef<Press | null>(null);
  const winRef = useRef<number | null>(null);

  if (shouldAccept(serverState, gameState)) setGameState(serverState);
  useEffect(() => { serverRef.current = serverState; }, [serverState]);

  const s = gameState;
  const me = s.players[currentPlayerId];
  const myTurn = s.status === 'playing' && s.currentTurn === currentPlayerId;
  const canDraw = myTurn && !s.hasDrawn && !saving;
  const canAct = myTurn && s.hasDrawn && !saving;
  const hand = useMemo(() => me?.hand ?? [], [me]);

  /* rafti */
  const rackKey = `gz_rack_${roomCode}_${s.gameId}_${s.round}_${currentPlayerId}`;
  const [rack, setRack] = useState<{ key: string; slots: (string | null)[] }>({ key: '', slots: [] });
  if (rack.key !== rackKey && typeof window !== 'undefined') setRack({ key: rackKey, slots: readRack(rackKey) });
  const layout = reconcile(rack.slots, hand);
  const layoutText = JSON.stringify(layout);
  useEffect(() => {
    try { window.localStorage.setItem(rackKey, layoutText); } catch { /* s'ka rëndësi */ }
  }, [rackKey, layoutText]);
  const byId = new Map(hand.map((t) => [t.id, t]));
  const chosen = selected.filter((id) => byId.has(id));
  const inRackIds = new Set(rackMelds(layout, byId).flat());
  const finishOpts = useMemo(() => (canAct && hand.length === 15 ? finishOptions(hand) : []), [canAct, hand]);

  /* ruajtja: menjëherë, vetëm nëse askush s'e ka ndryshuar lojën ndërkohë */
  const commit = async (next: RummyGameState) => {
    if (next === gameState) return;
    const saved = { ...next, rev: gameState.rev + 1 };
    setGameState(saved);
    setSaving(true);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await onUpdateState(saved);
        setSaving(false);
        return;
      } catch (err) {
        if (err instanceof StaleStateError) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
        else setToast('⚠️ Veprimi nuk u ruajt. Kontrollo internetin.');
      }
    }
    setGameState(serverRef.current);
    setSaving(false);
  };

  const fail = (msg?: string) => { if (msg) setToast(msg); };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  /* njoftim i madh kur dikush tregon treguesin */
  const shownKey = `${s.gameId}|${s.round}|${s.shownIndicator.join(',')}`;
  const [seenShown, setSeenShown] = useState(shownKey);
  if (seenShown !== shownKey) {
    setSeenShown(shownKey);
    const [g, r] = shownKey.split('|');
    const who = gameState.shownIndicator.at(-1);
    if (seenShown.startsWith(`${g}|${r}|`) && who) {
      const mine = who === currentPlayerId;
      setBanner({ id: shownKey, mine, text: mine ? '👁 Tregove treguesin! Të tjerët −1' : `👁 ${gameState.players[who]?.nickname} tregoi treguesin` });
    }
  }
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  /* koha e radhës: 30 sekonda */
  const turnKey = `${s.gameId}|${s.round}|${s.currentTurn}|${s.hasDrawn}|${s.status}`;
  const deadlineRef = useRef(0);
  const firedRef = useRef('');
  useEffect(() => { deadlineRef.current = Date.now() + TURN_MS; }, [turnKey]);
  const tick = useEffectEvent(() => {
    const left = deadlineRef.current - Date.now();
    setMsLeft(Math.max(0, left));
    if (s.status !== 'playing' || saving || isRummyBot(s.currentTurn) || firedRef.current === turnKey) return;
    const mine = s.currentTurn === currentPlayerId;
    if ((mine && left <= 0) || (isHost && !mine && left <= -HOST_GRACE_MS)) {
      firedRef.current = turnKey;
      void commit(autoPlayTurn(s));
    }
  });
  useEffect(() => {
    const t = setInterval(() => tick(), 250);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.ceil(msLeft / 1000);
  const progress = msLeft / TURN_MS;

  /* botët (i drejton hosti) */
  const botKey = isHost && !saving && s.status === 'playing' && isRummyBot(s.currentTurn) ? turnKey + s.rev : '';
  const playBot = useEffectEvent(() => { void commit(runBotRummyTurn(s)); });
  useEffect(() => {
    if (!botKey) return;
    const t = setTimeout(() => playBot(), BOT_MS);
    return () => clearTimeout(t);
  }, [botKey]);

  /* raundi tjetër */
  const nextRound = useEffectEvent(() => { void commit(startNextRound(s)); });
  const roundOverKey = isHost && s.status === 'roundOver' ? `${s.gameId}|${s.round}` : '';
  useEffect(() => {
    if (!roundOverKey) return;
    const t = setTimeout(() => nextRound(), NEXT_ROUND_MS);
    return () => clearTimeout(t);
  }, [roundOverKey]);

  /* fitorja regjistrohet nga fituesi, një herë për lojë */
  useEffect(() => {
    if (!isTileRummyState(serverState) || serverState.status !== 'finished') return;
    if (serverState.winnerId !== currentPlayerId || winRef.current === serverState.gameId) return;
    winRef.current = serverState.gameId;
    recordWin(serverState.winnerName || 'Lojtari', 150, 'Okey');
  }, [serverState, currentPlayerId]);

  /* veprimet */
  const leftId = prevSeat(s, currentPlayerId);
  const leftTop = s.discardPiles[leftId]?.at(-1) ?? null;

  const draw = (source: 'deck' | 'left', slot?: number) => {
    if (!canDraw) return fail(myTurn ? undefined : 'Nuk është radha jote.');
    if (source === 'left' && !leftTop) return;
    const next = drawRummyTile(s, currentPlayerId, source);
    const newId = next.lastDrawnTileId;
    if (newId) {
      const slots = layout.slice();
      const target = slot !== undefined && slots[slot] === null ? slot : slots.indexOf(null);
      if (target >= 0) { slots[target] = newId; setRack({ key: rackKey, slots }); }
    }
    void commit(next);
  };

  const discard = (id: string) => {
    if (!canAct) return fail(myTurn ? 'Merr një gur fillimisht!' : 'Nuk është radha jote.');
    setSelected([]);
    void commit(discardRummyTile(s, currentPlayerId, id));
  };

  const finish = (id?: string) => {
    if (!canAct) return fail(myTurn ? 'Merr një gur fillimisht!' : 'Nuk është radha jote.');
    const tileId = id ?? (chosen.length === 1 && finishOpts.some((o) => o.tileId === chosen[0]) ? chosen[0] : finishOpts[0]?.tileId);
    if (!tileId) return fail('Për ta mbyllur, 14 gurët e tjerë duhet të jenë të gjithë në kombinime ose 7 çifte.');
    const r = finishRummyRound(s, currentPlayerId, tileId);
    if (r.error) return fail(r.error);
    setSelected([]);
    void commit(r.state);
  };

  const moveTile = (id: string, to: number) => {
    const slots = layout.slice();
    const from = slots.indexOf(id);
    if (from < 0 || from === to) return;
    [slots[from], slots[to]] = [slots[to], slots[from]];
    setRack({ key: rackKey, slots });
  };

  /* tërheqja me gisht / maus */
  const targetAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null;

  const onPointerDown = (e: React.PointerEvent, kind: Press['kind'], id?: string) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pressRef.current = { kind, id, x0: e.clientX, y0: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 7) return;
    if (!p.moved && p.kind !== 'tile' && !canDraw) return;
    p.moved = true;
    setDrag({ kind: p.kind, id: p.id, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pressRef.current;
    pressRef.current = null;
    setDrag(null);
    if (!p) return;
    if (!p.moved) {
      if (p.kind === 'tile' && p.id) setSelected((sel) => (sel.includes(p.id!) ? sel.filter((x) => x !== p.id) : [...sel, p.id!]));
      else if (p.kind === 'deck') draw('deck');
      else if (p.kind === 'left') draw('left');
      return;
    }
    const target = targetAt(e.clientX, e.clientY);
    if (!target) return;
    const [what, arg] = target.split(':');
    if (p.kind === 'tile' && p.id) {
      if (what === 'slot') moveTile(p.id, Number(arg));
      else if (what === 'discard') discard(p.id);
      else if (what === 'finish') finish(p.id);
    } else if (what === 'slot') {
      draw(p.kind === 'deck' ? 'deck' : 'left', Number(arg));
    }
  };
  const onPointerCancel = () => { pressRef.current = null; setDrag(null); };

  /* ── pamja ── */
  const order = s.playerOrder;
  const myIdx = Math.max(0, order.indexOf(currentPlayerId));
  const seatAt = (offset: number) => order[(myIdx + offset) % order.length];
  const colorOf = (id: string) => SEAT_COLORS[Math.max(0, order.indexOf(id)) % SEAT_COLORS.length];
  const draggingTile = drag?.kind === 'tile' && drag.id ? byId.get(drag.id) : null;
  const jokerTile: RummyTile = { id: 'okey-preview', color: s.joker.color, number: s.joker.number, isJoker: true };
  const canShow = canShowIndicator(s, currentPlayerId) && !saving;
  const ranking = standings(s);
  const lastResult = s.history.at(-1);

  const opp = (offset: number, vertical: boolean) => {
    const id = seatAt(offset);
    const p = s.players[id];
    if (!p || id === currentPlayerId) return null;
    return <Seat name={p.nickname} count={p.hand.length} points={s.points[id] ?? 0} active={s.status === 'playing' && s.currentTurn === id}
      progress={progress} seconds={seconds} bot={isRummyBot(id)} color={colorOf(id)} vertical={vertical} />;
  };

  // grumbulli i lojtarit X qëndron në cep, midis tij dhe lojtarit pasardhës
  const pile = (offset: number, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    const id = seatAt(offset);
    const top = s.discardPiles[id]?.at(-1) ?? null;
    const count = s.discardPiles[id]?.length ?? 0;
    const takeable = id === leftId;
    const mine = id === currentPlayerId;
    return (
      <div className={`rk-corner rk-corner-${corner}`}>
        <div
          data-drop={mine ? 'discard' : undefined}
          data-testid={mine ? 'my-pile' : takeable ? 'left-pile' : undefined}
          onPointerDown={(e) => takeable && top && onPointerDown(e, 'left')}
          className={`rk-pile ${mine && drag?.over === 'discard' ? 'rk-over' : ''} ${mine && canAct && drag?.kind === 'tile' ? 'rk-target' : ''} ${takeable && canDraw && top ? 'rk-can' : ''}`}
          style={{ ['--seat' as string]: colorOf(id) }}
        >
          {top ? <Tile tile={top} /> : <span className="rk-pile-empty">{mine ? 'Hidh' : ''}</span>}
          {count > 1 && <span className="rk-badge">{count}</span>}
        </div>
        <span className="rk-label">{mine ? 'Gurët e tu' : takeable ? 'Merr këtu' : s.players[id]?.nickname}</span>
      </div>
    );
  };

  const hint = !myTurn
    ? `Radha e ${s.players[s.currentTurn]?.nickname ?? '...'}`
    : !s.hasDrawn ? 'Merr gurin nga stiva ose gurin majtas'
      : finishOpts.length ? 'Mund ta mbyllësh! Tërhiq gurin e tepërt mbi stivë' : 'Hidh një gur në grumbullin tënd (djathtas)';

  return (
    <div className="rk-room h-full flex flex-col select-none overflow-hidden"
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>

      {/* ── shiriti i sipërm ── */}
      <div className="rk-top">
        <button onClick={onLeaveRoom} className="rk-chip-btn"><ArrowLeft className="w-4 h-4" /> Dil</button>
        <div className="flex items-center gap-1.5">
          <span className="rk-round">Raundi <b>{s.round}</b></span>
          <button onClick={() => setModal('scores')} aria-label="Pikët" className="rk-icon-btn"><ListOrdered className="w-4 h-4" /></button>
          <button onClick={() => setModal('rules')} aria-label="Rregullat" className="rk-icon-btn"><BookOpen className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ── tavolina ── */}
      <div className="rk-table-wrap">
        <div className="rk-rim">
          <div className="rk-felt">
            <div className="rk-grid">
              {pile(2, 'tl')}
              <div className="rk-seat-top">{opp(2, false)}</div>
              {pile(1, 'tr')}

              <div className="rk-seat-side">{opp(3, true)}</div>
              <div className="rk-center">
                <div className="flex flex-col items-center gap-1">
                  <button
                    data-testid="deck"
                    data-drop="finish"
                    onPointerDown={(e) => onPointerDown(e, 'deck')}
                    className={`rk-stack ${canDraw ? 'rk-can' : ''} ${drag?.over === 'finish' ? 'rk-over' : ''} ${canAct && finishOpts.length && drag?.kind === 'tile' ? 'rk-target' : ''}`}
                    aria-label={`Stiva, ${s.deck.length} gurë`}
                  >
                    <span className="rk-stack-pile">{s.finishTile && s.status !== 'playing' ? <Tile tile={s.finishTile} /> : <TileBack />}</span>
                    <span className="rk-indicator" key={`${s.gameId}-${s.round}`} aria-label="Treguesi">
                      <Tile tile={{ ...s.indicator, isJoker: false }} />
                    </span>
                    <span className="rk-badge">{s.deck.length}</span>
                  </button>
                  <span className="rk-label">{canAct && finishOpts.length ? 'Mbyll këtu' : 'Stiva'}</span>
                </div>
                <div className="rk-joker">
                  <span className="rk-label !text-gold">Okey</span>
                  <Tile tile={jokerTile} small />
                </div>
              </div>
              <div className="rk-seat-side">{opp(1, true)}</div>

              {pile(3, 'bl')}
              <p className="rk-action">{s.lastActionText}</p>
              {pile(0, 'br')}
            </div>
          </div>
        </div>
      </div>

      {/* ── unë: radha, veprimet dhe rafti ── */}
      <div className="rk-bottom">
        <div className="rk-me">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={me?.nickname ?? 'Ti'} bot={false} color={colorOf(currentPlayerId)} active={myTurn} progress={progress} seconds={seconds} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-semibold text-white truncate">{me?.nickname ?? 'Ti'}</span>
                <span className="rk-pts" title="Pikët">{s.points[currentPlayerId] ?? START_POINTS}</span>
                <span className={`rk-points ${inRackIds.size >= 14 ? 'rk-points-ok' : ''}`} title="Gurët në kombinime të vlefshme në raft">
                  <b>{inRackIds.size}</b>/14
                </span>
              </div>
              <p className={`text-[11px] font-bold leading-tight ${myTurn ? 'text-gold' : 'text-white/70'}`}>{hint}</p>
            </div>
          </div>

          <div className="rk-actions">
            {canAct && finishOpts.length > 0 && (
              <button onClick={() => finish()} className="rk-btn rk-btn-gold rk-pulse">
                <Sparkles className="w-3.5 h-3.5" /> Mbyll{HOW_TEXT[finishOpts[0].how] ? ` (${finishOpts[0].how === 'normal' ? '' : '−' + LOSS[finishOpts[0].how]})` : ''}
              </button>
            )}
            {canShow && (
              <button onClick={() => void commit(showIndicator(s, currentPlayerId))} className="rk-btn rk-btn-gold">
                <Eye className="w-3.5 h-3.5" /> Trego treguesin
              </button>
            )}
            {canAct && chosen.length === 1 && (
              <button onClick={() => discard(chosen[0])} className="rk-btn rk-btn-red">Hidh gurin</button>
            )}
            <button onClick={() => { setSelected([]); setRack({ key: rackKey, slots: arrangeMelds(hand) }); }} className="rk-btn">
              <Wand2 className="w-3.5 h-3.5" /> Kombinime
            </button>
            <button onClick={() => setRack({ key: rackKey, slots: arrangePairs(hand) })} className="rk-btn">Çifte</button>
            <button onClick={() => setRack({ key: rackKey, slots: arrange(hand, 'runs') })} className="rk-btn">Seri</button>
            <button onClick={() => setRack({ key: rackKey, slots: arrange(hand, 'groups') })} className="rk-btn">Grupe</button>
          </div>
        </div>

        <div className="rk-rack" data-drop="rack">
          {[0, 1].map((row) => (
            <div key={row} className="rk-shelf">
              {layout.slice(row * ROW, row * ROW + ROW).map((id, k) => {
                const i = row * ROW + k;
                const t = id ? byId.get(id) : null;
                return (
                  <div key={i} data-drop={`slot:${i}`} className={`rk-slot ${drag?.over === `slot:${i}` ? 'rk-over' : ''}`}>
                    {t && (
                      <div data-tile={t.id} onPointerDown={(e) => onPointerDown(e, 'tile', t.id)} className={`rk-grab ${drag?.id === t.id ? 'opacity-30' : ''}`}>
                        <Tile tile={t} selected={chosen.includes(t.id)} isNew={myTurn && s.lastDrawnTileId === t.id} inMeld={inRackIds.has(t.id)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {drag && (
        <div className="fixed z-50 pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) rotate(-4deg) scale(1.12)' }}>
          {draggingTile ? <Tile tile={draggingTile} ghost /> : drag.kind === 'left' && leftTop ? <Tile tile={leftTop} ghost /> : <TileBack />}
        </div>
      )}

      {banner && <div key={banner.id} className={`rk-banner ${banner.mine ? 'rk-banner-mine' : ''}`} role="status">{banner.text}</div>}

      {toast && (
        <div role="alert" className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-night/95 border-2 border-coral text-white font-bold px-4 py-2 rounded-2xl text-xs sm:text-sm shadow-2xl max-w-[92vw] text-center">
          {toast}
        </div>
      )}

      {/* ── fundi i raundit / i lojës ── */}
      {(s.status === 'roundOver' || s.status === 'finished') && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm grid place-items-center p-3 overflow-y-auto">
          <div className="gz-panel rounded-[28px] p-5 w-full max-w-md text-center">
            <h2 className="font-display font-bold text-2xl sm:text-3xl">
              {s.status === 'finished' ? '🏆 Loja përfundoi!' : `Raundi ${s.round} përfundoi`}
            </h2>
            <p className="text-gold font-display font-semibold text-lg mt-1">
              {s.status === 'finished'
                ? `${s.winnerId === currentPlayerId ? 'Ti fitove' : `${s.winnerName} fitoi`} me ${s.points[s.winnerId ?? ''] ?? 0} pikë!`
                : lastResult?.winnerId
                  ? `${lastResult.winnerId === currentPlayerId ? 'Ti e mbylle' : `${s.players[lastResult.winnerId]?.nickname} e mbylli`} lojën${HOW_TEXT[lastResult.how as FinishHow] ?? ''}!`
                  : 'Stiva mbaroi — barazim.'}
            </p>
            {s.status === 'roundOver' && lastResult?.winnerId && <p className="text-sm text-mute">Të tjerët humbin {lastResult.loss} pikë.</p>}
            <PointsTable s={s} me={currentPlayerId} ranking={ranking} />
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {s.status === 'roundOver' ? (
                <button onClick={() => void commit(startNextRound(s))} disabled={saving} className="gz-btn font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
                  Raundi {s.round + 1} →
                </button>
              ) : (
                <>
                  {onRestartGame && (
                    <button onClick={onRestartGame} className="gz-btn inline-flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
                      <RotateCcw className="w-5 h-5" /> Luaj përsëri
                    </button>
                  )}
                  <button onClick={onLeaveRoom} className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 font-bold cursor-pointer">Dil</button>
                </>
              )}
            </div>
            <p className="text-xs text-mute mt-3">
              {s.status === 'roundOver' ? 'Raundi tjetër nis vetë pas pak sekondash.' : 'Dhoma mbetet e hapur — lojtarët e rinj mund të hyjnë.'}
            </p>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm grid place-items-center p-3 overflow-y-auto" onClick={() => setModal(null)}>
          <div className="gz-panel rounded-[28px] p-5 w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setModal(null)} aria-label="Mbyll" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
            {modal === 'scores' ? (
              <>
                <h2 className="font-display font-bold text-2xl mb-1">Pikët</h2>
                <p className="text-xs text-mute mb-2">Secili fillon me {START_POINTS}. Loja mbaron kur dikush mbetet pa pikë; fiton kush ka më shumë.</p>
                <PointsTable s={s} me={currentPlayerId} ranking={ranking} />
                {s.history.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-mute max-h-40 overflow-y-auto">
                    {s.history.slice().reverse().map((h) => (
                      <li key={h.round}>
                        Raundi {h.round}: {h.winnerId ? `${s.players[h.winnerId]?.nickname ?? '—'} e mbylli${HOW_TEXT[h.how as FinishHow] ?? ''} (të tjerët −${h.loss})` : 'barazim'}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display font-bold text-2xl mb-3">Rregullat e Okey-t</h2>
                <ul className="text-sm text-mute space-y-2 list-disc pl-5">
                  <li>106 gurë: 4 ngjyra × 1–13 × 2, plus 2 Jokerë të rremë (★).</li>
                  <li>Treguesi zbulohet mbi stivë. <strong className="text-ink">Okey-u</strong> është numri pasues me të njëjtën ngjyrë (pas 13 vjen 1) dhe zëvendëson çdo gur. Jokeri i rremë (★) vlen si vetë guri i Okey-t.</li>
                  <li>Kush e nis raundin ka 15 gurë dhe hedh i pari; të tjerët kanë 14.</li>
                  <li>Në radhën tënde: merr gurin e stivës ose gurin që hodhi lojtari në të majtë, pastaj hidh një gur në grumbullin tënd. Ke 30 sekonda.</li>
                  <li><strong className="text-ink">Seri:</strong> 3+ gurë me ngjyrë të njëjtë radhazi (lejohet 12-13-1, jo 13-1-2). <strong className="text-ink">Grup:</strong> 3–4 gurë me numër të njëjtë dhe ngjyra të ndryshme.</li>
                  <li>Nuk ka kombinime në tavolinë. Kur 14 gurë janë në kombinime (ose 7 çifte), tërhiq të 15-in mbi stivë për ta mbyllur.</li>
                  <li>Kur dikush mbyll, të tjerët humbin 2 pikë; 4 me çifte ose duke hedhur Okey-n; 8 me të dyja.</li>
                  <li>Në radhën e parë, kush ka gurin tregues mund ta tregojë: të tjerët humbin 1 pikë.</li>
                  <li>Secili fillon me {START_POINTS} pikë. Kur dikush mbetet pa pikë, fiton kush ka më shumë.</li>
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <RummyStyles />
    </div>
  );
}

function PointsTable({ s, me, ranking }: { s: RummyGameState; me: string; ranking: ReturnType<typeof standings> }) {
  return (
    <ol className="mt-3 space-y-1.5 text-left">
      {ranking.map((r, i) => (
        <li key={r.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${i === 0 ? 'bg-gold/15 border border-gold/40' : 'bg-white/5'}`}>
          <span className="w-6">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
          <span className="flex-1 font-bold truncate">{r.id === me ? 'Ti' : r.nickname}</span>
          {s.status !== 'playing' && s.roundWinnerId && r.id !== s.roundWinnerId && s.history.at(-1)?.loss ? (
            <span className="text-xs font-bold text-coral">−{s.history.at(-1)!.loss}</span>
          ) : null}
          <span className={`font-display font-semibold tabular-nums ${r.total <= 0 ? 'text-coral' : ''}`}>{r.total}</span>
        </li>
      ))}
    </ol>
  );
}

/* ───────────── stilet ───────────── */
const FLOOR = "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='120'>" +
  "<rect width='360' height='40' fill='%235b3a26'/><rect y='40' width='360' height='40' fill='%234e321f'/><rect y='80' width='360' height='40' fill='%23634029'/>" +
  "<g fill='none' stroke-width='1'><path d='M0 10 C90 7 190 14 360 9 M0 26 C120 30 240 22 360 27' stroke='%23fff' stroke-opacity='.06'/>" +
  "<path d='M0 52 C110 48 200 56 360 51 M0 68 C80 71 250 63 360 69' stroke='%23000' stroke-opacity='.18'/>" +
  "<path d='M0 92 C100 89 190 96 360 91 M0 108 C90 112 260 104 360 109' stroke='%23fff' stroke-opacity='.06'/></g>" +
  "<g stroke='%23281810' stroke-opacity='.7' stroke-width='2'><path d='M0 40H360M0 80H360M0 120H360'/><path d='M240 0V40M90 40V80M300 80V120'/></g></svg>";

function RummyStyles() {
  return (
    <style>{`
      .rk-room {
        /* guri: 13 në rresht duhet të hyjnë në gjerësi, dy rreshta + tavolina në lartësi */
        --tw: min(calc((100vw - 76px) / 13), 52px, calc((100dvh - 330px) / 2.95));
        --th: calc(var(--tw) * 1.38);
        --av: 44px;
        background:
          radial-gradient(90% 60% at 50% 40%, rgba(255,190,120,0.16), transparent 70%),
          radial-gradient(140% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.55)),
          url("data:image/svg+xml,${FLOOR}");
        background-color: #4e321f;
        background-size: auto, auto, 360px 120px;
        color: #fff;
        touch-action: none;
      }
      .rk-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px 0; flex-shrink: 0; position: relative; z-index: 20; }
      .rk-chip-btn { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.45); color: #fff; font-size: 14px; font-weight: 800; padding: 6px 14px 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; }
      .rk-icon-btn { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: rgba(0,0,0,0.45); color: #fff; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; }
      .rk-round { font-size: 12px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12); padding: 6px 12px; border-radius: 999px; }
      .rk-round b { color: #ffc83d; font-family: var(--font-display); font-size: 14px; }

      /* tavolina */
      .rk-table-wrap { flex: 1; min-height: 0; padding: 8px 8px 4px; }
      .rk-rim {
        height: 100%; border-radius: 34px; padding: 9px;
        background: linear-gradient(160deg, #a0612f, #6b3a19 45%, #8a4f24 70%, #5a2f13);
        box-shadow: 0 18px 40px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,220,170,0.35), inset 0 -3px 0 rgba(0,0,0,0.35);
      }
      .rk-felt {
        height: 100%; border-radius: 26px; position: relative; overflow: hidden;
        background: radial-gradient(70% 60% at 50% 45%, #2f9a72 0%, #1d7457 45%, #12503d 100%);
        box-shadow: inset 0 0 0 2px rgba(255,214,140,0.35), inset 0 10px 30px rgba(0,0,0,0.45);
      }
      .rk-felt::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35; background-image: radial-gradient(rgba(0,0,0,0.25) 1px, transparent 1px); background-size: 4px 4px; }
      .rk-grid {
        position: relative; height: 100%;
        display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 4px; padding: 8px;
      }
      .rk-seat-top { display: flex; justify-content: center; align-items: flex-start; }
      .rk-seat-side { display: flex; align-items: center; justify-content: center; }
      .rk-center { display: flex; align-items: center; justify-content: center; gap: clamp(12px, 4vw, 36px); min-height: 0; }
      .rk-action { align-self: end; text-align: center; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.85); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; padding: 0 4px 2px; }

      .rk-corner { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .rk-corner-tl, .rk-corner-tr { align-self: start; }
      .rk-corner-bl, .rk-corner-br { align-self: end; }
      .rk-pile {
        --tw: var(--ptw); --th: calc(var(--ptw) * 1.38);
        position: relative; touch-action: none;
        width: calc(var(--ptw) + 12px); height: calc(var(--ptw) * 1.38 + 12px);
        display: grid; place-items: center; border-radius: 12px;
        border: 2px dashed color-mix(in srgb, var(--seat) 60%, transparent);
        background: rgba(0,0,0,0.16);
      }
      .rk-pile-empty { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.6); }
      .rk-room { --ptw: min(var(--tw), 40px); }

      .rk-avatar { width: var(--av); height: var(--av); }
      .rk-name { font-size: 11px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.35); padding: 2px 8px; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rk-name-active { background: #ffc83d; color: #2a1600; }
      .rk-active { animation: rk-breathe 1.6s ease-in-out infinite; border-radius: 999px; }
      @keyframes rk-breathe { 50% { box-shadow: 0 0 0 4px rgba(255,200,61,0.25), 0 0 18px rgba(255,200,61,0.5); } }
      .rk-mini-rack { display: inline-flex; gap: 1px; padding: 3px 4px; border-radius: 4px; background: linear-gradient(180deg, #c27a3e, #7c431a); border-left: 3px solid #151313; border-right: 3px solid #151313; }
      .rk-mini-rack i { width: 5px; height: 8px; border-radius: 1px; background: #f6efd9; box-shadow: 0 1px 0 #cbbd99; }
      .rk-pts { font-size: 11px; font-weight: 800; font-family: var(--font-display); color: #2a1600; background: #ffc83d; padding: 0 7px; border-radius: 999px; }
      .rk-points { font-size: 11px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.4); padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
      .rk-points b { color: #ffc83d; }
      .rk-points-ok { background: #2ee6a6; color: #0d3b2c; }
      .rk-points-ok b { color: #0d3b2c; }

      /* gurët */
      .rk-tile {
        position: relative; width: var(--tw); height: var(--th);
        border-radius: calc(var(--tw) * 0.14);
        background: linear-gradient(180deg, #fffdf5 0%, #f7f0dc 65%, #e8dcbc 100%);
        box-shadow: 0 2px 0 #c9b98f, 0 4px 6px rgba(0,0,0,0.35), inset 0 1px 0 #fff;
        display: flex; flex-direction: column; align-items: center;
        padding-top: calc(var(--th) * 0.1);
        font-family: var(--font-display); line-height: 1;
        transition: transform .12s, box-shadow .12s;
      }
      .rk-num { font-weight: 700; font-size: calc(var(--tw) * 0.62); letter-spacing: -0.04em; }
      .rk-suit { font-size: calc(var(--tw) * 0.34); margin-top: calc(var(--th) * 0.06); }
      .rk-false { font-size: calc(var(--tw) * 0.7); margin-top: calc(var(--th) * 0.08); }
      .rk-star { position: absolute; top: 1px; right: 2px; font-size: calc(var(--tw) * 0.3); color: #e0a800; text-shadow: 0 0 2px #fff; }
      .rk-small { --tw: 21px; --th: 29px; }
      .rk-selected { transform: translateY(-18%); box-shadow: 0 0 0 2px #ffc83d, 0 8px 12px rgba(0,0,0,0.45), inset 0 1px 0 #fff; }
      .rk-in-meld::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: 3px; height: 3px; border-radius: 3px; background: #2ee6a6; }
      .rk-new { animation: rk-new 0.5s cubic-bezier(.2,1.6,.4,1), rk-new-glow 1.2s ease-in-out 0.5s 3; }
      @keyframes rk-new { from { transform: translateY(-60%) scale(1.2); } }
      @keyframes rk-new-glow { 50% { box-shadow: 0 0 0 3px #2ee6a6, 0 0 14px #2ee6a6, 0 4px 6px rgba(0,0,0,0.35); } }
      .rk-ghost { box-shadow: 0 14px 26px rgba(0,0,0,0.5); }
      .rk-back { background: linear-gradient(180deg, #fffaf0, #ebe0c2); }
      .rk-back::before { content: ''; position: absolute; inset: 22% 22%; border-radius: 50%; border: 2px solid rgba(160,120,60,0.35); }
      .rk-grab { touch-action: none; cursor: grab; }

      /* stiva me treguesin */
      .rk-stack { --tw: var(--ptw); --th: calc(var(--ptw) * 1.38); position: relative; width: calc(var(--ptw) * 1.8); height: calc(var(--ptw) * 1.38 * 1.25); padding: 0; background: none; border: 2px solid transparent; touch-action: none; border-radius: 12px; }
      .rk-stack-pile { position: absolute; left: 3px; bottom: 6px; }
      .rk-stack-pile .rk-back { box-shadow: 0 2px 0 #c9b98f, 0 4px 0 #ebe0c2, 0 6px 0 #c9b98f, 0 8px 0 #ebe0c2, 0 10px 10px rgba(0,0,0,0.45); }
      .rk-indicator { position: absolute; right: 0; top: 0; transform: rotate(14deg); animation: rk-reveal 0.9s ease-out 1, rk-wiggle 0.7s ease-in-out 0.9s 4; }
      .rk-indicator .rk-tile { box-shadow: 0 0 0 2px #ffc83d, 0 0 14px rgba(255,200,61,0.8), 0 6px 8px rgba(0,0,0,0.45); }
      @keyframes rk-reveal { 0% { transform: rotate(14deg) rotateY(180deg) scale(0.6); } 60% { transform: translateY(-14%) rotate(4deg) rotateY(0) scale(1.15); } 100% { transform: rotate(14deg) scale(1); } }
      @keyframes rk-wiggle { 0%, 100% { transform: rotate(14deg); } 25% { transform: translateY(-10%) rotate(4deg); } 75% { transform: translateY(-10%) rotate(22deg); } }
      .rk-badge { position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); background: #151313; color: #fff; font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; z-index: 2; }
      .rk-label { font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.78); white-space: nowrap; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
      .rk-can { cursor: pointer; animation: rk-glow 1.4s ease-in-out infinite; }
      @keyframes rk-glow { 50% { box-shadow: 0 0 0 3px rgba(255,200,61,0.8), 0 0 22px rgba(255,200,61,0.6); } }
      .rk-target { border-color: #ffc83d !important; background: rgba(255,200,61,0.15); }
      .rk-over { border-color: #ffc83d !important; border-style: solid !important; background: rgba(255,200,61,0.35) !important; }
      .rk-joker { display: flex; flex-direction: column; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); border: 2px solid rgba(255,200,61,0.8); border-radius: 14px; padding: 5px 9px 7px; }

      /* poshtë: unë + rafti */
      .rk-bottom { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 2px 8px 8px; }
      .rk-me { width: 100%; max-width: 760px; display: flex; flex-direction: column; gap: 6px; }
      .rk-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
      .rk-rack {
        position: relative; display: flex; flex-direction: column; gap: 4px;
        padding: 6px 6px 8px; border-radius: 10px;
        border-left: 10px solid #151313; border-right: 10px solid #151313;
        background: repeating-linear-gradient(91deg, rgba(0,0,0,0.06) 0 3px, transparent 3px 13px), linear-gradient(180deg, #c98443 0%, #a8652d 50%, #7d4519 100%);
        box-shadow: 0 12px 26px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,225,180,0.4);
      }
      .rk-shelf { display: grid; grid-template-columns: repeat(13, var(--tw)); gap: 2px; padding-bottom: 5px; border-bottom: 4px solid #6a3a15; box-shadow: 0 2px 0 rgba(255,210,160,0.25); }
      .rk-slot { width: var(--tw); height: var(--th); border-radius: 5px; position: relative; background: rgba(0,0,0,0.08); }
      .rk-slot.rk-over { box-shadow: 0 0 0 2px #ffc83d; }

      .rk-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.18); padding: 6px 11px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
      .rk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .rk-btn-gold { background: linear-gradient(180deg, #ffd666, #ffa41b); color: #2a1600; border-color: transparent; box-shadow: 0 3px 0 #b86a00; }
      .rk-btn-red { background: linear-gradient(180deg, #ff6b6b, #d62828); border-color: transparent; box-shadow: 0 3px 0 #8f1414; }
      .rk-pulse { animation: rk-pulse 1s ease-in-out infinite; }
      @keyframes rk-pulse { 50% { box-shadow: 0 3px 0 #b86a00, 0 0 0 4px rgba(255,255,255,0.35), 0 0 22px rgba(255,200,61,0.9); } }

      .rk-banner {
        position: fixed; left: 50%; top: 32%; z-index: 45; pointer-events: none; transform: translate(-50%, -50%); white-space: nowrap;
        font-family: var(--font-display); font-weight: 700; font-size: clamp(16px, 4.5vw, 28px); color: #fff; padding: 12px 22px; border-radius: 999px;
        background: linear-gradient(180deg, rgba(37,31,92,0.95), rgba(13,10,36,0.95)); border: 2px solid rgba(255,200,61,0.7); box-shadow: 0 16px 40px rgba(0,0,0,0.5);
        animation: rk-banner 2.6s ease-out forwards;
      }
      .rk-banner-mine { background: linear-gradient(180deg, #ffd666, #ffa41b); color: #2a1600; border-color: #fff; }
      @keyframes rk-banner { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } 20% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -70%); } }

      @media (min-width: 640px) {
        .rk-small { --tw: 25px; --th: 34px; }
        .rk-mini-rack i { width: 7px; height: 11px; }
        .rk-label { font-size: 10px; }
        .rk-room { --av: 48px; }
      }

      /* telefoni horizontal: butonat në një kolonë pranë raftit, që e gjithë tavolina të shihet */
      @media (orientation: landscape) and (max-height: 560px) {
        .rk-room {
          --tw: min(calc((100vw - 300px) / 13), 50px, calc((100dvh - 200px) / 2.95));
          --ptw: min(var(--tw), 32px);
          --av: 34px;
        }
        .rk-top { position: absolute; left: 0; right: 0; top: 0; padding: 6px 10px 0; pointer-events: none; }
        .rk-top > * { pointer-events: auto; }
        .rk-top { align-items: flex-start; }
        .rk-top > div { flex-direction: column; align-items: flex-end; }
        .rk-chip-btn { font-size: 12px; padding: 4px 10px 4px 8px; }
        .rk-icon-btn { width: 28px; height: 28px; }
        .rk-round { font-size: 11px; padding: 4px 10px; }
        .rk-table-wrap { padding: 4px 96px 2px; }
        .rk-rim { border-radius: 24px; padding: 6px; }
        .rk-felt { border-radius: 18px; }
        .rk-grid { padding: 4px 6px; gap: 2px; }
        .rk-bottom { flex-direction: row; align-items: flex-end; justify-content: center; gap: 8px; padding: 2px 8px 6px; }
        .rk-me { width: 230px; max-width: 230px; flex-shrink: 0; }
        .rk-actions { justify-content: flex-start; gap: 4px; }
        .rk-btn { font-size: 11px; padding: 4px 9px; }
        .rk-shelf { padding-bottom: 3px; border-bottom-width: 3px; }
        .rk-rack { padding: 4px 5px 5px; gap: 3px; }
        .rk-name { font-size: 10px; padding: 1px 6px; }
        .rk-mini-rack i { width: 4px; height: 7px; }
        .rk-action { font-size: 10px; -webkit-line-clamp: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .rk-indicator, .rk-can, .rk-new, .rk-pulse, .rk-active, .rk-banner { animation: none; }
      }
    `}</style>
  );
}
