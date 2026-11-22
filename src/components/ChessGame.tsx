'use client';
import React, { useEffect, useRef, useState } from 'react';
import { BOT_ID, ChessGameState, ChessPiece, computeBotMove, getLegalMoves, makeChessMove } from '@/lib/chessLogic';
import { recordWin } from '@/lib/supabase';
import { Trophy, RotateCcw, Crown, ShieldAlert } from 'lucide-react';
function playChessSound(type: 'move' | 'capture' | 'check' | 'win') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const tone = (freq: number, endFreq: number, dur: number, delay: number, wave: OscillatorType, vol: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = wave; o.frequency.setValueAtTime(freq, now + delay);
      if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, now + delay + dur);
      g.gain.setValueAtTime(vol, now + delay); g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g); g.connect(ctx.destination); o.start(now + delay); o.stop(now + delay + dur + 0.02);
    };
    if (type === 'move') { tone(190, 68, 0.09, 0, 'triangle', 0.45); tone(620, 140, 0.04, 0, 'sine', 0.25); }
    else if (type === 'capture') { tone(150, 48, 0.14, 0, 'sawtooth', 0.5); tone(420, 95, 0.08, 0.03, 'triangle', 0.45); }
    else if (type === 'check') { tone(130, 55, 0.22, 0, 'triangle', 0.5); tone(740, 740, 0.28, 0.02, 'sine', 0.35); tone(987.77, 987.77, 0.35, 0.14, 'sine', 0.4); }
    else { tone(523.25, 523.25, 0.22, 0, 'triangle', 0.35); tone(659.25, 659.25, 0.22, 0.13, 'triangle', 0.35); tone(783.99, 783.99, 0.25, 0.26, 'triangle', 0.4); tone(1046.5, 1046.5, 0.55, 0.4, 'sine', 0.45); }
  } catch {}
}
interface ChessGameProps { gameState: ChessGameState; currentPlayerId: string; isHost: boolean; onUpdateState: (newState: ChessGameState) => Promise<void>; onRestartGame?: () => Promise<void>; }
function ChessPiece3D({ piece }: { piece: ChessPiece }) {
  const isW = piece.color === 'w'; const gid = `cp_${piece.color}_${piece.type}`; const stroke = isW ? '#0f172a' : '#e2e8f0'; const gold = '#f59e0b';
  return (
    <svg viewBox="0 0 50 58" className="w-full h-full overflow-visible drop-shadow-[0_7px_6px_rgba(0,0,0,0.75)] select-none">
      <defs><linearGradient id={gid} x1="15%" y1="0%" x2="85%" y2="100%">{isW ? (<><stop offset="0%" stopColor="#ffffff" /><stop offset="50%" stopColor="#f1f5f9" /><stop offset="100%" stopColor="#94a3b8" /></>) : (<><stop offset="0%" stopColor="#64748b" /><stop offset="45%" stopColor="#1e293b" /><stop offset="100%" stopColor="#020617" /></>)}</linearGradient></defs>
      <ellipse cx="25" cy="53" rx="17" ry="4" fill="rgba(0,0,0,0.5)" />
      {piece.type === 'p' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M11 51 H39 L36 45 H14 Z" /><path d="M16 45 C17 35, 20 29, 21 24 H29 C30 29, 33 35, 34 45 Z" /><ellipse cx="25" cy="24" rx="7.5" ry="2.5" fill={gold} /><circle cx="25" cy="15.5" r="8" /></g>)}
      {piece.type === 'r' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M10 51 H40 L37 45 H13 Z" /><path d="M15 45 L17 21 H33 L35 45 Z" /><path d="M12 21 V11 H17.5 V15 H22 V11 H28 V15 H32.5 V11 H38 V21 Z" /><rect x="16.5" y="21" width="17" height="3" fill={gold} /></g>)}
      {piece.type === 'n' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M10 51 H40 L37 45 H13 Z" /><path d="M15 45 C15 35, 19 29, 23 25 C17 26, 12 24, 12 19.5 C12 14, 18 10, 22 8 L20.5 3.5 L26.5 7 C33.5 9.5, 37 17, 35.5 28 C34.5 35, 35.5 40, 35.5 45 Z" /><circle cx="19" cy="14.5" r="1.6" fill={gold} stroke="none" /></g>)}
      {piece.type === 'b' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M10 51 H40 L37 45 H13 Z" /><path d="M15 45 C16 35, 19 29, 21 25 H29 C31 29, 34 35, 35 45 Z" /><path d="M16.5 25 C15.5 17, 20 10, 25 7 C30 10, 34.5 17, 33.5 25 Z" /><circle cx="25" cy="4.5" r="2.8" fill={gold} /><path d="M21 15.5 L29 19.5 M25 13 V21" stroke={gold} strokeWidth="1.8" /></g>)}
      {piece.type === 'q' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M9 51 H41 L38 45 H12 Z" /><path d="M14 45 L17 24 H33 L36 45 Z" /><path d="M14.5 24 L10 11 L18 18 L25 8 L32 18 L40 11 L35.5 24 Z" /><rect x="16.5" y="23.5" width="17" height="3" fill={gold} /><circle cx="10" cy="9.5" r="2.2" fill={gold} /><circle cx="25" cy="6.5" r="2.6" fill={gold} /><circle cx="40" cy="9.5" r="2.2" fill={gold} /></g>)}
      {piece.type === 'k' && (<g fill={`url(#${gid})`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round"><path d="M9 51 H41 L38 45 H12 Z" /><path d="M14 45 L17 23 H33 L36 45 Z" /><path d="M14.5 23 C13.5 15, 19 11, 25 11 C31 11, 36.5 15, 35.5 23 Z" /><rect x="16.5" y="22.5" width="17" height="3" fill={gold} /><path d="M23.5 11 V3 H26.5 V11 M20.5 6.5 H29.5" stroke={gold} strokeWidth="2.8" /></g>)}
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

  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost) return;
    const isBotTurn = (gameState.turn === 'w' && gameState.whiteId === BOT_ID) || (gameState.turn === 'b' && gameState.blackId === BOT_ID);
    if (!isBotTurn) return;
    const timer = setTimeout(async () => {
      const mv = computeBotMove(gameState);
      if (mv) await onUpdateState(makeChessMove(gameState, BOT_ID, mv.from, mv.to));
    }, 650);
    return () => clearTimeout(timer);
  }, [gameState, isHost, onUpdateState]);
  const prevMoveRef = useRef<string>('');
  useEffect(() => {
    if (!gameState.lastMove) return;
    const key = `${gameState.lastMove.from.join(',')}-${gameState.lastMove.to.join(',')}-${gameState.status}`;
    if (prevMoveRef.current === key) return;
    prevMoveRef.current = key;
    if (gameState.status === 'finished') playChessSound('win');
    else if (gameState.inCheck) playChessSound('check');
    else playChessSound('move');
  }, [gameState.lastMove, gameState.inCheck, gameState.status]);
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

      <div className="w-full max-w-[520px] aspect-square mx-auto rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border-4 border-slate-800">
        <div className="w-full h-full grid grid-cols-8 grid-rows-8">
          {rows.map((r) => cols.map((c) => {
            const isLight = (r + c) % 2 === 0;
            const piece = gameState.board[r]?.[c];
            const isSel = selected !== null && selected.at(0) === r && selected.at(1) === c;
            const isTarget = legalTargets.some(([lr, lc]) => lr === r && lc === c);
            const fromR = gameState.lastMove?.from?.at(0);
            const fromC = gameState.lastMove?.from?.at(1);
            const toR = gameState.lastMove?.to?.at(0);
            const toC = gameState.lastMove?.to?.at(1);
            const isLast = (fromR === r && fromC === c) || (toR === r && toC === c);
            const isKingCheck = piece?.type === 'k' && gameState.inCheck === piece.color;
            const sqBg = isKingCheck ? 'bg-red-600 animate-pulse' : isSel ? 'bg-amber-300' : isLast ? (isLight ? 'bg-amber-200' : 'bg-amber-600/80') : isLight ? 'bg-slate-200' : 'bg-slate-800';
            const txtCol = isLast || isSel ? 'text-slate-900' : isLight ? 'text-slate-700' : 'text-slate-300';
            return (
              <button key={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center transition-colors ${sqBg} ${(isMyTurn && (piece?.color === myColor || isTarget)) ? 'cursor-pointer' : 'cursor-default'}`}>
                {c === cols.at(0) && <span className={`absolute top-0.5 left-1 text-[10px] font-extrabold select-none ${txtCol}`}>{8 - r}</span>}
                {r === rows.at(7) && <span className={`absolute bottom-0.5 right-1 text-[10px] font-extrabold select-none ${txtCol}`}>{files[c]}</span>}
                {piece && (<div className={`w-[86%] h-[86%] z-10 transition-transform ${isSel ? 'scale-110 -translate-y-0.5' : 'hover:scale-105'}`}><ChessPiece3D piece={piece} /></div>)}
                {isTarget && !piece && (<span className="w-3.5 h-3.5 rounded-full bg-black/20 z-20" />)}
                {isTarget && piece && (<span className="absolute inset-1 rounded-full border-[5px] border-black/20 z-20" />)}
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