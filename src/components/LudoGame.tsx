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
const THEME: Record<LudoColor, { gradient: string; ring: string; text: string; baseRing: string }> = {
  red: { gradient: 'from-rose-400 via-rose-600 to-rose-800', ring: 'ring-rose-400', text: 'text-rose-400', baseRing: 'border-rose-500 bg-rose-50' },
  blue: { gradient: 'from-sky-400 via-sky-600 to-sky-800', ring: 'ring-sky-400', text: 'text-sky-400', baseRing: 'border-sky-500 bg-sky-50' },
  yellow: { gradient: 'from-yellow-300 via-amber-400 to-amber-600', ring: 'ring-amber-300', text: 'text-amber-300', baseRing: 'border-amber-500 bg-amber-50' },
  green: { gradient: 'from-emerald-400 via-emerald-600 to-emerald-800', ring: 'ring-emerald-400', text: 'text-emerald-400', baseRing: 'border-emerald-500 bg-emerald-50' },
};
function DiceFace({ value, rolling }: { value: number | null; rolling: boolean }) {
  const m: Record<number, number[]> = { 1: Array.of(4), 2: Array.of(2,6), 3: Array.of(2,4,6), 4: Array.of(0,2,6,8), 5: Array.of(0,2,4,6,8), 6: Array.of(0,2,3,5,6,8) };
  const dots = value ? m[value] || [] : Array.of(4);
  return (<div className={`w-10 h-10 bg-gradient-to-br from-white to-slate-200 rounded-xl shadow-inner border-2 border-slate-300 p-1.5 grid grid-cols-3 grid-rows-3 gap-0.5 ${rolling ? 'animate-spin' : ''}`}>{Array.from({ length: 9 }).map((_, i) => (<div key={i} className="flex items-center justify-center">{dots.includes(i) && <span className={`w-2 h-2 rounded-full ${value === 1 || value === 6 ? 'bg-rose-600' : 'bg-slate-900'}`} />}</div>))}</div>);
}
export default function LudoGame({ gameState, currentPlayerId, isHost, onUpdateState, onRestartGame }: LudoGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const winRecordedRef = useRef(false);
  const [isRolling, setIsRolling] = useState(false);
  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';
  const currentPlayer = gameState.players[gameState.currentTurn];
  const me = gameState.players[currentPlayerId];
  const movable = isMyTurn && gameState.hasRolled && gameState.diceValue !== null && me ? getMovableTokenIndices(me, gameState.diceValue) : [];

  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    if (w && w.id === currentPlayerId) { winRecordedRef.current = true; recordWin(w.nickname, 100, 'Ludo (Mos u zemëro)'); }
  }, [gameState.status, gameState.winnerId, gameState.players, currentPlayerId]);

  const handleRoll = () => { if (!isMyTurn || gameState.hasRolled || isRolling) return; setIsRolling(true); setTimeout(async () => { const u = rollLudoDice(gameState, currentPlayerId); setIsRolling(false); await onUpdateState(u); }, 250); };
  const handleMove = async (pid: string, idx: number) => { if (pid !== currentPlayerId || !movable.includes(idx)) return; await onUpdateState(moveLudoToken(gameState, currentPlayerId, idx)); };
  const handleFs = async () => { const el = containerRef.current; if (!el) return; try { if (!document.fullscreenElement) { await el.requestFullscreen(); if (screen.orientation && 'lock' in screen.orientation) await (screen.orientation as unknown as { lock: (m: string) => Promise<void> }).lock('landscape'); } else await document.exitFullscreen(); } catch {} };

  if (gameState.status === 'finished') {
    const w = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    return (<div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-8 text-center max-w-md mx-auto shadow-2xl"><Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" /><h2 className="text-2xl font-black text-white mb-1">Loja Përfundoi!</h2><p className="text-amber-300 font-bold text-lg mb-6">👑 Fituesi: {w?.nickname || 'Lojtari'} (+100 pikë)</p>{isHost && onRestartGame && <button onClick={onRestartGame} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition cursor-pointer"><RotateCcw className="w-5 h-5" /> Luaj Përsëri</button>}</div>);
  }

  const tokensMap: Record<string, { pid: string; color: LudoColor; idx: number; ok: boolean }[]> = {};
  Object.values(gameState.players).forEach((p) => p.tokens.forEach((pos, idx) => {
    const rc = pos === -1 ? BASE_SLOTS[p.color].at(idx) : pos <= 51 ? MAIN_PATH.at(toGlobalPos(p.color, pos)) : HOME_PATH[p.color].at(pos - 52);
    if (rc) { const k = `${rc.at(0)}-${rc.at(1)}`; if (!tokensMap[k]) tokensMap[k] = []; tokensMap[k].push({ pid: p.id, color: p.color, idx, ok: p.id === currentPlayerId && movable.includes(idx) }); }
  }));

  const cellStyle = (r: number, c: number) => {
    if (r < 6 && c < 6) { const i = r >= 1 && r <= 4 && c >= 1 && c <= 4; return { bg: i ? 'bg-white border-transparent' : 'bg-rose-600 border-rose-700', star: false, bc: i ? 'red' as LudoColor : null }; }
    if (r < 6 && c > 8) { const i = r >= 1 && r <= 4 && c >= 10 && c <= 13; return { bg: i ? 'bg-white border-transparent' : 'bg-sky-600 border-sky-700', star: false, bc: i ? 'blue' as LudoColor : null }; }
    if (r > 8 && c > 8) { const i = r >= 10 && r <= 13 && c >= 10 && c <= 13; return { bg: i ? 'bg-white border-transparent' : 'bg-amber-400 border-amber-500', star: false, bc: i ? 'yellow' as LudoColor : null }; }
    if (r > 8 && c < 6) { const i = r >= 10 && r <= 13 && c >= 1 && c <= 4; return { bg: i ? 'bg-white border-transparent' : 'bg-emerald-600 border-emerald-700', star: false, bc: i ? 'green' as LudoColor : null }; }
    if ((r === 7 && c >= 1 && c <= 5) || (r === 6 && c === 1)) return { bg: 'bg-rose-500 border-rose-600', star: r === 6 && c === 1, bc: null };
    if ((c === 7 && r >= 1 && r <= 5) || (r === 1 && c === 8)) return { bg: 'bg-sky-500 border-sky-600', star: r === 1 && c === 8, bc: null };
    if ((r === 7 && c >= 9 && c <= 13) || (r === 8 && c === 13)) return { bg: 'bg-amber-400 border-amber-500', star: r === 8 && c === 13, bc: null };
    if ((c === 7 && r >= 9 && r <= 13) || (r === 13 && c === 6)) return { bg: 'bg-emerald-500 border-emerald-600', star: r === 13 && c === 6, bc: null };
    const idx = MAIN_PATH.findIndex(([mr, mc]) => mr === r && mc === c);
    return { bg: 'bg-slate-50 border-slate-300/80', star: SAFE_GLOBAL_CELLS.includes(idx), bc: null };
  };

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto flex flex-col gap-3 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-3 sm:p-5 rounded-3xl border border-slate-800 shadow-2xl">
      <div className="flex items-center justify-between gap-3 bg-slate-900/90 border border-slate-700/80 px-3.5 py-2.5 rounded-2xl shadow-lg">
        <div className="text-xs sm:text-sm font-semibold text-slate-200 flex-1 leading-snug">{gameState.lastActionText}</div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleRoll} disabled={!isMyTurn || gameState.hasRolled || isRolling} className={`flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-2xl font-extrabold text-xs sm:text-sm shadow-xl transition cursor-pointer ${isMyTurn && !gameState.hasRolled ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 ring-2 ring-amber-300/60' : 'bg-slate-800 text-slate-400 cursor-not-allowed'}`}><span>{isMyTurn && !gameState.hasRolled ? 'Hidh' : currentPlayer?.nickname || 'Prit'}</span><DiceFace value={gameState.diceValue} rolling={isRolling} /></button>
          <button onClick={handleFs} title="Ekran i plotë" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 cursor-pointer"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => { const p = gameState.players[id]; const t = THEME[p.color]; const active = gameState.currentTurn === id; const home = p.tokens.filter((x) => x === 57).length; return (<div key={id} className={`px-3 py-2 rounded-2xl border flex items-center justify-between transition ${active ? `bg-slate-800/90 border-white/60 shadow-lg ring-2 ${t.ring}` : 'bg-slate-900/60 border-slate-800 opacity-75'}`}><div className="flex items-center gap-2 truncate"><span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${t.gradient} border border-white/60 shrink-0`} /><span className="text-xs sm:text-sm font-bold text-white truncate">{p.nickname}</span></div><span className={`text-xs font-black ${t.text}`}>{home}/4</span></div>); })}
      </div>
      <div className="w-full max-w-[500px] aspect-square mx-auto bg-gradient-to-br from-amber-600 via-amber-500 to-amber-700 p-2 sm:p-2.5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] border-2 border-amber-300/50">
        <div className="relative w-full h-full rounded-2xl overflow-hidden bg-white shadow-inner grid" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}>
          <div className="pointer-events-none z-10 flex items-center justify-center" style={{ gridColumn: '7 / 10', gridRow: '7 / 10', background: 'conic-gradient(from 45deg, #0ea5e9 0deg 90deg, #fbbf24 90deg 180deg, #10b981 180deg 270deg, #f43f5e 270deg 360deg)' }}><div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/95 shadow-md flex items-center justify-center border border-amber-400"><Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-400" /></div></div>
          {Array.from({ length: 15 }).map((_, r) => Array.from({ length: 15 }).map((__, c) => {
            if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return null;
            const { bg, star, bc } = cellStyle(r, c);
            const tks = tokensMap[`${r}-${c}`] || [];
            const isSlot = Object.values(BASE_SLOTS).some((a) => a.some(([br, bcol]) => br === r && bcol === c));
            return (<div key={`${r}-${c}`} style={{ gridColumn: c + 1, gridRow: r + 1 }} className={`relative border-[0.5px] flex items-center justify-center ${bg}`}>{isSlot && bc && <div className={`w-4/5 h-4/5 rounded-full border-2 shadow-inner ${THEME[bc].baseRing}`} />}{star && tks.length === 0 && <Star className="w-3.5 h-3.5 text-slate-700/60 fill-white/80" />}{tks.length > 0 && <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-0.5 p-0.5">{tks.map((tk) => (<button key={`${tk.pid}-${tk.idx}`} onClick={() => handleMove(tk.pid, tk.idx)} disabled={!tk.ok} className={`rounded-full bg-gradient-to-br ${THEME[tk.color].gradient} border-2 border-white shadow-[0_3px_6px_rgba(0,0,0,0.5)] flex items-center justify-center transition-transform ${tks.length > 1 ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-4/5 h-4/5 max-w-[24px] max-h-[24px]'} ${tk.ok ? 'animate-bounce ring-2 ring-amber-300 scale-110 cursor-pointer z-30' : 'cursor-default z-20'}`}><span className="w-1/2 h-1/2 rounded-full bg-white/40" /></button>))}</div>}</div>);
          }))}
        </div>
      </div>
    </div>
  );
}
