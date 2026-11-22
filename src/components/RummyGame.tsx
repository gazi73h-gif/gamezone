'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  RotateCcw,
  Trophy,
  Menu,
  FileText,
  MessageSquare,
  Crown,
  X,
  Clock,
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

const SUIT_DISPLAY: Record<Suit, { sym: string; color: string; isRed: boolean }> = {
  hearts: { sym: '♥', color: 'text-[#d62828]', isRed: true },
  diamonds: { sym: '♦', color: 'text-[#d62828]', isRed: true },
  spades: { sym: '♠', color: 'text-[#1c1917]', isRed: false },
  clubs: { sym: '♣', color: 'text-[#1c1917]', isRed: false },
};

function cardRank(n: number): string {
  if (n === 1) return 'A';
  if (n === 11) return 'J';
  if (n === 12) return 'Q';
  if (n === 13) return 'K';
  return String(n);
}

// Ngjyrat e rrethit të meldeve (Meld 1 = Cyan, Meld 2 = Green, Meld 3 = Gold)
const GROUP_COLORS = [
  { border: 'border-[#00b4d8] text-[#0077b6]', bg: 'bg-[#caf0f8]/30', gradient: 'from-white via-white to-[#caf0f8]' },
  { border: 'border-[#22c55e] text-[#15803d]', bg: 'bg-[#dcfce7]/30', gradient: 'from-white via-white to-[#dcfce7]' },
  { border: 'border-[#f59e0b] text-[#b45309]', bg: 'bg-[#fef3c7]/30', gradient: 'from-white via-white to-[#fef3c7]' },
];

function CourtCardArt({ rank, isRed }: { rank: string; isRed: boolean }) {
  if (rank === 'Q') {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center p-0.5 pointer-events-none">
        <svg viewBox="0 0 48 56" className="w-full h-full max-h-[46px] drop-shadow-sm">
          <ellipse cx="24" cy="22" rx="10" ry="12" fill="#fed7aa" />
          <path d="M14 20 Q24 8 34 20 Q36 34 30 44 L18 44 Q12 34 14 20 Z" fill={isRed ? '#e11d48' : '#2563eb'} />
          <ellipse cx="24" cy="24" rx="7" ry="8" fill="#ffedd5" />
          <circle cx="21" cy="22" r="1.2" fill="#1e293b" />
          <circle cx="27" cy="22" r="1.2" fill="#1e293b" />
          <path d="M21 27 Q24 30 27 27" stroke="#e11d48" strokeWidth="1.2" fill="none" />
          <path d="M16 40 L32 40 L34 54 L14 54 Z" fill={isRed ? '#be123c' : '#1d4ed8'} />
          <circle cx="20" cy="46" r="1" fill="#fef08a" />
          <circle cx="24" cy="48" r="1" fill="#fef08a" />
          <circle cx="28" cy="46" r="1" fill="#fef08a" />
        </svg>
      </div>
    );
  }
  if (rank === 'J' || rank === 'K') {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center p-0.5 pointer-events-none">
        <svg viewBox="0 0 48 56" className="w-full h-full max-h-[46px] drop-shadow-sm">
          <rect x="18" y="10" width="12" height="4" fill="#f59e0b" />
          <polygon points="16,10 20,4 24,9 28,4 32,10" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />
          <ellipse cx="24" cy="22" rx="9" ry="10" fill="#fed7aa" />
          <circle cx="21" cy="20" r="1.2" fill="#1e293b" />
          <circle cx="27" cy="20" r="1.2" fill="#1e293b" />
          <path d="M20 25 Q24 27 28 25" stroke="#991b1b" strokeWidth="1" fill="none" />
          <path d="M19 14 L20 18 L28 18 L29 14 Z" fill="#fef08a" />
          <path d="M15 32 L33 32 L35 54 L13 54 Z" fill={isRed ? '#b91c1c' : '#1e3a8a'} />
          <line x1="24" y1="32" x2="24" y2="54" stroke="#fef08a" strokeWidth="2" />
        </svg>
      </div>
    );
  }
  return null;
}

function CasinoCardItem({
  tile,
  selected,
  isNew,
  small,
  groupColorIdx,
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
  small?: boolean;
  groupColorIdx?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  const suitInfo = SUIT_DISPLAY[tile.suit || 'spades'];
  const rankStr = cardRank(tile.number);
  const isCourt = tile.number >= 11 && tile.number <= 13;

  const groupStyle = groupColorIdx !== undefined && groupColorIdx >= 0 ? GROUP_COLORS[groupColorIdx % GROUP_COLORS.length] : null;

  // Madhësi responsive për telefon dhe desktop
  const sizeClass = small
    ? 'w-[36px] h-[54px] sm:w-[46px] sm:h-[68px] p-0.5 sm:p-1'
    : 'w-[42px] h-[66px] sm:w-[56px] sm:h-[86px] md:w-[68px] md:h-[102px] p-1 sm:p-1.5';

  const bgGradient = groupStyle ? groupStyle.gradient : 'from-white via-[#fafafa] to-[#f4f4f5]';

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative select-none rounded-[8px] sm:rounded-[12px] bg-gradient-to-b ${bgGradient} border border-[#d1d5db] shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-all duration-200 cursor-pointer shrink-0 flex flex-col justify-between overflow-hidden ${sizeClass} ${
        selected ? '-translate-y-5 sm:-translate-y-6 scale-105 ring-4 ring-amber-400 shadow-[0_12px_24px_rgba(251,191,36,0.6)] z-30' : 'hover:-translate-y-1.5'
      } ${isNew ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]' : ''}`}
    >
      {tile.isJoker ? (
        <div className="w-full h-full rounded-[6px] sm:rounded-[8px] bg-gradient-to-b from-amber-50 to-amber-200 border border-amber-400/80 flex flex-col items-center justify-center">
          <Crown className={small ? 'w-3.5 h-3.5 text-amber-600' : 'w-5 h-5 sm:w-7 sm:h-7 text-amber-600 animate-pulse'} />
          <span className="text-[8px] sm:text-[10px] font-black tracking-wider text-amber-950 font-serif mt-0.5">JOL</span>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center self-start leading-none font-black">
            {groupStyle ? (
              <div
                className={`w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full border-[1.5px] sm:border-2 ${groupStyle.border} flex items-center justify-center font-black ${
                  small ? 'text-[8px]' : 'text-[10px] sm:text-xs'
                }`}
              >
                {rankStr}
              </div>
            ) : (
              <span className={`font-black tracking-tight ${small ? 'text-[9px]' : 'text-[11px] sm:text-sm'} ${suitInfo.color}`}>
                {rankStr}
              </span>
            )}
            <span className={`leading-none mt-0.5 ${small ? 'text-[8px]' : 'text-[10px] sm:text-xs'} ${suitInfo.color}`}>
              {suitInfo.sym}
            </span>
          </div>

          {isCourt ? (
            <CourtCardArt rank={rankStr} isRed={suitInfo.isRed} />
          ) : (
            <div className={`self-end font-black leading-none ${small ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl md:text-3xl'} ${suitInfo.color}`}>
              {suitInfo.sym}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CasinoDeckBack({ count, onClick, active }: { count: number; onClick: () => void; active: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={onClick}>
      <div
        className={`relative w-[44px] h-[68px] sm:w-[58px] sm:h-[88px] md:w-[68px] md:h-[102px] rounded-[8px] sm:rounded-[12px] bg-[#d90429] border-2 border-white shadow-[0_6px_16px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden transition-all ${
          active ? 'ring-4 ring-amber-400 scale-105 animate-pulse' : 'hover:scale-102'
        }`}
      >
        <div className="w-[85%] h-[88%] rounded-[6px] border border-dashed border-white/60 bg-[#ef233c] flex flex-wrap items-center justify-center p-0.5 gap-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="text-white/40 text-[8px] sm:text-[10px] leading-none">
              ♣
            </span>
          ))}
        </div>
        <div className="absolute -bottom-1 -right-1 w-full h-full rounded-[8px] bg-[#9b2226] border border-white/40 -z-10" />
      </div>
      <div className="bg-[#1e1b4b] border border-[#caa764] px-2 py-0.2 rounded-full text-white font-black text-[10px] sm:text-xs shadow">
        {count}
      </div>
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
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [showChatPopup, setShowChatPopup] = useState<boolean>(false);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);

  // Kohëmatësi 15 sekonda për hedhje automatike
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number>(15);
  const autoDiscardHandledRef = useRef<boolean>(false);

  const winRecordedRef = useRef(false);

  const isMyTurn = gameState.status === 'playing' && gameState.currentTurn === currentPlayerId;
  const me = gameState.players[currentPlayerId];

  const opponentId = gameState.playerOrder.find((id) => id !== currentPlayerId) || BOT_RUMMY_ID;
  const opponent = gameState.players[opponentId];

  const myPoints = me ? getPlayerMeldPoints(gameState, currentPlayerId) : 0;

  // Gjej të gjitha meldet e mundshme në dorë
  const handMelds = useMemo(() => {
    if (!me) return [];
    return findAllMeldsInHand(me.hand);
  }, [me]);

  const handMeldPoints = useMemo(() => {
    return handMelds.reduce((sum, m) => sum + m.points, 0);
  }, [handMelds]);

  const meldedTileColorMap = useMemo(() => {
    const map = new Map<string, number>();
    handMelds.forEach((m, idx) => {
      m.tiles.forEach((t) => map.set(t.id, idx));
    });
    return map;
  }, [handMelds]);

  const deadwoodPoints = useMemo(() => {
    if (!me) return 0;
    const meldedIds = new Set(handMelds.flatMap((m) => m.tiles.map((t) => t.id)));
    return me.hand
      .filter((t) => !meldedIds.has(t.id))
      .reduce((sum, t) => sum + (t.isJoker ? 0 : t.number === 1 ? 1 : Math.min(t.number, 10)), 0);
  }, [me, handMelds]);

  const selectedTiles = useMemo(() => {
    if (!me) return [];
    return me.hand.filter((t) => selectedIds.includes(t.id));
  }, [me, selectedIds]);

  const selectedEval = useMemo(() => {
    return evaluateSelectedMelds(selectedTiles);
  }, [selectedTiles]);

  const canOpenWithSelected =
    selectedIds.length >= 3 &&
    selectedEval.valid &&
    (me?.hasOpened || selectedEval.totalPoints >= 51);

  const canOpenWithHand = !me?.hasOpened ? handMeldPoints >= 51 : handMelds.length > 0;

  const canOpen = isMyTurn && gameState.hasDrawn && (canOpenWithSelected || canOpenWithHand);

  const displayMeldPoints =
    selectedIds.length > 0
      ? selectedEval.valid
        ? selectedEval.totalPoints
        : 0
      : handMeldPoints;

  // Letra e vetme e përzgjedhur (nëse ka)
  const singleSelectedTile = selectedTiles.length === 1 ? selectedTiles[0] : null;

  // Rivendos kohëmatësin 15 sekonda sa herë ndryshon radha ose tërhiqet letër
  useEffect(() => {
    setTurnSecondsLeft(15);
    autoDiscardHandledRef.current = false;
  }, [gameState.currentTurn, gameState.hasDrawn]);

  // Veprimi i hedhjes së letrës
  const handleDiscard = useCallback(
    async (specificTileId?: string) => {
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
        setErrorToast('Zgjidh një letër për ta hedhur!');
        return;
      }
      setSelectedIds([]);
      await onUpdateState(discardRummyTile(gameState, currentPlayerId, tileIdToDiscard));
    },
    [isMyTurn, gameState, selectedIds, currentPlayerId, onUpdateState]
  );

  // Monitorimi i kohëmatësit 15 sekonda për hedhje automatike të letrës
  useEffect(() => {
    if (gameState.status !== 'playing') return;

    const timer = setInterval(async () => {
      setTurnSecondsLeft((prev) => {
        if (prev <= 1) {
          // Koha mbaroi (15 sekonda) -> kryej hedhjen automatike të një letre
          if (!autoDiscardHandledRef.current) {
            autoDiscardHandledRef.current = true;

            const turnPlayerId = gameState.currentTurn;
            const turnPlayer = gameState.players[turnPlayerId];

            if (turnPlayer && turnPlayer.hand.length > 0) {
              // Vetëm lojtari i radhës (ose hosti nëse është bot/kundërshtar) ekzekuton përditësimin
              if (turnPlayerId === currentPlayerId || (isHost && turnPlayerId !== currentPlayerId)) {
                let s = gameState;
                // Nëse nuk ka tërhequr ende brenda 15s, tërhiq automatikisht nga kuverta
                if (!s.hasDrawn) {
                  s = drawRummyTile(s, turnPlayerId, 'deck');
                }
                const updatedP = s.players[turnPlayerId];
                if (updatedP && updatedP.hand.length > 0) {
                  // Zgjidh një letër jo-xhoker rastësore ose letrën e parë
                  const nonJokers = updatedP.hand.filter((t) => !t.isJoker);
                  const dropCard = nonJokers.length > 0
                    ? nonJokers[Math.floor(Math.random() * nonJokers.length)]
                    : updatedP.hand[0];

                  onUpdateState(discardRummyTile(s, turnPlayerId, dropCard.id));
                }
              }
            }
          }
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentPlayerId, isHost, onUpdateState]);

  // Regjistro fitoren
  useEffect(() => {
    if (gameState.status !== 'finished') {
      winRecordedRef.current = false;
      return;
    }
    if (!winRecordedRef.current && gameState.winnerId === currentPlayerId && gameState.winnerName) {
      winRecordedRef.current = true;
      recordWin(gameState.winnerName, 150, 'Rummy / Remi');
    }
  }, [gameState.status, gameState.winnerId, gameState.winnerName, currentPlayerId]);

  // Radhë automatike për Botin
  useEffect(() => {
    if (gameState.status !== 'playing' || !isHost || gameState.currentTurn !== BOT_RUMMY_ID) return;
    const timer = setTimeout(async () => {
      await onUpdateState(runBotRummyTurn(gameState));
    }, 1200);
    return () => clearTimeout(timer);
  }, [gameState, isHost, onUpdateState]);

  useEffect(() => {
    if (!errorToast) return;
    const t = setTimeout(() => setErrorToast(''), 3000);
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

  const handleSort = () => {
    if (!me) return;
    const sOrd: Record<Suit, number> = { spades: 1, clubs: 2, diamonds: 3, hearts: 4 };
    const sorted = me.hand
      .slice()
      .sort((a, b) => (a.isJoker ? 1 : b.isJoker ? -1 : sOrd[a.suit] - sOrd[b.suit] || a.number - b.number))
      .map((t) => t.id);
    setLocalOrder(sorted);
  };

  const handleDraw = async (src: 'deck' | 'discard') => {
    if (!isMyTurn) {
      setErrorToast('Nuk është radha jote!');
      return;
    }
    if (gameState.hasDrawn) {
      setErrorToast('Tashmë ke tërhequr letër!');
      return;
    }
    setErrorToast('');
    await onUpdateState(drawRummyTile(gameState, currentPlayerId, src));
  };

  const handlePlayMeld = async () => {
    if (!canOpen) {
      if (!me?.hasOpened && displayMeldPoints < 51) {
        setErrorToast(`Kërkohen min. 51 pikë për t'u hapur! Aktualisht ke ${displayMeldPoints} pikë.`);
      } else {
        setErrorToast('Zgjidh kombinimin me min. 3 letra për ta hapur!');
      }
      return;
    }

    if (selectedIds.length >= 3 && selectedEval.valid) {
      const r = playRummyMeld(gameState, currentPlayerId, selectedIds);
      if (r.error) {
        setErrorToast(r.error);
        return;
      }
      setSelectedIds([]);
      await onUpdateState(r.state);
      return;
    }

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

  const sendReaction = (emoji: string) => {
    setActiveReaction(emoji);
    setShowChatPopup(false);
    setTimeout(() => setActiveReaction(null), 2500);
  };

  const topDiscard =
    gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;

  const myMelds = gameState.melds.filter((m) => m.ownerId === currentPlayerId);

  return (
    <div className="relative w-full min-h-screen bg-[#004e92] bg-[radial-gradient(#0066b2_1px,transparent_1px)] [background-size:16px_16px] flex flex-col items-center justify-between p-1 sm:p-3 select-none font-sans overflow-x-hidden">
      
      {/* Toast njoftimi */}
      {errorToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e1b4b] border-2 border-red-500 text-white font-bold px-4 py-2 rounded-2xl text-xs sm:text-sm shadow-2xl animate-bounce whitespace-nowrap">
          {errorToast}
        </div>
      )}

      {/* Emoji i animuar */}
      {activeReaction && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-50 text-5xl sm:text-6xl animate-ping duration-1000">
          {activeReaction}
        </div>
      )}

      {/* ===================== SHIRITI I SIPËRM ===================== */}
      <div className="w-full max-w-6xl flex items-center justify-between px-1.5 py-1 z-20">
        
        {/* Majtas: Room Pot & Piggy */}
        <div className="flex items-center gap-1.5">
          <div className="bg-[#451a03] border-2 border-[#ca8a04] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl flex flex-col items-center shadow-lg">
            <span className="text-[7px] sm:text-[9px] uppercase font-black text-amber-200 tracking-wider">ROOM POT</span>
            <span className="text-[11px] sm:text-sm font-black text-amber-400">1.34M</span>
          </div>

          <div className="hidden sm:flex bg-[#581c87]/90 border border-[#a855f7] p-1 rounded-xl items-center gap-1 shadow-md">
            <span className="text-sm">🐷</span>
            <div className="flex flex-col leading-none">
              <span className="text-[8px] text-purple-200 font-bold">Max 10M</span>
              <span className="text-[9px] text-amber-300 font-extrabold">🪙 50K</span>
            </div>
          </div>
        </div>

        {/* Qendër: Profili i Kundërshtarit */}
        {opponent && (
          <div className="relative flex items-center bg-[#4a044e]/95 border-2 border-amber-400 px-2.5 sm:px-4 py-0.5 rounded-full shadow-[0_0_15px_rgba(251,191,36,0.6)]">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-[9px] shadow border border-white -ml-1.5">
              ⭐ 20
            </div>
            <span className="text-white font-black text-xs sm:text-sm tracking-wide mx-1.5 truncate max-w-[90px] sm:max-w-[140px]">
              {opponent.nickname}
            </span>
            <div className="bg-[#2e1065] border border-amber-400/80 px-1.5 py-0.2 rounded-full text-[9px] sm:text-xs font-black text-amber-300">
              🪙 830K
            </div>
          </div>
        )}

        {/* Djathtas: Menu dhe Dalja */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowMenu(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-b from-[#7e22ce] to-[#581c87] border-2 border-amber-400 flex items-center justify-center text-white cursor-pointer shadow-lg hover:scale-105"
            title="Menu & Rregullat"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===================== TAVOLINA E KAZINOSË (EMERALD GREEN) ===================== */}
      <div className="relative w-full max-w-[1050px] flex-1 my-0.5 sm:my-1 bg-[radial-gradient(ellipse_at_center,_#2ec85a_0%,_#169c3e_55%,_#0b6623_100%)] border-[8px] sm:border-[14px] border-[#22160d] ring-2 sm:ring-4 ring-[#caa764] rounded-[36px] sm:rounded-[80px] shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col justify-between p-2 sm:p-4 overflow-hidden">
        
        {/* Zona e sipërme e tavolinës me Rrotën POT & Kohëmatësin 15s */}
        <div className="w-full flex items-center justify-between px-1 sm:px-4 relative z-10 pt-1">
          
          {/* Majtas: POT me kohëmatësin 15 sekonda */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-[#1b1109] border-2 sm:border-4 border-[#caa764] shadow-[0_8px_20px_rgba(0,0,0,0.7)] flex items-center justify-center">
              
              {/* Unaza rrethore me ngjyrë të kuqe kur mbaron koha */}
              <div
                className={`absolute inset-1 rounded-full border-2 sm:border-4 ${
                  turnSecondsLeft <= 5 ? 'border-red-500 animate-pulse' : 'border-[#22c55e]'
                } border-t-transparent animate-spin duration-3000 opacity-80`}
              />

              {/* Kohëmatësi 15s me shkëlqim */}
              <div className="flex flex-col items-center justify-center text-center p-0.5">
                <span className="text-[7px] sm:text-[9px] font-black uppercase text-amber-200">POT</span>
                <span className="text-[10px] sm:text-xs font-black text-amber-400">🪙 200K</span>
                
                {/* Treguesi i sekondave 15s */}
                <div
                  className={`mt-0.5 px-1.5 py-0.2 rounded-full text-[8px] sm:text-[10px] font-black flex items-center gap-0.5 ${
                    turnSecondsLeft <= 5
                      ? 'bg-red-600 text-white animate-ping'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-400/50'
                  }`}
                >
                  <Clock className="w-2.5 h-2.5" />
                  <span>{turnSecondsLeft}s</span>
                </div>
              </div>
            </div>

            {/* Tre pikat jeshile */}
            <div className="flex items-center gap-1 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            </div>
          </div>

          {/* Qendër-Djathtas: Tabakaja e letrave (Discard & Closed Deck) */}
          <div className="flex items-center gap-3 sm:gap-5 bg-black/25 p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl border border-white/20 shadow-inner">
            {/* Karta e hedhur */}
            <div className="flex flex-col items-center">
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
                      ? 'ring-4 ring-amber-400 scale-105 cursor-pointer'
                      : isMyTurn && gameState.hasDrawn && selectedIds.length === 1
                      ? 'ring-4 ring-emerald-400 scale-105 cursor-pointer'
                      : ''
                  }`}
                  title={!gameState.hasDrawn ? 'Tërhiq letrën e hedhur' : 'Kliko për të hedhur këtu letrën e zgjedhur'}
                >
                  <CasinoCardItem tile={topDiscard} />
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (isMyTurn && gameState.hasDrawn && selectedIds.length === 1) {
                      handleDiscard();
                    }
                  }}
                  className={`w-[42px] h-[66px] sm:w-[56px] sm:h-[86px] rounded-[8px] sm:rounded-[10px] border-2 border-dashed border-white/40 bg-black/30 flex items-center justify-center text-white/60 text-[10px] font-bold ${
                    isMyTurn && gameState.hasDrawn && selectedIds.length === 1 ? 'border-amber-400 cursor-pointer bg-amber-400/20' : ''
                  }`}
                >
                  Bosh
                </div>
              )}
            </div>

            {/* Kuverta e kuqe me model */}
            <CasinoDeckBack
              count={gameState.deck.length}
              onClick={() => handleDraw('deck')}
              active={Boolean(isMyTurn && !gameState.hasDrawn)}
            />
          </div>

          {/* Kolona e pikëve vertikale */}
          <div className="hidden sm:flex flex-col items-center bg-[#1e1b4b]/80 border border-white/20 rounded-full px-1.5 py-2.5 shadow-lg gap-1.5 text-white font-black text-[11px]">
            <span>0</span>
            <span className="bg-[#7c3aed] text-white px-1 py-0.2 rounded font-black text-[9px]">50</span>
            <span>0</span>
          </div>
        </div>

        {/* Meldet e hapura në tavolinë */}
        {myMelds.length > 0 && (
          <div className="w-full flex items-center justify-center gap-2 my-1 bg-black/25 p-1.5 rounded-2xl border border-emerald-400/30 overflow-x-auto z-10">
            <span className="text-amber-300 font-black text-[10px] sm:text-xs uppercase tracking-wider pl-1">
              Kombinimet ({myPoints} PTS):
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {myMelds.map((meld) => (
                <div
                  key={meld.id}
                  onClick={() => handleAttachToMeld(meld.id)}
                  className={`flex items-center -space-x-3.5 sm:-space-x-4 transition shrink-0 ${
                    isMyTurn && selectedIds.length > 0 ? 'hover:scale-105 cursor-pointer ring-2 ring-amber-400 rounded-lg' : ''
                  }`}
                >
                  {meld.tiles.map((t) => (
                    <CasinoCardItem key={t.id} tile={t} small />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================== SHIRITI I VEPRIMIT: DEADWOOD / MELD DHE BUTONI HIDH ===================== */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-2 relative z-20 my-1 px-1">
          
          {/* Pilli DEADWOOD dhe Butoni MELD */}
          <div
            onClick={handlePlayMeld}
            className={`cursor-pointer px-5 sm:px-8 py-1 rounded-full border-2 transition-all flex flex-col items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.6)] ${
              canOpen
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 border-white text-slate-950 scale-105 animate-pulse'
                : 'bg-gradient-to-b from-[#0284c7] to-[#0369a1] border-[#38bdf8] text-white hover:brightness-110'
            }`}
            title="Kliko për të hapur letrat (Meld)"
          >
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest leading-none">
              {canOpen ? 'MELD / HAP LETRAT!' : 'DEADWOOD'}
            </span>
            <span className="text-xs sm:text-sm font-black tracking-wider leading-none mt-0.5">
              {canOpen ? `✨ ${displayMeldPoints} / 51 PTS` : `${deadwoodPoints} / 10`}
            </span>
          </div>

          {/* BUTONI KRYESOR I DUKSHËM "HIDH LETRËN" - kur lojtari ka tërhequr letër */}
          {isMyTurn && gameState.hasDrawn && (
            <div className="animate-in fade-in duration-200">
              {singleSelectedTile ? (
                <button
                  type="button"
                  onClick={() => handleDiscard(singleSelectedTile.id)}
                  className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs sm:text-sm px-4 sm:px-6 py-1.5 rounded-full shadow-[0_0_18px_rgba(225,29,72,0.8)] border-2 border-white animate-pulse cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>🔥 Hidh Letrën: {cardRank(singleSelectedTile.number)}{SUIT_DISPLAY[singleSelectedTile.suit].sym}</span>
                  <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">⏱️ {turnSecondsLeft}s</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const firstDrop = hand.find((t) => !t.isJoker) || hand[0];
                    if (firstDrop) handleDiscard(firstDrop.id);
                  }}
                  className="bg-red-600/90 hover:bg-red-500 text-white font-bold text-[11px] sm:text-xs px-3.5 py-1 rounded-full shadow-lg border border-white/70 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Prek 1 letër për ta hedhur</span>
                  <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">⏱️ {turnSecondsLeft}s</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===================== DORA E LOJTARIT (RESPONSIVE ME LETRA QË NUK PËRPLASEN) ===================== */}
        <div className="w-full flex items-end justify-center px-0.5 sm:px-1 overflow-x-auto min-h-[76px] sm:min-h-[105px] z-20 pb-0.5">
          <div className="flex items-end -space-x-3.5 sm:-space-x-4 md:-space-x-5 pt-4">
            {hand.map((tile) => {
              const groupColorIdx = meldedTileColorMap.get(tile.id);
              return (
                <CasinoCardItem
                  key={tile.id}
                  tile={tile}
                  selected={selectedIds.includes(tile.id)}
                  isNew={isMyTurn && gameState.lastDrawnTileId === tile.id}
                  groupColorIdx={groupColorIdx}
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
              );
            })}
          </div>
        </div>
      </div>

      {/* ===================== SHIRITI I POSHTËM (I ADAPTUAR PËR TELEFON ME HAPËSIRË TË PLOTË) ===================== */}
      <div className="w-full max-w-6xl flex items-center justify-between px-1 sm:px-2 py-0.5 z-20">
        
        {/* Majtas: Chat & Emoji */}
        <button
          onClick={() => setShowChatPopup(!showChatPopup)}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-b from-[#f59e0b] to-[#d97706] border-2 border-white shadow-xl flex items-center justify-center text-white cursor-pointer hover:scale-105 shrink-0"
          title="Chat & Emoji"
        >
          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
        </button>

        {/* Qendër: Profili i Lojtarit (Kompakt në celular, i plotë në PC) */}
        <div className="flex items-center bg-[#4a044e]/95 border-2 border-amber-400 px-2 sm:px-4 py-0.5 rounded-full shadow-lg mx-1">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0284c7] border border-[#38bdf8] flex items-center justify-center text-xs shadow mr-1.5">
            🐷
          </div>
          <span className="text-white font-black text-[11px] sm:text-xs tracking-wider uppercase mr-2 truncate max-w-[70px] sm:max-w-[120px]">
            {me?.nickname || 'GUEST'}
          </span>
          <div className="bg-[#2e1065] border border-amber-400/80 px-1.5 py-0.2 rounded-full text-[9px] sm:text-xs font-black text-amber-300">
            🪙 900K
          </div>
        </div>

        {/* Djathtas: Butoni SORT (dhe opsionalisht butoni i dytë Hidh në ekran të madh) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isMyTurn && gameState.hasDrawn && selectedIds.length === 1 && (
            <button
              onClick={() => handleDiscard()}
              className="bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg border border-white cursor-pointer animate-pulse whitespace-nowrap"
            >
              Hidh Letrën
            </button>
          )}

          <button
            onClick={handleSort}
            className="flex items-center gap-1 bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] hover:from-[#3b82f6] hover:to-[#2563eb] border-2 border-white px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl shadow-xl text-white font-black text-[11px] sm:text-xs cursor-pointer hover:scale-105 transition"
            title="Rendit dorën automatikisht"
          >
            <span className="text-sm">🂠</span>
            <span>SORT</span>
          </button>
        </div>
      </div>

      {/* Pop-up i Chat / Emoji */}
      {showChatPopup && (
        <div className="absolute bottom-14 left-2 z-50 bg-[#1e1b4b] border-2 border-amber-400 p-2.5 rounded-2xl shadow-2xl flex gap-1.5">
          {['😂', '👍', '🔥', '👑', '🎉', '🍀', '😎', '🤐'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="text-xl sm:text-2xl hover:scale-125 transition cursor-pointer p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Menu & Rregullat */}
      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-[#1e1b4b] border-2 border-amber-400 rounded-3xl p-5 max-w-md w-full shadow-2xl text-white">
            <div className="flex items-center justify-between pb-2.5 border-b border-purple-800">
              <h3 className="text-base sm:text-lg font-black text-amber-300 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Rregullat e Rummy & Menu
              </h3>
              <button onClick={() => setShowMenu(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-3 space-y-1.5 text-xs text-slate-200">
              <p>• <strong>Kombinimet (Runs):</strong> Sekuenca prej 3+ letrave të së njëjtës shenjë (p.sh. 4♠ 5♠ 6♠ 7♠).</p>
              <p>• <strong>Grupet (Sets):</strong> 3 ose 4 letra me të njëjtën vlerë dhe shenja të ndryshme.</p>
              <p>• <strong>Hapja:</strong> Kërkon të paktën 51 pikë për hapjen e parë.</p>
              <p>• <strong>Hedhja me 15 sekonda:</strong> Nëse nuk hidhni letër brenda 15s, loja hedh automatikisht një letër për të mos bllokuar lojën.</p>
            </div>
            <div className="pt-2 flex justify-between gap-2">
              {onLeaveRoom && (
                <button
                  onClick={onLeaveRoom}
                  className="flex-1 bg-red-600 hover:bg-red-500 py-2 rounded-xl font-bold text-xs"
                >
                  Dil nga Dhoma
                </button>
              )}
              <button
                onClick={() => setShowMenu(false)}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 rounded-xl font-black text-xs"
              >
                Vazhdo Lojën
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modali i Fitores */}
      {gameState.status === 'finished' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3">
          <div className="bg-[#2e1065] border-4 border-amber-400 rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_rgba(251,191,36,0.6)] animate-in zoom-in duration-300">
            <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-2 animate-bounce" />
            <h2 className="text-2xl font-black text-white mb-1">RUMMY! FITORE!</h2>
            <p className="text-amber-300 font-extrabold text-sm mb-4">
              {gameState.winnerName} fitoi lojën (+150 pikë)!
            </p>

            {isHost && onRestartGame && (
              <button
                onClick={onRestartGame}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-2.5 rounded-2xl shadow-xl transition cursor-pointer text-xs sm:text-sm"
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
