'use client';
import React, { useEffect, useRef, useState } from 'react';
import { BOT_RUMMY_ID, RummyGameState, RummyTile, TileColor, addToRummyMeld, discardRummyTile, drawRummyTile, playRummyMeld, runBotRummyTurn } from '@/lib/rummyLogic';
import { recordWin } from '@/lib/supabase';
import { Trophy, RotateCcw, Crown, Layers, ArrowDownToLine, Sparkles, ArrowUpDown, PlusCircle } from 'lucide-react';

interface RummyGameProps { gameState: RummyGameState; currentPlayerId: string; isHost: boolean; onUpdateState: (newState: RummyGameState) => Promise<void>; onRestartGame?: () => Promise<void>; }

const TILE_COLOR: Record<TileColor, { text: string; dot: string }> = {
  red: { text: 'text-red-600', dot: 'bg-red-500' },
  blue: { text: 'text-sky-600', dot: 'bg-sky-500' },
  black: { text: 'text-slate-900', dot: 'bg-slate-800' },
  orange: { text: 'text-amber-600', dot: 'bg-amber-500' },
};

function playTileSound(kind: 'draw' | 'meld' | 'win') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx(); const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = kind === 'win' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(kind === 'draw' ? 420 : kind === 'meld' ? 580 : 660, now);
    o.frequency.exponentialRampToValueAtTime(kind === 'win' ? 990 : 180, now + (kind === 'win' ? 0.35 : 0.08));
    g.gain.setValueAtTime(0.25, now); g.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'win' ? 0.36 : 0.09));
    o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.38);
  } catch {}
}

function Tile3D({ tile, selected, onClick, small }: { tile: RummyTile; selected?: boolean; onClick?: () => void; small?: boolean }) {
  const c = TILE_COLOR[tile.color];
  return (
    <button type="button" onClick={onClick} className={`relative select-none rounded-xl bg-gradient-to-b from-[#fffdf7] via-[#f7edd8] to-[#e2cfa8] border border-amber-200 flex flex-col items-center justify-between transition-all ${small ? 'w-8 h-11 sm:w-9 sm:h-12 p-1 shadow-[0_3px_0_#9c7a49,0_5px_8px_rgba(0,0,0,0.5)]' : 'w-11 h-16 sm:w-12 sm:h-[68px] p-1.5 shadow-[0_5px_0_#9c7a49,0_8px_14px_rgba(0,0,0,0.65)] cursor-pointer hover:-translate-y-1'} ${selected ? '-translate-y-3 ring-3 ring-amber-400 shadow-[0_8px_0_#d97706,0_14px_20px_rgba(0,0,0,0.8)] z-20' : ''}`}>
      {tile.isJoker ? (
        <div className="flex flex-col items-center justify-center h-full text-amber-500">
          <Crown className={small ? 'w-4 h-4 fill-amber-400' : 'w-6 h-6 fill-amber-400'} />
          <span className="text-[9px] font-black tracking-tighter text-amber-700">JOL</span>
        </div>
      ) : (
        <>
          <span className={`font-black leading-none tracking-tight ${small ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'} ${c.text}`}>{tile.number}</span>
          <span className={`rounded-full shadow-inner ${small ? 'w-2 h-2' : 'w-2.5 h-2.5'} ${c.dot}`} />
        </>
      )}
    </button>
  );
}
export default function RummyGame({ gameState, currentPlayerId, isHost, onUpdateState, onRestartGame }: RummyGameProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(Array.of());
  const [localOrder, setLocalOrder] = useState<string[]>(Array.of());
  const [errorMsg, setErrorMsg] = useState<string>('');
  const winRecordedRef = useRef(false);

  const isMyTurn = gameState.status === 'playing' && gameState.currentTurn === currentPlayerId;
  const me = gameState.players[currentPlayerId];
  const currentPlayer = gameState.players[gameState.currentTurn];

  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    if (gameState.winnerId === currentPlayerId && gameState.winnerName) {
      winRecordedRef.current = true;
      playTileSound('win');
      recordWin(gameState.winnerName, 150, 'Rummy / Jol');
    }
  }, [gameState.status, gameState.winnerId, gameState.winnerName, currentPlayerId]);

  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost) return;
    if (gameState.currentTurn !== BOT_RUMMY_ID) return;
    const t = setTimeout(async () => { await onUpdateState(runBotRummyTurn(gameState)); }, 900);
    return () => clearTimeout(t);
  }, [gameState, isHost, onUpdateState]);

  const hand = me ? me.hand.slice().sort((a, b) => {
    const ia = localOrder.indexOf(a.id); const ib = localOrder.indexOf(b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return 0;
  }) : Array.of();

  const toggleSelect = (id: string) => { setErrorMsg(''); setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id))); };
  const sortByRun = () => { if (!me) return; const cOrd: Record<TileColor, number> = { red: 1, blue: 2, black: 3, orange: 4 }; setLocalOrder(me.hand.slice().sort((a, b) => (a.isJoker ? 1 : b.isJoker ? -1 : cOrd[a.color] - cOrd[b.color] || a.number - b.number)).map((t) => t.id)); };
  const sortByGroup = () => { if (!me) return; setLocalOrder(me.hand.slice().sort((a, b) => (a.isJoker ? 1 : b.isJoker ? -1 : a.number - b.number)).map((t) => t.id)); };

  const handleDraw = async (src: 'deck' | 'discard') => { if (!isMyTurn || gameState.hasDrawn) return; setErrorMsg(''); playTileSound('draw'); await onUpdateState(drawRummyTile(gameState, currentPlayerId, src)); };
  const handleMeld = async () => { if (!isMyTurn) return; const res = playRummyMeld(gameState, currentPlayerId, selectedIds); if (res.error) { setErrorMsg(res.error); return; } setSelectedIds(Array.of()); playTileSound('meld'); await onUpdateState(res.state); };
  const handleAddToMeld = async (meldId: string) => { if (!isMyTurn || selectedIds.length === 0) return; const res = addToRummyMeld(gameState, currentPlayerId, selectedIds, meldId); if (res.error) { setErrorMsg(res.error); return; } setSelectedIds(Array.of()); playTileSound('meld'); await onUpdateState(res.state); };
  const handleDiscard = async () => {
    if (!isMyTurn || !gameState.hasDrawn) { setErrorMsg('Tërhiq një gur fillimisht!'); return; }
    if (selectedIds.length !== 1) { setErrorMsg('Zgjidh saktësisht 1 gur për ta hedhur!'); return; }
    const id = selectedIds.at(0)!; setSelectedIds(Array.of()); playTileSound('draw'); await onUpdateState(discardRummyTile(gameState, currentPlayerId, id));
  };
  const topDiscard = gameState.discardPile.at(-1);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-3 bg-gradient-to-b from-slate-950 via-[#0d1f17] to-slate-950 p-3 sm:p-5 rounded-3xl border border-emerald-800/50 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-700/80 px-4 py-2.5 rounded-2xl shadow-lg">
        <div className="text-xs sm:text-sm font-bold text-emerald-100">{gameState.lastActionText}</div>
        {gameState.status === 'finished' && isHost && onRestartGame && (
          <button onClick={onRestartGame} className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"><RotateCcw className="w-4 h-4" /> Luaj Përsëri</button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => {
          const pl = gameState.players[id]; const active = gameState.status === 'playing' && gameState.currentTurn === id;
          return (
            <div key={id} className={`px-3 py-2 rounded-2xl border flex items-center justify-between transition ${active ? 'bg-emerald-950/90 border-amber-400 ring-2 ring-amber-400/40 shadow-lg' : 'bg-slate-900/70 border-slate-800 opacity-75'}`}>
              <span className="text-xs sm:text-sm font-extrabold text-white truncate">{pl.nickname}</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-black/40 text-amber-300">{pl.hand.length} gurë</span>
            </div>
          );
        })}
      </div>

      <div className="bg-gradient-to-br from-[#14532d] via-[#166534] to-[#0f3d21] p-4 sm:p-6 rounded-3xl border-4 border-[#5c361c] shadow-[inset_0_4px_20px_rgba(0,0,0,0.6),0_15px_35px_rgba(0,0,0,0.8)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-center gap-6 py-2">
          <button type="button" onClick={() => handleDraw('deck')} disabled={!isMyTurn || gameState.hasDrawn} className={`flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl bg-gradient-to-b from-[#fffdf7] to-[#e2cfa8] border-2 border-amber-300 shadow-[0_6px_0_#9c7a49,0_12px_20px_rgba(0,0,0,0.6)] transition ${isMyTurn && !gameState.hasDrawn ? 'ring-4 ring-amber-400 animate-pulse cursor-pointer hover:scale-105' : 'opacity-80 cursor-not-allowed'}`}>
            <Layers className="w-6 h-6 text-amber-800" />
            <span className="text-xs font-black text-slate-900">Pako ({gameState.deck.length})</span>
          </button>

          <div className="flex flex-col items-center gap-1">
            {topDiscard ? (
              <div onClick={() => handleDraw('discard')} className={`rounded-2xl p-1 ${isMyTurn && !gameState.hasDrawn ? 'ring-4 ring-amber-400 animate-pulse cursor-pointer' : ''}`}>
                <Tile3D tile={topDiscard} />
              </div>
            ) : (
              <div className="w-12 h-16 rounded-xl border-2 border-dashed border-emerald-300/40 flex items-center justify-center text-[10px] text-emerald-200/60 font-bold">Bosh</div>
            )}
            <span className="text-[11px] font-bold text-emerald-100/80">Guri i hedhur</span>
          </div>
        </div>

        <div className="min-h-[120px] bg-black/25 rounded-2xl p-3 border border-emerald-400/20">
          <div className="text-[11px] uppercase tracking-wider font-extrabold text-emerald-200/70 mb-2">Kombinimet e hapura në tavolinë ({gameState.melds.length})</div>
          {gameState.melds.length === 0 ? (
            <div className="text-xs text-emerald-100/50 text-center py-6 italic">Ende nuk është hapur asnjë seri (4-5-6) apo grup (7-7-7).</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {gameState.melds.map((m) => (
                <div key={m.id} onClick={() => handleAddToMeld(m.id)} title={selectedIds.length > 0 ? 'Kliko për të shtuar gurët e zgjedhur' : m.ownerName} className={`flex items-center gap-1 bg-black/35 p-2 rounded-2xl border transition ${isMyTurn && selectedIds.length > 0 ? 'border-amber-400 cursor-pointer hover:bg-amber-500/20' : 'border-emerald-500/20'}`}>
                  {m.tiles.map((t) => (<Tile3D key={t.id} tile={t} small />))}
                  {isMyTurn && selectedIds.length > 0 && <PlusCircle className="w-5 h-5 text-amber-400 ml-1" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {errorMsg && <div className="bg-red-500/20 border border-red-500 text-red-200 text-xs font-bold px-3.5 py-2 rounded-xl text-center">{errorMsg}</div>}

      {me && (
        <div className="bg-gradient-to-b from-[#6b3f21] via-[#4a2914] to-[#2b1609] p-3.5 sm:p-5 rounded-3xl border-2 border-amber-500/50 shadow-[0_12px_0_#1a0c04,0_25px_50px_rgba(0,0,0,0.9)] flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={sortByRun} className="inline-flex items-center gap-1 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/30 text-xs font-extrabold px-2.5 py-1.5 rounded-xl cursor-pointer"><ArrowUpDown className="w-3.5 h-3.5" /> 1-2-3</button>
              <button type="button" onClick={sortByGroup} className="inline-flex items-center gap-1 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/30 text-xs font-extrabold px-2.5 py-1.5 rounded-xl cursor-pointer"><ArrowUpDown className="w-3.5 h-3.5" /> 7-7-7</button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleMeld} disabled={!isMyTurn || selectedIds.length < 3} className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow cursor-pointer"><Sparkles className="w-4 h-4" /> Hap Kombinimin</button>
              <button type="button" onClick={handleDiscard} disabled={!isMyTurn || !gameState.hasDrawn || selectedIds.length !== 1} className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow cursor-pointer"><ArrowDownToLine className="w-4 h-4" /> Hidh Gurin</button>
            </div>
          </div>

          <div className="bg-black/30 p-3 rounded-2xl border-t-4 border-b-4 border-[#361c0c] shadow-inner flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 min-h-[84px]">
            {hand.map((tile) => (<Tile3D key={tile.id} tile={tile} selected={selectedIds.includes(tile.id)} onClick={() => toggleSelect(tile.id)} />))}
          </div>
        </div>
      )}

      {gameState.status === 'finished' && (
        <div className="bg-amber-500/20 border border-amber-400 rounded-2xl p-3 text-center flex items-center justify-center gap-2 text-amber-300 font-black text-sm shadow-lg">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span>{gameState.winnerName} fitoi (+150 pikë në Leaderboard)!</span>
          <Crown className="w-5 h-5 text-amber-400" />
        </div>
      )}
    </div>
  );
}