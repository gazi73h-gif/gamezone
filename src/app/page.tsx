'use client';
import Leaderboard from '../components/Leaderboard';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
 import { 
  Dices, Spade, Palette, Layers, Compass, LayoutGrid, 
  Coins, Gift, Users, Play, LogIn, Sparkles, Gamepad2, Radio 
} from 'lucide-react';

interface GameInfo {
  id: string;
  title: string;
  subtitle: string;
  players: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
}

const GAMES: GameInfo[] = [
  {
    id: 'yamb',
    title: 'Yamb (Jamb)',
    subtitle: 'Lojë me 5 ose 6 zara dhe tabelë pikësh',
    players: '1 - 4 Lojtarë',
    icon: <Dices className="w-8 h-8" />,
    color: 'from-amber-500 to-orange-600',
    badge: 'E re'
  },
  {
    id: 'pishpirik',
    title: 'Pishpirik',
    subtitle: 'Loja tradicionale shqiptare me letra',
    players: '2 ose 4 Lojtarë',
    icon: <Spade className="w-8 h-8" />,
    color: 'from-emerald-500 to-teal-700',
    badge: 'Popullore'
  },
  {
    id: 'shah',
    title: 'Shah (Chess)',
    subtitle: 'Shah fjalën dhe gjeje në chat',
    players: '2 - 8 Lojtarë',
    icon: <Palette className="w-8 h-8" />,
    color: 'from-pink-500 to-rose-600',
  },
  {
    id: 'uno',
    title: 'UNO Shqip',
    subtitle: 'Letra me ngjyra dhe karta speciale',
    players: '2 - 6 Lojtarë',
    icon: <Layers className="w-8 h-8" />,
    color: 'from-red-500 to-red-700',
  },
  {
    id: 'ludo',
    title: 'Ludo (Mos u zemëro)',
    subtitle: 'Gara klasike me 4 figura drejt shtëpisë',
    players: '2 - 4 Lojtarë',
    icon: <Compass className="w-8 h-8" />,
    color: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'rummy',
    title: 'Rummy / Jol',
    subtitle: '106 letra + Xhola, hapja e serive',
    players: '2 - 4 Lojtarë',
    icon: <LayoutGrid className="w-8 h-8" />,
    color: 'from-purple-500 to-violet-700',
  },
];
export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [tokens, setTokens] = useState<number>(1000);
  const [canClaimDaily, setCanClaimDaily] = useState<boolean>(false);
  const [joinCode, setJoinCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [openRooms, setOpenRooms] = useState<
    Array<{ code: string; game_type: string; playerCount: number; hostName: string }>
  >(Array.of());

  const fetchOpenRooms = async () => {
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('code, game_type')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!roomsData || roomsData.length === 0) {
      setOpenRooms(Array.of());
      return;
    }

    const codes = roomsData.map((r) => r.code);
    const { data: playersData } = await supabase
      .from('room_players')
      .select('room_code, nickname, seat_order')
      .in('room_code', codes);

    const formatted = roomsData
      .map((r) => {
        const roomPlayers = (playersData || []).filter((p) => p.room_code === r.code);
        const host = roomPlayers.find((p) => p.seat_order === 1) || roomPlayers.at(0);
        return {
          code: r.code,
          game_type: r.game_type,
          playerCount: roomPlayers.length,
          hostName: host?.nickname || 'Lojtar',
        };
      })
      .filter((r) => r.playerCount > 0);

    setOpenRooms(formatted);
  };

  useEffect(() => {
    fetchOpenRooms();
    const interval = setInterval(fetchOpenRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let storedId = localStorage.getItem('gamezone_player_id');
    if (!storedId) {
      storedId = 'player_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('gamezone_player_id', storedId);
    }
    setPlayerId(storedId);

    const storedNick = localStorage.getItem('gamezone_nickname');
    if (storedNick) setNickname(storedNick);

    const storedTokens = localStorage.getItem('gamezone_tokens');
    if (storedTokens) {
      setTokens(parseInt(storedTokens, 10));
    } else {
      localStorage.setItem('gamezone_tokens', '1000');
    }

    const lastBonus = localStorage.getItem('gamezone_last_bonus');
    if (lastBonus !== new Date().toDateString()) {
      setCanClaimDaily(true);
    }
  }, []);

  const handleSaveNickname = (val: string) => {
    setNickname(val);
    localStorage.setItem('gamezone_nickname', val);
  };

  const claimDailyBonus = () => {
    if (!canClaimDaily) return;
    const newBalance = tokens + 250;
    setTokens(newBalance);
    setCanClaimDaily(false);
    localStorage.setItem('gamezone_tokens', newBalance.toString());
    localStorage.setItem('gamezone_last_bonus', new Date().toDateString());
  };

  const handleCreateRoom = async (gameId: string) => {
    if (!nickname.trim()) {
      setErrorMsg('Ju lutem shkruani një nofkë (emër) përpara se të filloni!');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const { error: roomError } = await supabase
        .from('rooms')
        .insert([{ code, game_type: gameId, host_id: playerId, status: 'waiting' }]);
      if (roomError) throw roomError;

      const { error: playerError } = await supabase
        .from('room_players')
        .insert([{ room_code: code, player_id: playerId, nickname: nickname.trim(), seat_order: 1 }]);
      if (playerError) throw playerError;

      router.push(`/room/${code}`);
    } catch (err) {
      console.error(err);
      setErrorMsg('Gabim gjatë krijimit të dhomës. Kontrolloni lidhjen me Supabase.');
    } finally {
      setLoading(false);
    }
  };

   const joinRoomByCode = async (targetCode: string) => {
    if (!nickname.trim()) {
      setErrorMsg('Ju lutem shkruani një nofkë përpara se të hyni në dhomë!');
      return;
    }
    if (targetCode.length !== 4) {
      setErrorMsg('Kodi i dhomës duhet të ketë saktësisht 4 shifra.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const { data: room, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', targetCode)
        .single();
      if (fetchError || !room) {
        setErrorMsg('Kjo dhomë nuk ekziston ose ka përfunduar.');
        setLoading(false);
        return;
      }

      const { data: players } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_code', targetCode);

      const { error: joinError } = await supabase
        .from('room_players')
        .upsert(
          {
            room_code: targetCode,
            player_id: playerId,
            nickname: nickname.trim(),
            seat_order: (players?.length || 0) + 1,
          },
          { onConflict: 'room_code,player_id' }
        );
      if (joinError) throw joinError;

      router.push(`/room/${targetCode}`);
    } catch (err) {
      console.error(err);
      setErrorMsg('Gabim gjatë hyrjes në dhomë.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    await joinRoomByCode(joinCode);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2.5 rounded-xl text-slate-950">
            <Gamepad2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Game<span className="text-amber-400">Zone</span>
            </h1>
            <p className="text-xs text-slate-400">Lojëra tavoline & letra në kohë reale</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/30 px-4 py-2 rounded-xl">
            <Coins className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-amber-300">{tokens.toLocaleString()}</span>
            <span className="text-xs text-slate-400">Tokena</span>
          </div>

          {canClaimDaily && (
            <button
              onClick={claimDailyBonus}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition shadow-lg animate-pulse cursor-pointer"
            >
              <Gift className="w-4 h-4" />
              +250 Bonus Ditor
            </button>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            1. Shkruaj Nofkën tënde (Emrin në lojë)
          </label>
          <input
            type="text"
            maxLength={18}
            placeholder="p.sh. Dardani, Shqiponja, Besi..."
            value={nickname}
            onChange={(e) => handleSaveNickname(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none transition"
          />
          <p className="text-xs text-slate-400 mt-2">
            Nuk kërkohet regjistrim me email. Emri ruhet automatikisht në pajisjen tënde.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            2. Ke një kod dhome nga shokët?
          </label>
          <form onSubmit={handleJoinRoom} className="flex gap-3">
            <input
              type="text"
              maxLength={4}
              placeholder="Kodi 4-shifror (p.sh. 4829)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-white text-center font-mono text-lg tracking-widest placeholder-slate-500 placeholder:text-sm placeholder:tracking-normal outline-none transition"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-3 rounded-xl transition cursor-pointer"
            >
              <LogIn className="w-5 h-5" />
              Hyr
            </button>
          </form>
          <p className="text-xs text-slate-400 mt-2">
            Ose zgjidh njërën nga lojërat më poshtë për të hapur një tavolinë të re.
          </p>
        </div>
      </section>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm text-center">
          {errorMsg}
        </div>
      )}
      <section className="mb-10 bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h2 className="text-lg font-bold text-white">Dhomat e Hapura Tani (Bashkohu pa kod)</h2>
          </div>
          <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
            {openRooms.length} aktive
          </span>
        </div>

        {openRooms.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
            Aktualisht nuk ka dhoma në pritje. Krijo një lojë më poshtë dhe lojtarët e tjerë do ta shohin menjëherë këtu!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {openRooms.map((r) => {
              const gameInfo = GAMES.find((g) => g.id === r.game_type);
              return (
                <div
                  key={r.code}
                  className="flex items-center justify-between bg-slate-950 border border-slate-800 hover:border-emerald-500/50 p-4 rounded-xl transition"
                >
                  <div>
                    <div className="font-bold text-white text-sm">
                      {gameInfo?.title || r.game_type}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Host: <span className="text-amber-400 font-medium">{r.hostName}</span> •{' '}
                      <span className="text-emerald-400">{r.playerCount} lojtarë</span>
                    </div>
                  </div>

                  <button
                    onClick={() => joinRoomByCode(r.code)}
                    disabled={loading}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Hyr
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Zgjidh Lojën & Hap Tavolinë</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {GAMES.map((game) => (
            <div
              key={game.id}
              className="group relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${game.color} text-white shadow-md`}>
                    {game.icon}
                  </div>
                  {game.badge && (
                    <span className="text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full">
                      {game.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{game.title}</h3>
                <p className="text-sm text-slate-400 mb-4">{game.subtitle}</p>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Users className="w-4 h-4 text-slate-500" />
                  {game.players}
                </span>

                <button
                  onClick={() => handleCreateRoom(game.id)}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-amber-500 text-white hover:text-slate-950 text-sm font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Krijo Dhomë
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
           <div className="mt-10">
       <Leaderboard />
     </div>

    </div>
  );
}
