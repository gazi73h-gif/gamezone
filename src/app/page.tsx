'use client';
import Leaderboard from '../components/Leaderboard';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { Dices, Spade, Layers, Compass, LayoutGrid, Coins, Gift, Users, Play, LogIn, Sparkles, Gamepad2, Radio } from 'lucide-react';

interface GameInfo { id: string; title: string; subtitle: string; players: string; icon: React.ReactNode; color: string; badge?: string; }

const GAMES: GameInfo[] = [
  { id: 'yamb', title: 'Yamb (Jamb)', subtitle: 'Lojë me 5 ose 6 zara dhe tabelë pikësh', players: '1 - 4 Lojtarë', icon: <Dices className="w-8 h-8" />, color: 'from-amber-500 to-orange-600', badge: 'E re' },
  { id: 'pishpirik', title: 'Pishpirik', subtitle: 'Loja tradicionale shqiptare me letra', players: '2 ose 4 Lojtarë', icon: <Spade className="w-8 h-8" />, color: 'from-emerald-500 to-teal-700', badge: 'Popullore' },
  { id: 'shah', title: 'Shah (Chess)', subtitle: 'Lojë klasike 1v1 e strategjisë 3D ose kundër AI', players: '1 - 2 Lojtarë', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M19 22H5v-2h14v2M17.16 8.26A4.96 4.96 0 0 0 15 6.45V4l-2.85 1.9C11.45 5.65 10.74 5.5 10 5.5C6.96 5.5 4.5 7.96 4.5 11c0 1.48.59 2.83 1.54 3.82L4.5 18h15l-1.58-5.53c.48-.68.78-1.5.78-2.4c0-.66-.19-1.27-.54-1.81M10 10a1 1 0 1 1 0-2a1 1 0 0 1 0 2Z"/></svg>, color: 'from-amber-500 to-amber-700' },
  { id: 'uno', title: 'UNO Shqip', subtitle: 'Letra me ngjyra dhe karta speciale', players: '2 - 6 Lojtarë', icon: <Layers className="w-8 h-8" />, color: 'from-red-500 to-red-700' },
  { id: 'ludo', title: 'Ludo (Mos u zemëro)', subtitle: 'Gara klasike me 4 figura drejt shtëpisë', players: '2 - 4 Lojtarë', icon: <Compass className="w-8 h-8" />, color: 'from-blue-500 to-indigo-600' },
  { id: 'rummy', title: 'Rummy / Jol', subtitle: '108 letra + 4 Joker, hapja e serive', players: '2 - 4 Lojtarë', icon: <LayoutGrid className="w-8 h-8" />, color: 'from-purple-500 to-violet-700' },
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
  const [openRooms, setOpenRooms] = useState<Array<{ code: string; game_type: string; playerCount: number; hostName: string }>>(Array.of());

  const fetchOpenRooms = async () => {
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('code, game_type, created_at')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(15);

    if (!roomsData || roomsData.length === 0) {
      setOpenRooms([]);
      return;
    }

    // Mbylle dhe pastro automatikisht çdo dhomë pa aktivitet më të vjetër se 5 minuta
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const staleCodes = roomsData
      .filter((r) => r.created_at && new Date(r.created_at).getTime() < fiveMinutesAgo)
      .map((r) => r.code);

    if (staleCodes.length > 0) {
      await supabase.from('room_players').delete().in('room_code', staleCodes);
      await supabase.from('rooms').delete().in('code', staleCodes);
    }

    const activeRooms = roomsData.filter(
      (r) => !r.created_at || new Date(r.created_at).getTime() >= fiveMinutesAgo
    );

    const codes = activeRooms.map((r) => r.code);
    if (codes.length === 0) {
      setOpenRooms([]);
      return;
    }

    const { data: playersData } = await supabase
      .from('room_players')
      .select('room_code, nickname, seat_order')
      .in('room_code', codes);

    const formatted = activeRooms
      .map((r) => {
        const rp = (playersData || []).filter((p) => p.room_code === r.code);
        const host = rp.find((p) => p.seat_order === 1) || rp[0];
        return {
          code: r.code,
          game_type: r.game_type,
          playerCount: rp.length,
          hostName: host?.nickname || 'Lojtar',
        };
      })
      .filter((r) => r.playerCount > 0);

    setOpenRooms(formatted);
  };

  useEffect(() => { fetchOpenRooms(); const interval = setInterval(fetchOpenRooms, 3000); return () => clearInterval(interval); }, []);
  useEffect(() => {
    let storedId = localStorage.getItem('gamezone_player_id');
    if (!storedId) { storedId = 'player_' + Math.random().toString(36).substring(2, 10); localStorage.setItem('gamezone_player_id', storedId); }
    setPlayerId(storedId);
    const storedNick = localStorage.getItem('gamezone_nickname'); if (storedNick) setNickname(storedNick);
    const storedTokens = localStorage.getItem('gamezone_tokens'); if (storedTokens) setTokens(parseInt(storedTokens, 10)); else localStorage.setItem('gamezone_tokens', '1000');
    if (localStorage.getItem('gamezone_last_bonus') !== new Date().toDateString()) setCanClaimDaily(true);
  }, []);
  const handleSaveNickname = (val: string) => { setNickname(val); localStorage.setItem('gamezone_nickname', val); };
  const claimDailyBonus = () => { if (!canClaimDaily) return; const nb = tokens + 250; setTokens(nb); setCanClaimDaily(false); localStorage.setItem('gamezone_tokens', nb.toString()); localStorage.setItem('gamezone_last_bonus', new Date().toDateString()); };

  const handleCreateRoom = async (gameId: string) => {
    if (!nickname.trim()) { setErrorMsg('Ju lutem shkruani një nofkë (emër) përpara se të filloni!'); return; }
    setErrorMsg(''); setLoading(true);
    try {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const { error: re } = await supabase.from('rooms').insert([{ code, game_type: gameId, host_id: playerId, status: 'waiting' }]); if (re) throw re;
      const { error: pe } = await supabase.from('room_players').insert([{ room_code: code, player_id: playerId, nickname: nickname.trim(), seat_order: 1 }]); if (pe) throw pe;
      router.push(`/room/${code}`);
    } catch { setErrorMsg('Gabim gjatë krijimit të dhomës. Kontrolloni lidhjen me Supabase.'); } finally { setLoading(false); }
  };

  const joinRoomByCode = async (targetCode: string) => {
    if (!nickname.trim()) { setErrorMsg('Ju lutem shkruani një nofkë përpara se të hyni në dhomë!'); return; }
    if (targetCode.length !== 4) { setErrorMsg('Kodi i dhomës duhet të ketë saktësisht 4 shifra.'); return; }
    setErrorMsg(''); setLoading(true);
    try {
      const { data: room, error: fe } = await supabase.from('rooms').select('*').eq('code', targetCode).single();
      if (fe || !room) { setErrorMsg('Kjo dhomë nuk ekziston ose ka përfunduar.'); setLoading(false); return; }
      const { data: players } = await supabase.from('room_players').select('*').eq('room_code', targetCode);
      const { error: je } = await supabase.from('room_players').upsert({ room_code: targetCode, player_id: playerId, nickname: nickname.trim(), seat_order: (players?.length || 0) + 1 }, { onConflict: 'room_code,player_id' }); if (je) throw je;
      router.push(`/room/${targetCode}`);
    } catch { setErrorMsg('Gabim gjatë hyrjes në dhomë.'); } finally { setLoading(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2.5 rounded-xl text-slate-950"><Gamepad2 className="w-7 h-7" /></div>
          <div><h1 className="text-2xl font-extrabold tracking-tight text-white">Game<span className="text-amber-400">Zone</span></h1><p className="text-xs text-slate-400">Lojëra tavoline & letra në kohë reale</p></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/30 px-4 py-2 rounded-xl"><Coins className="w-5 h-5 text-amber-400" /><span className="font-bold text-amber-300">{tokens.toLocaleString()}</span><span className="text-xs text-slate-400">Tokens</span></div>
          {canClaimDaily && (<button onClick={claimDailyBonus} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition cursor-pointer"><Gift className="w-4 h-4" /> +250 Bonus Ditor</button>)}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <label className="block text-sm font-semibold text-slate-300 mb-2">1. Shkruaj Nofkën tënde (Emrin në lojë)</label>
          <input type="text" value={nickname} onChange={(e) => handleSaveNickname(e.target.value)} placeholder="p.sh. Arben_KS, Shqiponja..." maxLength={18} className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-white outline-none transition" />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); joinRoomByCode(joinCode); }} className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <label className="block text-sm font-semibold text-slate-300 mb-2">2. Ke një kod dhome nga shokët?</label>
          <div className="flex gap-2">
            <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Kodi 4-shifror (p.sh. 4829)" className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-white tracking-widest font-mono text-center text-lg outline-none transition" />
            <button type="submit" disabled={loading || joinCode.length !== 4} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition cursor-pointer"><LogIn className="w-5 h-5" /> Hyr</button>
          </div>
        </form>
      </div>

      {errorMsg && (<div className="bg-red-500/10 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm font-medium">{errorMsg}</div>)}

      {openRooms.length > 0 && (
        <div className="mb-8 bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3"><Radio className="w-4 h-4 text-emerald-400 animate-pulse" /><h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">Dhoma të Hapura Live ({openRooms.length})</h2></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {openRooms.map((rm) => (
              <div key={rm.code} className="flex items-center justify-between bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl">
                <div><div className="text-xs font-bold text-amber-400 uppercase">{GAMES.find((g) => g.id === rm.game_type)?.title || rm.game_type}</div><div className="text-xs text-slate-400">Krijuar nga <strong className="text-white">{rm.hostName}</strong> • {rm.playerCount} lojtarë</div></div>
                <button onClick={() => joinRoomByCode(rm.code)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition cursor-pointer">Bashkohu</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-5"><Sparkles className="w-5 h-5 text-amber-400" /><h2 className="text-xl font-bold text-white">Zgjidh Lojën & Hap Tavolinën</h2></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {GAMES.map((game) => (
          <div key={game.id} className="group relative bg-slate-900/90 border border-slate-800 hover:border-slate-600 rounded-2xl p-6 flex flex-col justify-between transition-all hover:-translate-y-1 shadow-lg">
            {game.badge && (<span className="absolute top-4 right-4 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full">{game.badge}</span>)}
            <div>
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center text-white mb-4 shadow-md`}>{game.icon}</div>
              <h3 className="text-lg font-bold text-white mb-1">{game.title}</h3>
              <p className="text-sm text-slate-400 mb-4">{game.subtitle}</p>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
              <span className="flex items-center gap-1.5 text-xs text-slate-400"><Users className="w-4 h-4 text-slate-500" />{game.players}</span>
              <button onClick={() => handleCreateRoom(game.id)} disabled={loading} className="flex items-center gap-1.5 bg-slate-800 hover:bg-amber-500 text-white hover:text-slate-950 font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"><Play className="w-3.5 h-3.5 fill-current" /> Krijo Dhomë</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10"><Leaderboard /></div>
    </div>
  );
}