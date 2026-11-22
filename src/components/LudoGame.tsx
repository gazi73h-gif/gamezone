'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  LudoColor, LudoGameState, SAFE_GLOBAL_CELLS,
  getMovableTokenIndices, moveLudoToken, rollLudoDice, toGlobalPos,
} from '@/lib/ludoLogic';
import { recordWin } from '@/lib/supabase';
import { Trophy, RotateCcw, Maximize2, Star } from 'lucide-react';

interface LudoGameProps {
  gameState: LudoGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (newState: LudoGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
}

const toRC = (arr: string[]) => arr.map((s) => s.split(',').map(Number) as [number, number]);
const MAIN_PATH_COORDS = toRC(['6,1','6,2','6,3','6,4','6,5','5,6','4,6','3,6','2,6','1,6','0,6','0,7','0,8','1,8','2,8','3,8','4,8','5,8','6,9','6,10','6,11','6,12','6,13','6,14','7,14','8,14','8,13','8,12','8,11','8,10','8,9','9,8','10,8','11,8','12,8','13,8','14,8','14,7','14,6','13,6','12,6','11,6','10,6','9,6','8,5','8,4','8,3','8,2','8,1','8,0','7,0','6,0']);
const HOME_STRETCH_COORDS: Record<LudoColor, [number, number][]> = {
  red: toRC(['7,1','7,2','7,3','7,4','7,5','7,6']),
  blue: toRC(['1,7','2,7','3,7','4,7','5,7','6,7']),
  yellow: toRC(['7,13','7,12','7,11','7,10','7,9','7,8']),
  green: toRC(['13,7','12,7','11,7','10,7','9,7','8,7']),
};
const BASE_SLOTS: Record<LudoColor, [number, number][]> = {
  red: toRC(['2,2','2,3','3,2','3,3']),
  blue: toRC(['2,11','2,12','3,11','3,12']),
  yellow: toRC(['11,11','11,12','12,11','12,12']),
  green: toRC(['11,2','11,3','12,2','12,3']),
};
const COLOR_THEME: Record<LudoColor, { bg: string; light: string; border: string; token: string; text: string }> = {
  red: { bg: 'bg-red-600', light: 'bg-red-500/20', border: 'border-red-500', token: 'bg-red-500 border-white', text: 'text-red-400' },
  blue: { bg: 'bg-blue-600', light: 'bg-blue-500/20', border: 'border-blue-500', token: 'bg-blue-500 border-white', text: 'text-blue-400' },
  yellow: { bg: 'bg-amber-400', light: 'bg-amber-400/20', border: 'border-amber-400', token: 'bg-amber-400 border-slate-900', text: 'text-amber-300' },
  green: { bg: 'bg-emerald-600', light: 'bg-emerald-500/20', border: 'border-emerald-500', token: 'bg-emerald-500 border-white', text: 'text-emerald-400' },
};

export default function LudoGame({ gameState, currentPlayerId, isHost, onUpdateState, onRestartGame }: LudoGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const winRecordedRef = useRef(false);
  const [isRolling, setIsRolling] = useState(false);

  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';
  const currentPlayer = gameState.players[gameState.currentTurn];
  const me = gameState.players[currentPlayerId];
  const movableIndices = isMyTurn && gameState.hasRolled && gameState.diceValue !== null && me ? getMovableTokenIndices(me, gameState.diceValue) : [];

  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    if (winner && winner.id === currentPlayerId) { winRecordedRef.current = true; recordWin(winner.nickname, 100, 'Ludo (Mos u zemëro)'); }
  }, [gameState.status, gameState.winnerId, gameState.players, currentPlayerId]);

  const handleRollDice = () => {
    if (!isMyTurn || gameState.hasRolled || isRolling) return;
    setIsRolling(true);
    setTimeout(async () => { const updated = rollLudoDice(gameState, currentPlayerId); setIsRolling(false); await onUpdateState(updated); }, 250);
  };

  const handleTokenClick = async (playerId: string, tokenIdx: number) => {
    if (playerId !== currentPlayerId || !movableIndices.includes(tokenIdx)) return;
    await onUpdateState(moveLudoToken(gameState, currentPlayerId, tokenIdx));
  };

  const handleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        if (screen.orientation && 'lock' in screen.orientation) await (screen.orientation as unknown as { lock: (m: string) => Promise<void> }).lock('landscape');
      } else { await document.exitFullscreen(); }
    } catch {}
  };

  if (gameState.status === 'finished') {
    const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    return (
      <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-6 text-center max-w-xl mx-auto shadow-2xl">
        <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" />
        <h2 className="text-2xl font-extrabold text-white mb-1">Loja Përfundoi!</h2>
        <p className="text-amber-300 font-bold text-lg mb-6">👑 Fituesi: {winner?.nickname || 'Lojtari'} (+100 pikë)</p>
        {isHost && onRestartGame && (
          <button onClick={onRestartGame} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition cursor-pointer">
            <RotateCcw className="w-5 h-5" /> Luaj Përsëri
          </button>
        )}
      </div>
    );
  }

  const cellTokens: Record<string, { playerId: string; color: LudoColor; tokenIdx: number; movable: boolean }[]> = {};
  Object.values(gameState.players).forEach((p) => {
    p.tokens.forEach((pos, idx) => {
      let rc: [number, number] | null = null;
      if (pos === -1) rc = BASE_SLOTS[p.color].at(idx) || null;
      else if (pos >= 0 && pos <= 51) rc = MAIN_PATH_COORDS.at(toGlobalPos(p.color, pos)) || null;
      else if (pos >= 52 && pos <= 57) rc = HOME_STRETCH_COORDS[p.color].at(pos - 52) || null;
      if (rc) {
        const key = `${rc.at(0)}-${rc.at(1)}`;
        if (!cellTokens[key]) cellTokens[key] = [];
        cellTokens[key].push({ playerId: p.id, color: p.color, tokenIdx: idx, movable: p.id === currentPlayerId && movableIndices.includes(idx) });
      }
    });
  });

  const getCellStyle = (r: number, c: number) => {
    if (r < 6 && c < 6) return { bg: 'bg-red-600/90 border-red-800', isStar: false };
    if (r < 6 && c > 8) return { bg: 'bg-blue-600/90 border-blue-800', isStar: false };
    if (r > 8 && c > 8) return { bg: 'bg-amber-400/90 border-amber-600', isStar: false };
    if (r > 8 && c < 6) return { bg: 'bg-emerald-600/90 border-emerald-800', isStar: false };
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { bg: 'bg-slate-900 border-slate-700', isStar: false };
    if (r === 7 && c >= 1 && c <= 5) return { bg: 'bg-red-500 border-red-700', isStar: false };
    if (c === 7 && r >= 1 && r <= 5) return { bg: 'bg-blue-500 border-blue-700', isStar: false };
    if (r === 7 && c >= 9 && c <= 13) return { bg: 'bg-amber-400 border-amber-600', isStar: false };
    if (c === 7 && r >= 9 && r <= 13) return { bg: 'bg-emerald-500 border-emerald-700', isStar: false };
    const idx = MAIN_PATH_COORDS.findIndex(([mr, mc]) => mr === r && mc === c);
    if (idx === 0) return { bg: 'bg-red-500 border-slate-400', isStar: true };
    if (idx === 13) return { bg: 'bg-blue-500 border-slate-400', isStar: true };
    if (idx === 26) return { bg: 'bg-amber-400 border-slate-400', isStar: true };
    if (idx === 39) return { bg: 'bg-emerald-500 border-slate-400', isStar: true };
    return { bg: 'bg-slate-100 border-slate-300', isStar: SAFE_GLOBAL_CELLS.includes(idx) };
  };

  return (
    <div ref={containerRef} className="max-w-4xl mx-auto flex flex-col gap-3 bg-slate-950 p-2 sm:p-4 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 px-3 py-2.5 rounded-xl">
        <div className="text-xs sm:text-sm font-medium text-slate-200 flex-1 min-w-[180px]">{gameState.lastActionText}</div>
        <div className="flex items-center gap-2">
          <button onClick={handleRollDice} disabled={!isMyTurn || gameState.hasRolled || isRolling} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm shadow-lg transition cursor-pointer ${isMyTurn && !gameState.hasRolled ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse' : 'bg-slate-800 text-slate-400 cursor-not-allowed'}`}>
            <span>🎲</span>
            <span>{isRolling ? '...' : gameState.diceValue ? `Zari: ${gameState.diceValue}` : isMyTurn ? 'Hidh Zarin' : currentPlayer?.nickname || 'Prit'}</span>
          </button>
          <button onClick={handleFullscreen} title="Ekran i plotë / Horizontal" className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 cursor-pointer"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id];
          const t = COLOR_THEME[p.color];
          const homeCount = p.tokens.filter((x) => x === 57).length;
          return (
            <div key={id} className={`px-3 py-2 rounded-xl border flex items-center justify-between transition ${gameState.currentTurn === id ? `${t.light} ${t.border} ring-2 ring-white/40` : 'bg-slate-900/70 border-slate-800 opacity-80'}`}>
              <div className="flex items-center gap-2 truncate"><span className={`w-3 h-3 rounded-full shrink-0 ${t.bg}`} /><span className="text-xs sm:text-sm font-bold text-white truncate">{p.nickname}</span></div>
              <span className={`text-xs font-black ${t.text}`}>{homeCount}/4 🏠</span>
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-[520px] aspect-square mx-auto bg-slate-900 p-1.5 rounded-2xl border-4 border-slate-800 shadow-2xl">
        <div className="grid w-full h-full" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}>
          {Array.from({ length: 15 }).map((_, r) => Array.from({ length: 15 }).map((__, c) => {
            const { bg, isStar } = getCellStyle(r, c);
            const tokensHere = cellTokens[`${r}-${c}`] || [];
            const isBase = Object.values(BASE_SLOTS).some((arr) => arr.some(([br, bc]) => br === r && bc === c));
            return (
              <div key={`${r}-${c}`} className={`relative border-[0.5px] flex items-center justify-center ${bg} ${isBase ? 'rounded-full m-0.5 bg-white/95' : ''}`}>
                {isStar && tokensHere.length === 0 && <Star className="w-3 h-3 text-slate-500/70 fill-slate-400/40" />}
                {r === 7 && c === 7 && <Trophy className="w-4 h-4 text-amber-400" />}
                {tokensHere.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-0.5 w-full h-full p-0.5">
                    {tokensHere.map((tk) => (
                      <button key={`${tk.playerId}-${tk.tokenIdx}`} onClick={() => handleTokenClick(tk.playerId, tk.tokenIdx)} disabled={!tk.movable} className={`rounded-full border-2 shadow-md ${COLOR_THEME[tk.color].token} ${tokensHere.length > 1 ? 'w-2.5 h-2.5 sm:w-3.5 sm:h-3.5' : 'w-4 h-4 sm:w-5 sm:h-5'} ${tk.movable ? 'animate-bounce ring-2 ring-white scale-110 cursor-pointer z-20' : 'cursor-default z-10'}`} />
                    ))}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}

export default function LudoGame({ gameState, currentPlayerId, isHost, onUpdateState, onRestartGame }: LudoGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const winRecordedRef = useRef(false);
  const [isRolling, setIsRolling] = useState(false);

  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';
  const currentPlayer = gameState.players[gameState.currentTurn];
  const me = gameState.players[currentPlayerId];
  const movableIndices = isMyTurn && gameState.hasRolled && gameState.diceValue !== null && me ? getMovableTokenIndices(me, gameState.diceValue) : [];

  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    if (winner && winner.id === currentPlayerId) { winRecordedRef.current = true; recordWin(winner.nickname, 100, 'Ludo (Mos u zemëro)'); }
  }, [gameState.status, gameState.winnerId, gameState.players, currentPlayerId]);

  const handleRollDice = () => {
    if (!isMyTurn || gameState.hasRolled || isRolling) return;
    setIsRolling(true);
    setTimeout(async () => { const updated = rollLudoDice(gameState, currentPlayerId); setIsRolling(false); await onUpdateState(updated); }, 300);
  };

  const handleTokenClick = async (playerId: string, tokenIdx: number) => {
    if (playerId !== currentPlayerId || !movableIndices.includes(tokenIdx)) return;
    await onUpdateState(moveLudoToken(gameState, currentPlayerId, tokenIdx));
  };

  const handleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        if (screen.orientation && 'lock' in screen.orientation) await (screen.orientation as unknown as { lock: (m: string) => Promise<void> }).lock('landscape');
      } else { await document.exitFullscreen(); }
    } catch {}
  };

  if (gameState.status === 'finished') {
    const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    return (
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-8 text-center max-w-md mx-auto shadow-2xl">
        <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" />
        <h2 className="text-2xl font-black text-white mb-1">Loja Përfundoi!</h2>
        <p className="text-amber-300 font-bold text-lg mb-6">👑 Fituesi: {winner?.nickname || 'Lojtari'} (+100 pikë)</p>
        {isHost && onRestartGame && (
          <button onClick={onRestartGame} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition cursor-pointer">
            <RotateCcw className="w-5 h-5" /> Luaj Përsëri
          </button>
        )}
      </div>
    );
  }

  const cellTokens: Record<string, { playerId: string; color: LudoColor; tokenIdx: number; movable: boolean }[]> = {};
  Object.values(gameState.players).forEach((p) => {
    p.tokens.forEach((pos, idx) => {
      let rc: [number, number] | null = null;
      if (pos === -1) rc = BASE_SLOTS[p.color].at(idx) || null;
      else if (pos >= 0 && pos <= 51) rc = MAIN_PATH_COORDS.at(toGlobalPos(p.color, pos)) || null;
      else if (pos >= 52 && pos <= 57) rc = HOME_STRETCH_COORDS[p.color].at(pos - 52) || null;
      if (rc) {
        const key = `${rc.at(0)}-${rc.at(1)}`;
        if (!cellTokens[key]) cellTokens[key] = [];
        cellTokens[key].push({ playerId: p.id, color: p.color, tokenIdx: idx, movable: p.id === currentPlayerId && movableIndices.includes(idx) });
      }
    });
  });

  const getCellVisual = (r: number, c: number) => {
    if (r < 6 && c < 6) { const i = r >= 1 && r <= 4 && c >= 1 && c <= 4; return { bg: i ? 'bg-white border-transparent' : 'bg-rose-600 border-rose-700', star: false, baseColor: i ? 'red' as LudoColor : null }; }
    if (r < 6 && c > 8) { const i = r >= 1 && r <= 4 && c >= 10 && c <= 13; return { bg: i ? 'bg-white border-transparent' : 'bg-sky-600 border-sky-700', star: false, baseColor: i ? 'blue' as LudoColor : null }; }
    if (r > 8 && c > 8) { const i = r >= 10 && r <= 13 && c >= 10 && c <= 13; return { bg: i ? 'bg-white border-transparent' : 'bg-amber-400 border-amber-500', star: false, baseColor: i ? 'yellow' as LudoColor : null }; }
    if (r > 8 && c < 6) { const i = r >= 10 && r <= 13 && c >= 1 && c <= 4; return { bg: i ? 'bg-white border-transparent' : 'bg-emerald-600 border-emerald-700', star: false, baseColor: i ? 'green' as LudoColor : null }; }
    if (r === 7 && c >= 1 && c <= 5) return { bg: 'bg-rose-500 border-rose-600', star: false, baseColor: null };
    if (c === 7 && r >= 1 && r <= 5) return { bg: 'bg-sky-500 border-sky-600', star: false, baseColor: null };
    if (r === 7 && c >= 9 && c <= 13) return { bg: 'bg-amber-400 border-amber-500', star: false, baseColor: null };
    if (c === 7 && r >= 9 && r <= 13) return { bg: 'bg-emerald-500 border-emerald-600', star: false, baseColor: null };
    const idx = MAIN_PATH_COORDS.findIndex(([mr, mc]) => mr === r && mc === c);
    if (idx === 0) return { bg: 'bg-rose-500 border-rose-600', star: true, baseColor: null };
    if (idx === 13) return { bg: 'bg-sky-500 border-sky-600', star: true, baseColor: null };
    if (idx === 26) return { bg: 'bg-amber-400 border-amber-500', star: true, baseColor: null };
    if (idx === 39) return { bg: 'bg-emerald-500 border-emerald-600', star: true, baseColor: null };
    return { bg: 'bg-slate-50 border-slate-300/80', star: SAFE_GLOBAL_CELLS.includes(idx), baseColor: null };
  };

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto flex flex-col gap-3 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-3 sm:p-5 rounded-3xl border border-slate-800 shadow-2xl">
      <div className="flex items-center justify-between gap-3 bg-slate-900/90 border border-slate-700/80 px-3.5 py-2.5 rounded-2xl shadow-lg">
        <div className="text-xs sm:text-sm font-semibold text-slate-200 flex-1 leading-snug">{gameState.lastActionText}</div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleRollDice} disabled={!isMyTurn || gameState.hasRolled || isRolling} className={`flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-2xl font-extrabold text-xs sm:text-sm shadow-xl transition cursor-pointer ${isMyTurn && !gameState.hasRolled ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 ring-2 ring-amber-300/60' : 'bg-slate-800 text-slate-400 cursor-not-allowed'}`}>
            <span>{isMyTurn && !gameState.hasRolled ? 'Hidh' : currentPlayer?.nickname || 'Prit'}</span>
            <DiceFace value={gameState.diceValue} rolling={isRolling} />
          </button>
          <button onClick={handleFullscreen} title="Ekran i plotë" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 cursor-pointer"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id]; const t = THEME[p.color]; const active = gameState.currentTurn === id; const homeCount = p.tokens.filter((x) => x === 57).length;
          return (
            <div key={id} className={`px-3 py-2 rounded-2xl border flex items-center justify-between transition ${active ? `bg-slate-800/90 border-white/60 shadow-lg ring-2 ${t.ring}` : 'bg-slate-900/60 border-slate-800 opacity-75'}`}>
              <div className="flex items-center gap-2 truncate"><span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${t.gradient} border border-white/60 shrink-0`} /><span className="text-xs sm:text-sm font-bold text-white truncate">{p.nickname}</span></div>
              <span className={`text-xs font-black ${t.text}`}>{homeCount}/4</span>
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-[500px] aspect-square mx-auto bg-gradient-to-br from-amber-600 via-amber-500 to-amber-700 p-2 sm:p-2.5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] border-2 border-amber-300/50">
        <div className="relative w-full h-full rounded-2xl overflow-hidden bg-white shadow-inner grid" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}>
          <div className="pointer-events-none z-10 flex items-center justify-center" style={{ gridColumn: '7 / 10', gridRow: '7 / 10', background: 'conic-gradient(from 45deg, #0ea5e9 0deg 90deg, #fbbf24 90deg 180deg, #10b981 180deg 270deg, #f43f5e 270deg 360deg)' }}>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/95 shadow-md flex items-center justify-center border border-amber-400"><Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-400" /></div>
          </div>
          {Array.from({ length: 15 }).map((_, r) => Array.from({ length: 15 }).map((__, c) => {
            if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return null;
            const { bg, star, baseColor } = getCellVisual(r, c);
            const tokensHere = cellTokens[`${r}-${c}`] || [];
            const isBaseSlot = Object.values(BASE_SLOTS).some((arr) => arr.some(([br, bc]) => br === r && bc === c));
            return (
              <div key={`${r}-${c}`} style={{ gridColumn: c + 1, gridRow: r + 1 }} className={`relative border-[0.5px] flex items-center justify-center ${bg}`}>
                {isBaseSlot && baseColor && <div className={`w-4/5 h-4/5 rounded-full border-2 shadow-inner ${THEME[baseColor].baseRing}`} />}
                {star && tokensHere.length === 0 && <Star className="w-3.5 h-3.5 text-slate-700/60 fill-white/80" />}
                {tokensHere.length > 0 && (
                  <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-0.5 p-0.5">
                    {tokensHere.map((tk) => (
                      <button key={`${tk.playerId}-${tk.tokenIdx}`} onClick={() => handleTokenClick(tk.playerId, tk.tokenIdx)} disabled={!tk.movable} className={`rounded-full bg-gradient-to-br ${THEME[tk.color].gradient} border-2 border-white shadow-[0_3px_6px_rgba(0,0,0,0.5)] flex items-center justify-center transition-transform ${tokensHere.length > 1 ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-4/5 h-4/5 max-w-[24px] max-h-[24px]'} ${tk.movable ? 'animate-bounce ring-2 ring-amber-300 scale-110 cursor-pointer z-30' : 'cursor-default z-20'}`}>
                        <span className="w-1/2 h-1/2 rounded-full bg-white/40" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}
