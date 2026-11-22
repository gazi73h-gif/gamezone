'use client';
import React, { useEffect, useRef, useState } from 'react';
import { LudoColor, LudoGameState, SAFE_GLOBAL_CELLS, getMovableTokenIndices, moveLudoToken, rollLudoDice, toGlobalPos } from '@/lib/ludoLogic';
import { recordWin } from '@/lib/supabase';
import { Trophy, RotateCcw, Maximize2, Star, Crown } from 'lucide-react';
interface LudoGameProps { gameState: LudoGameState; currentPlayerId: string; isHost: boolean; onUpdateState: (newState: LudoGameState) => Promise<void>; onRestartGame?: () => Promise<void>; }
const toRC = (arr: string[]) => arr.map((s) => s.split(',').map(Number) as [number, number]);
const MAIN_PATH = toRC(['6,1','6,2','6,3','6,4','6,5','5,6','4,6','3,6','2,6','1,6','0,6','0,7','0,8','1,8','2,8','3,8','4,8','5,8','6,9','6,10','6,11','6,12','6,13','6,14','7,14','8,14','8,13','8,12','8,11','8,10','8,9','9,8','10,8','11,8','12,8','13,8','14,8','14,7','14,6','13,6','12,6','11,6','10,6','9,6','8,5','8,4','8,3','8,2','8,1','8,0','7,0','6,0']);
const HOME_PATH: Record<LudoColor, [number, number][]> = { red: toRC(['7,1','7,2','7,3','7,4','7,5','7,6']), blue: toRC(['1,7','2,7','3,7','4,7','5,7','6,7']), yellow: toRC(['7,13','7,12','7,11','7,10','7,9','7,8']), green: toRC(['13,7','12,7','11,7','10,7','9,7','8,7']) };
const BASE_SLOTS: Record<LudoColor, [number, number][]> = { red: toRC(['2,2','2,3','3,2','3,3']), blue: toRC(['2,11','2,12','3,11','3,12']), yellow: toRC(['11,11','11,12','12,11','12,12']), green: toRC(['11,2','11,3','12,2','12,3']) };
const PAWN_COLORS: Record<LudoColor, { top: string; mid: string; dark: string; ring: string; text: string; slot: string }> = {
  red: { top: '#ff5252', mid: '#dc2626', dark: '#7f1d1d', ring: 'ring-red-500', text: 'text-red-400', slot: 'bg-red-600' },
  blue: { top: '#38bdf8', mid: '#0284c7', dark: '#0c4a6e', ring: 'ring-sky-500', text: 'text-sky-400', slot: 'bg-blue-600' },
  yellow: { top: '#fde047', mid: '#eab308', dark: '#854d0e', ring: 'ring-yellow-400', text: 'text-yellow-400', slot: 'bg-yellow-400' },
  green: { top: '#4ade80', mid: '#16a34a', dark: '#14532d', ring: 'ring-green-500', text: 'text-green-400', slot: 'bg-green-600' },
};
function Pawn3D({ color }: { color: LudoColor }) {
  const c = PAWN_COLORS[color];
  const id = `g_${color}`;
  return (
    <svg viewBox="0 0 44 56" className="w-full h-full overflow-visible drop-shadow-[0_6px_5px_rgba(0,0,0,0.75)]">
      <defs>
        <radialGradient id={id} cx="32%" cy="25%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="28%" stopColor={c.top} />
          <stop offset="72%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
      </defs>
      <ellipse cx="22" cy="50" rx="17" ry="5" fill="rgba(0,0,0,0.55)" />
      <ellipse cx="22" cy="46" rx="16" ry="5.5" fill={c.dark} stroke="#ffffff" strokeWidth="1.5" />
      <path d="M7 45 C8 34, 15 26, 17 21 L27 21 C29 26, 36 34, 37 45 Z" fill={`url(#${id})`} stroke="#ffffff" strokeWidth="1.5" />
      <ellipse cx="22" cy="21" rx="7" ry="2.5" fill={c.top} stroke="#ffffff" strokeWidth="1" />
      <circle cx="22" cy="12" r="10.5" fill={`url(#${id})`} stroke="#ffffff" strokeWidth="1.6" />
      <ellipse cx="18" cy="8" rx="3.5" ry="2" transform="rotate(-25 18 8)" fill="#ffffff" fillOpacity="0.65" />
    </svg>
  );
}
function DiceFace({ value, rolling }: { value: number | null; rolling: boolean }) {
  const m: Record<number, number[]> = { 1: Array.of(4), 2: Array.of(2,6), 3: Array.of(2,4,6), 4: Array.of(0,2,6,8), 5: Array.of(0,2,4,6,8), 6: Array.of(0,2,3,5,6,8) };
  const dots = value ? m[value] || [] : Array.of(5);
  return (
    <div className={`relative w-11 h-11 rounded-2xl bg-gradient-to-br from-white via-slate-100 to-slate-300 shadow-[0_6px_0_#94a3b8,0_10px_18px_rgba(0,0,0,0.6)] border-2 border-white p-1.5 grid grid-cols-3 grid-rows-3 gap-0.5 transition-transform active:translate-y-1 ${rolling ? 'animate-spin' : ''}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center justify-center">
          {dots.includes(i) && <span className={`w-2.5 h-2.5 rounded-full shadow-inner ${value === 1 || value === 6 ? 'bg-red-600' : 'bg-slate-900'}`} />}
        </div>
      ))}
    </div>
  );
}
export default function LudoGame({ gameState, currentPlayerId, isHost, onUpdateState, onRestartGame }: LudoGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const winRecordedRef = useRef(false);
  const [isRolling, setIsRolling] = useState(false);
  useEffect(() => { if (gameState.status !== 'playing' || !isHost || gameState.currentTurn !== 'BOT_LUDO') return; const t = setTimeout(async () => { if (!gameState.hasRolled) { await onUpdateState(rollLudoDice(gameState, 'BOT_LUDO')); } else { const idx = gameState.validPieceIndices?.at(0); if (idx !== undefined) await onUpdateState(moveLudoPiece(gameState, 'BOT_LUDO', idx)); } }, 850); return () => clearTimeout(t); }, [gameState, isHost, onUpdateState]);
  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';
  const currentPlayer = gameState.players[gameState.currentTurn];
  const me = gameState.players[currentPlayerId];
  const movable = isMyTurn && gameState.hasRolled && gameState.diceValue !== null && me ? getMovableTokenIndices(me, gameState.diceValue) : [];
  useEffect(() => { if (gameState.status !== 'finished') { winRecordedRef.current = false; return; } if (winRecordedRef.current) return; const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null; if (w && w.id === currentPlayerId) { winRecordedRef.current = true; recordWin(w.nickname, 100, 'Ludo (Mos u zemëro)'); } }, [gameState.status, gameState.winnerId, gameState.players, currentPlayerId]);
  const handleRoll = () => { if (!isMyTurn || gameState.hasRolled || isRolling) return; setIsRolling(true); setTimeout(async () => { const u = rollLudoDice(gameState, currentPlayerId); setIsRolling(false); await onUpdateState(u); }, 250); };
  const handleMove = async (pid: string, idx: number) => { if (pid !== currentPlayerId || !movable.includes(idx)) return; await onUpdateState(moveLudoToken(gameState, currentPlayerId, idx)); };
  const handleFs = async () => { const el = containerRef.current; if (!el) return; try { if (!document.fullscreenElement) { await el.requestFullscreen(); if (screen.orientation && 'lock' in screen.orientation) await (screen.orientation as unknown as { lock: (m: string) => Promise<void> }).lock('landscape'); } else await document.exitFullscreen(); } catch {} };
  if (gameState.status === 'finished') { const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null; return (<div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-8 text-center max-w-md mx-auto shadow-2xl"><Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" /><h2 className="text-2xl font-black text-white mb-1">Loja Përfundoi!</h2><p className="text-amber-300 font-bold text-lg mb-6">👑 Fituesi: {w?.nickname || 'Lojtari'} (+100 pikë)</p>{isHost && onRestartGame && <button onClick={onRestartGame} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition cursor-pointer"><RotateCcw className="w-5 h-5" /> Luaj Përsëri</button>}</div>); }
  const tokensMap: Record<string, { pid: string; color: LudoColor; idx: number; ok: boolean }[]> = {};
  Object.values(gameState.players).forEach((p) => p.tokens.forEach((pos, idx) => { const rc = pos === -1 ? BASE_SLOTS[p.color].at(idx) : pos <= 51 ? MAIN_PATH.at(toGlobalPos(p.color, pos)) : HOME_PATH[p.color].at(pos - 52); if (rc) { const k = `${rc.at(0)}-${rc.at(1)}`; if (!tokensMap[k]) tokensMap[k] = []; tokensMap[k].push({ pid: p.id, color: p.color, idx, ok: p.id === currentPlayerId && movable.includes(idx) }); } }));
  const cellStyle = (r: number, c: number) => {
    if (r < 6 && c < 6) return { bg: 'bg-gradient-to-br from-red-500 to-red-700 border-red-600/30', star: false, bc: null, hide: r >= 1 && r <= 4 && c >= 1 && c <= 4 };
    if (r < 6 && c > 8) return { bg: 'bg-gradient-to-br from-sky-500 to-blue-700 border-blue-600/30', star: false, bc: null, hide: r >= 1 && r <= 4 && c >= 10 && c <= 13 };
    if (r > 8 && c > 8) return { bg: 'bg-gradient-to-br from-yellow-300 to-amber-500 border-amber-500/30', star: false, bc: null, hide: r >= 10 && r <= 13 && c >= 10 && c <= 13 };
    if (r > 8 && c < 6) return { bg: 'bg-gradient-to-br from-emerald-500 to-green-700 border-green-600/30', star: false, bc: null, hide: r >= 10 && r <= 13 && c >= 1 && c <= 4 };
    if ((r === 7 && c >= 1 && c <= 5) || (r === 6 && c === 1)) return { bg: 'bg-gradient-to-b from-red-500 to-red-600 border-red-700', star: r === 6 && c === 1, bc: null, hide: false };
    if ((c === 7 && r >= 1 && r <= 5) || (r === 1 && c === 8)) return { bg: 'bg-gradient-to-b from-sky-500 to-blue-600 border-blue-700', star: r === 1 && c === 8, bc: null, hide: false };
    if ((r === 7 && c >= 9 && c <= 13) || (r === 8 && c === 13)) return { bg: 'bg-gradient-to-b from-yellow-300 to-amber-400 border-amber-500', star: r === 8 && c === 13, bc: null, hide: false };
    if ((c === 7 && r >= 9 && r <= 13) || (r === 13 && c === 6)) return { bg: 'bg-gradient-to-b from-emerald-500 to-green-600 border-green-700', star: r === 13 && c === 6, bc: null, hide: false };
    const idx = MAIN_PATH.findIndex(([mr, mc]) => mr === r && mc === c);
    return { bg: 'bg-gradient-to-b from-white to-slate-100 border-slate-300', star: SAFE_GLOBAL_CELLS.includes(idx), bc: null, hide: false };
  };
  return (
    <div ref={containerRef} className="max-w-3xl mx-auto flex flex-col gap-3 bg-slate-950 p-3 sm:p-5 rounded-3xl border border-slate-800 shadow-2xl">
      <div className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-700 px-3.5 py-2.5 rounded-2xl shadow-lg"><div className="text-xs sm:text-sm font-semibold text-slate-200 flex-1">{gameState.lastActionText}</div><div className="flex items-center gap-2 shrink-0"><button onClick={handleRoll} disabled={!isMyTurn || gameState.hasRolled || isRolling} className={`flex items-center gap-2.5 pl-3.5 pr-1.5 py-1.5 rounded-2xl font-extrabold text-xs sm:text-sm shadow-xl transition cursor-pointer ${isMyTurn && !gameState.hasRolled ? 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 ring-2 ring-amber-300' : 'bg-slate-800 text-slate-400 cursor-not-allowed'}`}><span>{isMyTurn && !gameState.hasRolled ? 'Hidh Zarin' : currentPlayer?.nickname || 'Prit'}</span><DiceFace value={gameState.diceValue} rolling={isRolling} /></button><button onClick={handleFs} title="Ekran i plotë" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 cursor-pointer"><Maximize2 className="w-4 h-4" /></button></div></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{gameState.playerOrder.map((id) => { const p = gameState.players[id]; const t = PAWN_COLORS[p.color]; const active = gameState.currentTurn === id; const home = p.tokens.filter((x) => x === 57).length; return (<div key={id} className={`px-3 py-2 rounded-2xl border flex items-center justify-between transition ${active ? `bg-slate-900 border-white shadow-lg ring-2 ${t.ring}` : 'bg-slate-900/60 border-slate-800 opacity-75'}`}><div className="flex items-center gap-2 truncate"><span className={`w-3.5 h-3.5 rounded-full ${t.slot} border border-white shrink-0`} /><span className="text-xs sm:text-sm font-bold text-white truncate">{p.nickname}</span></div><span className={`text-xs font-black ${t.text}`}>{home}/4</span></div>); })}</div>
      <div className="w-full max-w-[510px] aspect-square mx-auto bg-gradient-to-b from-white via-slate-100 to-slate-300 p-3 sm:p-3.5 rounded-[34px] shadow-[0_12px_0_#94a3b8,0_25px_50px_rgba(0,0,0,0.85)] border-2 border-white">
        <div className="relative w-full h-full rounded-2xl overflow-visible bg-white border-2 border-slate-800 grid" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}>
          <div className="pointer-events-none z-10 flex items-center justify-center border-2 border-slate-800 shadow-inner" style={{ gridColumn: '7 / 10', gridRow: '7 / 10', background: 'conic-gradient(from 45deg, #0284c7 0deg 90deg, #eab308 90deg 180deg, #16a34a 180deg 270deg, #dc2626 270deg 360deg)' }}><div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 shadow-lg flex items-center justify-center border-2 border-white"><Crown className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white drop-shadow" /></div></div>
          {[{ col: '2 / 6', row: '2 / 6', c: 'red' as LudoColor }, { col: '11 / 15', row: '2 / 6', c: 'blue' as LudoColor }, { col: '11 / 15', row: '11 / 15', c: 'yellow' as LudoColor }, { col: '2 / 6', row: '11 / 15', c: 'green' as LudoColor }].map((b) => (<div key={b.c} style={{ gridColumn: b.col, gridRow: b.row }} className="bg-white rounded-2xl shadow-[0_4px_10px_rgba(0,0,0,0.35),inset_0_2px_4px_rgba(255,255,255,0.9)] border-2 border-slate-200 p-2.5 sm:p-3 grid grid-cols-2 grid-rows-2 gap-2.5 sm:gap-3 z-0">{[0,1,2,3].map((i) => (<div key={i} className={`rounded-full ${PAWN_COLORS[b.c].slot} shadow-[inset_0_3px_6px_rgba(0,0,0,0.5)] border-2 border-slate-200`} />))}</div>))}
          {Array.from({ length: 15 }).map((_, r) => Array.from({ length: 15 }).map((__, c) => {
            if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return null;
            const { bg, star, hide } = cellStyle(r, c);
            const tks = tokensMap[`${r}-${c}`] || [];
            return (<div key={`${r}-${c}`} style={{ gridColumn: c + 1, gridRow: r + 1 }} className={`relative flex items-center justify-center ${hide ? 'bg-transparent border-transparent' : `border-[0.5px] ${bg}`}`}>{star && tks.length === 0 && <Star className="w-3.5 h-3.5 text-amber-500 fill-white drop-shadow-sm" />}{tks.length > 0 && <div className="absolute inset-0 flex items-center justify-center overflow-visible">{tks.map((tk, i) => (<button key={`${tk.pid}-${tk.idx}`} onClick={() => handleMove(tk.pid, tk.idx)} disabled={!tk.ok} style={{ transform: tks.length > 1 ? `translate(${(i - 0.5) * 6}px, -4px) scale(0.8)` : 'translateY(-5px)' }} className={`transition-transform w-6 h-8 sm:w-7 sm:h-9 ${tk.ok ? 'animate-bounce cursor-pointer z-30' : 'cursor-default z-20'}`}><Pawn3D color={tk.color} /></button>))}</div>}</div>);
          }))}
        </div>
      </div>
    </div>
  );
}