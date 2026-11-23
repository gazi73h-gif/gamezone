'use client';

import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  RummyGameState, RummyTile, TileColor, OPEN_MIN,
  addToRummyMeld, autoPlayTurn, discardRummyTile, drawRummyTile, evaluateSelectedMelds,
  findAllMeldsInHand, isRummyBot, isTileRummyState, playRummyMeld, playRummyMeldGroups, runBotRummyTurn,
  sortHand, standings, startNextRound, totalScore, validateSingleMeld,
} from '@/lib/rummyLogic';
import { StaleStateError } from '@/lib/roomSync';
import { recordWin } from '@/lib/supabase';
import { ArrowLeft, BookOpen, ListOrdered, RotateCcw, Sparkles, Wand2, X } from 'lucide-react';

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

const INK: Record<TileColor, string> = {
  red: '#d62828',
  blue: '#0b84a5',
  black: '#1f1d1b',
  orange: '#ea7a00',
};
// ngjyra e çdo vendi në tavolinë (unaza e avatarit dhe etiketa e kombinimeve)
const SEAT_COLORS = ['#ffc83d', '#4dabf7', '#ff6b6b', '#51cf66'];

/* ───────────── gurët ───────────── */

function Tile({ tile, small, selected, isNew, ghost, inMeld }: {
  tile: RummyTile; small?: boolean; selected?: boolean; isNew?: boolean; ghost?: boolean; inMeld?: boolean;
}) {
  return (
    <div
      className={`rk-tile ${small ? 'rk-small' : ''} ${selected ? 'rk-selected' : ''} ${isNew ? 'rk-new' : ''} ${ghost ? 'rk-ghost' : ''} ${inMeld ? 'rk-in-meld' : ''}`}
      style={{ color: INK[tile.color] }}
    >
      <span className="rk-num">{tile.number}</span>
      <span className="rk-suit">♥</span>
      {tile.isJoker && <span className="rk-star" title="Joker">★</span>}
    </div>
  );
}

const TileBack = ({ small }: { small?: boolean }) => <div className={`rk-tile rk-back ${small ? 'rk-small' : ''}`} />;

/* ───────────── lojtarët përreth tavolinës ───────────── */

function Avatar({ name, bot, color, active, progress, seconds }: {
  name: string; bot: boolean; color: string; active: boolean; progress: number; seconds: number;
}) {
  const C = 2 * Math.PI * 21;
  return (
    <div className={`relative w-12 h-12 shrink-0 ${active ? 'rk-active' : ''}`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="4" />
        {active && (
          <circle cx="24" cy="24" r="21" fill="none" stroke={progress > 0.25 ? color : '#ff5d73'} strokeWidth="4"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset .25s linear' }} />
        )}
      </svg>
      <div className="absolute inset-[5px] rounded-full grid place-items-center font-display font-bold text-white text-base"
        style={{ background: `radial-gradient(circle at 35% 30%, ${color}, #1b1340)` }}>
        {bot ? '🤖' : name.slice(0, 2).toUpperCase()}
      </div>
      {active && <span className="absolute -bottom-1 -right-1 grid place-items-center min-w-5 h-5 px-1 rounded-full bg-night text-gold text-[10px] font-extrabold border border-gold/60">{seconds}</span>}
    </div>
  );
}

function Seat({ name, count, opened, active, progress, seconds, bot, color, side }: {
  name: string; count: number; opened: boolean; active: boolean; progress: number; seconds: number; bot: boolean; color: string; side: 'top' | 'left' | 'right';
}) {
  const vertical = side !== 'top';
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} items-center gap-1.5`}>
      <Avatar name={name} bot={bot} color={color} active={active} progress={progress} seconds={seconds} />
      <div className={`flex flex-col ${vertical ? 'items-center' : 'items-start'} gap-1`}>
        <span className={`rk-name ${active ? 'rk-name-active' : ''}`} style={{ maxWidth: vertical ? 70 : 120 }}>{name}</span>
        <div className="flex items-center gap-1">
          <span className="rk-mini-rack" aria-label={`${count} gurë`}>
            {Array.from({ length: Math.min(count, vertical ? 6 : 10) }).map((_, i) => <i key={i} />)}
          </span>
          <span className="text-[10px] font-extrabold text-white/80">{count}</span>
        </div>
        {opened && <span className="rk-opened">✓ Hapur</span>}
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

// Vendos grupet në raft me një vend bosh midis, pa e ndarë një grup në dy rreshta
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

// Kombinimet më të mira të renditura në raft, pastaj gurët e tjerë
function arrangeMelds(hand: RummyTile[]): (string | null)[] {
  const found = findAllMeldsInHand(hand);
  const used = new Set(found.flatMap((m) => m.tiles.map((t) => t.id)));
  const rest = sortHand(hand.filter((t) => !used.has(t.id)), 'runs').map((t) => t.id);
  return packGroups([...found.map((m) => m.tiles.map((t) => t.id)), rest].filter((g) => g.length));
}

// Gurët njëri pas tjetrit në të njëjtin rresht (3+) që formojnë kombinim të vlefshëm
function rackMelds(layout: (string | null)[], byId: Map<string, RummyTile>) {
  const found: { ids: string[]; points: number }[] = [];
  for (const start of [0, ROW]) {
    let seg: string[] = [];
    for (let i = start; i <= start + ROW; i++) {
      const id = i < start + ROW ? layout[i] : null;
      if (id) { seg.push(id); continue; }
      if (seg.length >= 3) {
        const v = validateSingleMeld(seg.map((x) => byId.get(x)!));
        if (v.valid) found.push({ ids: seg, points: v.points });
      }
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
  s.playerOrder, s.currentTurn, s.hasDrawn, s.status, s.round, s.deck.length, s.discardPile.length,
  s.melds.map((m) => m.tiles.length), s.playerOrder.map((id) => [s.players[id].nickname, s.players[id].hand.length]),
]);

function shouldAccept(incoming: RummyGameState, local: RummyGameState) {
  if (incoming.gameId !== local.gameId) return true;
  const d = incoming.rev - local.rev;
  return d > 0 || (d === 0 && signatureOf(incoming) !== signatureOf(local));
}

type Press = { kind: 'tile' | 'deck' | 'discard'; id?: string; x0: number; y0: number; moved: boolean };
type Drag = { kind: Press['kind']; id?: string; x: number; y: number; over: string | null };

/* ───────────── loja ───────────── */

export default function RummyGame(props: RummyGameProps) {
  if (!isTileRummyState(props.gameState)) {
    return (
      <div className="rk-room h-full flex items-center justify-center p-4">
        <div className="gz-panel rounded-[28px] p-7 text-center max-w-sm">
          <h2 className="font-display font-bold text-2xl mb-2">Rummy tani luhet me gurë!</h2>
          <p className="text-mute text-sm mb-5">Kjo lojë u nis me versionin e vjetër me letra. Fillo një lojë të re në të njëjtën dhomë.</p>
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
  return <RummyTable {...props} />;
}

function RummyTable({ gameState: serverState, currentPlayerId, isHost, roomCode, onUpdateState, onRestartGame, onLeaveRoom }: RummyGameProps) {
  const [gameState, setGameState] = useState(serverState);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [banner, setBanner] = useState<{ id: number; text: string; mine: boolean } | null>(null);
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
  const hand = me?.hand ?? [];

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
  const chosenTiles = chosen.map((id) => byId.get(id)!);
  const inRack = rackMelds(layout, byId);
  const rackPoints = inRack.reduce((a, m) => a + m.points, 0);
  const inRackIds = new Set(inRack.flatMap((m) => m.ids));

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

  /* njoftim i madh kur hapet dikush */
  const openedRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const openedKey = `${s.gameId}|${s.round}`;
  const openedNow = s.playerOrder.filter((id) => s.players[id].hasOpened).join(',');
  useEffect(() => {
    const prev = openedRef.current;
    const now = new Set(openedNow ? openedNow.split(',') : []);
    if (prev.key === openedKey) {
      const fresh = [...now].find((id) => !prev.ids.has(id));
      if (fresh) {
        const pts = gameState.melds.filter((m) => m.ownerId === fresh).reduce((a, m) => a + m.points, 0);
        const mine = fresh === currentPlayerId;
        setBanner({ id: Date.now(), mine, text: mine ? `🎉 U hape me ${pts} pikë!` : `✨ ${gameState.players[fresh]?.nickname} u hap me ${pts} pikë` });
      }
    }
    openedRef.current = { key: openedKey, ids: now };
  }, [openedKey, openedNow, gameState, currentPlayerId]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2800);
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

  /* raundi tjetër: kushdo me buton, ose hosti automatikisht */
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
    recordWin(serverState.winnerName || 'Lojtari', 150, 'Rummy / Remi');
  }, [serverState, currentPlayerId]);

  /* veprimet */
  const draw = (source: 'deck' | 'discard', slot?: number) => {
    if (!canDraw) return fail(myTurn ? undefined : 'Nuk është radha jote.');
    if (source === 'discard' && s.discardPile.length === 0) return;
    const next = drawRummyTile(s, currentPlayerId, source);
    const newId = next.lastDrawnTileId;
    if (newId) {
      // guri i ri shkon aty ku u lëshua, ose në vendin e parë të lirë që duket qartë
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

  const openSelected = () => {
    if (!canAct) return fail('Merr një gur fillimisht!');
    const r = playRummyMeld(s, currentPlayerId, chosen);
    if (r.error) return fail(r.error);
    setSelected([]);
    void commit(r.state);
  };

  const openFromRack = () => {
    if (!canAct) return fail(myTurn ? 'Merr një gur fillimisht!' : 'Nuk është radha jote.');
    const r = playRummyMeldGroups(s, currentPlayerId, inRack.map((m) => m.ids));
    if (r.error) return fail(r.error);
    setSelected([]);
    void commit(r.state);
  };

  const addTo = (meldId: string, ids: string[]) => {
    if (!canAct) return fail(myTurn ? 'Merr një gur fillimisht!' : 'Nuk është radha jote.');
    if (ids.length === 0) return fail('Zgjidh gurët që do t’i shtosh.');
    const r = addToRummyMeld(s, currentPlayerId, ids, meldId);
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
      else if (p.kind === 'discard') draw('discard');
      return;
    }
    const target = targetAt(e.clientX, e.clientY);
    if (!target) return;
    const [what, arg] = target.split(':');
    if (p.kind === 'tile' && p.id) {
      if (what === 'slot') moveTile(p.id, Number(arg));
      else if (what === 'discard') discard(p.id);
      else if (what === 'meld') addTo(arg, chosen.includes(p.id) ? chosen : [p.id]);
    } else if (what === 'slot') {
      draw(p.kind === 'deck' ? 'deck' : 'discard', Number(arg));
    }
  };
  const onPointerCancel = () => { pressRef.current = null; setDrag(null); };

  /* ── pamja ── */
  const order = s.playerOrder;
  const myIdx = Math.max(0, order.indexOf(currentPlayerId));
  const seatAt = (offset: number) => order[(myIdx + offset) % order.length];
  const colorOf = (id: string) => SEAT_COLORS[Math.max(0, order.indexOf(id)) % SEAT_COLORS.length];
  const topDiscard = s.discardPile.at(-1) ?? null;
  const evalSel = chosenTiles.length >= 3 ? evaluateSelectedMelds(chosenTiles) : null;
  const selReady = !!evalSel?.valid && (me?.hasOpened || evalSel.totalPoints >= OPEN_MIN);
  const rackReady = inRack.length > 0 && (me?.hasOpened || rackPoints >= OPEN_MIN) && hand.length - inRackIds.size >= 1;
  const draggingTile = drag?.kind === 'tile' && drag.id ? byId.get(drag.id) : null;
  const jokerTile: RummyTile = { id: 'joker-preview', color: s.joker.color, number: s.joker.number, isJoker: true };
  const opp = (offset: number, side: 'top' | 'left' | 'right') => {
    const id = seatAt(offset);
    const p = s.players[id];
    if (!p || id === currentPlayerId) return null;
    const active = s.status === 'playing' && s.currentTurn === id;
    return <Seat name={p.nickname} count={p.hand.length} opened={p.hasOpened} active={active} progress={progress} seconds={seconds} bot={isRummyBot(id)} color={colorOf(id)} side={side} />;
  };
  const ranking = standings(s);
  const hint = !myTurn
    ? `Radha e ${s.players[s.currentTurn]?.nickname ?? '...'}`
    : !s.hasDrawn ? 'Merr një gur nga stiva ose nga toka' : 'Hap ose shto kombinime, pastaj hidh një gur';

  return (
    <div
      className="rk-room h-full flex flex-col select-none overflow-hidden"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* ── shiriti i sipërm ── */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 shrink-0 relative z-20">
        <button onClick={onLeaveRoom} className="rk-chip-btn">
          <ArrowLeft className="w-4 h-4" /> Dil
        </button>
        <div className="flex items-center gap-1.5">
          <span className="rk-round">
            Raundi <b>{s.round}</b><span className="opacity-60">/{s.totalRounds}</span>
          </span>
          <button onClick={() => setModal('scores')} aria-label="Pikët" className="rk-icon-btn"><ListOrdered className="w-4 h-4" /></button>
          <button onClick={() => setModal('rules')} aria-label="Rregullat" className="rk-icon-btn"><BookOpen className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ── tavolina ── */}
      <div className="flex-1 min-h-0 px-2 pt-2 pb-1">
        <div className="rk-rim h-full">
          <div className="rk-felt h-full flex flex-col">
            <div className="flex justify-center pt-2 shrink-0">{opp(2, 'top')}</div>

            <div className="flex-1 min-h-0 flex items-stretch gap-1 px-1.5">
              <div className="flex items-center shrink-0">{opp(3, 'left')}</div>

              <div className="flex-1 min-w-0 flex flex-col gap-2 py-1.5">
                {/* stiva me treguesin, jokeri, toka */}
                <div className="flex items-end justify-center gap-4 sm:gap-8 shrink-0">
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      data-testid="deck"
                      onPointerDown={(e) => onPointerDown(e, 'deck')}
                      className={`rk-stack ${canDraw ? 'rk-can' : ''}`}
                      aria-label={`Stiva, ${s.deck.length} gurë`}
                    >
                      <span className="rk-stack-pile"><TileBack /></span>
                      <span className="rk-indicator" key={`${s.gameId}-${s.round}`} aria-label="Treguesi">
                        <Tile tile={{ ...s.indicator, isJoker: false }} />
                      </span>
                      <span className="rk-badge">{s.deck.length}</span>
                    </button>
                    <span className="rk-label">Stiva</span>
                  </div>

                  <div className="rk-joker">
                    <span className="rk-label !text-gold">Jokeri</span>
                    <Tile tile={jokerTile} small />
                  </div>

                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      data-drop="discard"
                      data-testid="discard"
                      onPointerDown={(e) => topDiscard && onPointerDown(e, 'discard')}
                      className={`rk-discard ${drag?.over === 'discard' ? 'rk-over' : ''} ${canDraw && topDiscard ? 'rk-can' : ''} ${canAct && drag?.kind === 'tile' ? 'rk-target' : ''}`}
                    >
                      {/* guri i hedhur qëndron përmbys: askush s’e sheh cili është */}
                      {topDiscard ? <span className="rk-discard-pile"><TileBack /></span> : <span className="text-white/60 text-[10px] font-bold text-center leading-tight">Hidh<br />këtu</span>}
                    </div>
                    <span className="rk-label">Toka</span>
                  </div>
                </div>

                {/* kombinimet në tavolinë */}
                <div className="rk-melds flex-1 min-h-0 overflow-y-auto">
                  {s.melds.length === 0 ? (
                    <p className="h-full grid place-items-center text-white/55 text-xs font-bold text-center px-4">
                      Kombinimet e hapura dalin këtu · hapja e parë min. {OPEN_MIN} pikë
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 justify-center content-start">
                      {s.melds.map((m) => (
                        <button
                          key={m.id}
                          data-drop={`meld:${m.id}`}
                          onClick={() => chosen.length && addTo(m.id, chosen)}
                          className={`rk-meld ${drag?.over === `meld:${m.id}` ? 'rk-over' : ''}`}
                          style={{ ['--owner' as string]: colorOf(m.ownerId) }}
                          title={`${m.ownerName} · ${m.points} pikë`}
                        >
                          <span className="flex gap-[2px]">{m.tiles.map((t) => <Tile key={t.id} tile={t} small />)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center shrink-0">{opp(1, 'right')}</div>
            </div>

            <p className="text-center text-white/85 text-[11px] sm:text-xs font-semibold px-3 pb-2 shrink-0 truncate">{s.lastActionText}</p>
          </div>
        </div>
      </div>

      {/* ── unë: radha, veprimet dhe rafti ── */}
      <div className="shrink-0 px-2 pb-2 flex flex-col items-center gap-1.5">
        <div className="w-full max-w-3xl flex items-center gap-2">
          <Avatar name={me?.nickname ?? 'Ti'} bot={false} color={colorOf(currentPlayerId)} active={myTurn} progress={progress} seconds={seconds} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-semibold text-white truncate">{me?.nickname ?? 'Ti'}</span>
              {me?.hasOpened
                ? <span className="rk-opened">✓ U hape</span>
                : <span className={`rk-points ${rackPoints >= OPEN_MIN ? 'rk-points-ok' : ''}`} title="Pikët e kombinimeve të vendosura njëri pas tjetrit në raft">
                    Në raft: <b>{rackPoints}</b>/{OPEN_MIN}
                  </span>}
            </div>
            <p className={`text-[11px] font-bold truncate ${myTurn ? 'text-gold' : 'text-white/70'}`}>{hint}</p>
          </div>
        </div>

        <div className="flex items-center justify-center flex-wrap gap-1.5">
          {canAct && chosen.length >= 3 && (
            <button onClick={openSelected} disabled={!selReady} className="rk-btn rk-btn-gold">
              <Sparkles className="w-3.5 h-3.5" /> {me?.hasOpened ? 'Vendos' : 'Hap'} të zgjedhurit{evalSel?.valid ? ` · ${evalSel.totalPoints}` : ''}
            </button>
          )}
          {canAct && chosen.length < 3 && inRack.length > 0 && (
            <button onClick={openFromRack} disabled={!rackReady} className={`rk-btn rk-btn-gold ${rackReady ? 'rk-pulse' : ''}`}>
              <Sparkles className="w-3.5 h-3.5" /> {me?.hasOpened ? `Vendos nga rafti · ${rackPoints}` : rackPoints >= OPEN_MIN ? `Hap · ${rackPoints} pikë` : `Hap (${rackPoints}/${OPEN_MIN})`}
            </button>
          )}
          {canAct && chosen.length === 1 && (
            <button onClick={() => discard(chosen[0])} className="rk-btn rk-btn-red">Hidh gurin</button>
          )}
          <button onClick={() => { setSelected([]); setRack({ key: rackKey, slots: arrangeMelds(hand) }); }} className="rk-btn">
            <Wand2 className="w-3.5 h-3.5" /> Kombinime
          </button>
          <button onClick={() => setRack({ key: rackKey, slots: arrange(hand, 'runs') })} className="rk-btn">Seri</button>
          <button onClick={() => setRack({ key: rackKey, slots: arrange(hand, 'groups') })} className="rk-btn">Grupe</button>
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

      {/* guri që po tërhiqet */}
      {drag && (
        <div className="fixed z-50 pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) rotate(-4deg) scale(1.12)' }}>
          {draggingTile ? <Tile tile={draggingTile} ghost /> : <TileBack />}
        </div>
      )}

      {banner && (
        <div key={banner.id} className={`rk-banner ${banner.mine ? 'rk-banner-mine' : ''}`} role="status">{banner.text}</div>
      )}

      {toast && (
        <div role="alert" className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-night/95 border-2 border-coral text-white font-bold px-4 py-2 rounded-2xl text-xs sm:text-sm shadow-2xl max-w-[92vw] text-center">
          {toast}
        </div>
      )}

      {/* ── fundi i raundit / i lojës ── */}
      {(s.status === 'roundOver' || s.status === 'finished') && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm grid place-items-center p-4">
          <div className="gz-panel rounded-[28px] p-5 sm:p-6 w-full max-w-md text-center">
            <h2 className="font-display font-bold text-2xl sm:text-3xl">
              {s.status === 'finished' ? '🏆 Loja përfundoi!' : `Raundi ${s.round} përfundoi`}
            </h2>
            <p className="text-gold font-display font-semibold text-lg mt-1">
              {s.status === 'finished'
                ? (s.winnerId === currentPlayerId ? 'Ti fitove me më pak pikë!' : `${s.winnerName} fitoi me më pak pikë!`)
                : s.roundWinnerId ? `${s.players[s.roundWinnerId]?.nickname} mbaroi gurët!` : 'Gurët e stivës mbaruan.'}
            </p>
            <ScoreTable s={s} me={currentPlayerId} ranking={s.status === 'finished' ? ranking : null} />
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
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm grid place-items-center p-4" onClick={() => setModal(null)}>
          <div className="gz-panel rounded-[28px] p-5 w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setModal(null)} aria-label="Mbyll" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
            {modal === 'scores' ? (
              <>
                <h2 className="font-display font-bold text-2xl mb-1">Pikët</h2>
                <p className="text-xs text-mute mb-2">Pikët e gurëve që mbeten në dorë. Fiton kush ka më pak pas {s.totalRounds} raundeve.</p>
                <ScoreTable s={s} me={currentPlayerId} ranking={null} />
              </>
            ) : (
              <>
                <h2 className="font-display font-bold text-2xl mb-3">Rregullat</h2>
                <ul className="text-sm text-mute space-y-2 list-disc pl-5">
                  <li>104 gurë: 4 ngjyra, numrat 1–13, nga dy kopje.</li>
                  <li>Treguesi zbulohet në fillim të raundit. <strong className="text-ink">Jokeri</strong> është numri pasues me të njëjtën ngjyrë (pas 13 vjen 1) dhe zëvendëson çdo gur.</li>
                  <li>Në radhën tënde: merr një gur (stiva ose toka), hap/shto kombinime, pastaj hidh një gur. Ke 30 sekonda.</li>
                  <li><strong className="text-ink">Seri:</strong> 3+ gurë me ngjyrë të njëjtë radhazi. <strong className="text-ink">Grup:</strong> 3–4 gurë me numër të njëjtë dhe ngjyra të ndryshme.</li>
                  <li>Vendosi kombinimet në raft njërin pas tjetrit, me një vend bosh midis tyre. Kur ke {OPEN_MIN}+ pikë, shtyp <strong className="text-ink">Hap</strong>. Butoni <strong className="text-ink">Kombinime</strong> i rregullon vetë.</li>
                  <li>Pas hapjes, tërhiq një gur mbi një kombinim në tavolinë për ta shtuar.</li>
                  <li>Fiton raundin kush mbaron gurët. Të tjerët marrin pikët e gurëve në dorë (Jokeri 30, pa u hapur 100). Pas 4 raundeve fiton kush ka më pak pikë.</li>
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

function ScoreTable({ s, me, ranking }: { s: RummyGameState; me: string; ranking: ReturnType<typeof standings> | null }) {
  const rows = ranking ?? s.playerOrder.map((id) => ({ id, nickname: s.players[id].nickname, total: totalScore(s, id) }));
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-mute text-[11px] uppercase">
            <th className="text-left font-bold py-1">{ranking ? '#' : ''} Lojtari</th>
            {Array.from({ length: s.totalRounds }).map((_, i) => <th key={i} className="font-bold w-8">R{i + 1}</th>)}
            <th className="font-bold w-12 text-right">Gjithsej</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={`border-t border-white/10 ${ranking && i === 0 ? 'text-gold' : ''}`}>
              <td className="text-left py-1.5 font-bold truncate max-w-[120px]">
                {ranking && <span className="mr-1.5">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>}
                {r.id === me ? 'Ti' : r.nickname}
              </td>
              {Array.from({ length: s.totalRounds }).map((_, k) => (
                <td key={k} className="text-center tabular-nums text-mute">{s.scores[r.id]?.[k] ?? '–'}</td>
              ))}
              <td className="text-right font-display font-semibold tabular-nums">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── stilet: dhomë e ngrohtë, tavolinë me çohë, rafte druri ───────────── */
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
        /* gjerësia e gurit: 13 gurë + hapësirat + kapakët e raftit duhet të hyjnë në ekran */
        --tw: min(calc((100vw - 16px - 2 * 10px - 2 * 6px - 12 * 2px) / 13), 52px);
        --th: calc(var(--tw) * 1.38);
        background:
          radial-gradient(90% 60% at 50% 40%, rgba(255,190,120,0.16), transparent 70%),
          radial-gradient(140% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.55)),
          url("data:image/svg+xml,${FLOOR}");
        background-color: #4e321f;
        background-size: auto, auto, 360px 120px;
        color: #fff;
        touch-action: none;
      }
      .rk-chip-btn { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.4); color: #fff; font-size: 14px; font-weight: 800; padding: 6px 14px 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; }
      .rk-icon-btn { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; }
      .rk-round { font-size: 12px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12); padding: 6px 12px; border-radius: 999px; }
      .rk-round b { color: #ffc83d; font-family: var(--font-display); font-size: 14px; }

      /* tavolina: buzë druri e lëmuar + çohë e gjelbër me dritë në mes */
      .rk-rim {
        border-radius: 34px; padding: 9px;
        background: linear-gradient(160deg, #a0612f, #6b3a19 45%, #8a4f24 70%, #5a2f13);
        box-shadow: 0 18px 40px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,220,170,0.35), inset 0 -3px 0 rgba(0,0,0,0.35);
      }
      .rk-felt {
        border-radius: 26px; position: relative; overflow: hidden;
        background: radial-gradient(70% 55% at 50% 42%, #2f9a72 0%, #1d7457 45%, #12503d 100%);
        box-shadow: inset 0 0 0 2px rgba(255,214,140,0.35), inset 0 10px 30px rgba(0,0,0,0.45);
      }
      .rk-felt::before {
        content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35;
        background-image: radial-gradient(rgba(0,0,0,0.25) 1px, transparent 1px);
        background-size: 4px 4px;
      }
      .rk-felt > * { position: relative; }

      .rk-name { font-size: 11px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.35); padding: 2px 8px; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rk-name-active { background: #ffc83d; color: #2a1600; }
      .rk-active { animation: rk-breathe 1.6s ease-in-out infinite; border-radius: 999px; }
      @keyframes rk-breathe { 50% { box-shadow: 0 0 0 4px rgba(255,200,61,0.25), 0 0 18px rgba(255,200,61,0.5); } }
      .rk-mini-rack { display: inline-flex; gap: 1px; padding: 3px 4px; border-radius: 4px; background: linear-gradient(180deg, #c27a3e, #7c431a); border-left: 3px solid #151313; border-right: 3px solid #151313; }
      .rk-mini-rack i { width: 5px; height: 8px; border-radius: 1px; background: #f6efd9; box-shadow: 0 1px 0 #cbbd99; }
      .rk-opened { font-size: 10px; font-weight: 800; color: #0d3b2c; background: #2ee6a6; padding: 1px 7px; border-radius: 999px; white-space: nowrap; }
      .rk-points { font-size: 11px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.4); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
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
      .rk-grab:active { cursor: grabbing; }

      /* stiva me treguesin sipër (brenda kornizës së saj) */
      .rk-stack { position: relative; width: calc(var(--tw) * 1.75); height: calc(var(--th) * 1.25); padding: 0; background: none; border: 0; touch-action: none; border-radius: 12px; }
      .rk-stack-pile { position: absolute; left: 4px; bottom: 6px; }
      .rk-stack-pile .rk-back { box-shadow: 0 2px 0 #c9b98f, 0 4px 0 #ebe0c2, 0 6px 0 #c9b98f, 0 8px 0 #ebe0c2, 0 10px 10px rgba(0,0,0,0.45); }
      .rk-indicator {
        position: absolute; right: 0; top: 0;
        transform: rotate(14deg);
        animation: rk-reveal 0.9s ease-out 1, rk-wiggle 0.7s ease-in-out 0.9s 4;
      }
      .rk-indicator .rk-tile { box-shadow: 0 0 0 2px #ffc83d, 0 0 14px rgba(255,200,61,0.8), 0 6px 8px rgba(0,0,0,0.45); }
      @keyframes rk-reveal {
        0% { transform: rotate(14deg) rotateY(180deg) scale(0.6); }
        60% { transform: translateY(-14%) rotate(4deg) rotateY(0) scale(1.15); }
        100% { transform: rotate(14deg) scale(1); }
      }
      @keyframes rk-wiggle {
        0%, 100% { transform: rotate(14deg); }
        25% { transform: translateY(-10%) rotate(4deg); }
        75% { transform: translateY(-10%) rotate(22deg); }
      }
      .rk-badge { position: absolute; left: 50%; bottom: -8px; transform: translateX(-60%); background: #151313; color: #fff; font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; }
      .rk-label { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,0.75); }
      .rk-can { cursor: pointer; animation: rk-glow 1.4s ease-in-out infinite; }
      @keyframes rk-glow { 50% { box-shadow: 0 0 0 3px rgba(255,200,61,0.8), 0 0 22px rgba(255,200,61,0.6); } }

      .rk-joker { display: flex; flex-direction: column; align-items: center; gap: 5px; background: rgba(0,0,0,0.3); border: 2px solid rgba(255,200,61,0.8); border-radius: 14px; padding: 6px 10px 8px; }

      .rk-discard {
        touch-action: none; width: calc(var(--tw) + 16px); height: calc(var(--th) + 16px);
        border-radius: 12px; border: 2px dashed rgba(255,255,255,0.45);
        display: grid; place-items: center; background: rgba(0,0,0,0.18);
      }
      .rk-discard-pile .rk-back { transform: rotate(-6deg); box-shadow: 0 2px 0 #c9b98f, 0 4px 0 #ebe0c2, 0 6px 8px rgba(0,0,0,0.4); }
      .rk-target { border-color: #ffc83d; background: rgba(255,200,61,0.15); }
      .rk-over { border-color: #ffc83d !important; border-style: solid !important; background: rgba(255,200,61,0.35) !important; }

      .rk-melds { border-radius: 16px; padding: 8px; background: rgba(0,0,0,0.14); box-shadow: inset 0 2px 10px rgba(0,0,0,0.25); }
      .rk-meld {
        display: flex; padding: 5px 5px 6px; border-radius: 10px; border: 2px solid transparent;
        background: rgba(0,0,0,0.22); box-shadow: inset 0 -3px 0 var(--owner); cursor: pointer;
      }

      /* rafti im: dy rafte druri si në foto, me kapakë të zinj */
      .rk-rack {
        position: relative; display: flex; flex-direction: column; gap: 4px;
        padding: 6px 6px 8px; border-radius: 10px;
        border-left: 10px solid #151313; border-right: 10px solid #151313;
        background:
          repeating-linear-gradient(91deg, rgba(0,0,0,0.06) 0 3px, transparent 3px 13px),
          linear-gradient(180deg, #c98443 0%, #a8652d 50%, #7d4519 100%);
        box-shadow: 0 12px 26px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,225,180,0.4);
      }
      .rk-shelf {
        display: grid; grid-template-columns: repeat(13, var(--tw)); gap: 2px;
        padding-bottom: 5px; border-bottom: 4px solid #6a3a15;
        box-shadow: 0 2px 0 rgba(255,210,160,0.25);
      }
      .rk-slot { width: var(--tw); height: var(--th); border-radius: 5px; position: relative; background: rgba(0,0,0,0.08); }
      .rk-slot.rk-over { box-shadow: 0 0 0 2px #ffc83d; }

      .rk-btn {
        display: inline-flex; align-items: center; gap: 5px;
        font-size: 12px; font-weight: 800; color: #fff;
        background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.18);
        padding: 7px 12px; border-radius: 999px; cursor: pointer;
      }
      .rk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .rk-btn-gold { background: linear-gradient(180deg, #ffd666, #ffa41b); color: #2a1600; border-color: transparent; box-shadow: 0 3px 0 #b86a00; }
      .rk-btn-red { background: linear-gradient(180deg, #ff6b6b, #d62828); border-color: transparent; box-shadow: 0 3px 0 #8f1414; }
      .rk-pulse { animation: rk-pulse 1s ease-in-out infinite; }
      @keyframes rk-pulse { 50% { box-shadow: 0 3px 0 #b86a00, 0 0 0 4px rgba(255,255,255,0.35), 0 0 22px rgba(255,200,61,0.9); } }

      .rk-banner {
        position: fixed; left: 50%; top: 32%; z-index: 45; pointer-events: none;
        transform: translate(-50%, -50%); white-space: nowrap;
        font-family: var(--font-display); font-weight: 700; font-size: clamp(18px, 5vw, 30px);
        color: #fff; padding: 12px 22px; border-radius: 999px;
        background: linear-gradient(180deg, rgba(37,31,92,0.95), rgba(13,10,36,0.95));
        border: 2px solid rgba(255,200,61,0.7); box-shadow: 0 16px 40px rgba(0,0,0,0.5);
        animation: rk-banner 2.8s ease-out forwards;
      }
      .rk-banner-mine { background: linear-gradient(180deg, #ffd666, #ffa41b); color: #2a1600; border-color: #fff; }
      @keyframes rk-banner {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        12% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
        20% { transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; }
        100% { opacity: 0; transform: translate(-50%, -70%); }
      }

      @media (min-width: 640px) {
        .rk-small { --tw: 25px; --th: 34px; }
        .rk-mini-rack i { width: 7px; height: 11px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .rk-indicator, .rk-can, .rk-new, .rk-pulse, .rk-active, .rk-banner { animation: none; }
      }
    `}</style>
  );
}
