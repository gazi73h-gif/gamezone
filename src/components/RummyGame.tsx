'use client';

import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  RummyGameState, RummyTile, TileColor, OPEN_MIN,
  addToRummyMeld, autoPlayTurn, discardRummyTile, drawRummyTile, evaluateSelectedMelds,
  findAllMeldsInHand, isRummyBot, isTileRummyState, playRummyMeld, runBotRummyTurn,
  sortHand, standings, startNextRound, totalScore,
} from '@/lib/rummyLogic';
import { StaleStateError } from '@/lib/roomSync';
import { recordWin } from '@/lib/supabase';
import { ArrowLeft, BookOpen, ListOrdered, RotateCcw, Sparkles, X } from 'lucide-react';

interface RummyGameProps {
  gameState: RummyGameState;
  currentPlayerId: string;
  isHost: boolean;
  roomCode: string;
  onUpdateState: (newState: RummyGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
  onLeaveRoom?: () => void;
}

const TURN_MS = 15000; // hedhja automatike pas 15 sekondash (si më parë)
const HOST_GRACE_MS = 3000; // hosti e kryen vetëm nëse lojtari s'e ka bërë vetë
const BOT_MS = 1100;
const NEXT_ROUND_MS = 9000;
const RACK_SLOTS = 26; // dy rreshta × 13
const ROW = 13;

const INK: Record<TileColor, string> = {
  red: '#d62828',
  blue: '#0d8fa0',
  black: '#1f1d1b',
  orange: '#ea7a00',
};

/* ───────────── pamja e gurëve ───────────── */

function Tile({ tile, small, selected, isNew, ghost }: {
  tile: RummyTile; small?: boolean; selected?: boolean; isNew?: boolean; ghost?: boolean;
}) {
  return (
    <div
      className={`rk-tile ${small ? 'rk-small' : ''} ${selected ? 'rk-selected' : ''} ${isNew ? 'rk-new' : ''} ${ghost ? 'rk-ghost' : ''}`}
      style={{ color: INK[tile.color] }}
    >
      <span className="rk-num">{tile.number}</span>
      <span className="rk-suit">♥</span>
      {tile.isJoker && <span className="rk-star" title="Joker">★</span>}
    </div>
  );
}

const TileBack = ({ small }: { small?: boolean }) => <div className={`rk-tile rk-back ${small ? 'rk-small' : ''}`} />;

/* ───────────── rafti i kundërshtarit ───────────── */

function Seat({ name, count, opened, active, seconds, bot, side }: {
  name: string; count: number; opened: boolean; active: boolean; seconds: number; bot: boolean; side: 'top' | 'left' | 'right';
}) {
  const vertical = side !== 'top';
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-col'} items-center gap-1.5`}>
      <div className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] font-extrabold text-white shadow-lg ${active ? 'bg-gold text-[#2a1600]' : 'bg-black/55'}`}>
        <span className={`relative grid place-items-center w-6 h-6 rounded-full text-xs ${active ? 'bg-[#2a1600]/20' : 'bg-white/15'}`}>
          {bot ? '🤖' : name.slice(0, 1).toUpperCase()}
          {active && seconds > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid place-items-center w-4 h-4 rounded-full bg-coral text-white text-[9px]">{seconds}</span>
          )}
        </span>
        <span className={`truncate ${vertical ? 'max-w-[64px]' : 'max-w-[110px]'} ${active ? 'text-[#2a1600]' : ''}`}>{name}</span>
        {opened && <span className="text-[9px] px-1 rounded bg-mint/80 text-night">HAPUR</span>}
      </div>
      <div className={`rk-rack rk-rack-mini ${vertical ? 'rk-rack-vertical' : ''}`}>
        <div className={`flex ${vertical ? 'flex-col' : ''} gap-[2px]`}>
          {Array.from({ length: Math.min(count, vertical ? 8 : 15) }).map((_, i) => <TileBack key={i} small />)}
        </div>
        <span className="rk-count">{count}</span>
      </div>
    </div>
  );
}

/* ───────────── rafti im: ruhet në shfletues, që të mbetet pas refresh-it ───────────── */

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

function arrange(hand: RummyTile[], by: 'runs' | 'groups'): (string | null)[] {
  const sorted = sortHand(hand, by);
  const out: (string | null)[] = [];
  const key = (t: RummyTile) => (t.isJoker ? 'J' : by === 'runs' ? t.color : String(t.number));
  sorted.forEach((t, i) => {
    // një vend bosh midis grupeve, nëse ka hapësirë
    if (i > 0 && key(t) !== key(sorted[i - 1]) && sorted.length + out.filter((x) => x === null).length < RACK_SLOTS - 2) out.push(null);
    out.push(t.id);
  });
  while (out.length < RACK_SLOTS) out.push(null);
  return out.slice(0, RACK_SLOTS);
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
      <div className="rk-floor h-full flex items-center justify-center p-4">
        <div className="gz-panel rounded-[28px] p-7 text-center max-w-sm">
          <h2 className="font-display font-bold text-2xl mb-2">Rummy tani luhet me gurë!</h2>
          <p className="text-mute text-sm mb-5">Kjo lojë u nis me versionin e vjetër me letra. Fillo një lojë të re në të njëjtën dhomë.</p>
          {props.onRestartGame && (
            <button onClick={props.onRestartGame} className="gz-btn inline-flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
              <RotateCcw className="w-5 h-5" /> Lojë e re
            </button>
          )}
        </div>
      </div>
    );
  }
  return <RummyTable {...props} />;
}

function RummyTable({ gameState: serverState, currentPlayerId, isHost, roomCode, onUpdateState, onRestartGame, onLeaveRoom }: RummyGameProps) {
  const [gameState, setGameState] = useState(serverState);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [modal, setModal] = useState<'scores' | 'rules' | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(15);
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

  /* koha e radhës */
  const turnKey = `${s.gameId}|${s.round}|${s.currentTurn}|${s.hasDrawn}|${s.status}`;
  const deadlineRef = useRef(0);
  const firedRef = useRef('');
  useEffect(() => { deadlineRef.current = Date.now() + TURN_MS; }, [turnKey]);
  const tick = useEffectEvent(() => {
    const left = deadlineRef.current - Date.now();
    setSecondsLeft(Math.max(0, Math.ceil(left / 1000)));
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
    if (newId && slot !== undefined && layout[slot] === null) {
      const slots = layout.slice();
      slots[slot] = newId;
      setRack({ key: rackKey, slots });
    }
    void commit(next);
  };

  const discard = (id: string) => {
    if (!canAct) return fail(myTurn ? 'Merr një gur fillimisht!' : 'Nuk është radha jote.');
    setSelected([]);
    void commit(discardRummyTile(s, currentPlayerId, id));
  };

  const meld = () => {
    if (!canAct) return fail('Merr një gur fillimisht!');
    const r = playRummyMeld(s, currentPlayerId, chosen);
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

  const suggest = () => {
    const found = findAllMeldsInHand(hand);
    if (found.length === 0) return fail('Nuk u gjet asnjë kombinim.');
    setSelected(found.flatMap((m) => m.tiles.map((t) => t.id)));
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
  const topDiscard = s.discardPile.at(-1) ?? null;
  const evalSel = chosenTiles.length >= 3 ? evaluateSelectedMelds(chosenTiles) : null;
  const meldReady = !!evalSel?.valid && (me?.hasOpened || evalSel.totalPoints >= OPEN_MIN);
  const draggingTile = drag?.kind === 'tile' && drag.id ? byId.get(drag.id) : null;
  const jokerTile: RummyTile = { id: 'joker-preview', color: s.joker.color, number: s.joker.number, isJoker: true };
  const opp = (offset: number, side: 'top' | 'left' | 'right') => {
    const id = seatAt(offset);
    const p = s.players[id];
    if (!p || id === currentPlayerId) return null;
    return <Seat name={p.nickname} count={p.hand.length} opened={p.hasOpened} active={s.status === 'playing' && s.currentTurn === id} seconds={secondsLeft} bot={isRummyBot(id)} side={side} />;
  };

  const ranking = standings(s);

  return (
    <div
      className="rk-floor h-full flex flex-col select-none overflow-hidden"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* ── shiriti i sipërm ── */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 shrink-0 relative z-20">
        <button onClick={onLeaveRoom} className="flex items-center gap-1.5 bg-black/45 hover:bg-black/60 text-white text-sm font-bold pl-2.5 pr-3.5 py-1.5 rounded-full cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Dil
        </button>
        <div className="flex items-center gap-1.5">
          <span className="bg-black/45 text-white text-xs font-extrabold px-3 py-1.5 rounded-full">
            Raundi <span className="text-gold font-display">{s.round}/{s.totalRounds}</span>
          </span>
          <button onClick={() => setModal('scores')} aria-label="Pikët" className="grid place-items-center w-8 h-8 rounded-full bg-black/45 hover:bg-black/60 text-white cursor-pointer"><ListOrdered className="w-4 h-4" /></button>
          <button onClick={() => setModal('rules')} aria-label="Rregullat" className="grid place-items-center w-8 h-8 rounded-full bg-black/45 hover:bg-black/60 text-white cursor-pointer"><BookOpen className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ── kundërshtari përballë ── */}
      <div className="flex justify-center pt-1 shrink-0">{opp(2, 'top')}</div>

      {/* ── tavolina ── */}
      <div className="flex-1 min-h-0 flex items-stretch gap-1 px-1.5">
        <div className="flex items-center shrink-0">{opp(3, 'left')}</div>

        <div className="flex-1 min-w-0 flex flex-col gap-2 py-1">
          {/* stiva, treguesi, toka */}
          <div className="flex items-end justify-center gap-6 sm:gap-10 shrink-0 pt-6 sm:pt-7">
            <div className="flex flex-col items-center gap-1">
              <button
                data-testid="deck"
                onPointerDown={(e) => onPointerDown(e, 'deck')}
                className={`rk-stack relative ${canDraw ? 'rk-can' : ''}`}
                aria-label={`Stiva, ${s.deck.length} gurë`}
              >
                <TileBack />
                <span className="rk-indicator" key={`${s.gameId}-${s.round}`} aria-label="Treguesi">
                  <Tile tile={{ ...s.indicator, isJoker: false }} />
                </span>
                <span className="rk-count">{s.deck.length}</span>
              </button>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">Stiva · Treguesi</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="rk-joker-chip">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Jokeri</span>
                <Tile tile={jokerTile} small />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div
                data-drop="discard"
                data-testid="discard"
                onPointerDown={(e) => topDiscard && onPointerDown(e, 'discard')}
                className={`rk-discard ${drag?.over === 'discard' ? 'rk-over' : ''} ${canDraw && topDiscard ? 'rk-can' : ''}`}
              >
                {topDiscard ? <Tile tile={topDiscard} /> : <span className="text-white/50 text-[10px] font-bold text-center leading-tight">Hidh<br />këtu</span>}
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">Toka</span>
            </div>
          </div>

          {/* kombinimet në tavolinë */}
          <div className="rk-mat flex-1 min-h-0 overflow-y-auto">
            {s.melds.length === 0 ? (
              <p className="h-full grid place-items-center text-white/55 text-xs font-bold text-center px-4">
                Kombinimet e hapura dalin këtu. Hapja e parë: min. {OPEN_MIN} pikë.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 content-start">
                {s.melds.map((m) => (
                  <button
                    key={m.id}
                    data-drop={`meld:${m.id}`}
                    onClick={() => chosen.length && addTo(m.id, chosen)}
                    className={`rk-meld ${drag?.over === `meld:${m.id}` ? 'rk-over' : ''}`}
                    title={`${m.ownerName} · ${m.points} pikë`}
                  >
                    <span className="rk-owner">{m.ownerId === currentPlayerId ? 'Ti' : m.ownerName.slice(0, 8)}</span>
                    <span className="flex gap-[2px]">{m.tiles.map((t) => <Tile key={t.id} tile={t} small />)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-white/85 text-xs font-semibold min-h-4 drop-shadow shrink-0">{s.lastActionText}</p>
        </div>

        <div className="flex items-center shrink-0">{opp(1, 'right')}</div>
      </div>

      {/* ── veprimet dhe rafti im ── */}
      <div className="shrink-0 px-2 pb-2 pt-1 flex flex-col items-center gap-1.5">
        <div className="flex items-center justify-center flex-wrap gap-1.5 min-h-9">
          <span className={`flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-full ${myTurn ? 'bg-gold text-[#2a1600]' : 'bg-black/45 text-white'}`}>
            {myTurn ? (s.hasDrawn ? 'Hap, shto ose hidh një gur' : 'Merr gur nga stiva ose toka') : `Radha e ${s.players[s.currentTurn]?.nickname ?? '...'}`}
            {s.status === 'playing' && <span className={`grid place-items-center min-w-5 h-5 px-1 rounded-full text-[10px] ${myTurn ? 'bg-[#2a1600] text-gold' : 'bg-white/20'}`}>{secondsLeft}</span>}
          </span>
          {canAct && chosen.length >= 3 && (
            <button onClick={meld} disabled={!meldReady} className="rk-btn rk-btn-gold">
              <Sparkles className="w-3.5 h-3.5" /> {me?.hasOpened ? 'Vendos' : 'Hap'} {evalSel?.valid ? `${evalSel.totalPoints} p.` : ''}
            </button>
          )}
          {canAct && chosen.length === 1 && (
            <button onClick={() => discard(chosen[0])} className="rk-btn rk-btn-red">Hidh gurin</button>
          )}
          {canAct && chosen.length === 0 && (
            <button onClick={suggest} className="rk-btn">Gjej kombinimet</button>
          )}
          <button onClick={() => setRack({ key: rackKey, slots: arrange(hand, 'runs') })} className="rk-btn">Seri</button>
          <button onClick={() => setRack({ key: rackKey, slots: arrange(hand, 'groups') })} className="rk-btn">Grupe</button>
        </div>

        <div className="rk-rack rk-rack-mine" data-drop="rack">
          <div className="rk-rows">
            {layout.map((id, i) => {
              const t = id ? byId.get(id) : null;
              const over = drag?.over === `slot:${i}`;
              return (
                <div key={i} data-drop={`slot:${i}`} className={`rk-slot ${over ? 'rk-over' : ''} ${i === ROW ? 'rk-row2' : ''}`}>
                  {t && (
                    <div
                      data-tile={t.id}
                      onPointerDown={(e) => onPointerDown(e, 'tile', t.id)}
                      className={`rk-grab ${drag?.id === t.id ? 'opacity-30' : ''}`}
                    >
                      <Tile tile={t} selected={chosen.includes(t.id)} isNew={myTurn && s.lastDrawnTileId === t.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* guri që po tërhiqet */}
      {drag && (
        <div className="fixed z-50 pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) rotate(-4deg) scale(1.12)' }}>
          {draggingTile ? <Tile tile={draggingTile} ghost /> : drag.kind === 'discard' && topDiscard ? <Tile tile={topDiscard} ghost /> : <TileBack />}
        </div>
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
                  <li>Në radhën tënde: merr një gur (stiva ose toka), hap/shto kombinime, pastaj hidh një gur.</li>
                  <li><strong className="text-ink">Seri:</strong> 3+ gurë me ngjyrë të njëjtë radhazi. <strong className="text-ink">Grup:</strong> 3–4 gurë me numër të njëjtë dhe ngjyra të ndryshme.</li>
                  <li>Hapja e parë kërkon min. {OPEN_MIN} pikë. Pas hapjes mund të shtosh gurë te çdo kombinim.</li>
                  <li>Fiton raundin kush mbaron gurët. Të tjerët marrin pikët e gurëve në dorë (Jokeri 30, pa u hapur 100).</li>
                  <li>Pas 4 raundeve fiton kush ka më pak pikë. Pas 15 sekondash pa veprim, loja hedh një gur automatikisht.</li>
                  <li>Tërhiq gurët për t’i rregulluar në raft, ose prek për t’i zgjedhur.</li>
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

/* ───────────── stilet: dru, rafte dhe gurë si në tavolinë të vërtetë ───────────── */
function RummyStyles() {
  return (
    <style>{`
      .rk-floor {
        --tw: min(calc((100vw - 34px) / 13.4), 50px);
        --th: calc(var(--tw) * 1.4);
        background-color: #9b9284;
        background-image:
          radial-gradient(120% 80% at 50% 45%, transparent 55%, rgba(0,0,0,0.28)),
          url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='132'><rect width='320' height='44' fill='%23a59c8e'/><rect y='44' width='320' height='44' fill='%23938a7d'/><rect y='88' width='320' height='44' fill='%23ada392'/><g fill='none' stroke-width='1'><path d='M0 9 C80 6 160 13 320 8 M0 21 C90 25 200 17 320 22 M0 33 C120 30 210 36 320 31' stroke='%23fff' stroke-opacity='.10'/><path d='M0 54 C100 50 180 58 320 53 M0 67 C70 70 220 63 320 68 M0 79 C130 76 230 82 320 78' stroke='%23000' stroke-opacity='.10'/><path d='M0 97 C90 94 170 101 320 96 M0 110 C80 114 230 106 320 111 M0 123 C140 120 220 126 320 122' stroke='%23fff' stroke-opacity='.10'/></g><g stroke='%23473f36' stroke-opacity='.55' stroke-width='2'><path d='M0 44H320M0 88H320M0 132H320'/><path d='M210 0V44M70 44V88M265 88V132'/></g></svg>");
        background-size: auto, 320px 132px;
        color: #fff;
        touch-action: none;
      }
      .rk-tile {
        position: relative; width: var(--tw); height: var(--th);
        border-radius: calc(var(--tw) * 0.12);
        background: linear-gradient(180deg, #fffdf4 0%, #f6efd9 70%, #e9dfc2 100%);
        box-shadow: 0 2px 0 #cbbd99, 0 3px 4px rgba(0,0,0,0.35), inset 0 1px 0 #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        padding-top: calc(var(--th) * 0.1);
        font-family: var(--font-display); line-height: 1;
        transition: transform .12s, box-shadow .12s;
      }
      .rk-num { font-weight: 700; font-size: calc(var(--tw) * 0.62); letter-spacing: -0.04em; }
      .rk-suit { font-size: calc(var(--tw) * 0.34); margin-top: calc(var(--th) * 0.06); }
      .rk-star { position: absolute; top: 1px; right: 2px; font-size: calc(var(--tw) * 0.3); color: #e0a800; text-shadow: 0 0 2px #fff; }
      .rk-small { --tw: 22px; --th: 31px; }
      .rk-selected { transform: translateY(-22%); box-shadow: 0 0 0 2px #ffc83d, 0 6px 10px rgba(0,0,0,0.4), inset 0 1px 0 #fff; }
      .rk-new { animation: rk-new 1.2s ease-out 2; }
      @keyframes rk-new { 50% { box-shadow: 0 0 0 3px #2ee6a6, 0 3px 4px rgba(0,0,0,0.35); } }
      .rk-ghost { box-shadow: 0 12px 24px rgba(0,0,0,0.45); }
      .rk-back {
        background: linear-gradient(180deg, #fffaf0, #ece2c6);
        background-image: radial-gradient(circle at 50% 45%, rgba(180,150,90,0.35) 0 18%, transparent 19%), linear-gradient(180deg, #fffaf0, #ece2c6);
      }
      .rk-grab { touch-action: none; cursor: grab; }
      .rk-grab:active { cursor: grabbing; }

      /* rafti prej druri me skaje të zeza, si në foto */
      .rk-rack {
        position: relative; border-radius: 8px;
        background:
          repeating-linear-gradient(92deg, rgba(0,0,0,0.07) 0 3px, transparent 3px 11px),
          linear-gradient(180deg, #c27a3e 0%, #a35f28 55%, #7c431a 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 18px rgba(0,0,0,0.45);
        border-left: 8px solid #151313; border-right: 8px solid #151313;
      }
      .rk-rack-mini { padding: 4px 6px; }
      .rk-rack-mini .rk-tile { --tw: 9px; --th: 14px; border-radius: 2px; box-shadow: 0 1px 0 #cbbd99; padding: 0; }
      .rk-rack-vertical .rk-tile { --tw: 14px; --th: 9px; }
      .rk-count { position: absolute; bottom: -8px; right: -10px; background: #151313; color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 999px; }
      .rk-rack-mine { padding: 6px 4px 8px; width: calc(var(--tw) * 13 + 2px * 12 + 8px); }
      .rk-rows { display: grid; grid-template-columns: repeat(13, var(--tw)); gap: 6px 2px; }
      .rk-slot { width: var(--tw); height: var(--th); border-radius: 4px; position: relative; }
      .rk-slot::after { content: ''; position: absolute; inset: 0; border-radius: 4px; box-shadow: inset 0 -3px 0 rgba(0,0,0,0.18); pointer-events: none; }
      .rk-slot.rk-over { background: rgba(255,200,61,0.45); box-shadow: 0 0 0 2px #ffc83d; }

      .rk-stack { touch-action: none; position: relative; padding: 0; background: none; border: 0; filter: drop-shadow(0 6px 6px rgba(0,0,0,0.35)); }
      .rk-stack > .rk-back { box-shadow: 0 2px 0 #cbbd99, 0 4px 0 #e9dfc2, 0 6px 0 #cbbd99, 0 8px 0 #e9dfc2, 0 10px 8px rgba(0,0,0,0.4); }
      .rk-can { cursor: pointer; animation: rk-glow 1.4s ease-in-out infinite; border-radius: 8px; }
      @keyframes rk-glow { 50% { filter: drop-shadow(0 0 8px #ffc83d) drop-shadow(0 6px 6px rgba(0,0,0,0.35)); } }
      .rk-stack > .rk-count { bottom: -12px; right: 50%; transform: translateX(50%); }

      /* treguesi: i kthyer mbi stivë, me lëvizje në fillim të raundit */
      .rk-indicator {
        position: absolute; left: 62%; top: 8%;
        transform: translate(-50%, -50%) rotate(-14deg);
        filter: drop-shadow(0 0 6px #ffc83d);
        animation: rk-reveal 0.9s ease-out 0s 1, rk-wiggle 0.7s ease-in-out 0.9s 4;
      }
      .rk-indicator .rk-tile { box-shadow: 0 0 0 2px #ffc83d, 0 4px 6px rgba(0,0,0,0.4); }
      @keyframes rk-reveal {
        0% { transform: translate(-50%, -50%) rotate(-14deg) rotateY(180deg) scale(0.6); }
        60% { transform: translate(-50%, -75%) rotate(-6deg) rotateY(0deg) scale(1.18); }
        100% { transform: translate(-50%, -50%) rotate(-14deg) scale(1); }
      }
      @keyframes rk-wiggle {
        0%, 100% { transform: translate(-50%, -50%) rotate(-14deg); }
        25% { transform: translate(-50%, -62%) rotate(-24deg); }
        75% { transform: translate(-50%, -62%) rotate(-4deg); }
      }
      .rk-joker-chip { display: flex; flex-direction: column; align-items: center; gap: 4px; background: rgba(21,19,19,0.7); border: 2px solid #ffc83d; border-radius: 12px; padding: 5px 8px 7px; color: #ffc83d; }

      .rk-discard {
        touch-action: none; width: calc(var(--tw) + 14px); height: calc(var(--th) + 14px);
        border-radius: 10px; border: 2px dashed rgba(255,255,255,0.45);
        display: grid; place-items: center; background: rgba(0,0,0,0.15);
      }
      .rk-discard.rk-over, .rk-meld.rk-over { border-color: #ffc83d; background: rgba(255,200,61,0.3); border-style: solid; }

      .rk-mat {
        border-radius: 14px; padding: 8px;
        background: rgba(40,28,18,0.32); box-shadow: inset 0 2px 10px rgba(0,0,0,0.35);
      }
      .rk-meld {
        display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
        padding: 4px 5px; border-radius: 9px; border: 2px solid transparent;
        background: linear-gradient(180deg, #b06a33, #874a1f); box-shadow: 0 3px 6px rgba(0,0,0,0.35); cursor: pointer;
      }
      .rk-owner { font-size: 9px; font-weight: 800; color: rgba(255,255,255,0.85); padding-left: 2px; }

      .rk-btn {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 12px; font-weight: 800; color: #fff;
        background: rgba(21,19,19,0.7); border: 1px solid rgba(255,255,255,0.2);
        padding: 6px 11px; border-radius: 999px; cursor: pointer;
      }
      .rk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .rk-btn-gold { background: linear-gradient(180deg, #ffc83d, #ffa41b); color: #2a1600; border-color: transparent; box-shadow: 0 3px 0 #b86a00; }
      .rk-btn-red { background: linear-gradient(180deg, #ff6b6b, #d62828); border-color: transparent; box-shadow: 0 3px 0 #8f1414; }

      @media (min-width: 640px) {
        .rk-small { --tw: 26px; --th: 36px; }
        .rk-rack-mini .rk-tile { --tw: 12px; --th: 17px; }
        .rk-rack-vertical .rk-tile { --tw: 17px; --th: 12px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .rk-indicator, .rk-can, .rk-new { animation: none; }
      }
    `}</style>
  );
}
