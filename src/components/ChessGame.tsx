'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ChessGameState, ChessPiece, getLegalMoves, makeChessMove } from '@/lib/chessLogic';
import { recordWin } from '@/lib/supabase';
import { Trophy, RotateCcw, Crown, ShieldAlert } from 'lucide-react';
interface ChessGameProps { gameState: ChessGameState; currentPlayerId: string; isHost: boolean; onUpdateState: (newState: ChessGameState) => Promise<void>; onRestartGame?: () => Promise<void>; }
function ChessPiece3D({ piece }: { piece: ChessPiece }) {
  const isW = piece.color === 'w'; const gid = `cp_${piece.color}_${piece.type}`; const stroke = isW ? '#1e293b' : '#cbd5e1'; const accent = isW ? '#d97706' : '#f59e0b';
  return (
    <svg viewBox="0 0 48 56" className="w-full h-full overflow-visible drop-shadow-[0_6px_5px_rgba(0,0,0,0.75)] select-none">
      <defs><linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">{isW ? (<><stop offset="0%" stopColor="#ffffff" /><stop offset="55%" stopColor="#f8fafc" /><stop offset="100%" stopColor="#cbd5e1" /></>) : (<><stop offset="0%" stopColor="#475569" /><stop offset="50%" stopColor="#1e293b" /><stop offset="100%" stopColor="#020617" /></>)}</linearGradient></defs>
      <ellipse cx="24" cy="51" rx="16" ry="3.8" fill="rgba(0,0,0,0.5)" />
      {piece.type === 'p' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M12 49 H36 L34 44 H14 Z" /><path d="M16 44 C17 35, 20 29, 20 24 H28 C28 29, 31 35, 32 44 Z" /><ellipse cx="24" cy="24" rx="6.5" ry="2.2" /><circle cx="24" cy="16" r="7.5" /></g>)}
      {piece.type === 'r' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M11 49 H37 L35 44 H13 Z" /><path d="M15 44 L17 21 H31 L33 44 Z" /><path d="M13 21 V12 H18 V15 H21.5 V12 H26.5 V15 H30 V12 H35 V21 Z" /><line x1="16" y1="25" x2="32" y2="25" stroke={accent} strokeWidth="1.5" /></g>)}
      {piece.type === 'n' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M11 49 H37 L35 44 H13 Z" /><path d="M15 44 C15 35, 19 29, 22 25 C17 26, 13 24, 13 20 C13 15, 18 11, 22 9 L21 5 L26 8 C32 10, 35 17, 34 27 C33 34, 34 39, 34 44 Z" /><circle cx="19" cy="15" r="1.4" fill={accent} stroke="none" /></g>)}
      {piece.type === 'b' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M11 49 H37 L35 44 H13 Z" /><path d="M15 44 C16 35, 19 29, 20 25 H28 C29 29, 32 35, 33 44 Z" /><path d="M17 25 C16 18, 20 11, 24 8 C28 11, 32 18, 31 25 Z" /><circle cx="24" cy="5.5" r="2.6" fill={accent} /><line x1="21" y1="16" x2="27" y2="19" stroke={accent} strokeWidth="1.6" /></g>)}
      {piece.type === 'q' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M10 49 H38 L36 44 H12 Z" /><path d="M14 44 L17 24 H31 L34 44 Z" /><path d="M15 24 L11 12 L18 18 L24 9 L30 18 L37 12 L33 24 Z" /><circle cx="11" cy="10.5" r="2" fill={accent} /><circle cx="24" cy="7.5" r="2.4" fill={accent} /><circle cx="37" cy="10.5" r="2" fill={accent} /></g>)}
      {piece.type === 'k' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M10 49 H38 L36 44 H12 Z" /><path d="M14 44 L17 23 H31 L34 44 Z" /><path d="M15 23 C14 16, 19 12, 24 12 C29 12, 34 16, 33 23 Z" /><path d="M22.5 12 V4 H25.5 V12 M20 7 H28" stroke={accent} strokeWidth="2.4" /></g>)}
    </svg>
  );
}
export default function ChessGame({ gameState, currentPlayerId, isHost, onUpdateState, onRestartGame }: ChessGameProps) {
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const winRecordedRef = useRef(false);
  const isWhite = currentPlayerId === gameState.whiteId;
  const isBlack = currentPlayerId === gameState.blackId && gameState.blackId !== gameState.whiteId;
  const myColor = isWhite ? 'w' : isBlack ? 'b' : null;
  const isMyTurn = gameState.status === 'playing' && ((gameState.turn === 'w' && currentPlayerId === gameState.whiteId) || (gameState.turn === 'b' && currentPlayerId === gameState.blackId));

  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    if (gameState.winnerId && gameState.winnerId === currentPlayerId && gameState.winnerName) {
      winRecordedRef.current = true;
      recordWin(gameState.winnerName, 150, 'Shah (Chess)');
    }
  }, [gameState.status, gameState.winnerId, gameState.winnerName, currentPlayerId]);

  const legalTargets = selected ? getLegalMoves(gameState.board, selected.at(0)!, selected.at(1)!) : [];
  const handleCellClick = async (r: number, c: number) => {
    if (!isMyTurn) return;
    if (selected && legalTargets.some(([lr, lc]) => lr === r && lc === c)) {
      const next = makeChessMove(gameState, currentPlayerId, selected, Array.of(r, c) as [number, number]);
      setSelected(null);
      await onUpdateState(next);
      return;
    }
    const piece = gameState.board[r]?.[c];
    if (piece && piece.color === gameState.turn) setSelected(Array.of(r, c) as [number, number]);
    else setSelected(null);
  };
  const rows = isBlack ? Array.of(7,6,5,4,3,2,1,0) : Array.of(0,1,2,3,4,5,6,7);
  const cols = isBlack ? Array.of(7,6,5,4,3,2,1,0) : Array.of(0,1,2,3,4,5,6,7);
  const files = Array.of('a','b','c','d','e','f','g','h');

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-3 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-3 sm:p-5 rounded-3xl border border-slate-800 shadow-2xl">
      <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border shadow-lg ${gameState.inCheck ? 'bg-red-950/70 border-red-500 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-200'}`}>
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
          {gameState.inCheck && <ShieldAlert className="w-5 h-5 text-red-400 animate-bounce shrink-0" />}
          <span>{gameState.lastActionText}</span>
        </div>
        {gameState.status === 'finished' && isHost && onRestartGame && (
          <button onClick={onRestartGame} className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0"><RotateCcw className="w-4 h-4" /> Luaj Përsëri</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[{ id: gameState.whiteId, name: gameState.whiteName, color: 'w' as const, cap: gameState.capturedByWhite }, { id: gameState.blackId, name: gameState.blackName, color: 'b' as const, cap: gameState.capturedByBlack }].map((pl) => {
          const active = gameState.status === 'playing' && gameState.turn === pl.color;
          return (
            <div key={pl.color} className={`px-3 py-2.5 rounded-2xl border flex items-center justify-between transition ${active ? 'bg-slate-800 border-amber-400 ring-2 ring-amber-400/40 shadow-lg' : 'bg-slate-900/70 border-slate-800 opacity-80'}`}>
              <div className="flex items-center gap-2 truncate"><span className={`w-4 h-4 rounded-full border ${pl.color === 'w' ? 'bg-white border-slate-400' : 'bg-slate-950 border-slate-500'}`} /><span className="text-xs sm:text-sm font-extrabold text-white truncate">{pl.name}</span></div>
              <div className="flex items-center -space-x-1.5">{pl.cap.slice(-6).map((cp, i) => (<div key={i} className="w-4 h-5"><ChessPiece3D piece={cp} /></div>))}</div>
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-[520px] aspect-square mx-auto bg-gradient-to-br from-amber-800 via-amber-950 to-stone-950 p-2.5 sm:p-3.5 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.85)] border-2 border-amber-500/40">
        <div className="w-full h-full rounded-xl overflow-hidden border-2 border-amber-950 grid grid-cols-8 grid-rows-8 shadow-inner">
          {rows.map((r) => cols.map((c) => {
            const isLight = (r + c) % 2 === 0;
            const piece = gameState.board[r]?.[c];
            const isSel = selected && selected.at(0) === r && selected.at(1) === c;
            const isTarget = legalTargets.some(([lr, lc]) => lr === r && lc === c);
            const isLast = gameState.lastMove && ((gameState.lastMove.from.at(0) === r && gameState.lastMove.from.at(1) === c) || (gameState.lastMove.to.at(0) === r && gameState.lastMove.to.at(1) === c));
            const isKingCheck = piece?.type === 'k' && gameState.inCheck === piece.color;
            return (
              <button key={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center transition-colors ${isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'} ${isSel ? '!bg-amber-400/90' : ''} ${isLast && !isSel ? 'after:absolute after:inset-0 after:bg-yellow-300/30' : ''} ${isKingCheck ? '!bg-red-600/85 animate-pulse' : ''} ${(isMyTurn && (piece?.color === myColor || isTarget)) ? 'cursor-pointer' : 'cursor-default'}`}>
                {c === cols.at(0) && <span className={`absolute top-0.5 left-1 text-[9px] font-black select-none ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}`}>{8 - r}</span>}
                {r === rows.at(7) && <span className={`absolute bottom-0.5 right-1 text-[9px] font-black select-none ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}`}>{files[c]}</span>}
                {piece && (<div className={`w-4/5 h-4/5 z-10 transition-transform ${isSel ? 'scale-110 -translate-y-1' : 'hover:scale-105'}`}><ChessPiece3D piece={piece} /></div>)}
                {isTarget && !piece && (<span className="w-3.5 h-3.5 rounded-full bg-emerald-600/75 ring-2 ring-white/60 z-20" />)}
                {isTarget && piece && (<span className="absolute inset-1 rounded-xl border-4 border-red-500/85 z-20 animate-pulse" />)}
              </button>
            );
          }))}
        </div>
      </div>

      {gameState.status === 'finished' && (
        <div className="bg-amber-500/15 border border-amber-400/50 rounded-2xl p-3 text-center flex items-center justify-center gap-2 text-amber-300 font-black text-sm">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span>{gameState.winnerName} (+150 pikë në Leaderboard)</span>
          <Crown className="w-5 h-5 text-amber-400" />
        </div>
      )}
    </div>
  );
}