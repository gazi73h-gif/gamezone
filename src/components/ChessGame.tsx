'use client';
import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { BOT_ID, ChessGameState, ChessPiece, epSquareOf, getLegalMoves, makeChessMove } from '@/lib/chessLogic';
import { requestBotMove } from '@/lib/chessBot';
import { playSound } from '@/lib/sound';
import { PlayerChip, GameKitStyles } from './gamekit';
import { recordWin } from '@/lib/supabase';
import { Trophy, RotateCcw, Crown, ShieldAlert, Undo2, History, Sparkles } from 'lucide-react';
function playChessSound(type: 'move' | 'capture' | 'check' | 'win') {
  playSound(type);
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
  const [view3D, setView3D] = useState<boolean>(true);
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

  // boti mendon në sfond (Web Worker). Çelësi është vetë pozicioni, që rifreskimi i faqes
  // çdo 2 sekonda të mos e ndërpresë llogaritjen; përgjigjja e vjetër injorohet nëse pozicioni ndryshoi.
  const isBotTurn = gameState.status === 'playing' && isHost &&
    ((gameState.turn === 'w' && gameState.whiteId === BOT_ID) || (gameState.turn === 'b' && gameState.blackId === BOT_ID));
  const botKey = isBotTurn ? JSON.stringify([gameState.board, gameState.turn, gameState.lastMove, gameState.aiDifficulty]) : '';
  const applyBotMove = useEffectEvent((key: string, mv: { from: [number, number]; to: [number, number] }) => {
    const current = JSON.stringify([gameState.board, gameState.turn, gameState.lastMove, gameState.aiDifficulty]);
    if (current === key) void onUpdateState(makeChessMove(gameState, BOT_ID, mv.from, mv.to));
  });
  const botInput = useEffectEvent(() => gameState);
  useEffect(() => {
    if (!botKey) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const mv = await requestBotMove(botInput());
      if (!cancelled && mv) applyBotMove(botKey, mv);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [botKey]);
  const prevMoveRef = useRef<string>('');
  const capturedRef = useRef(gameState.capturedByWhite.length + gameState.capturedByBlack.length);
  useEffect(() => {
    if (!gameState.lastMove) return;
    const key = `${gameState.lastMove.from.join(',')}-${gameState.lastMove.to.join(',')}-${gameState.status}`;
    if (prevMoveRef.current === key) return;
    prevMoveRef.current = key;
    if (gameState.status === 'finished') playChessSound('win');
    else if (gameState.inCheck) playChessSound('check');
    else if ((gameState.capturedByWhite.length + gameState.capturedByBlack.length) > capturedRef.current) playChessSound('capture');
    else playChessSound('move');
    capturedRef.current = gameState.capturedByWhite.length + gameState.capturedByBlack.length;
  }, [gameState.lastMove, gameState.inCheck, gameState.status, gameState.capturedByWhite.length, gameState.capturedByBlack.length]);
  const handleUndo = async () => {
    if (!gameState.prevBoard || gameState.status !== 'playing') return;
    setSelected(null);
    await onUpdateState({ ...gameState, board: gameState.prevBoard, prevBoard: null, turn: gameState.turn === 'w' ? 'b' : 'w', inCheck: null, lastActionText: '↩️ Potezi i fundit u kthye prapa.' });
  };
  const handleDifficulty = async (diff: 'easy' | 'medium' | 'hard') => {
    await onUpdateState({ ...gameState, aiDifficulty: diff });
  };
  const legalTargets = selected ? getLegalMoves(gameState.board, selected.at(0)!, selected.at(1)!, epSquareOf(gameState)) : [];
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
  const isBotMatch = gameState.blackId === BOT_ID || gameState.whiteId === BOT_ID;

  return (
    <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-4 bg-gradient-to-br from-[#1b120c] via-[#120c08] to-[#090604] p-3 sm:p-5 rounded-3xl border border-amber-500/30 shadow-[0_25px_70px_rgba(0,0,0,0.95)]">
      <div className="flex-1 flex flex-col gap-3">
        <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-2xl border shadow-lg ${gameState.inCheck ? 'bg-red-950/80 border-red-500 text-red-200' : 'bg-[#23170f]/90 border-amber-500/30 text-amber-100'}`}>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            {gameState.inCheck && <ShieldAlert className="w-5 h-5 text-red-400 animate-bounce shrink-0" />}
            <span>{gameState.lastActionText}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setView3D(!view3D)} className="inline-flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 font-bold text-xs px-2.5 py-1.5 rounded-xl transition cursor-pointer"><Sparkles className="w-3.5 h-3.5" /> {view3D ? '3D' : '2D'}</button>
            {gameState.prevBoard && gameState.status === 'playing' && (
              <button onClick={handleUndo} className="inline-flex items-center gap-1 bg-stone-800 hover:bg-stone-700 text-amber-200 border border-amber-500/30 font-bold text-xs px-2.5 py-1.5 rounded-xl transition cursor-pointer"><Undo2 className="w-3.5 h-3.5" /> Kthe</button>
            )}
            {isHost && onRestartGame && (
              <button onClick={onRestartGame} className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs px-3 py-1.5 rounded-xl transition cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /> Rinis</button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <GameKitStyles />
          {[{ id: gameState.whiteId, name: gameState.whiteName, color: 'w' as const, cap: gameState.capturedByWhite }, { id: gameState.blackId, name: gameState.blackName, color: 'b' as const, cap: gameState.capturedByBlack }].map((pl) => (
            <PlayerChip key={pl.color} name={pl.name.replace('🤖 ', '')} me={pl.id === currentPlayerId} bot={pl.id === BOT_ID}
              color={pl.color === 'w' ? '#e9d8b4' : '#6b4226'}
              active={gameState.status === 'playing' && gameState.turn === pl.color}
              sub={pl.cap.length ? (
                <span className="flex items-center -space-x-1">{pl.cap.slice(-7).map((cp, i) => (<span key={i} className="w-3.5 h-4 inline-block"><ChessPiece3D piece={cp} /></span>))}</span>
              ) : (pl.color === 'w' ? 'Të bardhat' : 'Të zezat')} />
          ))}
        </div>

        <div className="py-2 sm:py-4 flex items-center justify-center" style={{ perspective: view3D ? '1100px' : 'none' }}>
          <div style={{ transform: view3D ? 'rotateX(16deg)' : 'none', transformStyle: 'preserve-3d' }} className="w-full max-w-[500px] aspect-square mx-auto p-3.5 sm:p-5 bg-gradient-to-b from-[#5c361c] via-[#3b200e] to-[#1f0f05] rounded-[32px] shadow-[0_18px_0_#140903,0_35px_70px_rgba(0,0,0,0.95)] border-2 border-amber-400/75 transition-transform duration-500">
            <div className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-xl overflow-visible border-2 border-amber-400/60 shadow-inner">
              {rows.map((r) => cols.map((c) => {
                const isLight = (r + c) % 2 === 0;
                const piece = gameState.board[r]?.[c];
                const isSel = selected !== null && selected.at(0) === r && selected.at(1) === c;
                const isTarget = legalTargets.some(([lr, lc]) => lr === r && lc === c);
                const isLast = (gameState.lastMove?.from?.at(0) === r && gameState.lastMove?.from?.at(1) === c) || (gameState.lastMove?.to?.at(0) === r && gameState.lastMove?.to?.at(1) === c);
                const isKingCheck = piece?.type === 'k' && gameState.inCheck === piece.color;
                const sqBg = isKingCheck ? 'bg-red-600 animate-pulse' : isSel ? 'bg-amber-300' : isLast ? (isLight ? 'bg-amber-200/95' : 'bg-amber-600/90') : isLight ? 'bg-gradient-to-br from-[#f8eed9] to-[#e2cba1]' : 'bg-gradient-to-br from-[#6b4226] to-[#422512]';
                const txtCol = isLight ? 'text-[#5c3a21]' : 'text-[#f5ebd6]';
                return (
                  <button key={`${r}-${c}`} data-square={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center transition-all ${sqBg} ${(isMyTurn && (piece?.color === myColor || isTarget)) ? 'cursor-pointer' : 'cursor-default'}`}>
                    {c === cols.at(0) && <span className={`absolute top-0.5 left-1 text-[9px] font-black select-none ${txtCol}`}>{8 - r}</span>}
                    {r === rows.at(7) && <span className={`absolute bottom-0.5 right-1 text-[9px] font-black select-none ${txtCol}`}>{files[c]}</span>}
                    {piece && (<div style={{ transform: view3D ? 'rotateX(-14deg) translateY(-6px)' : 'none' }} className={`w-[92%] h-[92%] z-10 transition-transform duration-200 ${isSel ? 'scale-115 -translate-y-2' : 'hover:scale-105'}`}><ChessPiece3D piece={piece} /></div>)}
                    {isTarget && !piece && (<span className="w-3.5 h-3.5 rounded-full bg-amber-400/80 ring-2 ring-white/80 shadow z-20" />)}
                    {isTarget && piece && (<span className="absolute inset-1 rounded-xl border-4 border-amber-400 z-20 animate-pulse" />)}
                  </button>
                );
              }))}
            </div>
          </div>
        </div>

        {gameState.status === 'finished' && (
          <div className="bg-amber-500/20 border border-amber-400 rounded-2xl p-3 text-center flex items-center justify-center gap-2 text-amber-300 font-black text-sm shadow-lg">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>{gameState.winnerName} (+150 pikë në Leaderboard)</span>
            <Crown className="w-5 h-5 text-amber-400" />
          </div>
        )}
      </div>

      <div className="w-full lg:w-64 flex flex-col gap-3 bg-[#1d130c]/90 border border-amber-500/25 rounded-2xl p-3.5">
        {isBotMatch && isHost && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-amber-400/80 font-extrabold mb-1.5">Niveli i AI (Bot)</div>
            <div className="grid grid-cols-3 gap-1">
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button key={d} onClick={() => handleDifficulty(d)} className={`py-1.5 rounded-lg text-xs font-extrabold capitalize transition cursor-pointer ${(gameState.aiDifficulty || 'medium') === d ? 'bg-amber-500 text-stone-950 shadow' : 'bg-stone-900 text-amber-200/70 hover:bg-stone-800'}`}>
                  {d === 'easy' ? 'Lehtë' : d === 'medium' ? 'Mesatar' : 'Vështirë'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-[140px]">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300 mb-2"><History className="w-4 h-4" /> Historiku i Potezave</div>
          <div className="flex-1 max-h-64 overflow-y-auto bg-black/40 rounded-xl p-2 border border-amber-900/30 space-y-1 text-xs font-mono text-amber-100/90">
            {(gameState.moveHistory || []).length === 0 ? (<div className="text-amber-500/50 italic text-center py-4">Asnjë lëvizje ende</div>) : (gameState.moveHistory || []).map((m, idx) => (<div key={idx} className="flex justify-between px-2 py-0.5 rounded bg-amber-950/30"><span className="text-amber-500">#{idx + 1}</span><span>{m}</span></div>))}
          </div>
        </div>
      </div>
    </div>
  );
}