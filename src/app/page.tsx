'use client';
import Leaderboard from '../components/Leaderboard';
import DailyMissions from '../components/DailyMissions';
import { cleanupRooms, createRoom, joinRoom, RoomError } from '../lib/rooms';
import GameArt, { GAME_THEME } from '../components/GameArt';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { LOBBY_CHANNEL, LobbyRoom, lobbyRoomsFrom, MAX_SEATS } from '../lib/lobby';
import { useAccount, bonusAvailable, ACCOUNTS_OPEN } from '../lib/account';
import AccountMenu from '../components/AccountMenu';
import { useOnlineCount } from '../lib/online';
import { UserAvatar } from '../lib/avatars';
import { Coins, Gift, Users, Play, LogIn, Bot, Zap, Smartphone, ArrowRight, Pencil, Check, ShieldCheck, Dices } from 'lucide-react';

// nofkë e rastësishme, që lojtari i ri të luajë menjëherë
const NICK_WORDS = ['Ujku', 'Shqiponja', 'Luani', 'Tigri', 'Ariu', 'Skifteri', 'Dragoi', 'Rrufeja', 'Yllka', 'Zjarri', 'Mbreti', 'Kampioni', 'Fantazma', 'Shigjeta', 'Gjeniu', 'Bomba'];
const randomNick = () => `${NICK_WORDS[Math.floor(Math.random() * NICK_WORDS.length)]}_${Math.floor(10 + Math.random() * 90)}`;

interface GameInfo { id: string; title: string; subtitle: string; players: string; badge?: string; }

const GAMES: GameInfo[] = [
  { id: 'ludo', title: 'Ludo', subtitle: 'Mos u zemëro! Çoji 4 figurat në shtëpi', players: '2 - 4', badge: 'Popullore' },
  { id: 'pishpirik', title: 'Pishpirik', subtitle: 'Loja tradicionale shqiptare me letra', players: '2 ose 4' },
  { id: 'rummy', title: 'Okey', subtitle: 'Okey klasik · 4 raunde, çifte dhe Okey', players: '2 - 4' },
  { id: 'uno', title: 'UNO Shqip', subtitle: 'Letra me ngjyra dhe karta speciale', players: '2 - 6' },
  { id: 'yamb', title: 'Yamb', subtitle: 'Zarat dhe tabela e pikëve', players: '1 - 4' },
  { id: 'shah', title: 'Shah', subtitle: 'Strategji 1 me 1 ose kundër AI', players: '1 - 2' },
];

const gameTitle = (id: string) => GAMES.find((g) => g.id === id)?.title || id;

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const account = useAccount();
  const onlineCount = useOnlineCount();
  // me llogari: ID e llogarisë dhe tokens nga serveri; pa llogari: si mysafir në këtë shfletues
  const myId = account.user?.id ?? playerId;
  const online = !!account.user && account.serverReady === true && !!account.profile;
  const [profileNick, setProfileNick] = useState('');
  const [editingNick, setEditingNick] = useState(false);
  if (account.profile && account.profile.nickname !== profileNick) {
    setProfileNick(account.profile.nickname);
    setNickname(account.profile.nickname);
  }
  const [tokens, setTokens] = useState<number>(1000);
  const [canClaimDaily, setCanClaimDaily] = useState<boolean>(false);
  const [joinCode, setJoinCode] = useState<string>('');
  const [invite, setInvite] = useState('');
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
    // fshi vetëm dhomat pa asnjë lojtar (një dhomë mund të kthehet "në pritje" kur largohet boti)
    const cleanup = () => { void cleanupRooms(); };
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
    const kod = new URLSearchParams(window.location.search).get('kod');
    if (kod && /^\d{4}$/.test(kod)) { setJoinCode(kod); setInvite(kod); }
  }, []);
  const handleSaveNickname = (val: string) => { setNickname(val); localStorage.setItem('gamezone_nickname', val); };
  const autoNick = () => { const n = randomNick(); handleSaveNickname(n); return n; };
  const claimDailyBonus = () => { if (!canClaimDaily) return; const nb = tokens + 250; setTokens(nb); setCanClaimDaily(false); localStorage.setItem('gamezone_tokens', nb.toString()); localStorage.setItem('gamezone_last_bonus', new Date().toDateString()); };

  const handleCreateRoom = async (gameId: string) => {
    const nick = nickname.trim() || autoNick();
    setErrorMsg(''); setLoading(true);
    try {
      const code = await createRoom(myId, gameId, nick, account.avatar);
      router.push(`/room/${code}`);
    } catch (e) {
      setErrorMsg(e instanceof RoomError && e.reason === 'slow_down' ? 'Prit pak — po krijon shumë dhoma njëherësh.' : 'Gabim gjatë krijimit të dhomës. Kontrolloni internetin.');
    } finally { setLoading(false); }
  };

  const joinRoomByCode = async (targetCode: string) => {
    const nick = nickname.trim() || autoNick();
    if (targetCode.length !== 4) { setErrorMsg('Kodi i dhomës duhet të ketë saktësisht 4 shifra.'); return; }
    setErrorMsg(''); setLoading(true);
    try {
      await joinRoom(myId, targetCode, nick, account.avatar);
      router.push(`/room/${targetCode}`);
    } catch (e) {
      const reason = e instanceof RoomError ? e.reason : '';
      setErrorMsg(reason === 'no_room' ? 'Kjo dhomë nuk ekziston ose ka përfunduar.' : reason === 'room_full' ? 'Kjo dhomë është plot.' : 'Gabim gjatë hyrjes në dhomë.');
    } finally { setLoading(false); }
  };


  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Shiriti i sipërm ── */}
      <header className="flex items-center justify-between gap-2 py-4 sm:py-5">
        <span className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="grid place-items-center w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-2xl bg-gradient-to-br from-gold to-gold-2 shadow-[0_4px_0_#b86a00] -rotate-8">
            <span className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#2a1600]" />)}
            </span>
          </span>
          <span className="font-display text-xl sm:text-2xl font-bold tracking-tight truncate hidden min-[360px]:inline">
            Game<span className="text-gold">Zone</span>
          </span>
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {(online ? bonusAvailable(account.profile) : canClaimDaily) && (
            <button aria-label="Merr bonusin ditor +250 tokens" title="Bonusi ditor +250" onClick={online ? () => void account.claimBonus() : claimDailyBonus} className="flex items-center gap-1.5 bg-mint/15 hover:bg-mint/25 text-mint border border-mint/40 text-xs sm:text-sm font-extrabold p-2 sm:px-3 rounded-full transition cursor-pointer">
              <Gift className="w-4 h-4" /> <span className="hidden sm:inline">Bonusi ditor +250</span>
            </button>
          )}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-night-2/80 border border-gold/30 pl-1 sm:pl-1.5 pr-2.5 sm:pr-3.5 py-1 sm:py-1.5 rounded-full" title={online ? 'Tokens (të ruajtura në server)' : 'Tokens (vetëm në këtë pajisje)'}>
            <span className="grid place-items-center w-6 h-6 rounded-full bg-gold/20"><Coins className="w-4 h-4 text-gold" /></span>
            <span className="font-display font-semibold text-gold">{(online ? account.profile!.tokens : tokens).toLocaleString()}</span>
          </div>
          {(ACCOUNTS_OPEN || account.user) && <AccountMenu account={account} />}
        </div>
      </header>

      {/* ── Hero + profili ── */}
      <section className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-10 items-center pt-2 sm:pt-6 pb-10">
        <div>
          <span data-testid="online-count" className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-mint bg-mint/10 border border-mint/30 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
            {onlineCount > 0 ? <><b className="text-sm">{onlineCount}</b> {onlineCount === 1 ? 'lojtar online' : 'lojtarë online'}</> : 'Live, në kohë reale'}
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
          {invite && (
            <p className="mb-4 bg-mint/10 border border-mint/40 text-mint font-bold text-sm px-4 py-2.5 rounded-2xl" data-testid="invite">
              🎉 Je ftuar në dhomën <b className="tracking-widest">{invite}</b> — shkruaj nofkën dhe shtyp <b>Hyr</b>!
            </p>
          )}
          {account.user && !editingNick ? (
            /* i kyçur: emri dihet, s'ka nevojë për kutinë e nofkës */
            <div className="flex items-center gap-3">
              <UserAvatar src={account.avatar} name={nickname} className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-[#8b7cf6] to-[#ff5db1] font-display font-bold text-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-mute">Mirë se erdhe,</p>
                <p className="font-display font-bold text-2xl leading-tight truncate">{nickname || 'Lojtar'}!</p>
                <p className="flex items-center gap-1 text-xs font-bold text-mint mt-0.5"><ShieldCheck className="w-3.5 h-3.5" /> I kyçur · pikët ruhen në llogari</p>
              </div>
              <button onClick={() => setEditingNick(true)} aria-label="Ndrysho nofkën" title="Ndrysho nofkën"
                className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="nick" className="block font-display font-semibold text-lg mb-3">{account.user ? 'Ndrysho nofkën' : 'Si të thërrasim?'}</label>
              <form className="flex items-center gap-3" onSubmit={(e) => { e.preventDefault(); if (nickname.trim()) setEditingNick(false); }}>
                <UserAvatar src={account.avatar} name={nickname} className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-[#8b7cf6] to-[#ff5db1] font-display font-bold text-lg" />
                <input id="nick" type="text" value={nickname} autoFocus={editingNick} onChange={(e) => handleSaveNickname(e.target.value)} onBlur={() => { if (online && nickname.trim() && nickname !== account.profile?.nickname) void account.saveNickname(nickname); }} placeholder="Nofka jote, p.sh. Arben_KS" maxLength={18}
                  className="gz-input w-full min-w-0 rounded-2xl px-4 py-3 text-ink placeholder:text-mute/60 font-semibold" />
                {!editingNick && (
                  <button type="button" onClick={() => handleSaveNickname(randomNick())} aria-label="Nofkë e rastësishme" title="Nofkë e rastësishme"
                    className="grid place-items-center w-12 h-12 shrink-0 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gold cursor-pointer transition">
                    <Dices className="w-5 h-5" />
                  </button>
                )}
                {editingNick && (
                  <button type="submit" aria-label="Ruaj nofkën" className="grid place-items-center w-12 h-12 shrink-0 rounded-2xl bg-mint text-night cursor-pointer">
                    <Check className="w-5 h-5" />
                  </button>
                )}
              </form>
            </>
          )}

          <div className="flex items-center gap-3 my-5 text-xs font-bold uppercase tracking-widest text-mute/70">
            <span className="h-px flex-1 bg-white/10" /> {account.user ? 'hyr në dhomën e shokut' : 'ose hyr me kod'} <span className="h-px flex-1 bg-white/10" />
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
                <div key={rm.code} className="gz-room gz-panel snap-start shrink-0 w-72 rounded-3xl p-3" style={{ ['--glow' as string]: t.glow }}>
                  <div className="flex items-center gap-3">
                    <GameArt game={rm.game_type} className="w-14 h-14 rounded-2xl shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-semibold text-lg leading-tight truncate" style={{ color: t.from }}>{gameTitle(rm.game_type)}</div>
                      <span className={`gz-status gz-status-${rm.status}`}>
                        <span className="gz-status-dot" />
                        {rm.status === 'bot' ? 'Duke luajtur me Bot' : rm.status === 'seats' ? 'Vende të lira' : 'Në pritje të lojtarit'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="w-8 h-8 shrink-0 rounded-full overflow-hidden font-display font-bold text-xs text-white" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
                      <UserAvatar src={rm.hostAvatar} name={rm.hostName} className="w-full h-full" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{rm.hostName}</div>
                      <div className="flex items-center gap-1" aria-label={`${rm.playerCount} lojtarë`}>
                        {Array.from({ length: MAX_SEATS[rm.game_type] ?? 4 }).map((_, i) => (
                          <span key={i} className={`w-2 h-2 rounded-full ${i < rm.playerCount ? 'bg-mint' : 'bg-white/15'}`} />
                        ))}
                      </div>
                    </div>
                    <button onClick={() => joinRoomByCode(rm.code)} aria-label={`Bashkohu në dhomën ${rm.code}`}
                      className="flex items-center gap-1 shrink-0 rounded-full bg-mint text-night font-display font-semibold text-sm pl-3.5 pr-3 py-2 hover:brightness-110 transition cursor-pointer">
                      Luaj <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
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

      <section className="mt-12">
        <DailyMissions onReward={(t) => setTokens(t)} />
      </section>
      <section className="mt-6"><Leaderboard /></section>

      <footer className="mt-12 text-center text-xs text-mute/70 space-x-2">
        <span>GameZone · Lojëra tavoline &amp; letra në shqip</span>
        <span>·</span><a href="/privatesia" className="underline hover:text-ink">Privatësia</a>
      </footer>
    </div>
  );
}
