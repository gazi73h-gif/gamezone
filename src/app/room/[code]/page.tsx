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

  // Rivendos kohën e aktivitetit sa herë ka veprim nga lojtari ose përditësim loje
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityWarning(null);
  }, []);

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

      if (playersData) setPlayers(playersData);
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
  }, [roomCode, router, resetActivity]);

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

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 bg-[#080d12]">
        {InactivityWarningBanner}
        Duke ngarkuar dhomën...
      </div>
    );
  }

  // 1. Rummy / Remi 51 (JOL)
  if (room.status === 'playing' && room.game_type === 'rummy' && room.game_state) {
    return (
      <div className="relative min-h-screen bg-[#080d12] text-white">
        {InactivityWarningBanner}
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
      <div className="relative min-h-screen bg-slate-950 text-white pb-10">
        {InactivityWarningBanner}
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
          <LudoGame
            gameState={room.game_state as LudoGameState}
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

  // 3. Yamb (Jamb)
  if (room.status === 'playing' && room.game_type === 'yamb') {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white">
        {InactivityWarningBanner}
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

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      {InactivityWarningBanner}
      <div className="max-w-3xl mx-auto px-4 py-10">
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Dil nga dhoma
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold">
                Dhoma e Lojës
              </span>
              <h1 className="text-3xl font-extrabold text-white mt-1">
                {GAME_NAMES[room.game_type] || room.game_type}
              </h1>
            </div>

            <div className="flex items-center gap-3 bg-slate-950 border border-slate-700 px-5 py-3 rounded-2xl">
              <div>
                <p className="text-[11px] text-slate-400 uppercase">Kodi i Dhomës</p>
                <p className="text-2xl font-mono font-black tracking-widest text-amber-400">
                  {room.code}
                </p>
              </div>
              <button
                onClick={copyRoomCode}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 transition cursor-pointer"
                title="Kopjo kodin"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Users className="w-4 h-4 text-amber-400" />
                Lojtarët në tavolinë ({players.length})
              </h2>
              <span className="text-xs text-slate-500">Duke pritur shokët...</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-slate-950/70 border border-slate-800 px-4 py-3.5 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-amber-400 text-sm">
                      {p.nickname.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-bold text-sm text-white">{p.nickname}</span>
                      {p.player_id === currentPlayerId && (
                        <span className="ml-2 text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          Ti
                        </span>
                      )}
                    </div>
                  </div>

                  {p.player_id === room.host_id && (
                    <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
                      <Crown className="w-3.5 h-3.5" />
                      Krijuesi
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            {isHost ? (
              <button
                onClick={handleStartGame}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-3.5 rounded-xl transition shadow-lg cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                Fillo Lojën
              </button>
            ) : (
              <p className="text-sm text-slate-400 italic">
                Duke pritur që krijuesi i dhomës të fillojë lojën...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
