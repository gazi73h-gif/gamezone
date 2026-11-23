'use client';
import Leaderboard from '../components/Leaderboard';
import GameArt, { GAME_THEME } from '../components/GameArt';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { LOBBY_CHANNEL, LobbyRoom, lobbyRoomsFrom } from '../lib/lobby';
import { Coins, Gift, Users, Play, LogIn, Bot, Zap, Smartphone, ArrowRight } from 'lucide-react';

interface GameInfo { id: string; title: string; subtitle: string; players: string; badge?: string; }

const GAMES: GameInfo[] = [
  { id: 'ludo', title: 'Ludo', subtitle: 'Mos u zemëro! Çoji 4 figurat në shtëpi', players: '2 - 4', badge: 'Popullore' },
  { id: 'pishpirik', title: 'Pishpirik', subtitle: 'Loja tradicionale shqiptare me letra', players: '2 ose 4' },
  { id: 'rummy', title: 'Okey', subtitle: 'Okey klasik me tregues, Okey dhe 7 çifte', players: '2 - 4' },
  { id: 'uno', title: 'UNO Shqip', subtitle: 'Letra me ngjyra dhe karta speciale', players: '2 - 6' },
  { id: 'yamb', title: 'Yamb', subtitle: 'Zarat dhe tabela e pikëve', players: '1 - 4', badge: 'E re' },
  { id: 'shah', title: 'Shah', subtitle: 'Strategji 1 me 1 ose kundër AI', players: '1 - 2' },
];

const gameTitle = (id: string) => GAMES.find((g) => g.id === id)?.title || id;

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [tokens, setTokens] = useState<number>(1000);
  const [canClaimDaily, setCanClaimDaily] = useState<boolean>(false);
  const [joinCode, setJoinCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [openRooms, setOpenRooms] = useState<LobbyRoom[]>([]);

  // Dhomat e hapura: i shpallin vetë krijuesit sa janë online dhe kanë vend të lirë
  useEffect(() => {
    const ch = supabase.channel(LOBBY_CHANNEL);
    ch.on('presence', { event: 'sync' }, () => setOpenRooms(lobbyRoomsFrom(ch.presenceState()))).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Pastro dhomat në pritje që askush s'i ka nisur për më shumë se 5 minuta
  useEffect(() => {
    const cleanup = async () => {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase.from('rooms').select('code').eq('status', 'waiting').lt('created_at', cutoff).limit(50);
      const codes = (data || []).map((r) => r.code);
      if (codes.length === 0) return;
      await supabase.from('room_players').delete().in('room_code', codes);
      await supabase.from('rooms').delete().in('code', codes);
    };
    cleanup();
    const interval = setInterval(cleanup, 60000);
    return () => clearInterval(interval);
  }, []);
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Shiriti i sipërm ── */}
      <header className="flex items-center justify-between gap-3 py-5">
        <span className="flex items-center gap-2.5 shrink-0">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-gold to-gold-2 shadow-[0_4px_0_#b86a00] -rotate-8">
            <span className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#2a1600]" />)}
            </span>
          </span>
          <span className="font-display text-2xl font-bold tracking-tight">
            Game<span className="text-gold">Zone</span>
          </span>
        </span>
        <div className="flex items-center gap-2">
          {canClaimDaily && (
            <button onClick={claimDailyBonus} className="flex items-center gap-1.5 bg-mint/15 hover:bg-mint/25 text-mint border border-mint/40 text-xs sm:text-sm font-extrabold px-3 py-2 rounded-full transition cursor-pointer">
              <Gift className="w-4 h-4" /> <span className="hidden sm:inline">Bonusi ditor</span> +250
            </button>
          )}
          <div className="flex items-center gap-1.5 bg-night-2/80 border border-gold/30 pl-1.5 pr-3.5 py-1.5 rounded-full" title="Tokens">
            <span className="grid place-items-center w-6 h-6 rounded-full bg-gold/20"><Coins className="w-4 h-4 text-gold" /></span>
            <span className="font-display font-semibold text-gold">{tokens.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* ── Hero + profili ── */}
      <section className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-10 items-center pt-2 sm:pt-6 pb-10">
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-mint bg-mint/10 border border-mint/30 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-mint animate-pulse" /> Live, në kohë reale
          </span>
          <h1 className="font-display font-bold text-[2.6rem] leading-[1.02] sm:text-6xl mt-4 text-balance">
            Luaj me shokët,<br />
            <span className="bg-gradient-to-r from-gold via-[#ff8f6b] to-[#ff5db1] bg-clip-text text-transparent">kudo që janë.</span>
          </h1>
          <p className="text-mute text-base sm:text-lg mt-4 max-w-md">
            Ludo, Okey, Pishpirik, UNO, Yamb dhe Shah. Krijo një dhomë, ndaje kodin dhe fillo lojën.
          </p>
          <ul className="flex flex-wrap gap-2 mt-6 text-sm font-bold">
            <li className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full"><Zap className="w-4 h-4 text-gold" /> Pa regjistrim</li>
            <li className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full"><Bot className="w-4 h-4 text-[#8b7cf6]" /> Bot kur je vetëm</li>
            <li className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full"><Smartphone className="w-4 h-4 text-mint" /> Në telefon</li>
          </ul>
        </div>

        <div className="gz-panel rounded-[28px] p-5 sm:p-6">
          <label htmlFor="nick" className="block font-display font-semibold text-lg mb-3">Si të thërrasim?</label>
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-[#8b7cf6] to-[#ff5db1] font-display font-bold text-lg">
              {(nickname.trim() || '?').slice(0, 2).toUpperCase()}
            </span>
            <input id="nick" type="text" value={nickname} onChange={(e) => handleSaveNickname(e.target.value)} placeholder="Nofka jote, p.sh. Arben_KS" maxLength={18}
              className="gz-input w-full min-w-0 rounded-2xl px-4 py-3 text-ink placeholder:text-mute/60 font-semibold" />
          </div>

          <div className="flex items-center gap-3 my-5 text-xs font-bold uppercase tracking-widest text-mute/70">
            <span className="h-px flex-1 bg-white/10" /> ose hyr me kod <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); joinRoomByCode(joinCode); }} className="flex gap-2">
            <input type="text" inputMode="numeric" aria-label="Kodi i dhomës" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="• • • •"
              className="gz-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-center font-display text-2xl tracking-[0.4em] text-gold placeholder:text-mute/40" />
            <button type="submit" disabled={loading || joinCode.length !== 4} className="gz-btn flex items-center gap-2 font-display font-semibold text-lg px-5 rounded-2xl cursor-pointer">
              <LogIn className="w-5 h-5" /> Hyr
            </button>
          </form>

          {errorMsg && (<p role="alert" className="mt-4 bg-coral/10 border border-coral/40 text-[#ffb3bf] px-4 py-3 rounded-2xl text-sm font-semibold">{errorMsg}</p>)}
        </div>
      </section>

      {/* ── Dhomat e hapura ── */}
      {openRooms.length > 0 && (
        <section className="mb-10">
          <h2 className="flex items-center gap-2 font-display font-semibold text-xl mb-3">
            <span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-mint animate-ping" /><span className="relative w-2.5 h-2.5 rounded-full bg-mint" /></span>
            Dhoma që të presin <span className="text-mute text-base">({openRooms.length})</span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {openRooms.map((rm) => {
              const t = GAME_THEME[rm.game_type] ?? GAME_THEME.ludo;
              return (
                <div key={rm.code} className="gz-panel snap-start shrink-0 w-64 rounded-3xl p-3 flex items-center gap-3">
                  <GameArt game={rm.game_type} className="w-14 h-14 rounded-2xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-semibold truncate" style={{ color: t.from }}>{gameTitle(rm.game_type)}</div>
                    <div className="text-xs text-mute truncate"><strong className="text-ink">{rm.hostName}</strong> · {rm.playerCount} lojtarë</div>
                  </div>
                  <button onClick={() => joinRoomByCode(rm.code)} aria-label={`Bashkohu në dhomën ${rm.code}`} className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-mint text-night hover:brightness-110 transition cursor-pointer">
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Lojërat ── */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display font-semibold text-2xl sm:text-3xl">Zgjidh lojën</h2>
          <span className="text-sm text-mute hidden sm:block">Krijo dhomë dhe ndaje kodin me shokët</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {GAMES.map((game) => {
            const t = GAME_THEME[game.id];
            return (
              <button key={game.id} onClick={() => handleCreateRoom(game.id)} disabled={loading}
                className="group text-left gz-panel rounded-[26px] p-2 sm:p-2.5 flex flex-col transition duration-200 hover:-translate-y-1.5 disabled:opacity-60 cursor-pointer"
                style={{ ['--glow' as string]: t.glow }}>
                <div className="relative w-full">
                  <GameArt game={game.id} className="aspect-[4/3] rounded-[20px] transition group-hover:shadow-[0_18px_40px_-12px_var(--glow)]" />
                  {game.badge && (
                    <span className="absolute top-2.5 left-2.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wide bg-night/70 backdrop-blur px-2.5 py-1 rounded-full">{game.badge}</span>
                  )}
                  <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-[11px] font-extrabold bg-night/70 backdrop-blur px-2.5 py-1 rounded-full">
                    <Users className="w-3.5 h-3.5" /> {game.players}
                  </span>
                </div>
                <div className="w-full px-1.5 sm:px-2 pt-3 pb-1.5 flex-1 flex flex-col">
                  <h3 className="font-display font-semibold text-lg sm:text-xl leading-tight">{game.title}</h3>
                  <p className="text-xs sm:text-sm text-mute mt-1 flex-1">{game.subtitle}</p>
                  <span className="mt-3 inline-flex items-center justify-center gap-1.5 w-full rounded-2xl py-2.5 font-display font-semibold text-sm sm:text-base text-white transition group-hover:brightness-110"
                    style={{ background: `linear-gradient(180deg, ${t.from}, ${t.to})`, boxShadow: '0 3px 0 rgb(0 0 0 / 0.3)' }}>
                    <Play className="w-4 h-4 fill-current" /> Luaj tani
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-12"><Leaderboard /></section>

      <footer className="mt-12 text-center text-xs text-mute/70">GameZone · Lojëra tavoline &amp; letra në shqip</footer>
    </div>
  );
}
