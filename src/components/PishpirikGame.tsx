'use client';

import React, { useEffect, useRef } from 'react';
import {
  Card,
  PishpirikGameState,
  playPishpirikCard,
  Suit,
} from '@/lib/pishpirikLogic';
import { recordWin } from '@/lib/supabase';
import { Trophy, Layers, Flame, RotateCcw } from 'lucide-react';

interface PishpirikGameProps {
  gameState: PishpirikGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (newState: PishpirikGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
}

function getSuitSymbol(suit: Suit): { symbol: string; color: string } {
  switch (suit) {
    case 'hearts':
      return { symbol: '♥', color: 'text-red-500' };
    case 'diamonds':
      return { symbol: '♦', color: 'text-red-500' };
    case 'clubs':
      return { symbol: '♣', color: 'text-slate-900' };
    case 'spades':
      return { symbol: '♠', color: 'text-slate-900' };
  }
}

function PlayingCard({
  card,
  onClick,
  disabled,
  isHighlight,
}: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  isHighlight?: boolean;
}) {
  const { symbol, color } = getSuitSymbol(card.suit);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-20 h-28 sm:w-24 sm:h-36 bg-white rounded-xl shadow-lg border-2 flex flex-col justify-between p-2 select-none transition-all duration-200 ${
        isHighlight ? 'border-amber-400 ring-4 ring-amber-400/30' : 'border-slate-200'
      } ${
        !disabled && onClick
          ? 'hover:-translate-y-3 hover:shadow-xl cursor-pointer active:scale-95'
          : 'cursor-default'
      }`}
    >
      <div className={`text-left font-bold text-base sm:text-lg leading-none ${color}`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>

      <div className={`text-3xl sm:text-4xl self-center ${color}`}>{symbol}</div>

      <div className={`text-right font-bold text-base sm:text-lg leading-none rotate-180 ${color}`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
    </button>
  );
}

export default function PishpirikGame({
  gameState,
  currentPlayerId,
  isHost,
  onUpdateState,
  onRestartGame,
}: PishpirikGameProps) {
  const me = gameState.players[currentPlayerId];
  useEffect(() => { if (gameState.status !== 'playing' || !isHost || gameState.currentTurn !== 'BOT_PISH') return; const h = gameState.hands['BOT_PISH'] || []; if (h.length === 0) return; const t = setTimeout(async () => { const top = gameState.tableCards.at(-1); const pick = h.find((x) => top && x.rank === top.rank) || h.find((x) => x.rank === 'J') || h.at(0)!; await onUpdateState(playPishpirikCard(gameState, 'BOT_PISH', pick.id)); }, 850); return () => clearTimeout(t); }, [gameState, isHost, onUpdateState]);
  const isMyTurn = gameState.currentTurn === currentPlayerId && gameState.status === 'playing';
  const activePlayerName = gameState.players[gameState.currentTurn]?.nickname || '...';
  const topCard = gameState.table.at(gameState.table.length - 1);
  const winRecordedRef = useRef(false);

  useEffect(() => {
    if (gameState.status !== 'finished') {
      winRecordedRef.current = false;
      return;
    }
    if (winRecordedRef.current) return;

    const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    if (winner && winner.id === currentPlayerId) {
      winRecordedRef.current = true;
      recordWin(winner.nickname, winner.score, 'Pishpirik');
    }
  }, [gameState.status, gameState.players, currentPlayerId]);

  const handlePlayCard = async (cardId: string) => {
    if (!isMyTurn) return;
    const updated = playPishpirikCard(gameState, currentPlayerId, cardId);
    await onUpdateState(updated);
  };

  if (gameState.status === 'finished') {
    const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);

    return (
      <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-6 text-center max-w-xl mx-auto shadow-2xl">
        <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-3 animate-bounce" />
        <h2 className="text-2xl font-extrabold text-white mb-1">Loja Përfundoi!</h2>
        <p className="text-slate-400 text-sm mb-6">Rezultatet përfundimtare të Pishpirikut</p>

        <div className="space-y-3 mb-6">
          {sortedPlayers.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                idx === 0
                  ? 'bg-amber-500/20 border-amber-500/50 text-white'
                  : 'bg-slate-800/70 border-slate-700 text-slate-200'
              }`}
            >
              <div className="text-left">
                <div className="font-bold text-lg">
                  {idx === 0 ? '👑 ' : `${idx + 1}. `}
                  {p.nickname}
                </div>
                <div className="text-xs text-slate-400">
                  Letra: {p.captured.length} • Pishpirikë: {p.pishpiriks} (+{p.pishpirikPoints} pikë)
                </div>
              </div>
              <div className="text-2xl font-black text-amber-400">{p.score} pikë</div>
            </div>
          ))}
        </div>

        {isHost && onRestartGame && (
          <button
            onClick={onRestartGame}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition"
          >
            <RotateCcw className="w-5 h-5" />
            Luaj Përsëri
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto">
      {/* Shiriti i sipërm i informacionit */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 px-4 py-3 rounded-xl">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <span className="inline-flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-lg font-medium">
            <Layers className="w-4 h-4 text-emerald-400" />
            Pakoja: <strong className="text-white">{gameState.deck.length}</strong>
          </span>
          <span className="bg-slate-800 px-3 py-1 rounded-lg font-medium">
            Raundi: <strong className="text-white">{gameState.round}</strong>
          </span>
        </div>

        <div
          className={`px-4 py-1.5 rounded-full text-sm font-bold ${
            isMyTurn
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
              : 'bg-slate-800 text-slate-300'
          }`}
        >
          {isMyTurn ? '🟢 Radha jote!' : `⏳ Po luan: ${activePlayerName}`}
        </div>
      </div>

      {/* Statistikat e lojtarëve */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id];
          const active = gameState.currentTurn === id;
          return (
            <div
              key={id}
              className={`p-3 rounded-xl border text-sm transition ${
                active
                  ? 'bg-emerald-950/50 border-emerald-500/60'
                  : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="font-bold text-white truncate">{p.nickname}</div>
              <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                <span>Kapura: {p.captured.length}</span>
                <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
                  <Flame className="w-3.5 h-3.5" /> {p.pishpiriks}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tavolina e gjelbër në mes */}
      <div className="relative bg-gradient-to-b from-emerald-900 to-emerald-950 border-4 border-emerald-800/80 rounded-3xl p-6 min-h-[240px] flex flex-col items-center justify-center shadow-inner">
        <div className="text-xs uppercase tracking-wider text-emerald-300/70 mb-3 font-semibold">
          Në tavolinë: {gameState.table.length} {gameState.table.length === 1 ? 'letër' : 'letra'}
        </div>

        {topCard ? (
          <div className="relative">
            {gameState.table.length > 1 && (
              <div className="absolute -top-2 -left-2 w-20 h-28 sm:w-24 sm:h-36 bg-slate-300 rounded-xl border border-slate-400 -rotate-6" />
            )}
            <PlayingCard card={topCard} isHighlight={gameState.table.length === 1} />
          </div>
        ) : (
          <div className="w-24 h-36 rounded-xl border-2 border-dashed border-emerald-600/50 flex items-center justify-center text-emerald-400/50 text-xs text-center p-2">
            Tavolina bosh
          </div>
        )}

        <div className="mt-4 text-center text-sm font-medium text-emerald-100 bg-black/30 px-4 py-1.5 rounded-full">
          {gameState.lastActionText}
        </div>
      </div>

      {/* Dora e lojtarit aktual */}
      {me && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 mb-3 text-center">
            {isMyTurn ? 'Zgjidh një letër për ta hedhur:' : 'Letrat e tua në dorë:'}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {me.hand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                disabled={!isMyTurn}
                onClick={() => handlePlayCard(card.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

