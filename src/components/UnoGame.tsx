'use client';

import React, { useState, useEffect, useRef } from 'react';
import { recordWin } from '@/lib/supabase';
import { playSound } from '@/lib/sound';
import {
  UnoCard,
  UnoColor,
  UnoGameState,
  canPlayUnoCard,
  playUnoCard,
  drawUnoCardAction,
  callUnoShout,
} from '../lib/unoLogic';
import { RotateCcw, Flame } from 'lucide-react';
import { PlayerChip, FeltTable, CardFan, ResultPanel, GameKitStyles, SEAT_COLORS } from './gamekit';

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

const UNO_DOT: Record<UnoColor, string> = { red: 'bg-red-600', blue: 'bg-blue-600', green: 'bg-emerald-600', yellow: 'bg-amber-400', wild: 'bg-white' };

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
      className={`relative uno-card border-4 shadow-xl flex flex-col justify-between p-2 select-none transition-all duration-200 ${
        COLOR_STYLES[card.color]
      } ${
        playable
          ? 'ring-4 ring-gold/80 shadow-[0_0_22px_rgba(255,200,61,0.6)] cursor-pointer active:scale-95'
          : onClick ? 'brightness-75 cursor-default' : 'cursor-default'
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

  // tingujt: letra e luajtur (toka rritet) dhe letra e marrë (pakoja zvogëlohet)
  const unoKey = `${gameState.deck.length}|${gameState.discardPile.length}`;
  const unoRef = useRef('');
  useEffect(() => {
    const prev = unoRef.current;
    unoRef.current = unoKey;
    if (!prev) return;
    const [deck, pile] = unoKey.split('|').map(Number);
    const [pDeck, pPile] = prev.split('|').map(Number);
    if (pile > pPile) playSound('cardPlay');
    else if (deck < pDeck) playSound('cardDraw');
  }, [unoKey]);
  const winRecordedRef = useRef(false);
  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    const w = (gameState.winnerId ? gameState.players[gameState.winnerId] : null) || Object.values(gameState.players).find((p) => p.hand.length === 0);
    if (w && w.id === currentPlayerId) { winRecordedRef.current = true; recordWin(w.nickname, 50, 'UNO Shqip'); }
  }, [gameState.status, gameState.winnerId, gameState.players, currentPlayerId]);

  const me = gameState.players[currentPlayerId];
  const activePlayerId = gameState.playerOrder.at(gameState.currentTurnIndex) || '';
  useEffect(() => { if (gameState.status !== 'playing' || !isHost || gameState.playerOrder.at(gameState.currentTurnIndex) !== 'BOT_UNO') return; const h = gameState.players['BOT_UNO']?.hand || []; const top = gameState.discardPile.at(-1); const t = setTimeout(async () => { const valid = top && h.find((x) => canPlayUnoCard(x, top, gameState.activeColor)); if (valid) await onUpdateState(playUnoCard(gameState, 'BOT_UNO', valid.id, 'red')); else await onUpdateState(drawUnoCardAction(gameState, 'BOT_UNO')); }, 850); return () => clearTimeout(t); }, [gameState, isHost, onUpdateState]);
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

  const colorOf = (id: string) => SEAT_COLORS[Math.max(0, gameState.playerOrder.indexOf(id)) % SEAT_COLORS.length];
  const FELT: Record<Exclude<UnoColor, 'wild'>, 'red' | 'blue' | 'green'> = { red: 'red', blue: 'blue', green: 'green', yellow: 'green' };

  if (gameState.status === 'finished') {
    const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null;
    return (
      <>
        <ResultPanel
          title="UNO!"
          subtitle={winner ? `${winner.id === currentPlayerId ? 'Ti fitove' : `${winner.nickname} fitoi`}!` : undefined}
          actions={onRestartGame && (
            <button onClick={onRestartGame} className="gz-btn inline-flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
              <RotateCcw className="w-5 h-5" /> Luaj përsëri
            </button>
          )}
        >
          <p className="text-sm text-mute text-center">{gameState.lastActionText}</p>
        </ResultPanel>
        <GameKitStyles />
      </>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-3 px-1 pb-2">
      {/* lojtarët */}
      <div className="flex flex-wrap justify-center gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id];
          return (
            <PlayerChip key={id} name={p.nickname} me={id === currentPlayerId} bot={id.startsWith('BOT')} color={colorOf(id)}
              active={activePlayerId === id} sub={`${p.hand.length} letra`}
              badge={p.calledUno ? <span className="text-[9px] font-black bg-coral text-white px-1.5 rounded-full">UNO!</span> : undefined} />
          );
        })}
      </div>

      {/* tavolina: ngjyra e çohës = ngjyra aktive */}
      <FeltTable tone={FELT[gameState.activeColor as Exclude<UnoColor, 'wild'>] ?? 'green'}>
        <div className="flex flex-col items-center gap-4 px-4 py-6 min-h-[250px] justify-center">
          <div className="flex items-center justify-center gap-8 sm:gap-14">
            <button onClick={handleDrawCard} disabled={!isMyTurn} aria-label="Tërhiq një letër"
              className={`flex flex-col items-center gap-1.5 rounded-2xl ${isMyTurn ? 'cursor-pointer uno-can' : 'cursor-default'}`}>
              <div className="uno-back"><span>UNO</span></div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/80">Tërhiq ({gameState.deck.length})</span>
            </button>
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative">
                {gameState.discardPile.length > 1 && <div className="absolute inset-0 rotate-[-8deg] opacity-70"><div className="uno-card uno-ghost" /></div>}
                {topCard && <UnoCardView card={topCard} />}
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white/80">
                <span className={`w-3 h-3 rounded-full border-2 border-white ${UNO_DOT[gameState.activeColor]}`} />
                {COLOR_NAMES_SQ[gameState.activeColor as Exclude<UnoColor, 'wild'>] ?? ''} · {gameState.direction === 1 ? '↻' : '↺'}
              </span>
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${isMyTurn ? 'bg-gold text-[#2a1600]' : 'bg-black/30 text-white'}`}>
            {isMyTurn ? 'Radha jote!' : `Po luan: ${activePlayerName}`}
          </span>
          <p className="text-center text-sm font-semibold text-white/90 max-w-md">{gameState.lastActionText}</p>
        </div>
      </FeltTable>

      {/* zgjedhja e ngjyrës për Wild / +4 */}
      {pendingWildCardId && (
        <div className="gz-panel rounded-3xl p-4 text-center">
          <p className="font-display font-semibold text-lg mb-3">Zgjidh ngjyrën e re</p>
          <div className="grid grid-cols-4 gap-2">
            {(['red', 'blue', 'green', 'yellow'] as const).map((col) => (
              <button key={col} onClick={() => handleChooseWildColor(col)}
                className={`h-14 rounded-2xl font-bold text-xs border-4 border-white/80 cursor-pointer transition hover:scale-105 ${COLOR_STYLES[col]}`}>
                {COLOR_NAMES_SQ[col]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* dora ime */}
      {me && (
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <p className={`text-xs font-bold ${isMyTurn ? 'text-gold' : 'text-mute'}`}>
              {isMyTurn ? 'Luaj një letër me të njëjtën ngjyrë ose numër' : 'Letrat e tua'}
            </p>
            {me.hand.length <= 1 && !me.calledUno && (
              <button onClick={handleShoutUno}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-orange-500 text-white font-black text-xs px-4 py-2 rounded-full shadow-lg animate-bounce cursor-pointer">
                <Flame className="w-4 h-4" /> THIRR UNO!
              </button>
            )}
          </div>
          <CardFan items={me.hand} keyOf={(c) => c.id} render={(card) => (
            <UnoCardView card={card} playable={isMyTurn && canPlayUnoCard(card, topCard, gameState.activeColor)} onClick={() => handleCardClick(card)} />
          )} />
        </div>
      )}
      <GameKitStyles />
      <style>{`
        .uno-card { width: clamp(58px, 15vw, 84px); height: clamp(84px, 21.5vw, 120px); border-radius: 12px; }
        .uno-ghost { background: #fff; box-shadow: 0 6px 14px rgba(0,0,0,0.35); }
        .uno-back { width: clamp(58px, 15vw, 84px); height: clamp(84px, 21.5vw, 120px); border-radius: 12px; display: grid; place-items: center;
          background: radial-gradient(ellipse at center, #e53935 0 38%, #1b1b1b 39%); border: 4px solid #fff; box-shadow: 0 8px 18px rgba(0,0,0,0.45); }
        .uno-back span { font-family: var(--font-display); font-weight: 700; color: #ffd43b; transform: rotate(-20deg); font-size: clamp(14px, 4vw, 20px); text-shadow: 2px 2px 0 #000; }
        .uno-can .uno-back { box-shadow: 0 0 0 3px #ffc83d, 0 0 22px rgba(255,200,61,0.7), 0 8px 18px rgba(0,0,0,0.45); }
      `}</style>
    </div>
  );
}
