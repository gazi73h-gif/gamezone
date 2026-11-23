'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import YambGame from '../../../components/YambGame';
import { YambGameState, createEmptySheet } from '../../../lib/yambLogic';
import PishpirikGame from '../../../components/PishpirikGame';
import { initPishpirikGame, PishpirikGameState } from '../../../lib/pishpirikLogic';
import ChessGame from '../../../components/ChessGame';
import { initChessGame, ChessGameState } from '../../../lib/chessLogic';
import UnoGame from '../../../components/UnoGame';
import { initUnoGame, UnoGameState } from '../../../lib/unoLogic';
import LudoGame from '../../../components/LudoGame';
import GameArt from '../../../components/GameArt';
import RummyGame from '../../../components/RummyGame';
import { initLudoGame, LudoGameState } from '../../../lib/ludoLogic';
import { initRummyGame, RummyGameState } from '../../../lib/rummyLogic';

import { Copy, Check, Users, ArrowLeft, Play, Crown, AlertTriangle } from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  nickname: string;
  seat_order: number;
}

interface Room {
  code: string;
  game_type: string;
  status: string;
  host_id: string;
  game_state: any;
}

const GAME_NAMES: Record<string, string> = {
  yamb: 'Yamb (Jamb)',
  pishpirik: 'Pishpirik',
  shah: 'Shah (Chess)',
  uno: 'UNO Shqip',
  ludo: 'Ludo (Mos u zemëro)',
  rummy: 'Rummy / Jol',
};

// Kohëzgjatja maksimale e mosaktivitetit: 5 minuta (300,000 ms)
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;

export default function RoomLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Monitorimi i mosaktivitetit
  const lastActivityRef = useRef<number>(Date.now());
  const [inactivityWarning, setInactivityWarning] = useState<number | null>(null);
  const isClosingRef = useRef<boolean>(false);

  // Koha e rifillimit të fundit, që dy kërkesa të njëpasnjëshme të mos e rifillojnë lojën dy herë
  const lastRestartRef = useRef<number>(0);
  const [playingWithBot, setPlayingWithBot] = useState<boolean>(false);

  // Rivendos kohën e aktivitetit sa herë ka veprim nga lojtari ose përditësim loje
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityWarning(null);
  }, []);

  // Helper: ndërto gjendjen fillestare të lojës me listën e lojtarëve (mund të përfshijë bot)
  const buildInitialGameState = useCallback(
    async (
      gameType: string,
      playerList: { player_id: string; nickname: string }[],
      withBot: boolean
    ) => {
      const mapped = playerList.map((p) => ({ id: p.player_id, nickname: p.nickname }));

      if (gameType === 'yamb') {
        const finalList =
          withBot
            ? [mapped[0], { id: 'BOT_YAMB', nickname: '🤖 Bot Yamb' }]
            : mapped;
        const sheets: Record<string, ReturnType<typeof createEmptySheet>> = {};
        finalList.forEach((p) => { sheets[p.id] = createEmptySheet(); });
        return {
          currentTurnPlayerId: finalList[0].id,
          dice: [1, 2, 3, 4, 5, 6],
          held: [false, false, false, false, false, false],
          rollsLeft: 3,
          calledRow: null,
          sheets,
          winnerId: null,
        };
      } else if (gameType === 'pishpirik') {
        return initPishpirikGame(withBot ? [mapped[0]] : mapped);
      } else if (gameType === 'shah') {
        return initChessGame(
          withBot
            ? [mapped[0], { id: 'BOT_AI', nickname: '🤖 Bot Shah' }]
            : mapped
        );
      } else if (gameType === 'uno') {
        return initUnoGame(withBot ? [mapped[0]] : mapped);
      } else if (gameType === 'ludo') {
        return initLudoGame(withBot ? [mapped[0]] : mapped);
      } else if (gameType === 'rummy') {
        return initRummyGame(
          withBot
            ? [mapped[0], { id: 'BOT_RUMMY', nickname: '🤖 Bot Rummy' }]
            : mapped
        );
      }
      return null;
    },
    []
  );

  useEffect(() => {
    const storedId = localStorage.getItem('gamezone_player_id') || '';
    setCurrentPlayerId(storedId);

    const fetchRoomData = async () => {
      const { data: roomData, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single();

      if (error || !roomData) {
        if (!isClosingRef.current) {
          isClosingRef.current = true;
          alert('Kjo dhomë është mbyllur ose nuk ekziston.');
          router.push('/');
        }
        return;
      }
      setRoom(roomData);
      resetActivity();

      const { data: playersData } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_code', roomCode)
        .order('seat_order', { ascending: true });

      if (playersData) {
        setPlayers(playersData);

        // Gjej vetëm lojtarët real (jo-bot)
        const BOT_IDS = ['BOT_YAMB', 'BOT_PISH', 'BOT_AI', 'BOT_UNO', 'BOT_LUDO', 'BOT_RUMMY'];
        const realPlayers = playersData.filter(
          (p) => !BOT_IDS.includes(p.player_id)
        );
        const realCount = realPlayers.length;
        const storedHostId = localStorage.getItem('gamezone_player_id') || '';
        const isHostNow = roomData.host_id === storedHostId;

        // AUTO-START me Bot: vetëm 1 lojtar real + loja është në pritje
        if (
          isHostNow &&
          realCount === 1 &&
          roomData.status === 'waiting'
        ) {
          const gs = await buildInitialGameState(roomData.game_type, realPlayers, true);
          if (gs) {
            await supabase
              .from('rooms')
              .update({ status: 'playing', game_state: gs })
              .eq('code', roomCode);
            setPlayingWithBot(true);
          }
        }

        // AUTO-RESTART me lojtarë real: vetëm kur loja po luhej me bot dhe tani ka 2+ lojtarë real.
        // (Më parë numri i lojtarëve fillonte nga 0 pas çdo refresh, prandaj hosti e fshinte lojën pa dashje.)
        const stateText = JSON.stringify(roomData.game_state ?? '');
        const playingWithBot = roomData.status === 'playing' && BOT_IDS.some((id) => stateText.includes(id));
        if (
          isHostNow &&
          realCount >= 2 &&
          (roomData.status === 'waiting' || playingWithBot) &&
          Date.now() - lastRestartRef.current > 5000
        ) {
          lastRestartRef.current = Date.now();
          const gs = await buildInitialGameState(roomData.game_type, realPlayers, false);
          if (gs) {
            await supabase
              .from('rooms')
              .update({ status: 'playing', game_state: gs })
              .eq('code', roomCode);
            setPlayingWithBot(false);
          }
        }

      }
    };

    fetchRoomData();

    const channel = supabase
      .channel(`room_sync_${roomCode}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_code=eq.${roomCode}` },
        () => {
          resetActivity();
          fetchRoomData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` },
        (payload) => {
          resetActivity();
          setRoom(payload.new as Room);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` },
        () => {
          if (!isClosingRef.current) {
            isClosingRef.current = true;
            alert('Dhoma u mbyll për shkak të mosaktivitetit për 5 minuta.');
            router.push('/');
          }
        }
      )
      .subscribe();

    const backupInterval = setInterval(fetchRoomData, 2000);

    return () => {
      clearInterval(backupInterval);
      supabase.removeChannel(channel);
    };
  }, [roomCode, router, resetActivity, buildInitialGameState]);

  // Kontrolluesi i mosaktivitetit për 5 minuta për çdo dhomë dhe çdo lojë
  useEffect(() => {
    const checkInactivity = async () => {
      if (isClosingRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      const remainingSec = Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - elapsed) / 1000));

      // Shfaq paralajmërim gjatë 45 sekondave të fundit para mbylljes
      if (remainingSec <= 45 && remainingSec > 0) {
        setInactivityWarning(remainingSec);
      } else if (remainingSec > 45 && inactivityWarning !== null) {
        setInactivityWarning(null);
      }

      // Nëse kanë kaluar 5 minuta (300,000 ms) pa aktivitet, mbylle dhomën
      if (elapsed >= INACTIVITY_LIMIT_MS) {
        isClosingRef.current = true;
        try {
          await supabase.from('room_players').delete().eq('room_code', roomCode);
          await supabase.from('rooms').delete().eq('code', roomCode);
        } catch {}
        alert('Dhoma u mbyll automatikisht për shkak të mosaktivitetit për 5 minuta.');
        router.push('/');
      }
    };

    const timer = setInterval(checkInactivity, 3000);

    const userEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleUserEvent = () => resetActivity();
    userEvents.forEach((ev) => window.addEventListener(ev, handleUserEvent, { passive: true }));

    return () => {
      clearInterval(timer);
      userEvents.forEach((ev) => window.removeEventListener(ev, handleUserEvent));
    };
  }, [roomCode, router, inactivityWarning, resetActivity]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveRoom = async () => {
    if (currentPlayerId) {
      await supabase
        .from('room_players')
        .delete()
        .eq('room_code', roomCode)
        .eq('player_id', currentPlayerId);
    }
    // Nëse ishte hosti ose nuk mbeti asnjë lojtar, fshi dhomën menjëherë
    const remaining = players.filter((p) => p.player_id !== currentPlayerId);
    if (remaining.length === 0 || room?.host_id === currentPlayerId) {
      await supabase.from('rooms').delete().eq('code', roomCode);
    }
    router.push('/');
  };

  const handleStartGame = async () => {
    if (!room || players.length === 0) return;
    resetActivity();

    if (room.game_type === 'yamb') {
      const initialSheets: Record<string, ReturnType<typeof createEmptySheet>> = {};
      const yPlayers =
        players.length >= 2
          ? players
          : [players[0], { player_id: 'BOT_YAMB', nickname: '🤖 Bot Yamb' } as Player];
      yPlayers.forEach((p) => {
        initialSheets[p.player_id] = createEmptySheet();
      });

      const initialState: YambGameState = {
        currentTurnPlayerId: players[0].player_id,
        dice: [1, 2, 3, 4, 5, 6],
        held: [false, false, false, false, false, false],
        rollsLeft: 3,
        calledRow: null,
        sheets: initialSheets,
        winnerId: null,
      };

      await supabase
        .from('rooms')
        .update({ status: 'playing', game_state: initialState })
        .eq('code', roomCode);
    } else if (room.game_type === 'pishpirik') {
      const initialState = initPishpirikGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await supabase
        .from('rooms')
        .update({ status: 'playing', game_state: initialState })
        .eq('code', roomCode);
    } else if (room.game_type === 'shah') {
      const initialState = initChessGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await supabase
        .from('rooms')
        .update({ status: 'playing', game_state: initialState })
        .eq('code', roomCode);
    } else if (room.game_type === 'uno') {
      const initialState = initUnoGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await supabase
        .from('rooms')
        .update({ status: 'playing', game_state: initialState })
        .eq('code', roomCode);
    } else if (room.game_type === 'ludo') {
      const initialState = initLudoGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await supabase
        .from('rooms')
        .update({ status: 'playing', game_state: initialState })
        .eq('code', roomCode);
    } else if (room.game_type === 'rummy') {
      const initialState = initRummyGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await supabase
        .from('rooms')
        .update({ status: 'playing', game_state: initialState })
        .eq('code', roomCode);
    } else {
      alert('Kjo lojë do të shtohet në hapat e radhës!');
    }
  };

  // Shiriti i paralajmërimit të mosaktivitetit
  const InactivityWarningBanner = inactivityWarning !== null ? (
    <div
      onClick={resetActivity}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-600/95 border-2 border-amber-300 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-pulse cursor-pointer select-none"
    >
      <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0" />
      <span>
        ⚠️ Dhoma do të mbyllet pas {inactivityWarning} sekondash për shkak të mosaktivitetit! Kliko këtu për të vazhduar.
      </span>
    </div>
  ) : null;

  // Baneri "Duke luajtur me Bot AI"
  const BotBanner = playingWithBot ? (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] bg-indigo-700/95 border border-indigo-400 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2 max-w-[90vw] text-center">
      🤖 Duke luajtur me Bot AI — sapo të futet një lojtar online, loja rifillon automatikisht!
    </div>
  ) : null;

  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-mute">
        {InactivityWarningBanner}
        <span className="w-12 h-12 rounded-full border-4 border-white/10 border-t-gold animate-spin" />
        <span className="font-display text-lg">Duke ngarkuar dhomën...</span>
      </div>
    );
  }

  // 1. Rummy / Remi 51 (JOL)
  if (room.status === 'playing' && room.game_type === 'rummy' && room.game_state) {
    return (
      <div className="relative min-h-screen bg-[#080d12] text-white">
        {InactivityWarningBanner}
        {BotBanner}
        <RummyGame
          gameState={room.game_state as RummyGameState}
          currentPlayerId={currentPlayerId}
          isHost={room.host_id === currentPlayerId}
          onUpdateState={async (ns) => {
            resetActivity();
            await supabase.from('rooms').update({ game_state: ns }).eq('code', roomCode);
          }}
          onRestartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
        />
      </div>
    );
  }

  // 2. Ludo (Mos u zemëro)
  if (room.status === 'playing' && room.game_type === 'ludo' && room.game_state) {
    return (
      <div className="relative h-dvh flex flex-col overflow-hidden">
        {InactivityWarningBanner}
        {BotBanner}
        <div className="w-full max-w-3xl mx-auto px-3 pt-3 flex items-center justify-between shrink-0">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-mute hover:text-ink text-sm font-bold pl-2.5 pr-3.5 py-1.5 rounded-full transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Dil
          </button>
          <span className="text-xs font-bold text-mute bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
            Dhoma <strong className="font-display text-gold tracking-widest">{room.code}</strong>
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <LudoGame
            gameState={room.game_state as LudoGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              const { error } = await supabase.from('rooms').update({ game_state: newState }).eq('code', roomCode);
              if (error) throw error;
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }

  // 3. Yamb (Jamb)
  if (room.status === 'playing' && room.game_type === 'yamb') {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white">
        {InactivityWarningBanner}
        {BotBanner}
        <div className="max-w-5xl mx-auto px-3 pt-4 flex items-center justify-between">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Dil nga loja
          </button>
          <span className="text-xs font-mono text-slate-400">
            Dhoma: <strong className="text-amber-400">{room.code}</strong>
          </span>
        </div>
        <YambGame
          roomCode={room.code}
          gameState={room.game_state}
          players={players}
          currentPlayerId={currentPlayerId}
        />
      </div>
    );
  }

  // 4. Pishpirik
  if (room.status === 'playing' && room.game_type === 'pishpirik' && room.game_state) {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white pb-10">
        {InactivityWarningBanner}
        {BotBanner}
        <div className="max-w-5xl mx-auto px-3 pt-4 mb-4 flex items-center justify-between">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Dil nga loja
          </button>
          <span className="text-xs font-mono text-slate-400">
            Dhoma: <strong className="text-amber-400">{room.code}</strong>
          </span>
        </div>
        <div className="px-3">
          <PishpirikGame
            gameState={room.game_state as PishpirikGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await supabase.from('rooms').update({ game_state: newState }).eq('code', roomCode);
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }

  // 5. Shah (Chess)
  if (room.status === 'playing' && room.game_type === 'shah' && room.game_state) {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white pb-10">
        {InactivityWarningBanner}
        {BotBanner}
        <div className="max-w-5xl mx-auto px-3 pt-4 mb-4 flex items-center justify-between">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Dil nga loja
          </button>
          <span className="text-xs font-mono text-slate-400">
            Dhoma: <strong className="text-amber-400">{room.code}</strong>
          </span>
        </div>
        <div className="px-3">
          <ChessGame
            gameState={room.game_state as ChessGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await supabase.from('rooms').update({ game_state: newState }).eq('code', roomCode);
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }

  // 6. UNO Shqip
  if (room.status === 'playing' && room.game_type === 'uno' && room.game_state) {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white pb-10">
        {InactivityWarningBanner}
        {BotBanner}
        <div className="max-w-5xl mx-auto px-3 pt-4 mb-4 flex items-center justify-between">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Dil nga loja
          </button>
          <span className="text-xs font-mono text-slate-400">
            Dhoma: <strong className="text-amber-400">{room.code}</strong>
          </span>
        </div>
        <div className="px-3">
          <UnoGame
            gameState={room.game_state as UnoGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await supabase.from('rooms').update({ game_state: newState }).eq('code', roomCode);
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }

  // 7. Lobby (Pritja e lojtarëve)
  const isHost = room.host_id === currentPlayerId;
  const SEATS: Record<string, number> = { yamb: 4, pishpirik: 4, shah: 2, uno: 6, ludo: 4, rummy: 4 };
  const emptySeats = Math.max(0, (SEATS[room.game_type] ?? 4) - players.length);

  return (
    <div className="relative min-h-screen">
      {InactivityWarningBanner}
      <div className="max-w-xl mx-auto px-4 py-5 sm:py-10">
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-mute hover:text-ink text-sm font-bold pl-2.5 pr-3.5 py-1.5 rounded-full mb-5 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Dil nga dhoma
        </button>

        <div className="gz-panel rounded-[30px] p-2.5">
          <GameArt game={room.game_type} className="h-36 sm:h-44 rounded-[24px]" />
          <div className="px-3 sm:px-4 pt-4">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-mute">Dhoma e lojës</span>
            <h1 className="font-display font-bold text-3xl leading-tight">{GAME_NAMES[room.game_type] || room.game_type}</h1>
          </div>

          <div className="p-3 sm:p-4">
            {/* kodi */}
            <div className="flex items-center justify-between gap-3 rounded-3xl bg-night/50 border border-white/10 p-3 sm:p-4">
              <div>
                <p className="text-xs font-bold text-mute">Ndaje këtë kod me shokët</p>
                <div className="flex gap-1.5 mt-2">
                  {room.code.split('').map((d, i) => (
                    <span key={i} className="grid place-items-center w-10 h-12 sm:w-12 sm:h-14 rounded-xl bg-panel-2 border-b-4 border-line font-display font-bold text-2xl sm:text-3xl text-gold">{d}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={copyRoomCode}
                className={`flex flex-col items-center gap-1 w-20 py-2.5 rounded-2xl text-xs font-extrabold transition cursor-pointer ${copied ? 'bg-mint/15 text-mint' : 'bg-white/5 hover:bg-white/10 text-ink'}`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'U kopjua' : 'Kopjo'}
              </button>
            </div>

            {/* lojtarët */}
            <div className="flex items-center justify-between mt-6 mb-3">
              <h2 className="flex items-center gap-2 font-display font-semibold text-lg">
                <Users className="w-5 h-5 text-gold" /> Lojtarët <span className="text-mute text-base">({players.length})</span>
              </h2>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {players.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-night/40 border border-white/10 p-2.5">
                  <span className={`grid place-items-center w-10 h-10 shrink-0 rounded-xl font-display font-bold text-white bg-gradient-to-br ${['from-[#ff6b6b] to-[#e03131]', 'from-[#4dabf7] to-[#1c7ed6]', 'from-[#ffd43b] to-[#f59f00]', 'from-[#51cf66] to-[#2f9e44]', 'from-[#cc5de8] to-[#9c36b5]', 'from-[#ff922b] to-[#e8590c]'][i % 6]}`}>
                    {p.nickname.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{p.nickname}</p>
                    <p className="text-[11px] font-bold text-mute flex items-center gap-1">
                      {p.player_id === room.host_id ? <><Crown className="w-3 h-3 text-gold" /> Krijuesi</> : 'Lojtar'}
                      {p.player_id === currentPlayerId && <span className="text-mint"> · Ti</span>}
                    </p>
                  </div>
                </li>
              ))}
              {Array.from({ length: emptySeats }).map((_, i) => (
                <li key={`empty-${i}`} className="flex items-center gap-2.5 rounded-2xl border-2 border-dashed border-white/10 p-2.5 text-mute/70">
                  <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-white/5 text-lg">+</span>
                  <span className="text-xs font-bold">Vend i lirë</span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {isHost ? (
                <button
                  onClick={handleStartGame}
                  className="gz-btn w-full flex items-center justify-center gap-2 font-display font-semibold text-xl py-4 rounded-2xl cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Fillo lojën
                </button>
              ) : (
                <p className="flex items-center justify-center gap-2 text-sm font-bold text-mute py-4 rounded-2xl bg-white/5">
                  <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                  Duke pritur krijuesin të fillojë lojën...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
