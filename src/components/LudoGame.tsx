'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  LudoColor, LudoGameState, SAFE_GLOBAL_CELLS,
  getMovableTokenIndices, moveLudoToken, rollLudoDice, toGlobalPos,
} from '@/lib/ludoLogic';
import { recordWin } from '@/lib/supabase';
import { RotateCcw, Trophy } from 'lucide-react';

interface LudoGameProps {
  gameState: LudoGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (ns: LudoGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
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
const BASE_SLOTS: Record<LudoColor, [number, number][]> = {
  red:    toRC(['2,2','2,3','3,2','3,3']),
  blue:   toRC(['2,11','2,12','3,11','3,12']),
  yellow: toRC(['11,11','11,12','12,11','12,12']),
  green:  toRC(['11,2','11,3','12,2','12,3']),
};

/* ───────────── colour palette (matches the photo) ───────────── */
const ZONE: Record<LudoColor, { bg: string; light: string; dark: string; token: string; home: string }> = {
  red:    { bg: '#e53935', light: '#ef5350', dark: '#b71c1c', token: '#f44336', home: '#ef9a9a' },
  blue:   { bg: '#1e88e5', light: '#42a5f5', dark: '#0d47a1', token: '#2196f3', home: '#90caf9' },
  yellow: { bg: '#fdd835', light: '#ffee58', dark: '#f9a825', token: '#ffeb3b', home: '#fff59d' },
  green:  { bg: '#43a047', light: '#66bb6a', dark: '#1b5e20', token: '#4caf50', home: '#a5d6a7' },
};

/* ───────────── token pin (matches GPS-pin style in photo) ───────────── */
function TokenPin({ color, glow }: { color: LudoColor; glow?: boolean }) {
  const z = ZONE[color];
  return (
    <svg viewBox="0 0 32 42" className="w-full h-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]">
      <defs>
        <radialGradient id={`pin_${color}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="40%" stopColor={z.light} />
          <stop offset="100%" stopColor={z.dark} />
        </radialGradient>
      </defs>
      {glow && <circle cx="16" cy="16" r="17" fill={z.token} opacity="0.3" />}
      {/* pin body */}
      <path d="M16 2 C8 2, 2 8, 2 16 C2 24, 16 40, 16 40 C16 40, 30 24, 30 16 C30 8, 24 2, 16 2 Z"
        fill={`url(#pin_${color})`} stroke="#fff" strokeWidth="1.5" />
      {/* inner white circle */}
      <circle cx="16" cy="16" r="7" fill="white" opacity="0.9" />
      {/* colour dot inside */}
      <circle cx="16" cy="16" r="4.5" fill={z.token} />
    </svg>
  );
}

/* ───────────── dice ───────────── */
function Dice({ value, rolling, canRoll, onClick }: {
  value: number | null; rolling: boolean; canRoll: boolean; onClick: () => void;
}) {
  const DOT_POS: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
  };
  const dots = value ? DOT_POS[value] || [] : [];
  return (
    <button
      onClick={onClick}
      disabled={!canRoll}
      className={`relative w-14 h-14 rounded-2xl transition-all select-none
        ${canRoll
          ? 'cursor-pointer active:scale-95 shadow-[0_6px_0_#1a3a6e,0_10px_20px_rgba(0,0,0,0.5)] bg-white hover:shadow-[0_4px_0_#1a3a6e,0_8px_16px_rgba(0,0,0,0.5)]'
          : 'cursor-default shadow-[0_4px_0_#4b5563] bg-slate-100 opacity-60'}
        ${rolling ? 'animate-spin' : ''}`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full p-1">
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="8"
            fill={value === 1 ? '#e53935' : '#1e1e1e'} />
        ))}
        {!value && !rolling && (
          <text x="50" y="62" textAnchor="middle" fontSize="36" fill="#94a3b8">?</text>
        )}
      </svg>
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

export default function LudoGame({
  gameState, currentPlayerId, isHost, onUpdateState, onRestartGame,
}: LudoGameProps) {
  const winRef = useRef(false);
  const [rolling, setRolling] = useState(false);

  /* bot turn */
  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost || gameState.currentTurn !== 'BOT_LUDO') return;
    const t = setTimeout(async () => {
      if (!gameState.hasRolled) {
        await onUpdateState(rollLudoDice(gameState, 'BOT_LUDO'));
      } else {
        const b = gameState.players['BOT_LUDO'];
        const idx = b && gameState.diceValue !== null
          ? getMovableTokenIndices(b, gameState.diceValue).at(0)
          : undefined;
        if (idx !== undefined) await onUpdateState(moveLudoToken(gameState, 'BOT_LUDO', idx));
      }
    }, 900);
    return () => clearTimeout(t);
  }, [gameState, isHost, onUpdateState]);

  /* win record */
  useEffect(() => {
    if (gameState.status !== 'finished') { winRef.current = false; return; }
    if (winRef.current) return;
    const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    if (w && w.id === currentPlayerId) {
      winRef.current = true;
      recordWin(w.nickname, 100, 'Ludo (Mos u zemëro)');
    }
  }, [gameState.status, gameState.winnerId, gameState.players, currentPlayerId]);

  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';
  const me = gameState.players[currentPlayerId];
  const movable = isMyTurn && gameState.hasRolled && gameState.diceValue !== null && me
    ? getMovableTokenIndices(me, gameState.diceValue) : [];

  /* handle roll */
  const handleRoll = () => {
    if (!isMyTurn || gameState.hasRolled || rolling) return;
    setRolling(true);
    setTimeout(async () => {
      setRolling(false);
      await onUpdateState(rollLudoDice(gameState, currentPlayerId));
    }, 300);
  };

  /* handle move */
  const handleMove = async (pid: string, idx: number) => {
    if (pid !== currentPlayerId || !movable.includes(idx)) return;
    await onUpdateState(moveLudoToken(gameState, currentPlayerId, idx));
  };

  /* build token map */
  const tokensMap: Record<string, { pid: string; color: LudoColor; idx: number; ok: boolean }[]> = {};
  Object.values(gameState.players).forEach((p) =>
    p.tokens.forEach((pos, idx) => {
      let rc: [number, number] | undefined;
      if (pos === -1) rc = BASE_SLOTS[p.color].at(idx);
      else if (pos <= 51) rc = MAIN_PATH.at(toGlobalPos(p.color, pos));
      else rc = HOME_PATH[p.color].at(pos - 52);
      if (rc) {
        const k = `${rc[0]}-${rc[1]}`;
        if (!tokensMap[k]) tokensMap[k] = [];
        tokensMap[k].push({ pid: p.id, color: p.color, idx, ok: p.id === currentPlayerId && movable.includes(idx) });
      }
    })
  );

  /* ── finished screen ── */
  if (gameState.status === 'finished') {
    const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1565c0]">
        <div className="bg-white rounded-3xl p-10 text-center shadow-2xl max-w-sm w-full mx-4">
          <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" />
          <h2 className="text-2xl font-black text-slate-800 mb-1">Loja Përfundoi!</h2>
          <p className="text-amber-600 font-bold text-lg mb-6">👑 {w?.nickname || 'Lojtari'} fitoi!</p>
          {isHost && onRestartGame && (
            <button onClick={onRestartGame}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition cursor-pointer">
              <RotateCcw className="w-5 h-5" /> Luaj Përsëri
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── current player info ── */
  const curPlayer = gameState.players[gameState.currentTurn];
  const curColor = curPlayer?.color ?? 'red';

  /* ── board rendering ── */
  const BOARD_SIZE = 15;

  return (
    <div className="min-h-screen flex flex-col bg-[#1565c0] select-none" style={{ fontFamily: 'sans-serif' }}>

      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-white font-black text-xl tracking-wide drop-shadow">🎲 Ludo</span>
        <div
          className="px-4 py-1.5 rounded-full text-sm font-bold text-white"
          style={{ background: ZONE[curColor].bg }}
        >
          {isMyTurn ? '🎯 Rradha jote!' : `⏳ ${curPlayer?.nickname ?? '...'}`}
        </div>
      </div>

      {/* board */}
      <div className="flex-1 flex items-center justify-center px-2 py-1">
        <div className="w-full max-w-[min(98vw,480px)] aspect-square relative">
          {/* outer border ring */}
          <div className="absolute inset-0 rounded-2xl" style={{ background: '#1a237e', padding: 6 }}>
            <div className="w-full h-full rounded-xl overflow-hidden"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
                border: '2px solid #90a4ae',
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

                  const tokens = tokensMap[`${r}-${c}`] || [];
                  const { bg, arrow, star } = cellBg(r, c);

                  /* cell border */
                  const border = '0.5px solid #b0bec5';

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
                          background: 'conic-gradient(from 45deg, #1e88e5 0deg 90deg, #fdd835 90deg 180deg, #43a047 180deg 270deg, #e53935 270deg 360deg)',
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
                      {star && tokens.length === 0 && (
                        <svg viewBox="0 0 24 24" style={{ width: '55%', height: '55%', opacity: 0.35 }}>
                          <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"
                            fill="#78909c" />
                        </svg>
                      )}
                      {/* arrow cells */}
                      {arrow && tokens.length === 0 && (
                        <span style={{ fontSize: '1em', color: '#546e7a', fontWeight: 900, lineHeight: 1 }}>{arrow}</span>
                      )}
                      {/* tokens */}
                      {tokens.length > 0 && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {tokens.map((tk, i) => (
                            <button
                              key={`${tk.pid}-${tk.idx}`}
                              onClick={() => handleMove(tk.pid, tk.idx)}
                              disabled={!tk.ok}
                              style={{
                                width: tokens.length > 1 ? '52%' : '70%',
                                height: tokens.length > 1 ? '52%' : '70%',
                                transform: tokens.length > 1 ? `translate(${(i % 2) * 45 - 22}%, ${Math.floor(i / 2) * 45 - 22}%)` : 'none',
                                position: 'absolute',
                                cursor: tk.ok ? 'pointer' : 'default',
                                background: 'none', border: 'none', padding: 0,
                                animation: tk.ok ? 'ludo-bounce 0.8s infinite alternate' : 'none',
                              }}
                            >
                              <TokenPin color={tk.color} glow={tk.ok} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* ── Base zone 4×4 inner white squares with 4 token slots ── */}
              {(
                [
                  { color: 'red'    as LudoColor, col: 2, row: 2 },
                  { color: 'blue'   as LudoColor, col: 11, row: 2 },
                  { color: 'yellow' as LudoColor, col: 11, row: 11 },
                  { color: 'green'  as LudoColor, col: 2, row: 11 },
                ]
              ).map(({ color, col, row }) => {
                // Render tokens in base
                const baseRcs = BASE_SLOTS[color];
                return (
                  <div
                    key={`base_${color}`}
                    style={{
                      gridColumn: `${col} / ${col + 3}`,
                      gridRow: `${row} / ${row + 3}`,
                      background: 'white',
                      borderRadius: 12,
                      margin: '10%',
                      padding: '8%',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gridTemplateRows: '1fr 1fr',
                      gap: '10%',
                      zIndex: 5,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                    }}
                  >
                    {[0, 1, 2, 3].map((si) => {
                      const rc = baseRcs[si];
                      const slotTokens = rc ? (tokensMap[`${rc[0]}-${rc[1]}`] || []) : [];
                      const tk = slotTokens[0];
                      return (
                        <div
                          key={si}
                          style={{
                            borderRadius: '50%',
                            background: ZONE[color].light,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
                            padding: '8%',
                          }}
                        >
                          {tk && (
                            <button
                              onClick={() => handleMove(tk.pid, tk.idx)}
                              disabled={!tk.ok}
                              style={{
                                width: '100%', height: '100%',
                                background: 'none', border: 'none', padding: 0,
                                cursor: tk.ok ? 'pointer' : 'default',
                                animation: tk.ok ? 'ludo-bounce 0.8s infinite alternate' : 'none',
                              }}
                            >
                              <TokenPin color={tk.color} glow={tk.ok} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom player bar (like in the photo) ── */}
      <div className="px-3 pb-3 pt-1">
        {/* last action */}
        <div className="text-center text-white/80 text-xs mb-2 min-h-[18px] drop-shadow">
          {gameState.lastActionText}
        </div>

        {/* player cards + dice */}
        <div className="bg-[#0d2b6b] rounded-2xl px-3 py-2.5 flex items-center gap-2 shadow-xl border border-white/10">
          {gameState.playerOrder.map((pid, pi) => {
            const p = gameState.players[pid];
            if (!p) return null;
            const active = gameState.currentTurn === pid;
            const isSelf = pid === currentPlayerId;
            const homeCount = p.tokens.filter((x) => x === 57).length;
            const isBot = pid.startsWith('BOT');
            return (
              <div
                key={pid}
                className="flex-1 min-w-0 flex flex-col items-center gap-1"
              >
                <div
                  className={`w-full rounded-xl px-2 py-1.5 flex flex-col items-center gap-0.5 transition-all
                    ${active ? 'ring-2 ring-white scale-105' : 'opacity-70'}`}
                  style={{ background: ZONE[p.color].bg }}
                >
                  {/* avatar circle */}
                  <div className="w-9 h-9 rounded-full bg-white/20 border-2 border-white flex items-center justify-center overflow-hidden text-lg font-black text-white">
                    {isBot ? '🤖' : p.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-white font-bold text-[10px] leading-tight truncate w-full text-center">
                    {isSelf ? '(Ti) ' : ''}{p.nickname}
                  </span>
                  {/* progress dots */}
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full border border-white/60"
                        style={{ background: i < homeCount ? '#fff' : 'rgba(255,255,255,0.2)' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* dice in center */}
          <div className="flex flex-col items-center gap-1 px-1 shrink-0">
            <Dice
              value={gameState.diceValue}
              rolling={rolling}
              canRoll={isMyTurn && !gameState.hasRolled && !rolling}
              onClick={handleRoll}
            />
            <span className="text-white/60 text-[9px]">
              {isMyTurn && !gameState.hasRolled ? 'Hidh' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* bounce animation */}
      <style>{`
        @keyframes ludo-bounce {
          from { transform: translateY(0); }
          to   { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
