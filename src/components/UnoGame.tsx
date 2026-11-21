'use client';

import React, { useState } from 'react';
import {
  UnoCard,
  UnoColor,
  UnoGameState,
  canPlayUnoCard,
  playUnoCard,
  drawUnoCardAction,
  callUnoShout,
} from '../lib/unoLogic';
import { Layers, Trophy, RotateCcw, Flame } from 'lucide-react';

interface UnoGameProps {
  gameState: UnoGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (newState: UnoGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
}

const COLOR_STYLES: Record<UnoColor, string> = {
  red: 'bg-red-600 border-red-300 text-white',
  blue: 'bg-blue-600 border-blue-300 text-white',
  green: 'bg-emerald-600 border-emerald-300 text-white',
  yellow: 'bg-amber-400 border-amber-100 text-slate-950',
  wild: 'bg-gradient-to-br from-red-500 via-amber-400 to-blue-600 border-white text-white',
};

const COLOR_NAMES_SQ: Record<Exclude<UnoColor, 'wild'>, string> = {
  red: 'E Kuqe',
  blue: 'Blu',
  green: 'E Gjelbër',
  yellow: 'E Verdhë',
};

function renderCardSymbol(value: UnoCard['value']): string {
  switch (value) {
    case 'skip':
      return '🚫';
    case 'reverse':
      return '🔄';
    case 'draw2':
      return '+2';
    case 'wild':
      return '🎨';
    case 'wild4':
      return '+4';
    default:
      return value;
  }
}

function UnoCardView({
  card,
  playable,
  onClick,
}: {
  card: UnoCard;
  playable?: boolean;
  onClick?: () => void;
}) {
  const symbol = renderCardSymbol(card.value);

  return (
    <button
      onClick={onClick}
      disabled={!playable}
      className={`relative w-20 h-28 sm:w-24 sm:h-36 rounded-2xl border-4 shadow-xl flex flex-col justify-between p-2 select-none transition-all duration-200 ${
        COLOR_STYLES[card.color]
      } ${
        playable
          ? 'hover:-translate-y-3 hover:scale-105 ring-4 ring-white/40 cursor-pointer active:scale-95'
          : 'opacity-75 cursor-default'
      }`}
    >
      <span className="text-left font-black text-sm sm:text-base leading-none drop-shadow">
        {symbol}
      </span>

      <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-full bg-white/20 flex items-center justify-center self-center rotate-12 border border-white/30">
        <span className="text-2xl sm:text-3xl font-black drop-shadow">{symbol}</span>
      </div>

      <span className="text-right font-black text-sm sm:text-base leading-none rotate-180 drop-shadow">
        {symbol}
      </span>
    </button>
  );
}
export default function UnoGame({
  gameState,
  currentPlayerId,
  isHost,
  onUpdateState,
  onRestartGame,
}: UnoGameProps) {
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);

  const me = gameState.players[currentPlayerId];
  const activePlayerId = gameState.playerOrder.at(gameState.currentTurnIndex) || '';
  const isMyTurn = activePlayerId === currentPlayerId && gameState.status === 'playing';
  const activePlayerName = gameState.players[activePlayerId]?.nickname || '...';
  const topCard = gameState.discardPile.at(gameState.discardPile.length - 1)!;

  const handleCardClick = async (card: UnoCard) => {
    if (!isMyTurn) return;
    if (!canPlayUnoCard(card, topCard, gameState.activeColor)) return;

    if (card.color === 'wild') {
      setPendingWildCardId(card.id);
      return;
    }

    const updated = playUnoCard(gameState, currentPlayerId, card.id);
    await onUpdateState(updated);
  };

  const handleChooseWildColor = async (chosenColor: Exclude<UnoColor, 'wild'>) => {
    if (!pendingWildCardId) return;
    const cardId = pendingWildCardId;
    setPendingWildCardId(null);
    const updated = playUnoCard(gameState, currentPlayerId, cardId, chosenColor);
    await onUpdateState(updated);
  };

  const handleDrawCard = async () => {
    if (!isMyTurn) return;
    const updated = drawUnoCardAction(gameState, currentPlayerId);
    await onUpdateState(updated);
  };

  const handleShoutUno = async () => {
    if (!me || me.calledUno) return;
    const updated = callUnoShout(gameState, currentPlayerId);
    await onUpdateState(updated);
  };

  if (gameState.status === 'finished') {
    const winnerName = gameState.winnerId
      ? gameState.players[gameState.winnerId]?.nickname
      : 'Lojtari';

    return (
      <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-8 text-center max-w-lg mx-auto shadow-2xl">
        <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" />
        <h2 className="text-3xl font-extrabold text-white mb-2">UNO! Fituesi: {winnerName}</h2>
        <p className="text-slate-400 text-sm mb-6">{gameState.lastActionText}</p>

        {isHost && onRestartGame && (
          <button
            onClick={onRestartGame}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-xl transition cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            Luaj Përsëri
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5">
      {/* Shiriti i sipërm */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 px-4 py-3 rounded-2xl">
        <div className="flex items-center gap-3 text-sm">
          <span className="bg-slate-800 px-3 py-1.5 rounded-xl text-slate-300 font-medium">
            Ngjyra aktive:{' '}
            <strong className="text-white uppercase">{COLOR_NAMES_SQ[gameState.activeColor]}</strong>
          </span>
          <span className="bg-slate-800 px-3 py-1.5 rounded-xl text-slate-300 font-medium">
            Drejtimi: <strong className="text-amber-400">{gameState.direction === 1 ? '↻' : '↺'}</strong>
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

      {/* Lojtarët dhe numri i letrave */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id];
          const active = activePlayerId === id;
          return (
            <div
              key={id}
              className={`p-3 rounded-xl border text-sm transition ${
                active
                  ? 'bg-amber-500/15 border-amber-500/60'
                  : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white truncate">{p.nickname}</span>
                {p.calledUno && (
                  <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full">
                    UNO!
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Letra në dorë: <strong className="text-white">{p.hand.length}</strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tavolina në qendër: Pakoja + Letra e hedhur */}
      <div className="relative bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-inner">
        <div className="flex items-center gap-6">
          <button
            onClick={handleDrawCard}
            disabled={!isMyTurn}
            className={`w-20 h-28 sm:w-24 sm:h-36 rounded-2xl bg-slate-800 border-4 border-slate-600 flex flex-col items-center justify-center gap-1 shadow-xl transition ${
              isMyTurn ? 'hover:border-amber-400 hover:-translate-y-1 cursor-pointer' : 'opacity-60'
            }`}
          >
            <Layers className="w-7 h-7 text-amber-400" />
            <span className="text-xs font-bold text-white">Tërhiq</span>
            <span className="text-[10px] text-slate-400">({gameState.deck.length})</span>
          </button>

          {topCard && <UnoCardView card={topCard} />}
        </div>

        {/* Zgjedhësi i ngjyrës për kartat e zeza (Wild / +4) */}
        {pendingWildCardId && (
          <div className="bg-slate-900 border border-amber-500/50 p-4 rounded-2xl shadow-2xl text-center">
            <p className="text-xs font-bold text-amber-300 uppercase mb-3">Zgjidh ngjyrën e re:</p>
            <div className="flex items-center gap-2.5">
              {Array.of('red' as const, 'blue' as const, 'green' as const, 'yellow' as const).map(
                (col) => (
                  <button
                    key={col}
                    onClick={() => handleChooseWildColor(col)}
                    className={`px-3.5 py-2 rounded-xl font-bold text-xs border-2 cursor-pointer transition hover:scale-105 ${COLOR_STYLES[col]}`}
                  >
                    {COLOR_NAMES_SQ[col]}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        <div className="text-center text-sm font-medium text-slate-200 bg-black/40 px-4 py-1.5 rounded-full">
          {gameState.lastActionText}
        </div>
      </div>

      {/* Dora e lojtarit aktual + Butoni UNO! */}
      {me && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400">
              {isMyTurn ? 'Zgjidh një letër që përputhet me ngjyrën ose numrin:' : 'Letrat e tua:'}
            </span>

            {me.hand.length <= 1 && !me.calledUno && (
              <button
                onClick={handleShoutUno}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black text-xs px-4 py-2 rounded-full shadow-lg animate-bounce cursor-pointer"
              >
                <Flame className="w-4 h-4" />
                THIRR UNO!
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {me.hand.map((card) => {
              const playable = isMyTurn && canPlayUnoCard(card, topCard, gameState.activeColor);
              return (
                <UnoCardView
                  key={card.id}
                  card={card}
                  playable={playable}
                  onClick={() => handleCardClick(card)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
