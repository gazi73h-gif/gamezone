'use client';

import React, { useEffect, useState } from 'react';
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

import { Copy, Check, Users, ArrowLeft, Play, Crown } from 'lucide-react';

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

export default function RoomLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  const [copied, setCopied] = useState(false);

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
        router.push('/');
        return;
      }
      setRoom(roomData);

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
        () => fetchRoomData()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .subscribe();

    const backupInterval = setInterval(fetchRoomData, 2000);

    return () => {
      clearInterval(backupInterval);
      supabase.removeChannel(channel);
    };
  }, [roomCode, router]);
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
    router.push('/');
  };

  const handleStartGame = async () => {
    if (!room || players.length === 0) return;

    if (room.game_type === 'yamb') {
      const initialSheets: Record<string, ReturnType<typeof createEmptySheet>> = {};
      const yPlayers = players.length >= 2 ? players : Array.of(players.at(0)!, { player_id: 'BOT_YAMB', nickname: '🤖 Bot Yamb' } as Player); yPlayers.forEach((p) => {
        initialSheets[p.player_id] = createEmptySheet();
      });

      const initialState: YambGameState = {
        currentTurnPlayerId: players[0].player_id,
        dice: new Array(1, 2, 3, 4, 5, 6),
        held: new Array(false, false, false, false, false, false),
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
    } else if (room.game_type === 'ludo') { const initialState = initLudoGame(players.map((p) => ({ id: p.player_id, nickname: p.nickname }))); await supabase.from('rooms').update({ status: 'playing', game_state: initialState }).eq('code', roomCode);
    } else if (room.game_type === 'rummy') {
      const initialState = initRummyGame(players.map((p) => ({ id: p.player_id, nickname: p.nickname })));
      await supabase.from('rooms').update({ status: 'playing', game_state: initialState }).eq('code', roomCode);
    } else if (room.game_type === 'rummy') {
      const initialState = initRummyGame(players.map((p) => ({ id: p.player_id, nickname: p.nickname })));
      await supabase.from('rooms').update({ status: 'playing', game_state: initialState }).eq('code', roomCode); } else {

      alert('Kjo lojë do të shtohet në hapat e radhës!');
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Duke ngarkuar dhomën...
      </div>
    );
  }

  if (room.status === 'playing' && room.game_type === 'rummy' && room.game_state) {
    return (
      <div className="min-h-screen bg-[#080d12] text-white">
        <RummyGame
          gameState={room.game_state as RummyGameState}
          currentPlayerId={currentPlayerId}
          isHost={room.host_id === currentPlayerId}
          onUpdateState={async (ns) => {
            await supabase.from('rooms').update({ game_state: ns }).eq('code', roomCode);
          }}
          onRestartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
        />
      </div>
    );
  }

  if (room.status === 'playing' && room.game_type === 'ludo' && room.game_state) { return (<div className="min-h-screen bg-slate-950 text-white pb-10"><div className="max-w-5xl mx-auto px-3 pt-4 mb-4 flex items-center justify-between"><button onClick={handleLeaveRoom} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition cursor-pointer"><ArrowLeft className="w-4 h-4" />Dil nga loja</button><span className="text-xs font-mono text-slate-400">Dhoma: <strong className="text-amber-400">{room.code}</strong></span></div><div className="px-3"><LudoGame gameState={room.game_state as LudoGameState} currentPlayerId={currentPlayerId} isHost={room.host_id === currentPlayerId} onUpdateState={async (newState) => { await supabase.from('rooms').update({ game_state: newState }).eq('code', roomCode); }} onRestartGame={handleStartGame} /></div></div>); }

  if (room.status === 'playing' && room.game_type === 'yamb') {
    return (
      <div>
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

  if (room.status === 'playing' && room.game_type === 'pishpirik' && room.game_state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white pb-10">
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
              await supabase
                .from('rooms')
                .update({ game_state: newState })
                .eq('code', roomCode);
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }

  if (room.status === 'playing' && room.game_type === 'shah' && room.game_state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white pb-10">
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
              await supabase
                .from('rooms')
                .update({ game_state: newState })
                .eq('code', roomCode);
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }
  if (room.status === 'playing' && room.game_type === 'uno' && room.game_state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white pb-10">
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
              await supabase
                .from('rooms')
                .update({ game_state: newState })
                .eq('code', roomCode);
            }}
            onRestartGame={handleStartGame}
          />
        </div>
      </div>
    );
  }

  const isHost = room.host_id === currentPlayerId;

  return (
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
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold text-slate-950">
                    {p.nickname.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-white">{p.nickname}</span>
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
  );
}
