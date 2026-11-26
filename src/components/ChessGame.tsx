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
// Figurat sipas fletës së dizajnit: siluetë e qartë për çdo figurë (mbreti me kurorë të gjerë pa kryq,
// oficeri me mitër dhe të çarë), ngjyra të sheshta që lexohen mirë edhe në telefon. viewBox 50×58.
const PIECE_NAMES: Record<string, string> = { k: 'Mbreti', q: 'Mbretëresha', b: 'Oficeri', n: 'Kali', r: 'Kulla', p: 'Ushtari' };
function ChessPiece3D({ piece }: { piece: ChessPiece }) {
  const w = piece.color === 'w';
  const fill = w ? '#F6EFE0' : '#2B2635';
  const stroke = w ? '#2A2230' : '#0D0B12';
  const gold = w ? '#D99A1E' : '#F2B33D';
  const shadow = <ellipse cx="25" cy="54" rx={piece.type === 'k' ? 18 : piece.type === 'p' ? 13 : 16} ry="3" fill="rgba(0,0,0,0.28)" />;
  return (
    <svg viewBox="0 0 50 58" className="w-full h-full overflow-visible drop-shadow-[0_5px_4px_rgba(0,0,0,0.55)] select-none" role="img" aria-label={`${PIECE_NAMES[piece.type]} ${w ? 'i bardhë' : 'i zi'}`}>
      {shadow}
      <g stroke={stroke} strokeWidth="1.6" strokeLinejoin="round">
        {piece.type === 'k' && (<>
          <path d="M6.5 52 H43.5 L41 46.5 H9 Z" fill={fill} />
          <path d="M11.5 46.5 C12 38 13.5 30.5 15 25.5 H35 C36.5 30.5 38 38 38.5 46.5 Z" fill={fill} />
          <rect x="13.5" y="24.3" width="23" height="3.4" rx="1" fill={gold} />
          <path d="M11.5 25 C10.2 17.2 16.5 12.6 25 12.6 C33.5 12.6 39.8 17.2 38.5 25 Z" fill={fill} />
          <rect x="14.5" y="10.4" width="21" height="3.6" rx="1.2" fill={gold} />
          <path d="M15.5 10.8 L16.8 4.6 L20.8 8 L25 3.4 L29.2 8 L33.2 4.6 L34.5 10.8 Z" fill={fill} />
        </>)}
        {piece.type === 'q' && (<>
          <path d="M9 52 H41 L38.5 46.5 H11.5 Z" fill={fill} />
          <path d="M14 46.5 L17 25 H33 L36 46.5 Z" fill={fill} />
          <path d="M14.5 25 L10 12.5 L18 19 L21.5 10 L25 18 L28.5 10 L32 19 L40 12.5 L35.5 25 Z" fill={fill} />
          <rect x="16.5" y="24.5" width="17" height="2.8" fill={gold} />
          <circle cx="10" cy="10.6" r="2.1" fill={gold} /><circle cx="21.5" cy="8" r="2" fill={gold} />
          <circle cx="28.5" cy="8" r="2" fill={gold} /><circle cx="40" cy="10.6" r="2.1" fill={gold} />
        </>)}
        {piece.type === 'b' && (<>
          <path d="M11 52 H39 L36.5 46.5 H13.5 Z" fill={fill} />
          <path d="M17 46.5 C18 39 21 34 22 30 H28 C29 34 32 39 33 46.5 Z" fill={fill} />
          <ellipse cx="25" cy="30" rx="7" ry="2.2" fill={gold} />
          <path d="M19.5 29.5 C17.5 23 21 17 25 13.5 C29 17 32.5 23 30.5 29.5 Z" fill={fill} />
          <path d="M22 25.2 L28.4 18.2" fill="none" stroke={gold} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="25" cy="10.2" r="2.9" fill={gold} />
        </>)}
        {piece.type === 'n' && (<>
          <path d="M9.5 52 H40.5 L38 46.5 H12 Z" fill={fill} />
          <path d="M15 46.5 C15 37 19 31 23 27 C17 28 12 26 12 21.5 C12 16 18 12 22 10 L20.5 5.5 L26.5 9 C33.5 11.5 37 19 35.5 30 C34.5 37 35.5 41 35.5 46.5 Z" fill={fill} />
          <circle cx="19" cy="16.5" r="1.7" fill={gold} stroke="none" />
          <path d="M26.5 9.5 C29 14 30 18 29.5 22" fill="none" stroke={gold} strokeWidth="1.8" strokeLinecap="round" />
        </>)}
        {piece.type === 'r' && (<>
          <path d="M9.5 52 H40.5 L38 46.5 H12 Z" fill={fill} />
          <path d="M15 46.5 L17 25 H33 L35 46.5 Z" fill={fill} />
          <path d="M12.5 25 V12 H18 V16 H22.5 V12 H27.5 V16 H32 V12 H37.5 V25 Z" fill={fill} />
          <rect x="16.5" y="25" width="17" height="2.8" fill={gold} />
        </>)}
        {piece.type === 'p' && (<>
          <path d="M11.5 52 H38.5 L36 46.5 H14 Z" fill={fill} />
          <path d="M16 46.5 C17 39 20 34 21.5 29.5 H28.5 C30 34 33 39 34 46.5 Z" fill={fill} />
          <ellipse cx="25" cy="29.5" rx="7.5" ry="2.3" fill={gold} />
          <circle cx="25" cy="21.5" r="6.6" fill={fill} />
        </>)}
      </g>
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
            <PlayerChip key={pl.color} id={pl.id} name={pl.name.replace('🤖 ', '')} me={pl.id === currentPlayerId} bot={pl.id === BOT_ID}
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
                const sqBg = isKingCheck ? 'bg-red-600 animate-pulse' : isSel ? 'bg-amber-300' : isLast ? (isLight ? 'bg-amber-200/95' : 'bg-amber-600/90') : isLight ? 'bg-[#EFDFC0]' : 'bg-[#A8744C]';
                const txtCol = isLight ? 'text-[#7A4E30]' : 'text-[#F7EBD3]';
                return (
                  <button key={`${r}-${c}`} data-square={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center transition-all ${sqBg} ${(isMyTurn && (piece?.color === myColor || isTarget)) ? 'cursor-pointer' : 'cursor-default'}`}>
                    {c === cols.at(0) && <span className={`absolute top-0.5 left-1 text-[9px] font-black select-none ${txtCol}`}>{8 - r}</span>}
                    {r === rows.at(7) && <span className={`absolute bottom-0.5 right-1 text-[9px] font-black select-none ${txtCol}`}>{files[c]}</span>}
                    {piece && (<div style={{ transform: view3D ? 'rotateX(-14deg) translateY(-6px)' : 'none' }} className={`w-[84%] h-[94%] z-10 transition-transform duration-200 ${isSel ? 'scale-115 -translate-y-2' : 'hover:scale-105'}`}><ChessPiece3D piece={piece} /></div>)}
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