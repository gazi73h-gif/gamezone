'use client';
import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  LudoColor, LudoGameState,
  getMovableTokenIndices, moveLudoToken, rollAndAutoMove, toGlobalPos,
  normalizeLudoState, LAST_MAIN, FINISH, isLudoBot, ludoStandings,
} from '@/lib/ludoLogic';
import { StaleStateError } from '@/lib/roomSync';
import { playSound } from '@/lib/sound';
import { useDiceSkin } from '@/lib/shop';
import type { LudoAction, LudoResult } from '@/lib/ludoRemote';
import Fireworks from '@/components/Fireworks';
import { useAvatar, UserAvatar } from '@/lib/avatars';
import { recordWin } from '@/lib/supabase';
import { RotateCcw, Trophy } from 'lucide-react';

interface LudoGameProps {
  gameState: LudoGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (ns: LudoGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
  /** rregullat në server: zari hidhet dhe lëvizja kontrollohet nga serveri */
  remote?: (a: LudoAction) => Promise<LudoResult>;
}

/* ───────────── board geometry ───────────── */
const toRC = (arr: string[]) => arr.map((s) => s.split(',').map(Number) as [number, number]);
const MAIN_PATH = toRC([
  '6,1','6,2','6,3','6,4','6,5','5,6','4,6','3,6','2,6','1,6','0,6',
  '0,7','0,8','1,8','2,8','3,8','4,8','5,8','6,9','6,10','6,11','6,12','6,13','6,14',
  '7,14','8,14','8,13','8,12','8,11','8,10','8,9','9,8','10,8','11,8','12,8','13,8','14,8',
  '14,7','14,6','13,6','12,6','11,6','10,6','9,6','8,5','8,4','8,3','8,2','8,1','8,0',
  '7,0','6,0',
]);
const HOME_PATH: Record<LudoColor, [number, number][]> = {
  red:    toRC(['7,1','7,2','7,3','7,4','7,5','7,6']),
  blue:   toRC(['1,7','2,7','3,7','4,7','5,7','6,7']),
  yellow: toRC(['7,13','7,12','7,11','7,10','7,9','7,8']),
  green:  toRC(['13,7','12,7','11,7','10,7','9,7','8,7']),
};

/* ───────────── colour palette (matches the photo) ───────────── */
const ZONE: Record<LudoColor, { bg: string; light: string; dark: string; token: string; home: string }> = {
  red:    { bg: '#e53935', light: '#ef5350', dark: '#b71c1c', token: '#f44336', home: '#ef9a9a' },
  blue:   { bg: '#1e88e5', light: '#42a5f5', dark: '#0d47a1', token: '#2196f3', home: '#90caf9' },
  yellow: { bg: '#fdd835', light: '#ffee58', dark: '#f9a825', token: '#ffeb3b', home: '#fff59d' },
  green:  { bg: '#43a047', light: '#66bb6a', dark: '#1b5e20', token: '#4caf50', home: '#a5d6a7' },
};

/* ───────────── pawn: guri klasik i Ludos ───────────── */
// Pika ku guri "qëndron" mbi fushë, si pjesë e lartësisë së SVG-së
const PAWN_ASPECT = 54 / 40;
const PAWN_FOOT = 44 / 54;

function Pawn({ color }: { color: LudoColor }) {
  const z = ZONE[color];
  const id = `pw-${color}`;
  const shape = (
    <>
      <ellipse cx="20" cy="43" rx="15" ry="6" />
      <path d="M8.5 42 C9.5 34 15 30 15.5 22 L24.5 22 C25 30 30.5 34 31.5 42 Z" />
      <circle cx="20" cy="13.5" r="10.5" />
    </>
  );
  return (
    <svg viewBox="0 0 40 54" className="block w-full h-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`${id}-b`} x1="0" x2="1">
          <stop offset="0" stopColor={z.dark} />
          <stop offset="0.45" stopColor={z.light} />
          <stop offset="1" stopColor={z.dark} />
        </linearGradient>
        <radialGradient id={`${id}-h`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.28" stopColor={z.light} />
          <stop offset="1" stopColor={z.dark} />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="47.5" rx="14" ry="4.5" fill="#000" opacity="0.32" />
      {/* rrethi i bardhë që e ndan gurin nga fusha me të njëjtën ngjyrë */}
      <g fill="#fff" stroke="#fff" strokeWidth="4" strokeLinejoin="round">{shape}</g>
      <ellipse cx="20" cy="43" rx="15" ry="6" fill={z.dark} />
      <ellipse cx="20" cy="41" rx="15" ry="5.2" fill={`url(#${id}-b)`} />
      <path d="M8.5 41 C9.5 34 15 30 15.5 22 L24.5 22 C25 30 30.5 34 31.5 41 Z" fill={`url(#${id}-b)`} />
      <ellipse cx="20" cy="22.5" rx="8" ry="2.6" fill={z.dark} />
      <ellipse cx="20" cy="21.8" rx="7.6" ry="2.2" fill={z.light} />
      <circle cx="20" cy="13.5" r="10.5" fill={`url(#${id}-h)`} />
      <ellipse cx="16.2" cy="9.4" rx="3.6" ry="2.4" fill="#fff" opacity="0.75" transform="rotate(-25 16.2 9.4)" />
    </svg>
  );
}

/* ───────────── zari 3D ───────────── */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[27, 27], [73, 73]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[27, 22], [73, 22], [27, 50], [73, 50], [27, 78], [73, 78]],
};
// faqja e çdo numri dhe rrotullimi i kubit që e kthen atë nga lojtari
const FACE: Record<number, string> = { 1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 2: 'rotateY(90deg)', 5: 'rotateY(-90deg)', 3: 'rotateX(90deg)', 4: 'rotateX(-90deg)' };
const SHOW: Record<number, string> = { 1: 'rotateX(0deg) rotateY(0deg)', 6: 'rotateY(-180deg)', 2: 'rotateY(-90deg)', 5: 'rotateY(90deg)', 3: 'rotateX(-90deg)', 4: 'rotateX(90deg)' };

function Dice({ value, rolling, canRoll, onClick }: {
  value: number | null; rolling: boolean; canRoll: boolean; onClick: () => void;
}) {
  const skin = useDiceSkin();
  const v = value ?? 1;
  return (
    <button
      aria-label="Hidh zarin"
      onClick={onClick}
      disabled={!canRoll}
      className={`ld-dice ${canRoll ? 'ld-can' : ''}`}
    >
      <span className="ld-scene">
        <span className={`ld-cube ${rolling ? 'ld-rolling' : ''}`} style={rolling ? undefined : { transform: `rotateX(-16deg) rotateY(20deg) ${SHOW[v]}` }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} className="ld-face" style={{ background: skin.face, transform: `${FACE[n]} translateZ(var(--half))` }}>
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {PIPS[n].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="10" fill={n === 1 ? skin.one : skin.pip} />)}
              </svg>
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

/* ───────────── board cell style ───────────── */
function cellBg(r: number, c: number): { bg: string; arrow?: string; star?: boolean } {
  // coloured quadrants (home zones)
  if (r < 6 && c < 6)   return { bg: ZONE.red.bg };
  if (r < 6 && c > 8)   return { bg: ZONE.blue.bg };
  if (r > 8 && c > 8)   return { bg: ZONE.yellow.bg };
  if (r > 8 && c < 6)   return { bg: ZONE.green.bg };

  // Red home column
  if (r === 7 && c >= 1 && c <= 5) return { bg: ZONE.red.home };
  // Blue home row
  if (c === 7 && r >= 1 && r <= 5) return { bg: ZONE.blue.home };
  // Yellow home column
  if (r === 7 && c >= 9 && c <= 13) return { bg: ZONE.yellow.home };
  // Green home row
  if (c === 7 && r >= 9 && r <= 13) return { bg: ZONE.green.home };

  // safe cells + arrows
  const safe8 = [0, 8, 13, 21, 26, 34, 39, 47];
  const idx = MAIN_PATH.findIndex(([mr, mc]) => mr === r && mc === c);

  // entry arrows
  if (r === 6 && c === 1) return { bg: '#fff', arrow: '→', star: false };  // red start
  if (r === 1 && c === 8) return { bg: '#fff', arrow: '↓', star: false };  // blue start
  if (r === 8 && c === 13) return { bg: '#fff', arrow: '←', star: false }; // yellow start
  if (r === 13 && c === 6) return { bg: '#fff', arrow: '↑', star: false };  // green start

  if (idx >= 0 && safe8.includes(idx)) return { bg: '#fff', star: true };
  return { bg: '#fff' };
}

/* ───────────── movement ───────────── */
const HOP_MS = 260;
const ROLL_MS = 1000; // zari rrotullohet 1 sekondë
const LANDED_MS = 1300; // numri i madh qëndron pak pasi ndalet zari
const SAVE_ATTEMPTS = 3;
const BASE_CENTER: Record<LudoColor, [number, number]> = {
  red: [3, 3], blue: [3, 12], yellow: [12, 12], green: [12, 3],
};
// Vendi i gurëve që kanë arritur në qendër
const FINISH_SPOT: Record<LudoColor, [number, number]> = {
  red: [7.5, 6.6], blue: [6.6, 7.5], yellow: [7.5, 8.4], green: [8.4, 7.5],
};
const pct = (cells: number) => `${(cells / 15) * 100}%`;

type Positions = Record<string, number[]>;

const positionsOf = (s: LudoGameState): Positions =>
  Object.fromEntries(s.playerOrder.map((id) => [id, s.players[id].tokens]));

// jsonb i ndërron vendet çelësave, prandaj krahasohet sipas playerOrder
const signatureOf = (s: LudoGameState) =>
  JSON.stringify([
    s.playerOrder.map((id) => s.players[id].tokens),
    s.playerOrder, s.currentTurn, s.diceValue, s.hasRolled, s.status,
  ]);

function shouldAccept(incoming: LudoGameState, local: LudoGameState) {
  if (incoming.gameId !== local.gameId) return true;
  const diff = (incoming.rev ?? 0) - (local.rev ?? 0);
  return diff > 0 || (diff === 0 && signatureOf(incoming) !== signatureOf(local));
}

/* një hap drejt gjendjes së ruajtur: së pari ecën guri, pastaj kthehet në bazë ai që u hëngr */
function nextHop(shown: Positions, target: Positions): Positions {
  for (const [pid, tokens] of Object.entries(target)) {
    const idx = tokens.findIndex((pos, i) => pos > shown[pid][i]);
    if (idx >= 0) return { ...shown, [pid]: shown[pid].map((pos, i) => (i === idx ? pos + 1 : pos)) };
  }
  return target;
}

/* qendra e gurit, në njësi kutish [rreshti, kolona] */
function tokenCenter(color: LudoColor, pos: number, idx: number): [number, number] {
  if (pos === -1) {
    const [r, c] = BASE_CENTER[color];
    return [r + (idx < 2 ? -0.85 : 0.85), c + (idx % 2 ? 0.85 : -0.85)];
  }
  if (pos === FINISH) return FINISH_SPOT[color];
  const [r, c] = pos <= LAST_MAIN ? MAIN_PATH[toGlobalPos(color, pos)] : HOME_PATH[color][pos - LAST_MAIN - 1];
  return [r + 0.5, c + 0.5];
}

export default function LudoGame({
  gameState: rawServerState, currentPlayerId, isHost, onUpdateState, onRestartGame, remote,
}: LudoGameProps) {
  const serverState = normalizeLudoState(rawServerState);
  const winRef = useRef(false);
  // gameState = gjendja më e re (pa pritur serverin), shown = ku duken gurët gjatë kërcimit
  const [gameState, setGameState] = useState(serverState);
  const [shown, setShown] = useState(() => positionsOf(serverState));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const serverRef = useRef(serverState);

  if (shouldAccept(serverState, gameState)) {
    setGameState(serverState);
    const sameGame = serverState.gameId === gameState.gameId
      && serverState.playerOrder.join() === gameState.playerOrder.join();
    if (!sameGame) setShown(positionsOf(serverState));
  }

  useEffect(() => { serverRef.current = serverState; }, [serverState]);

  /* zari: çdo hedhje e re (rollId) rrotullohet 5 sekonda, pastaj tregon numrin */
  const rollKey = `${gameState.gameId}|${gameState.rollId ?? 0}`;
  const [seenRoll, setSeenRoll] = useState(rollKey);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState<{ key: string; value: number; name: string } | null>(null);
  if (rollKey !== seenRoll) {
    const sameGame = seenRoll.split('|')[0] === rollKey.split('|')[0];
    setSeenRoll(rollKey);
    if (sameGame && gameState.diceValue) { setRolling(true); setLanded(null); }
  }
  const landedInfo = useEffectEvent(() => ({
    key: rollKey, value: gameState.diceValue ?? 1,
    name: gameState.rolledBy === currentPlayerId ? 'Ti' : gameState.players[gameState.rolledBy ?? '']?.nickname ?? '',
  }));
  useEffect(() => {
    if (!rolling) return;
    playSound('dice');
    const rattle = setInterval(() => playSound('dice'), 420);
    const stop = setTimeout(() => {
      const info = landedInfo();
      setRolling(false); setLanded(info);
      playSound(info.value === 6 ? 'six' : 'diceLand');
    }, ROLL_MS);
    return () => { clearInterval(rattle); clearTimeout(stop); };
  }, [rolling, seenRoll]);
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), LANDED_MS);
    return () => clearTimeout(t);
  }, [landed]);

  const moving = gameState.playerOrder.some((id) =>
    gameState.players[id].tokens.some((pos, i) => shown[id]?.[i] !== pos));
  const busy = moving || saving || rolling;

  /* kërcimi, një fushë në çdo hap */
  const hopN = useRef(0);
  useEffect(() => {
    if (!moving) { hopN.current = 0; return; }
    if (rolling) return;
    const t = setTimeout(() => {
      const target = positionsOf(gameState);
      const next = nextHop(shown, target);
      setShown(next);
      // a u rrëzua ndonjë figurë (nga fusha kthehet në bazë)?
      const victims = next === target
        ? Object.keys(target).filter((pid) => target[pid].some((pos, i) => pos === -1 && (shown[pid]?.[i] ?? -1) >= 0))
        : [];
      const reset = victims.length && Object.keys(target).every((pid) => target[pid].every((pos) => pos === -1));
      if (!victims.length || reset) {
        const changed = (test: (pos: number, was: number) => boolean) =>
          Object.keys(next).some((pid) => next[pid].some((pos, i) => test(pos, shown[pid]?.[i] ?? -1)));
        if (changed((pos, was) => pos === FINISH && was !== FINISH)) playSound('home');
        else if (changed((pos, was) => pos === 0 && was === -1)) playSound('enter');
        else playSound('hop', hopN.current++);
      } else if (victims.includes(currentPlayerId)) playSound('ouch');
      else if (gameState.rolledBy === currentPlayerId) playSound('yes');
      else playSound('knock');
    }, HOP_MS);
    return () => clearTimeout(t);
  }, [moving, rolling, shown, gameState, currentPlayerId]);

  /* ruaje menjëherë, animacioni vjen pas */
  const commit = async (next: LudoGameState) => {
    if (next === gameState) return;
    const saved = { ...next, rev: (gameState.rev ?? 0) + 1 };
    setGameState(saved);
    setSaving(true);
    setSaveFailed(false);
    for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
      try {
        await onUpdateState(saved);
        setSaving(false);
        return;
      } catch (err) {
        if (err instanceof StaleStateError) break;
        if (attempt < SAVE_ATTEMPTS) await new Promise((res) => setTimeout(res, 500 * attempt));
        else setSaveFailed(true);
      }
    }
    setGameState(serverRef.current);
    setShown(positionsOf(serverRef.current));
    setSaving(false);
  };

  /* veprimi: së pari te serveri; kur serveri s'është gati, si më parë (llogaritet këtu dhe ruhet) */
  const act = async (action: LudoAction, local: () => LudoGameState) => {
    if (remote) {
      setSaving(true);
      setSaveFailed(false);
      const res = await remote(action);
      if (res.ok) { setGameState(normalizeLudoState(res.state)); setSaving(false); return; }
      if (res.reason !== 'unavailable') {
        // lëvizja u refuzua ose dikush tjetër luajti ndërkohë: merr gjendjen e serverit
        const back = res.state ? normalizeLudoState(res.state) : serverRef.current;
        setGameState(back);
        setShown(positionsOf(back));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    void commit(local());
  };

  /* bot turn */
  const botReady = isHost && !busy && gameState.status === 'playing' && isLudoBot(gameState.currentTurn);
  const playBot = useEffectEvent(() => {
    const bot = gameState.players[gameState.currentTurn];
    if (!bot) return;
    if (!gameState.hasRolled) return void act({ type: 'roll', bot: bot.id }, () => rollAndAutoMove(gameState, bot.id));
    if (gameState.diceValue === null) return;
    const idx = getMovableTokenIndices(bot, gameState.diceValue).at(0);
    if (idx !== undefined) void act({ type: 'move', token: idx, bot: bot.id }, () => moveLudoToken(gameState, bot.id, idx));
  });
  useEffect(() => {
    if (!botReady) return;
    const t = setTimeout(() => playBot(), 900);
    return () => clearTimeout(t);
  }, [botReady, gameState]);

  /* win record */
  useEffect(() => {
    if (serverState.status !== 'finished') { winRef.current = false; return; }
    if (winRef.current) return;
    const w = serverState.winnerId ? serverState.players[serverState.winnerId] : null;
    if (w && w.id === currentPlayerId) {
      winRef.current = true;
      recordWin(w.nickname, 100, 'Ludo (Mos u zemëro)');
    }
  }, [serverState.status, serverState.winnerId, serverState.players, currentPlayerId]);

  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';

  /* "ding" kur të vjen radha */
  const myCall = isMyTurn && !gameState.hasRolled && !busy;
  useEffect(() => { if (myCall) playSound('turn'); }, [myCall]);

  /* fundi: fanfarë + fishekzjarre */
  const celebrate = gameState.status === 'finished' && !moving;
  useEffect(() => { if (celebrate) playSound('victory'); }, [celebrate]);
  const me = gameState.players[currentPlayerId];
  const movable = isMyTurn && !busy && gameState.hasRolled && gameState.diceValue !== null && me
    ? getMovableTokenIndices(me, gameState.diceValue) : [];

  /* handle roll */
  const handleRoll = () => {
    if (!isMyTurn || gameState.hasRolled || busy) return;
    void act({ type: 'roll' }, () => rollAndAutoMove(gameState, currentPlayerId));
  };

  /* handle move */
  const handleMove = (pid: string, idx: number) => {
    if (pid !== currentPlayerId || !movable.includes(idx)) return;
    void act({ type: 'move', token: idx }, () => moveLudoToken(gameState, currentPlayerId, idx));
  };

  /* renditje fikse, përndryshe DOM-i i zhvendos gurët dhe prishet animacioni */
  const tokens = gameState.playerOrder.flatMap((pid) => {
    const { color, tokens: saved } = gameState.players[pid];
    return (shown[pid] ?? saved).map((pos, idx) => {
      const [y, x] = tokenCenter(color, pos, idx);
      return { pid, color, idx, pos, x, y, cell: `${y}-${x}`, ok: pid === currentPlayerId && movable.includes(idx) };
    });
  });
  const occupied = new Set(tokens.map((tk) => tk.cell));

  /* ── finished screen ── */
  if (gameState.status === 'finished' && !moving) {
    const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    return (
      <div className="h-full flex items-center justify-center px-4">
        <Fireworks key={gameState.gameId} />
        <div className="gz-panel rounded-[30px] p-8 text-center max-w-sm w-full relative ld-win">
          <div className="w-24 h-32 mx-auto mb-2 animate-bounce">
            {w ? <Pawn color={w.color} /> : <Trophy className="w-16 h-16 text-gold mx-auto" />}
          </div>
          <h2 className="font-display font-bold text-3xl mb-1">{w?.id === currentPlayerId ? <>🎉 <span className="ld-win-title">Fitove!</span> 🎉</> : <span className="ld-win-title">Loja përfundoi!</span>}</h2>
          <p className="text-gold font-display font-semibold text-xl mb-5">👑 {w?.nickname || 'Lojtari'} fitoi!</p>
          <ol className="text-left space-y-1.5 mb-6">
            {ludoStandings(gameState).map((row, i) => (
              <li key={row.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${i === 0 ? 'bg-gold/15 border border-gold/40' : 'bg-white/5'}`}>
                <span className="w-5 font-display font-bold text-mute">{i + 1}</span>
                <span className="w-5 h-7 shrink-0"><Pawn color={row.color} /></span>
                <span className="flex-1 font-bold truncate">{row.id === currentPlayerId ? 'Ti' : row.nickname}</span>
                <span className="text-xs font-bold text-mute">{row.home}/4 në shtëpi</span>
              </li>
            ))}
          </ol>
          {onRestartGame && (
            <button onClick={onRestartGame}
              className="gz-btn inline-flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
              <RotateCcw className="w-5 h-5" /> Luaj përsëri
            </button>
          )}
          <p className="text-xs text-mute mt-3">Dhoma mbetet e hapur — lojtarët e rinj mund të hyjnë.</p>
          <style>{`
            .ld-win { animation: ld-win-in 0.7s cubic-bezier(.2,1.4,.4,1) both; }
            @keyframes ld-win-in { from { opacity: 0; transform: scale(0.6) translateY(30px); } }
            .ld-win-title { background: linear-gradient(90deg, #ffc83d, #ff5d73, #4cc9f0, #3ddc97, #ffc83d); background-size: 300% 100%;
              -webkit-background-clip: text; background-clip: text; color: transparent; animation: ld-shine 3s linear infinite; }
            @keyframes ld-shine { to { background-position: 300% 0; } }
          `}</style>
        </div>
      </div>
    );
  }

  /* ── current player info ── */
  const curPlayer = gameState.players[gameState.currentTurn];
  // gjatë rrotullimit tregohet kush po hedh, që rezultati të mos zbulohet para se të ndalet zari
  const rollerName = gameState.rolledBy === currentPlayerId ? 'Ti' : gameState.players[gameState.rolledBy ?? '']?.nickname ?? '';
  const curColor = (rolling ? gameState.players[gameState.rolledBy ?? '']?.color : undefined) ?? curPlayer?.color ?? 'red';

  /* ── board rendering ── */
  const BOARD_SIZE = 15;

  return (
    <div className="ld-root h-full flex flex-col select-none">

      {/* radha */}
      <div className="ld-turn flex justify-center px-3 pt-2 shrink-0">
        <div
          className="flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full font-display font-semibold text-white shadow-lg"
          style={{ background: `linear-gradient(180deg, ${ZONE[curColor].light}, ${ZONE[curColor].dark})` }}
        >
          <span className="w-6 h-8 -mt-2"><Pawn color={curColor} /></span>
          {rolling ? `🎲 ${rollerName} po hedh zarin…` : isMyTurn ? (gameState.hasRolled ? 'Zgjidh një gur' : 'Radha jote, hidh zarin!') : `Radha e ${curPlayer?.nickname ?? '...'}`}
        </div>
      </div>

      {/* board: sa më i madh që lejon ekrani */}
      <div className="ld-board flex-1 min-h-0 flex items-center justify-center px-2 pt-5 pb-2" style={{ containerType: 'size' }}>
        <div className="relative aspect-square" style={{ width: 'min(100cqw, 100cqh, 640px)' }}>
          {/* outer border ring */}
          <div className="absolute inset-0 rounded-[22px]" style={{ background: 'linear-gradient(180deg, #2b2470, #1a1550)', padding: 6, boxShadow: '0 24px 50px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
            <div className="w-full h-full rounded-2xl overflow-hidden"
              style={{
                display: 'grid',
                position: 'relative',
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                border: '2px solid #cfd8dc',
                background: '#fff',
              }}
            >
              {Array.from({ length: BOARD_SIZE }).map((_, r) =>
                Array.from({ length: BOARD_SIZE }).map((__, c) => {
                  /* home zone quadrants — render as single coloured blocks, tokens drawn on top */
                  const inRedZone    = r >= 1 && r <= 4 && c >= 1 && c <= 4;
                  const inBlueZone   = r >= 1 && r <= 4 && c >= 10 && c <= 13;
                  const inYellowZone = r >= 10 && r <= 13 && c >= 10 && c <= 13;
                  const inGreenZone  = r >= 10 && r <= 13 && c >= 1 && c <= 4;

                  /* center (3×3) */
                  const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;

                  const isEmpty = !occupied.has(`${r + 0.5}-${c + 0.5}`);
                  const { bg, arrow, star } = cellBg(r, c);

                  /* cell border */
                  const border = '0.5px solid #cfd8dc';

                  /* invisible cells inside base zones (the 4×4 big squares are rendered separately) */
                  if (inRedZone || inBlueZone || inYellowZone || inGreenZone) {
                    return (
                      <div key={`${r}-${c}`} style={{
                        gridColumn: c + 1, gridRow: r + 1,
                        background: inRedZone ? ZONE.red.bg : inBlueZone ? ZONE.blue.bg : inYellowZone ? ZONE.yellow.bg : ZONE.green.bg,
                        border,
                        position: 'relative',
                      }} />
                    );
                  }

                  if (inCenter) {
                    /* only render once at top-left of center */
                    if (r === 6 && c === 6) {
                      return (
                        <div key={`${r}-${c}`} style={{
                          gridColumn: '7 / 10', gridRow: '7 / 10',
                          background: 'conic-gradient(from 45deg, #fdd835 0deg 90deg, #43a047 90deg 180deg, #e53935 180deg 270deg, #1e88e5 270deg 360deg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          position: 'relative', zIndex: 10,
                        }}>
                          {/* white triangle overlays to form star */}
                          <div style={{
                            position: 'absolute', inset: 0,
                            clipPath: 'polygon(50% 50%, 0% 0%, 100% 0%)',
                            background: 'rgba(255,255,255,0.08)',
                          }} />
                          <div style={{
                            position: 'absolute', inset: 0,
                            clipPath: 'polygon(50% 50%, 100% 0%, 100% 100%)',
                            background: 'rgba(0,0,0,0.08)',
                          }} />
                          {/* star icon */}
                          <svg viewBox="0 0 60 60" style={{ width: '65%', height: '65%' }}>
                            <polygon points="30,5 36,22 54,22 40,33 45,51 30,40 15,51 20,33 6,22 24,22"
                              fill="white" opacity="0.9" />
                          </svg>
                        </div>
                      );
                    }
                    return null;
                  }

                  return (
                    <div
                      key={`${r}-${c}`}
                      style={{
                        gridColumn: c + 1, gridRow: r + 1,
                        background: bg,
                        border,
                        position: 'relative',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {/* safe star */}
                      {star && isEmpty && (
                        <svg viewBox="0 0 24 24" style={{ width: '55%', height: '55%', opacity: 0.35 }}>
                          <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"
                            fill="#78909c" />
                        </svg>
                      )}
                      {/* arrow cells */}
                      {arrow && isEmpty && (
                        <span style={{ fontSize: '1em', color: '#546e7a', fontWeight: 900, lineHeight: 1 }}>{arrow}</span>
                      )}
                    </div>
                  );
                })
              )}

              {/* ── Base zones with 4 token slots ── */}
              {(Object.keys(BASE_CENTER) as LudoColor[]).map((color) => {
                const [cy, cx] = BASE_CENTER[color];
                return (
                  <React.Fragment key={`base_${color}`}>
                    <div style={{
                      position: 'absolute', zIndex: 5,
                      left: pct(cx - 1.8), top: pct(cy - 1.8), width: pct(3.6), height: pct(3.6),
                      background: 'white', borderRadius: '18%',
                      boxShadow: '0 3px 0 rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.25)',
                    }} />
                    {[0, 1, 2, 3].map((i) => {
                      const [y, x] = tokenCenter(color, -1, i);
                      return (
                        <div key={i} style={{
                          position: 'absolute', zIndex: 6,
                          left: pct(x - 0.7), top: pct(y - 0.7), width: pct(1.4), height: pct(1.4),
                          borderRadius: '50%', background: ZONE[color].home,
                          boxShadow: `inset 0 3px 6px rgba(0,0,0,0.25), 0 0 0 3px ${ZONE[color].light}`,
                        }} />
                      );
                    })}
                  </React.Fragment>
                );
              })}

            </div>

            {landed && (
                <div key={landed.key} className="ld-landed" role="status">
                  <span className="ld-landed-name">{landed.name}</span>
                  <span className="ld-landed-num">{landed.value}</span>
                </div>
              )}

            {/* ── Figurat: shtresë mbi tabelë (jashtë overflow), që të kërcejnë nga fusha në fushë ── */}
            <div style={{ position: 'absolute', inset: 8, pointerEvents: 'none' }}>
              {tokens.map((tk) => {
                const stack = tokens.filter((other) => other.cell === tk.cell);
                const i = stack.indexOf(tk);
                const shared = stack.length > 1;
                const width = tk.pos === -1 ? 1.3 : tk.pos === FINISH ? 0.85 : shared ? 0.95 : 1.3;
                const height = width * PAWN_ASPECT;
                const x = tk.x + (shared ? (i % 2 ? 0.24 : -0.24) : 0);
                const foot = tk.y + (tk.pos === -1 ? 0.3 : 0.2) + (stack.length > 2 ? (i % 4 < 2 ? -0.2 : 0.2) : 0);
                return (
                  <button
                    key={`${tk.pid}-${tk.idx}`}
                    data-token={`${tk.pid}:${tk.idx}`}
                    data-pos={tk.pos}
                    aria-label={`${gameState.players[tk.pid].nickname}, guri ${tk.idx + 1}`}
                    onClick={() => handleMove(tk.pid, tk.idx)}
                    disabled={!tk.ok}
                    className={tk.ok ? 'ludo-can-move' : undefined}
                    style={{
                      position: 'absolute', padding: 0, border: 'none', background: 'none',
                      left: pct(x - width / 2), top: pct(foot - height * PAWN_FOOT),
                      width: pct(width), height: pct(height),
                      transition: `left ${HOP_MS - 40}ms linear, top ${HOP_MS - 40}ms linear`,
                      // ata më poshtë dalin përpara, si në tavolinë të vërtetë
                      zIndex: (tk.ok ? 200 : 20) + Math.round(foot * 4),
                      pointerEvents: tk.ok ? 'auto' : 'none',
                      cursor: tk.ok ? 'pointer' : 'default',
                    }}
                  >
                    {tk.ok && <span className="ludo-ring" />}
                    {/* key={pos} e nis kërcimin nga fillimi në çdo fushë */}
                    <span key={tk.pos} className="ludo-hop">
                      <Pawn color={tk.color} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Lojtarët dhe zari ── */}
      <div className="ld-side w-full max-w-2xl mx-auto px-3 pb-3 shrink-0">
        <div className={`text-center text-xs sm:text-sm font-semibold mb-2 min-h-[20px] ${saveFailed ? 'text-coral' : 'text-mute'}`}>
          {saveFailed ? '⚠️ Lëvizja nuk u ruajt. Kontrollo internetin dhe provo përsëri.' : rolling ? 'Zari po rrotullohet…' : gameState.lastActionText}
        </div>

        <div className="ld-panel gz-panel rounded-[26px] p-2 flex items-center gap-2">
          <div className="ld-grid flex-1 min-w-0 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${gameState.playerOrder.length}, minmax(0, 1fr))` }}>
            {gameState.playerOrder.map((pid) => {
              const p = gameState.players[pid];
              if (!p) return null;
              const active = rolling ? gameState.rolledBy === pid : gameState.currentTurn === pid;
              const isSelf = pid === currentPlayerId;
              const homeCount = p.tokens.filter((x) => x === FINISH).length;
              const isBot = pid.startsWith('BOT');
              const z = ZONE[p.color];
              return (
                <div
                  key={pid}
                  className={`relative rounded-2xl px-1.5 pt-2 pb-1.5 flex flex-col items-center gap-1 transition-all ${active ? '' : 'opacity-55'}`}
                  style={{
                    background: active ? `linear-gradient(180deg, ${z.light}, ${z.dark})` : 'rgba(255,255,255,0.05)',
                    boxShadow: active ? `0 0 0 2px #fff, 0 8px 20px -6px ${z.bg}` : 'none',
                  }}
                >
                  <div className="relative w-9 h-9 rounded-full grid place-items-center font-display font-bold text-white text-sm"
                    style={{ background: active ? 'rgba(255,255,255,0.22)' : z.dark, boxShadow: `0 0 0 2px ${active ? '#fff' : z.light}` }}>
                    <LudoFace id={pid} name={p.nickname} bot={isBot} />
                  </div>
                  <span className="text-white font-bold text-[11px] leading-tight truncate w-full text-center">
                    {isSelf ? 'Ti' : p.nickname}
                  </span>
                  <div className="flex gap-1" aria-label={`${homeCount} nga 4 në shtëpi`}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full"
                        style={{ background: i < homeCount ? '#fff' : 'rgba(255,255,255,0.25)' }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-1 px-1 shrink-0">
            <Dice
              value={gameState.diceValue}
              rolling={rolling}
              canRoll={isMyTurn && !gameState.hasRolled && !busy}
              onClick={handleRoll}
            />
            <span className="font-display text-[11px] font-semibold text-gold h-3.5 leading-none">
              {rolling ? 'Po rrotullohet…' : isMyTurn && !gameState.hasRolled && !busy ? 'Hidh!' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* animations */}
      <style>{`
        /* telefoni horizontal: tabela majtas sa më e madhe, lojtarët dhe zari djathtas */
        @media (orientation: landscape) and (max-height: 760px) {
          .ld-root { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 34%); grid-template-rows: auto minmax(0, 1fr); }
          .ld-board { grid-column: 1; grid-row: 1 / span 2; padding-top: 4px; padding-bottom: 6px; }
          .ld-turn { grid-column: 2; grid-row: 1; padding-top: 4px; }
          .ld-turn > div { font-size: 13px; }
          .ld-side { grid-column: 2; grid-row: 2; align-self: center; max-width: none; padding-bottom: 6px; }
          .ld-panel { flex-direction: column; gap: 4px; }
          .ld-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; width: 100%; }
        }
        @media (orientation: landscape) and (max-height: 560px) {
          .ld-grid > div { padding: 5px 4px 4px; gap: 2px; }
          .ld-grid > div > div:first-child { width: 30px; height: 30px; font-size: 11px; }
          .ld-dice { --s: 48px; --half: 24px; }
        }
        .ld-dice { --s: 60px; --half: 30px; width: calc(var(--s) + 8px); height: calc(var(--s) + 8px); display: grid; place-items: center;
          background: none; border: none; padding: 0; border-radius: 18px; cursor: default; }
        .ld-dice.ld-can { cursor: pointer; animation: ld-glow 1.3s ease-in-out infinite; }
        @keyframes ld-glow { 50% { filter: drop-shadow(0 0 10px rgba(255,200,61,0.9)); } }
        .ld-scene { width: var(--s); height: var(--s); perspective: 420px; display: block; }
        .ld-cube { position: relative; display: block; width: 100%; height: 100%; transform-style: preserve-3d;
          transition: transform 0.9s cubic-bezier(.2,1.25,.35,1); }
        .ld-face { position: absolute; inset: 0; display: block; border-radius: 13px; padding: 6%;
          background: radial-gradient(circle at 30% 25%, #ffffff, #f2ede0 60%, #ddd3bb);
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08), inset -4px -5px 10px rgba(0,0,0,0.12); backface-visibility: hidden; }
        .ld-rolling { animation: ld-roll 0.75s linear infinite; }
        @keyframes ld-roll {
          0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) translateY(0); }
          25% { transform: rotateX(200deg) rotateY(90deg) rotateZ(40deg) translateY(-8px); }
          50% { transform: rotateX(380deg) rotateY(200deg) rotateZ(80deg) translateY(0); }
          75% { transform: rotateX(560deg) rotateY(290deg) rotateZ(130deg) translateY(-8px); }
          100% { transform: rotateX(720deg) rotateY(360deg) rotateZ(180deg) translateY(0); }
        }
        .ld-landed { position: absolute; left: 50%; top: 50%; z-index: 400; pointer-events: none; transform: translate(-50%, -50%);
          display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 22px 12px; border-radius: 22px;
          background: rgba(13,10,36,0.88); border: 2px solid #ffc83d; box-shadow: 0 16px 40px rgba(0,0,0,0.5);
          animation: ld-pop ${LANDED_MS}ms ease-out forwards; }
        .ld-landed-name { font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.8); }
        .ld-landed-num { font-family: var(--font-display); font-weight: 700; font-size: 54px; line-height: 1; color: #ffc83d; text-shadow: 0 4px 0 rgba(0,0,0,0.35); }
        @keyframes ld-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
          25% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -60%) scale(0.95); } }
        @media (prefers-reduced-motion: reduce) { .ld-rolling { animation-duration: 2s; } .ld-landed { animation: none; } }
        .ludo-hop {
          display: block; width: 100%; height: 100%;
          transform-origin: 50% ${PAWN_FOOT * 100}%;
          animation: ludo-hop ${HOP_MS - 20}ms ease-out;
        }
        @keyframes ludo-hop {
          0%   { transform: translateY(0) scale(1.08, 0.9); }
          45%  { transform: translateY(-42%) scale(1.08); }
          85%  { transform: translateY(0) scale(1.12, 0.86); }
          100% { transform: translateY(0) scale(1); }
        }
        .ludo-can-move .ludo-hop { animation: ludo-bob 0.7s ease-in-out infinite alternate; }
        .ludo-can-move svg { filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px #ffc83d) drop-shadow(0 0 10px #ffc83d); }
        @keyframes ludo-bob {
          from { transform: translateY(0); }
          to   { transform: translateY(-12%); }
        }
        .ludo-ring {
          position: absolute; left: -10%; width: 120%; aspect-ratio: 2.4;
          top: ${PAWN_FOOT * 100}%; translate: 0 -50%;
          border: 3px solid #ffc83d; border-radius: 50%;
          box-shadow: 0 0 10px #ffc83d, inset 0 0 8px #fff;
          animation: ludo-ring 0.9s ease-out infinite;
        }
        @keyframes ludo-ring {
          from { transform: scale(0.7); opacity: 1; }
          to   { transform: scale(1.35); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ludo-can-move .ludo-hop, .ludo-ring { animation: none; }
        }
      `}</style>
    </div>
  );
}

// foto e lojtarit (Facebook/Google) ose inicialet
function LudoFace({ id, name, bot }: { id: string; name: string; bot: boolean }) {
  const photo = useAvatar(id);
  return <UserAvatar src={photo} name={name} bot={bot} className="w-full h-full rounded-full overflow-hidden" />;
}
