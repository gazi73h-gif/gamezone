'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  BOT_RUMMY_ID,
  RummyGameState,
  RummyTile,
  Suit,
  addToRummyMeld,
  discardRummyTile,
  drawRummyTile,
  evaluateSelectedMelds,
  findAllMeldsInHand,
  getPlayerMeldPoints,
  playRummyMeld,
  runBotRummyTurn,
} from '@/lib/rummyLogic';
import { recordWin } from '@/lib/supabase';
import {
  ChevronLeft,
  RotateCcw,
  Trophy,
  Smile,
  BarChart2,
  ListOrdered,
  X,
  Crown,
  Info,
  Sparkles,
} from 'lucide-react';

interface RummyGameProps {
  gameState: RummyGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (newState: RummyGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
  onLeaveRoom?: () => void;
}

const SUIT_DISPLAY: Record<Suit, { sym: string; color: string }> = {
  hearts: { sym: '♥', color: 'text-[#9e1b1b]' },
  diamonds: { sym: '♦', color: 'text-[#9e1b1b]' },
  spades: { sym: '♠', color: 'text-[#111827]' },
  clubs: { sym: '♣', color: 'text-[#111827]' },
};

function cardRank(n: number): string {
  if (n === 1) return 'A';
  if (n === 11) return 'J';
  if (n === 12) return 'Q';
  if (n === 13) return 'K';
  return String(n);
}

// Komponenti i letrës individuale me dizajnin e përputhur me fotot
function CardItem({
  tile,
  selected,
  isNew,
  horizontal,
  small,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  tile: RummyTile;
  selected?: boolean;
  isNew?: boolean;
  horizontal?: boolean;
  small?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  const suitInfo = SUIT_DISPLAY[tile.suit || 'spades'];

  const sizeClasses = horizontal
    ? 'w-[72px] h-[50px] sm:w-[86px] sm:h-[60px]'
    : small
    ? 'w-[38px] h-[56px] sm:w-[46px] sm:h-[68px]'
    : 'w-[48px] h-[72px] sm:w-[58px] sm:h-[88px] md:w-[64px] md:h-[96px]';

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative select-none rounded-[8px] sm:rounded-[10px] bg-[#fdfbf7] border border-[#d5ccbd] shadow-[0_4px_10px_rgba(0,0,0,0.55)] transition-all duration-200 cursor-pointer shrink-0 flex flex-col justify-between p-1 sm:p-1.5 ${sizeClasses} ${
        selected
          ? '-translate-y-5 ring-2 ring-amber-400 shadow-[0_12px_24px_rgba(251,191,36,0.5)] z-30'
          : ''
      } ${
        isNew
          ? 'ring-2 ring-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]'
          : 'hover:-translate-y-1.5'
      }`}
    >
      {tile.isJoker ? (
        <div className="w-full h-full rounded-[6px] border border-amber-400/60 bg-gradient-to-b from-amber-50 to-amber-100/60 flex flex-col items-center justify-center">
          <Crown className={small ? 'w-3 h-3 text-amber-600' : 'w-4 h-4 sm:w-5 sm:h-5 text-amber-600'} />
          <span className="text-[9px] sm:text-[10px] font-black tracking-tight text-amber-900 font-serif">
            JOL
          </span>
        </div>
      ) : horizontal ? (
        <div className="w-full h-full flex items-center justify-between px-1">
          <div className={`flex flex-col items-center leading-none font-black text-xs sm:text-sm ${suitInfo.color}`}>
            <span>{cardRank(tile.number)}</span>
            <span className="text-[11px] sm:text-xs">{suitInfo.sym}</span>
          </div>
          <div className={`leading-none text-xl sm:text-2xl ${suitInfo.color}`}>{suitInfo.sym}</div>
        </div>
      ) : (
        <>
          <div className={`flex flex-col items-start leading-none font-black ${suitInfo.color}`}>
            <span className={small ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm md:text-base'}>
              {cardRank(tile.number)}
            </span>
            <span className={small ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs'}>
              {suitInfo.sym}
            </span>
          </div>
          <div
            className={`self-end leading-none font-bold ${
              small ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl md:text-3xl'
            } ${suitInfo.color}`}
          >
            {suitInfo.sym}
          </div>
        </>
      )}
    </div>
  );
}

export default function RummyGame({
  gameState,
  currentPlayerId,
  isHost,
  onUpdateState,
  onRestartGame,
  onLeaveRoom,
}: RummyGameProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);

  const winRecordedRef = useRef(false);

  const isMyTurn = gameState.status === 'playing' && gameState.currentTurn === currentPlayerId;
  const me = gameState.players[currentPlayerId];

  const opponentId = gameState.playerOrder.find((id) => id !== currentPlayerId) || BOT_RUMMY_ID;
  const opponent = gameState.players[opponentId];

  // Pikët e meldeve në tavolinë
  const myPoints = me ? getPlayerMeldPoints(gameState, currentPlayerId) : 0;
  const opponentPoints = opponent ? getPlayerMeldPoints(gameState, opponentId) : 0;

  // 1. Llogaritja e kombinimeve të mundshme në të gjithë dorën
  const handMelds = useMemo(() => {
    if (!me) return [];
    return findAllMeldsInHand(me.hand);
  }, [me]);

  const handMeldPoints = useMemo(() => {
    return handMelds.reduce((sum, m) => sum + m.points, 0);
  }, [handMelds]);

  // 2. Llogaritja e kartave të zgjedhura manualisht
  const selectedTiles = useMemo(() => {
    if (!me) return [];
    return me.hand.filter((t) => selectedIds.includes(t.id));
  }, [me, selectedIds]);

  const selectedEval = useMemo(() => {
    return evaluateSelectedMelds(selectedTiles);
  }, [selectedTiles]);

  // Përcaktimi nëse lojtari mund të hapet tani
  const canOpenWithSelected =
    selectedIds.length >= 3 &&
    selectedEval.valid &&
    (me?.hasOpened || selectedEval.totalPoints >= 51);

  const canOpenWithHand = !me?.hasOpened ? handMeldPoints >= 51 : handMelds.length > 0;

  const canOpen = isMyTurn && gameState.hasDrawn && (canOpenWithSelected || canOpenWithHand);

  // Pikët që shfaqen në butonin "Vendos: min 51 — ke X"
  const displayPoints =
    selectedIds.length > 0
      ? selectedEval.valid
        ? selectedEval.totalPoints
        : 0
      : handMeldPoints;

  // Regjistro fitoren në Supabase
  useEffect(() => {
    if (gameState.status !== 'finished') {
      winRecordedRef.current = false;
      return;
    }
    if (!winRecordedRef.current && gameState.winnerId === currentPlayerId && gameState.winnerName) {
      winRecordedRef.current = true;
      recordWin(gameState.winnerName, 150, 'Rummy / Jol');
    }
  }, [gameState.status, gameState.winnerId, gameState.winnerName, currentPlayerId]);

  // Radhë automatike për Botin
  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost || gameState.currentTurn !== BOT_RUMMY_ID) return;
    const timer = setTimeout(async () => {
      await onUpdateState(runBotRummyTurn(gameState));
    }, 1100);
    return () => clearTimeout(timer);
  }, [gameState, isHost, onUpdateState]);

  // Pastrim mesazhi gabimi pas disa sekondash
  useEffect(() => {
    if (!errorToast) return;
    const t = setTimeout(() => setErrorToast(''), 3200);
    return () => clearTimeout(t);
  }, [errorToast]);

  const ensureOrder = (tiles: RummyTile[]) => {
    const ids = tiles.map((t) => t.id);
    const base = localOrder.filter((id) => ids.includes(id));
    for (const id of ids) {
      if (!base.includes(id)) base.push(id);
    }
    return base;
  };

  const hand: RummyTile[] = me
    ? me.hand.slice().sort((a, b) => {
        const ia = localOrder.indexOf(a.id);
        const ib = localOrder.indexOf(b.id);
        return ia !== -1 && ib !== -1 ? ia - ib : ia !== -1 ? -1 : ib !== -1 ? 1 : 0;
      })
    : [];

  const handleDrop = (targetId: string) => {
    if (!me || !dragId || dragId === targetId) return;
    const ord = ensureOrder(me.hand);
    const fromIdx = ord.indexOf(dragId);
    const toIdx = ord.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ord.splice(fromIdx, 1);
    ord.splice(toIdx, 0, dragId);
    setLocalOrder(ord);
    setDragId(null);
  };

  const toggleSelect = (id: string) => {
    setErrorToast('');
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const [sortMode, setSortMode] = useState<'run' | 'group'>('run');
  const handleSort = () => {
    if (!me) return;
    if (sortMode === 'run') {
      const sOrd: Record<Suit, number> = { hearts: 1, spades: 2, diamonds: 3, clubs: 4 };
      const sorted = me.hand
        .slice()
        .sort((a, b) =>
          a.isJoker
            ? 1
            : b.isJoker
            ? -1
            : sOrd[a.suit] - sOrd[b.suit] || a.number - b.number
        )
        .map((t) => t.id);
      setLocalOrder(sorted);
      setSortMode('group');
    } else {
      const sorted = me.hand
        .slice()
        .sort((a, b) => (a.isJoker ? 1 : b.isJoker ? -1 : a.number - b.number))
        .map((t) => t.id);
      setLocalOrder(sorted);
      setSortMode('run');
    }
  };

  const handleDraw = async (src: 'deck' | 'discard') => {
    if (!isMyTurn) {
      setErrorToast('Nuk është radha jote!');
      return;
    }
    if (gameState.hasDrawn) {
      setErrorToast('Tashmë ke tërhequr një letër!');
      return;
    }
    setErrorToast('');
    await onUpdateState(drawRummyTile(gameState, currentPlayerId, src));
  };

  // Veprimi i hapjes së letrave ("Vendos: min 51")
  const handlePlayMeld = async () => {
    if (!isMyTurn) {
      setErrorToast('Nuk është radha jote!');
      return;
    }
    if (!gameState.hasDrawn) {
      setErrorToast('Tërhiq një letër fillimisht para se të hapesh!');
      return;
    }

    // Nëse ka zgjedhur letra manualisht dhe ato janë të vlefshme
    if (selectedIds.length >= 3 && selectedEval.valid) {
      if (!me?.hasOpened && selectedEval.totalPoints < 51) {
        setErrorToast(
          `Kërkohen min. 51 pikë për t'u hapur! Këto letra kanë ${selectedEval.totalPoints} pikë.`
        );
        return;
      }
      const r = playRummyMeld(gameState, currentPlayerId, selectedIds);
      if (r.error) {
        setErrorToast(r.error);
        return;
      }
      setSelectedIds([]);
      await onUpdateState(r.state);
      return;
    }

    // Nëse nuk ka përzgjedhur manualisht por dora ka kombinime të mjaftueshme
    if (canOpenWithHand) {
      const r = playRummyMeld(gameState, currentPlayerId);
      if (r.error) {
        setErrorToast(r.error);
        return;
      }
      setSelectedIds([]);
      await onUpdateState(r.state);
      return;
    }

    if (selectedIds.length > 0 && !selectedEval.valid) {
      setErrorToast('Kombinimi i përzgjedhur nuk është i vlefshëm!');
    } else if (!me?.hasOpened) {
      setErrorToast(`Duhen të paktën 51 pikë për hapjen e parë! Aktualisht ke ${displayPoints} pikë.`);
    } else {
      setErrorToast('Zgjidh kombinimin me min. 3 letra për ta vendosur në tavolinë!');
    }
  };

  const handleAttachToMeld = async (meldId: string) => {
    if (!isMyTurn || selectedIds.length === 0) return;
    const r = addToRummyMeld(gameState, currentPlayerId, selectedIds, meldId);
    if (r.error) {
      setErrorToast(r.error);
      return;
    }
    setSelectedIds([]);
    await onUpdateState(r.state);
  };

  const handleDiscard = async (specificTileId?: string) => {
    if (!isMyTurn) {
      setErrorToast('Nuk është radha jote!');
      return;
    }
    if (!gameState.hasDrawn) {
      setErrorToast('Tërhiq një letër fillimisht!');
      return;
    }

    const tileIdToDiscard = specificTileId || (selectedIds.length === 1 ? selectedIds[0] : null);
    if (!tileIdToDiscard) {
      setErrorToast('Zgjidh saktësisht 1 letër për ta hedhur!');
      return;
    }

    setSelectedIds([]);
    await onUpdateState(discardRummyTile(gameState, currentPlayerId, tileIdToDiscard));
  };

  const sendEmojiReaction = (emoji: string) => {
    setActiveReaction(emoji);
    setShowEmojiPicker(false);
    setTimeout(() => setActiveReaction(null), 2500);
  };

  const topDiscard =
    gameState.discardPile.length > 0
      ? gameState.discardPile[gameState.discardPile.length - 1]
      : null;

  const opponentMelds = gameState.melds.filter((m) => m.ownerId === opponentId);
  const myMelds = gameState.melds.filter((m) => m.ownerId === currentPlayerId);

  return (
    <div className="relative w-full min-h-[600px] sm:min-h-[720px] bg-[#080d12] flex flex-col items-center justify-between p-2 sm:p-4 select-none font-sans overflow-hidden">
      {/* Toast njoftimi */}
      {errorToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1c1214] border border-red-500/80 text-red-200 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <Info className="w-4 h-4 text-red-400" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Reagimi me emoji */}
      {activeReaction && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-50 text-5xl sm:text-6xl animate-ping duration-1000">
          {activeReaction}
        </div>
      )}

      {/* Tavolina kryesore */}
      <div className="relative w-full max-w-[1100px] flex-1 bg-gradient-to-b from-[#0e1620] via-[#0b1118] to-[#070b10] border-[1.5px] border-[#c59a3f]/40 rounded-[32px] sm:rounded-[48px] shadow-[0_0_50px_rgba(0,0,0,0.85)] flex flex-col justify-between p-3 sm:p-6 overflow-hidden">
        
        {/* ===================== SHIRITI I SIPËRM ===================== */}
        <div className="w-full flex items-center justify-between relative z-20">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/5 rounded-full transition cursor-pointer"
            title="Kthehu"
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>

          {/* Kuti / Badge i kundërshtarit (sabajdin) */}
          {opponent && (
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bg-[#111822] border border-[#c59a3f]/70 px-3.5 sm:px-4 py-1.5 rounded-2xl flex items-center gap-2.5 sm:gap-3 shadow-lg">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1b2533] border border-[#c59a3f]/40 flex items-center justify-center text-[#d4af37] text-xs font-bold">
                {opponent.nickname.slice(0, 2).toUpperCase()}
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-white text-xs sm:text-sm font-bold tracking-tight">
                    {opponent.nickname}
                  </span>
                  <span className="text-[#c59a3f] text-[10px]">▸</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 text-slate-300">
                    <span className="text-amber-400">🂠</span> {opponent.hand.length}
                  </span>
                  <span className="bg-[#211d13] border border-[#856c27]/60 text-[#d4af37] px-1.5 py-0.2 rounded text-[9px] font-semibold">
                    {opponent.rank || 'Bronz'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Pikët e kundërshtarit në flori (57 PTS si në Image 003) */}
          <div className="flex flex-col items-end">
            {opponentPoints > 0 && (
              <span className="text-[#d4af37] font-extrabold text-sm sm:text-base tracking-wider drop-shadow-md">
                {opponentPoints} PTS
              </span>
            )}
          </div>
        </div>

        {/* Meldet e kundërshtarit lart djathtas */}
        {opponentMelds.length > 0 && (
          <div className="w-full flex justify-end pr-2 pt-2 gap-3 z-10">
            <div className="flex flex-col items-end gap-2 bg-black/20 p-2 rounded-2xl border border-[#c59a3f]/20">
              {opponentMelds.map((meld) => (
                <div
                  key={meld.id}
                  onClick={() => handleAttachToMeld(meld.id)}
                  className={`flex items-center -space-x-4 sm:-space-x-5 transition ${
                    isMyTurn && selectedIds.length > 0
                      ? 'hover:scale-105 cursor-pointer ring-1 ring-amber-400/50 rounded-lg p-0.5'
                      : ''
                  }`}
                  title="Kliko për të shtuar letra"
                >
                  {meld.tiles.map((t) => (
                    <CardItem key={t.id} tile={t} small />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================== ZONA QENDRORE ===================== */}
        <div className="relative my-auto flex flex-col items-center justify-center py-3 w-full z-10">
          <div className="flex items-center justify-center gap-3 sm:gap-5 mb-3">
            {/* Kuverta JOL */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                onClick={() => handleDraw('deck')}
                className={`relative w-[52px] h-[76px] sm:w-[62px] sm:h-[90px] rounded-[10px] bg-[#141d27] border-[1.5px] border-[#c59a3f]/80 shadow-[0_8px_20px_rgba(0,0,0,0.7)] flex flex-col items-center justify-center transition-all ${
                  isMyTurn && !gameState.hasDrawn
                    ? 'ring-2 ring-amber-400 cursor-pointer hover:scale-105'
                    : 'opacity-90'
                }`}
                title="Tërhiq letër nga kuverta"
              >
                <div className="absolute -bottom-1 -right-1 w-full h-full rounded-[10px] bg-[#0e1620] border border-[#c59a3f]/40 -z-10" />
                <span className="text-[#c59a3f]/40 text-lg sm:text-xl">♠</span>
                <span className="text-[#d4af37] font-serif italic font-bold text-xs sm:text-sm tracking-wider">
                  JOL
                </span>
              </div>
              <div className="bg-[#0b1017] border border-[#c59a3f]/60 px-2 py-0.5 rounded-full text-[#d4af37] text-[10px] font-bold shadow">
                {gameState.deck.length}
              </div>
            </div>

            {/* Karta e hapur horizontale */}
            {gameState.starterCard && (
              <div className="flex items-center justify-center">
                <CardItem tile={gameState.starterCard} horizontal />
              </div>
            )}

            {/* Vendi i letrave të hedhura */}
            <div className="flex items-center justify-center">
              {topDiscard ? (
                <div
                  onClick={() => {
                    if (isMyTurn && !gameState.hasDrawn) {
                      handleDraw('discard');
                    } else if (isMyTurn && gameState.hasDrawn && selectedIds.length === 1) {
                      handleDiscard();
                    }
                  }}
                  className={`transition-all ${
                    isMyTurn && !gameState.hasDrawn
                      ? 'ring-2 ring-amber-400 cursor-pointer hover:scale-105'
                      : isMyTurn && gameState.hasDrawn && selectedIds.length === 1
                      ? 'ring-2 ring-emerald-400 cursor-pointer hover:scale-105'
                      : ''
                  }`}
                  title={
                    !gameState.hasDrawn
                      ? 'Kliko për të tërhequr letrën e hedhur'
                      : 'Kliko për të hedhur letrën e përzgjedhur'
                  }
                >
                  <CardItem tile={topDiscard} />
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (isMyTurn && gameState.hasDrawn && selectedIds.length === 1) {
                      handleDiscard();
                    }
                  }}
                  className={`w-[52px] h-[76px] sm:w-[62px] sm:h-[90px] rounded-[10px] border border-dashed border-slate-700/60 bg-black/20 flex items-center justify-center text-slate-500 text-[10px] ${
                    isMyTurn && gameState.hasDrawn && selectedIds.length === 1
                      ? 'border-amber-400/80 cursor-pointer hover:bg-amber-400/10'
                      : ''
                  }`}
                >
                  Bosh
                </div>
              )}
            </div>
          </div>

          {/* Teksti udhëzues i radhës */}
          <div className="bg-[#0d141d] border border-[#c59a3f]/70 px-4 sm:px-6 py-1.5 rounded-full shadow-lg">
            <span className="text-[#d4af37] text-xs sm:text-sm font-semibold tracking-wide">
              {isMyTurn
                ? !gameState.hasDrawn
                  ? 'Radha jote — tërhiq'
                  : canOpen
                  ? `Radha jote — mund të hapesh (${displayPoints} pikë)!`
                  : 'Radha jote — vendos ose hidh'
                : `Radha e ${gameState.players[gameState.currentTurn]?.nickname || 'kundërshtarit'}`}
            </span>
          </div>

          {/* Butoni "Meld / Open Hand" (Vendos: min 51) - Aktiv vetëm kur arrihen 51+ pikë */}
          <div className="w-full flex justify-end pr-2 sm:pr-8 mt-2 sm:mt-1">
            <button
              type="button"
              onClick={handlePlayMeld}
              disabled={!canOpen}
              aria-label="Meld / Open Hand"
              className={`border-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-xl transition-all ${
                canOpen
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200 ring-4 ring-amber-400/60 shadow-[0_0_25px_rgba(251,191,36,0.5)] animate-pulse hover:scale-105 cursor-pointer'
                  : 'border-slate-800 bg-[#0d141e]/80 text-slate-500 opacity-60 cursor-not-allowed'
              }`}
            >
              {canOpen
                ? me?.hasOpened
                  ? `✨ Vendos / Meld (${displayPoints} PTS)`
                  : `✨ Hap Letrat / Meld (${displayPoints} PTS)`
                : me?.hasOpened
                ? `Vendos / Meld${displayPoints > 0 ? ` — ke ${displayPoints}` : ''}`
                : `Vendos / Meld: min 51 — ke ${displayPoints}`}
            </button>
          </div>
        </div>

        {/* Meldet e mia të vendosura në tavolinë (81 PTS si në Image 003) */}
        {myMelds.length > 0 && (
          <div className="w-full flex items-center gap-4 px-2 py-2 mb-2 bg-black/15 rounded-2xl border border-[#c59a3f]/20 z-10 overflow-x-auto">
            <div className="text-[#d4af37] font-extrabold text-sm sm:text-base tracking-wider shrink-0 pl-1">
              {myPoints} PTS
            </div>
            <div className="flex items-center gap-3 overflow-x-auto py-1">
              {myMelds.map((meld) => (
                <div
                  key={meld.id}
                  onClick={() => handleAttachToMeld(meld.id)}
                  className={`flex items-center -space-x-4 sm:-space-x-5 transition shrink-0 ${
                    isMyTurn && selectedIds.length > 0
                      ? 'hover:scale-105 cursor-pointer ring-1 ring-amber-400/50 rounded-lg p-0.5'
                      : ''
                  }`}
                  title="Kliko për të shtuar letra"
                >
                  {meld.tiles.map((t) => (
                    <CardItem key={t.id} tile={t} small />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Njoftim ndihmës kur bëhen 51 pikë */}
        {isMyTurn && gameState.hasDrawn && canOpen && !me?.hasOpened && (
          <div
            onClick={handlePlayMeld}
            className="w-full max-w-md mx-auto my-1 bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400/70 py-1.5 px-3 rounded-full text-center text-[#fbbf24] text-xs font-bold shadow-lg cursor-pointer hover:scale-102 transition flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Ke {displayPoints} pikë! Kliko këtu ose te &quot;Hap Letrat / Meld&quot; për t&apos;i hapur letrat.</span>
          </div>
        )}

        {/* ===================== SHIRITI I POSHTËM (DORA & KONTROLLET) ===================== */}
        <div className="w-full flex items-end justify-between relative z-20 pt-1">
          {/* Ikonat majtas: Emoji dhe Statistikat */}
          <div className="flex flex-col gap-2 shrink-0 pb-1">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#121922] border border-[#c59a3f]/70 flex items-center justify-center text-[#d4af37] hover:bg-[#1a2330] hover:scale-105 transition shadow-lg cursor-pointer"
              title="Dërgo reagim"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowStatsModal(true)}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#121922] border border-[#c59a3f]/70 flex items-center justify-center text-[#d4af37] hover:bg-[#1a2330] hover:scale-105 transition shadow-lg cursor-pointer"
              title="Statistikat e lojës"
            >
              <BarChart2 className="w-5 h-5" />
            </button>
          </div>

          {/* Dora e plotë e lojtarit */}
          <div className="flex-1 flex justify-center items-end px-1 sm:px-3 overflow-x-auto min-h-[90px] sm:min-h-[110px] pb-1">
            <div className="flex items-end -space-x-4 sm:-space-x-6 md:-space-x-7 pt-5">
              {hand.map((tile) => (
                <CardItem
                  key={tile.id}
                  tile={tile}
                  selected={selectedIds.includes(tile.id)}
                  isNew={isMyTurn && gameState.lastDrawnTileId === tile.id}
                  onClick={() => toggleSelect(tile.id)}
                  onDoubleClick={() => {
                    if (isMyTurn && gameState.hasDrawn) {
                      handleDiscard(tile.id);
                    }
                  }}
                  draggable
                  onDragStart={() => setDragId(tile.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(tile.id)}
                />
              ))}
            </div>
          </div>

          {/* Butonat djathtas: Hidh dhe Rendit */}
          <div className="flex flex-col items-end gap-2 shrink-0 pb-1">
            {isMyTurn && gameState.hasDrawn && selectedIds.length === 1 && (
              <button
                type="button"
                onClick={() => handleDiscard()}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] sm:text-xs px-3 py-1.5 rounded-xl shadow-lg transition cursor-pointer animate-pulse"
              >
                Hidh Letrën
              </button>
            )}

            <button
              type="button"
              onClick={handleSort}
              className="bg-[#121922] border border-[#c59a3f]/70 px-3 py-2 rounded-xl flex flex-col items-center justify-center text-[#d4af37] hover:bg-[#1a2330] hover:scale-105 transition shadow-lg cursor-pointer min-w-[56px] sm:min-w-[64px]"
              title="Rendit dorën"
            >
              <ListOrdered className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
              <span className="text-[10px] sm:text-xs font-bold">Rendit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modali i Emojive */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-6 z-50 bg-[#121922] border border-[#c59a3f] p-3 rounded-2xl shadow-2xl flex gap-2">
          {['😂', '👍', '🔥', '👏', '🍀', '👑', '😎', '🤐'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendEmojiReaction(emoji)}
              className="text-2xl hover:scale-125 transition cursor-pointer p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Modali i Statistikave dhe Rregullave */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f1722] border border-[#c59a3f] rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base sm:text-lg font-bold text-[#d4af37] flex items-center gap-2">
                <BarChart2 className="w-5 h-5" />
                Statistikat & Rregullat
              </h3>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-2">
              <div className="text-xs uppercase text-slate-400 font-bold tracking-wider mb-1">
                Lojtarët në tavolinë
              </div>
              {gameState.playerOrder.map((id) => {
                const p = gameState.players[id];
                const pts = getPlayerMeldPoints(gameState, id);
                const isCurrent = gameState.currentTurn === id;
                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      isCurrent
                        ? 'bg-amber-500/10 border-amber-400/50'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{p.nickname}</span>
                      <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-500/30">
                        {p.rank || 'Bronz'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">🂠 {p.hand.length} letra</span>
                      <span className="font-bold text-[#d4af37]">{pts} PTS</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-black/30 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <div className="font-bold text-[#d4af37] text-xs mb-1">Rregullat e Remi 51 (JOL):</div>
              <p>• Hapja e parë kërkon të paktën 51 pikë në sekuenca ose grupe.</p>
              <p>• Sapo dora arrin 51 pikë, butoni &quot;Vendos&quot; aktivizohet për t&apos;i hapur letrat në tavolinë.</p>
              <p>• Kartat JOL (Xhoker) zëvendësojnë çdo letër në kombinim.</p>
              <p>• Pasi të hapesh, mund të shtosh letra te kombinimet ekzistuese në tavolinë.</p>
              <p>• Çdo radhë nis me tërheqje dhe përfundon me hedhjen e 1 letre.</p>
            </div>
          </div>
        </div>
      )}

      {/* Modali i Fitores */}
      {gameState.status === 'finished' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f1722] border-2 border-[#c59a3f] rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(212,175,55,0.4)] animate-in fade-in zoom-in duration-300">
            <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-bounce" />
            <h2 className="text-2xl font-black text-white mb-1">JOL! FITORE!</h2>
            <p className="text-amber-300 font-bold text-sm mb-4">
              {gameState.winnerName} fitoi lojën (+150 pikë)!
            </p>

            {isHost && onRestartGame && (
              <button
                type="button"
                onClick={onRestartGame}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3 rounded-2xl shadow-xl transition cursor-pointer text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Luaj Përsëri
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
