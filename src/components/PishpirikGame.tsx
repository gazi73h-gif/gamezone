'use client';

import React, { useEffect, useRef } from 'react';
import { PishpirikGameState, playPishpirikCard } from '@/lib/pishpirikLogic';
import { recordWin } from '@/lib/supabase';
import { playSound } from '@/lib/sound';
import { Flame, RotateCcw } from 'lucide-react';
import { PlayerChip, FeltTable, PlayingCard, CardBack, CardFan, ResultPanel, GameKitStyles, SEAT_COLORS } from './gamekit';
import { feltBackground, useTableSkin } from '@/lib/shop';

interface PishpirikGameProps {
  gameState: PishpirikGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (newState: PishpirikGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
}

export default function PishpirikGame({
  gameState,
  currentPlayerId,
  isHost,
  onUpdateState,
  onRestartGame,
}: PishpirikGameProps) {
  const tableSkin = useTableSkin();
  const me = gameState.players[currentPlayerId];
  // tingujt: letra e luajtur (dora zvogëlohet) dhe shpërndarja (pakoja zvogëlohet)
  const handCards = Object.values(gameState.players).reduce((a, p) => a + p.hand.length, 0);
  const cardKey = `${gameState.deck.length}|${handCards}`;
  const cardRef = useRef('');
  useEffect(() => {
    const prev = cardRef.current;
    cardRef.current = cardKey;
    if (!prev) return;
    const [deck, hands] = cardKey.split('|').map(Number);
    const [pDeck, pHands] = prev.split('|').map(Number);
    if (hands < pHands) playSound('cardPlay');
    else if (deck < pDeck) playSound('cardDraw');
  }, [cardKey]);

  useEffect(() => { if (gameState.status !== 'playing' || !isHost || gameState.currentTurn !== 'BOT_PISH') return; const h = gameState.players['BOT_PISH']?.hand || []; if (h.length === 0) return; const t = setTimeout(async () => { const top = gameState.table.at(-1); const pick = h.find((x) => top && x.rank === top.rank) || h.find((x) => x.rank === 'J') || h.at(0)!; await onUpdateState(playPishpirikCard(gameState, 'BOT_PISH', pick.id)); }, 850); return () => clearTimeout(t); }, [gameState, isHost, onUpdateState]);
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

  const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  const colorOf = (id: string) => SEAT_COLORS[Math.max(0, gameState.playerOrder.indexOf(id)) % SEAT_COLORS.length];

  if (gameState.status === 'finished') {
    const winner = sortedPlayers[0];
    return (
      <>
        <ResultPanel
          title="Loja përfundoi!"
          subtitle={winner ? `${winner.id === currentPlayerId ? 'Ti fitove' : `${winner.nickname} fitoi`} me ${winner.score} pikë` : undefined}
          actions={onRestartGame && (
            <button onClick={onRestartGame} className="gz-btn inline-flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer">
              <RotateCcw className="w-5 h-5" /> Luaj përsëri
            </button>
          )}
        >
          <ol className="space-y-1.5">
            {sortedPlayers.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${i === 0 ? 'bg-gold/15 border border-gold/40' : 'bg-white/5'}`}>
                <span className="w-6">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{p.id === currentPlayerId ? 'Ti' : p.nickname}</span>
                  <span className="block text-xs text-mute">{p.captured.length} letra · 🔥 {p.pishpiriks} pishpirikë (+{p.pishpirikPoints})</span>
                </span>
                <span className="font-display font-semibold text-gold tabular-nums">{p.score}</span>
              </li>
            ))}
          </ol>
        </ResultPanel>
        <GameKitStyles />
      </>
    );
  }

  const pile = gameState.table.slice(-4);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-3 px-1 pb-2">
      {/* lojtarët */}
      <div className="flex flex-wrap justify-center gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id];
          return (
            <PlayerChip key={id} id={id} name={p.nickname} me={id === currentPlayerId} bot={id.startsWith('BOT')} color={colorOf(id)}
              active={gameState.currentTurn === id}
              sub={<>{p.captured.length} letra · <Flame className="inline w-3 h-3 text-gold -mt-0.5" /> {p.pishpiriks}</>} />
          );
        })}
      </div>

      {/* tavolina */}
      <FeltTable tone="green" background={feltBackground(tableSkin)}>
        <div className="flex flex-col items-center gap-4 px-4 py-6 min-h-[250px] justify-center">
          <div className="flex items-center justify-center gap-8 sm:gap-14">
            <div className="flex flex-col items-center gap-1.5">
              {gameState.deck.length > 0 ? <CardBack label={<span className="text-lg">{gameState.deck.length}</span>} /> : <div className="gk-card gk-card-md opacity-30" />}
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/75">Pakoja</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative grid place-items-center" style={{ width: 'clamp(90px, 24vw, 130px)', height: 'clamp(100px, 26vw, 140px)' }}>
                {pile.length === 0 ? (
                  <span className="text-xs font-bold text-white/60 border-2 border-dashed border-white/30 rounded-xl px-3 py-8">Tavolina bosh</span>
                ) : pile.map((c, i) => (
                  <div key={c.id} className="absolute" style={{ transform: `rotate(${(i - pile.length + 1) * 9}deg) translate(${(i - pile.length + 1) * 6}px, 0)` }}>
                    <PlayingCard rank={c.rank} suit={c.suit} glow={i === pile.length - 1 && gameState.table.length === 1} />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/75">
                Në tavolinë: {gameState.table.length}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
            <span className="bg-black/30 text-white px-3 py-1 rounded-full">Raundi {gameState.round}</span>
            <span className={`px-3 py-1 rounded-full ${isMyTurn ? 'bg-gold text-[#2a1600]' : 'bg-black/30 text-white'}`}>
              {isMyTurn ? 'Radha jote!' : `Po luan: ${activePlayerName}`}
            </span>
          </div>
          <p className="text-center text-sm font-semibold text-white/90 max-w-md">{gameState.lastActionText}</p>
        </div>
      </FeltTable>

      {/* dora ime */}
      {me && (
        <div className="flex flex-col items-center">
          <p className={`text-xs font-bold ${isMyTurn ? 'text-gold' : 'text-mute'}`}>
            {isMyTurn ? 'Zgjidh një letër për ta hedhur' : 'Letrat e tua'}
          </p>
          <CardFan items={me.hand} keyOf={(c) => c.id} render={(card) => (
            <button onClick={() => handlePlayCard(card.id)} disabled={!isMyTurn} aria-label={`${card.rank} ${card.suit}`}
              className={`block rounded-[10px] ${isMyTurn ? 'cursor-pointer' : 'cursor-default'}`}>
              <PlayingCard rank={card.rank} suit={card.suit} glow={isMyTurn && !!topCard && card.rank === topCard.rank} />
            </button>
          )} />
        </div>
      )}
      <GameKitStyles />
    </div>
  );
}
