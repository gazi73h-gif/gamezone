'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { BOT_IDS, MAX_SEATS, LOBBY_CHANNEL, isJoinable, hasBot } from '../../../lib/lobby';
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
import SoundToggle from '../../../components/SoundToggle';
import { setRoomAvatars, UserAvatar } from '../../../lib/avatars';
import RummyGame from '../../../components/RummyGame';
import { initLudoGame, LudoGameState } from '../../../lib/ludoLogic';
import { initRummyGame, RummyGameState } from '../../../lib/rummyLogic';
import { saveRoomState } from '../../../lib/roomSync';
import { closeRoom, leaveRoom, timeoutSignal, updateRoom } from '../../../lib/rooms';
import { ludoAction, okeyAction, type LudoAction, type OkeyAction } from '../../../lib/ludoRemote';

// Ludo: nisja dhe vendet bëhen nga serveri kur funksioni "ludo-action" është gati
const ludoServerHandled = async (code: string, player: string, action: LudoAction) => {
  const res = await ludoAction(code, player, action);
  return res.ok || res.reason !== 'unavailable';
};
// Okey: njësoj, me "okey-action"
const okeyServerHandled = async (code: string, player: string, action: OkeyAction) => {
  const res = await okeyAction(code, player, action);
  return res.ok || res.reason !== 'unavailable';
};
const serverHandled = (game: string, code: string, player: string, type: 'start' | 'sync') =>
  game === 'ludo' ? ludoServerHandled(code, player, { type }) : game === 'rummy' ? okeyServerHandled(code, player, { type }) : Promise.resolve(false);

// statistikat: sa lojëra niset (serveri injoron dyfishimet; gabimet s'e prekin lojën)
const logGameStart = (room: string, game: string, players: number) => {
  void supabase.rpc('log_game_start', { p_room: room, p_game: game, p_players: players }).then(() => {}, () => {});
};
import { SEAT_GAMES, syncSeats, hasFreeSeat } from '../../../lib/seats';

import { Copy, Check, Users, ArrowLeft, Play, Crown, AlertTriangle, RotateCcw } from 'lucide-react';
import { CHAT_GAMES, useRoomChat } from '../../../lib/chat';
import { trackGame } from '../../../lib/daily';
import { ChatButton, ChatBubbles } from '../../../components/RoomChat';

interface Player {
  id: string;
  avatar_url?: string | null;
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
  rummy: 'Okey',
};

/* Fto shokët me një prekje: WhatsApp, Viber ose ndarja e telefonit. Linku hap faqen me kodin gati. */
function InviteButtons({ code, game }: { code: string; game: string }) {
  const link = typeof window !== 'undefined' ? `${window.location.origin}/?kod=${code}` : '';
  const text = `Eja luaj ${game} me mua në GameZone! 🎲 Kodi: ${code}\n${link}`;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'GameZone', text }); return; } catch { return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  const btn = 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-extrabold transition cursor-pointer';
  return (
    <div className="flex gap-2 mt-3" data-testid="invite-buttons">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#5ff09a] border border-[#25d366]/40`}>WhatsApp</a>
      <a href={`viber://forward?text=${encodeURIComponent(text)}`} className={`${btn} bg-[#7360f2]/15 hover:bg-[#7360f2]/25 text-[#b3a8ff] border border-[#7360f2]/40`}>Viber</a>
      <button type="button" onClick={() => void share()} className={`${btn} bg-white/5 hover:bg-white/10 border border-white/10`}>Fto…</button>
    </div>
  );
}

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
  const [newGameBusy, setNewGameBusy] = useState(false);

  // Monitorimi i mosaktivitetit
  const lastActivityRef = useRef<number>(Date.now());
  const [inactivityWarning, setInactivityWarning] = useState<number | null>(null);
  const isClosingRef = useRef<boolean>(false);

  // Koha e rifillimit të fundit, që dy kërkesa të njëpasnjëshme të mos e rifillojnë lojën dy herë
  const lastRestartRef = useRef<number>(0);

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
        // vendet bosh (deri në 4) i zënë botët
        return initRummyGame(withBot ? [mapped[0]] : mapped);
      }
      return null;
    },
    []
  );

  useEffect(() => {
    const storedId = localStorage.getItem('gamezone_player_id') || '';
    setCurrentPlayerId(storedId);

    // Vetëm një lexim njëkohësisht dhe me afat: në telefon, pas gjumit, kërkesat mund të mbeten pa
    // përgjigje ose të vijnë me vonesë dhe të mbishkruajnë një gjendje më të re.
    let inFlight = false;
    let inFlightSince = 0;
    let disposed = false;
    let lastPush = 0;
    const fetchRoomData = async () => {
      if (disposed || (inFlight && Date.now() - inFlightSince < 15000)) return;
      inFlight = true;
      inFlightSince = Date.now();
      try { await readRoom(); } catch { /* s'ka lidhje: provohet sërish pas pak */ } finally { inFlight = false; }
    };
    const readRoom = async () => {
      const started = Date.now();
      const { data: roomData, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .abortSignal(timeoutSignal(10000))
        .maybeSingle();
      if (disposed) return;
      if (error) return; // gabim interneti, jo dhomë e mbyllur
      if (lastPush > started) return; // ndërkohë erdhi një gjendje më e re live

      if (!roomData) {
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
        .order('seat_order', { ascending: true })
        .abortSignal(timeoutSignal(10000));

      if (playersData) {
        setPlayers(playersData);

        // Gjej vetëm lojtarët real (jo-bot)
        const realPlayers = playersData.filter(
          (p) => !BOT_IDS.includes(p.player_id)
        );
        const storedHostId = localStorage.getItem('gamezone_player_id') || '';
        const isHostNow = roomData.host_id === storedHostId;

        // Dhoma pret: krijuesi fton shokët ose shtyp "Fillo me bot" (pa nisje automatike)

        const hostHere = realPlayers.some((p) => p.player_id === storedHostId);
        const stateText = JSON.stringify(roomData.game_state ?? '');
        const joiners = realPlayers.filter((p) => !stateText.includes(p.player_id));

        // Hyri një lojtar i vërtetë në një lojë me bot: boti largohet, loja ndalet dhe të gjithë
        // shohin "Filloni një lojë të re" (për të gjitha lojërat)
        if (
          isHostNow &&
          hostHere &&
          roomData.status === 'playing' &&
          !SEAT_GAMES.includes(roomData.game_type) && // Ludo/Okey: lojtari i ri zë vendin e botit, loja vazhdon
          hasBot(roomData.game_state) &&
          joiners.length > 0 &&
          Date.now() - lastRestartRef.current > 5000
        ) {
          lastRestartRef.current = Date.now();
          await updateRoom(storedHostId, roomCode, { status: 'waiting', state: { notice: 'bot-left', joined: joiners.map((p) => p.nickname) } }).catch(() => false);
        } else if (isHostNow && hostHere && roomData.status === 'playing' && SEAT_GAMES.includes(roomData.game_type)) {
          // Ludo & Okey pa bot: kush largohet zëvendësohet nga boti; në Ludo lojtari i ri zë një ngjyrë të lirë
          const next = syncSeats(roomData.game_type, roomData.game_state, realPlayers);
          if (next && await serverHandled(roomData.game_type, roomCode, storedHostId, 'sync')) {
            // serveri i sinkronizoi vendet
          } else if (next) {
            try {
              await saveRoomState(roomCode, next, storedHostId);
            } catch {
              // dikush tjetër e ndryshoi lojën ndërkohë; provohet sërish në kontrollin e radhës
            }
          }
        }
      }
    };

    fetchRoomData();

    // Kanali live: kur telefoni fle, lidhja shpesh mbyllet pa u rilidhur. Rilidhet kur bie,
    // si edhe kur faqja bëhet sërish e dukshme ose kthehet interneti.
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0; // emër i ri në çdo rilidhje: kanali i vjetër hiqet me vonesë
    const connect = () => {
      if (disposed) return;
      clearTimeout(retry);
      if (channel) void supabase.removeChannel(channel);
      const ch = supabase
        .channel(`room_sync_${roomCode}_${Date.now().toString(36)}${++attempt}`, {
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
            lastPush = Date.now();
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
        );
      channel = ch;
      ch.subscribe((status) => {
        if (disposed || channel !== ch) return;
        if (status === 'SUBSCRIBED') fetchRoomData(); // merr çfarë humbi ndërkohë
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(retry);
          retry = setTimeout(connect, 3000);
        }
      });
    };
    connect();

    const backupInterval = setInterval(fetchRoomData, 2000);

    // U kthye në faqe (ekrani u ndez, u hap sërish aplikacioni) ose u kthye interneti
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      resetActivity(); // koha në sfond s'llogaritet si mosaktivitet
      inFlight = false; // kërkesa e nisur para gjumit mund të mos kthehet kurrë
      fetchRoomData();
      if (!channel || channel.state !== 'joined') connect();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);

    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(backupInterval);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [roomCode, router, resetActivity, buildInitialGameState]);

  // Kontrolluesi i mosaktivitetit për 5 minuta për çdo dhomë dhe çdo lojë
  useEffect(() => {
    let lastTick = Date.now();
    let checking = false;
    const checkInactivity = async () => {
      if (isClosingRef.current || checking) return;
      // Telefoni ishte në gjumë (oraret ndalen): koha e humbur s'është mosaktivitet i dhomës
      const now = Date.now();
      const slept = now - lastTick > 15000;
      lastTick = now;
      if (slept || document.visibilityState !== 'visible') { resetActivity(); return; }
      const elapsed = now - lastActivityRef.current;
      const remainingSec = Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - elapsed) / 1000));

      // Shfaq paralajmërim gjatë 45 sekondave të fundit para mbylljes
      if (remainingSec <= 45 && remainingSec > 0) {
        setInactivityWarning(remainingSec);
      } else if (remainingSec > 45 && inactivityWarning !== null) {
        setInactivityWarning(null);
      }

      // Nëse kanë kaluar 5 minuta (300,000 ms) pa aktivitet, mbylle dhomën
      if (elapsed >= INACTIVITY_LIMIT_MS) {
        // Para se ta mbyllim për të gjithë: a është kjo pajisje thjesht pa internet, apo dhoma
        // vërtet s'ka lëvizur? Pa lidhje s'mbyllet asgjë (lojtarët e tjerë mund të jenë duke luajtur).
        checking = true;
        try {
          const { data, error } = await supabase.from('rooms').select('code').eq('code', roomCode)
            .abortSignal(timeoutSignal(8000)).maybeSingle();
          if (error) { resetActivity(); return; } // pa lidhje: provo sërish më vonë
          if (!data) {
            isClosingRef.current = true;
            alert('Kjo dhomë është mbyllur.');
            router.push('/');
            return;
          }
          if (Date.now() - lastActivityRef.current < INACTIVITY_LIMIT_MS) return; // ndërkohë pati aktivitet
          isClosingRef.current = true;
          try {
            await closeRoom(localStorage.getItem('gamezone_player_id') || '', roomCode);
          } catch {}
          alert('Dhoma u mbyll automatikisht për shkak të mosaktivitetit për 5 minuta.');
          router.push('/');
        } catch {
          resetActivity();
        } finally {
          checking = false;
        }
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

  // Shpalle dhomën në faqen kryesore sa kohë krijuesi është këtu dhe ka vend të lirë
  const amHost = !!room && !!currentPlayerId && room.host_id === currentPlayerId;
  const realPlayerCount = players.filter((p) => !BOT_IDS.includes(p.player_id)).length;
  const hostNick = players.find((p) => p.player_id === room?.host_id)?.nickname || 'Lojtar';
  const hostAvatar = players.find((p) => p.player_id === room?.host_id)?.avatar_url || null;
  // fotot e lojtarëve për lojërat (lexohen sipas ID-së)
  useEffect(() => {
    setRoomAvatars(Object.fromEntries(players.filter((p) => p.avatar_url).map((p) => [p.player_id, p.avatar_url as string])));
  }, [players]);
  const lobbyEntry = amHost && room && isJoinable(room.status, room.game_state, room.game_type, realPlayerCount)
    ? JSON.stringify({
        code: room.code, game_type: room.game_type, hostName: hostNick, hostAvatar, playerCount: realPlayerCount,
        status: room.status === 'waiting' ? 'waiting' : hasBot(room.game_state) ? 'bot' : 'seats',
      })
    : '';
  const lobbyChannelRef = useRef<RealtimeChannel | null>(null);
  const [lobbyReady, setLobbyReady] = useState(false);

  useEffect(() => {
    if (!amHost) return;
    const ch = supabase.channel(LOBBY_CHANNEL, { config: { presence: { key: roomCode } } });
    ch.subscribe((status) => setLobbyReady(status === 'SUBSCRIBED'));
    lobbyChannelRef.current = ch;
    return () => {
      lobbyChannelRef.current = null;
      setLobbyReady(false);
      supabase.removeChannel(ch);
    };
  }, [amHost, roomCode]);

  useEffect(() => {
    const ch = lobbyChannelRef.current;
    if (!ch || !lobbyReady) return;
    if (lobbyEntry) ch.track(JSON.parse(lobbyEntry));
    else ch.untrack();
  }, [lobbyEntry, lobbyReady]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveRoom = async () => {
    // Dhoma fshihet vetëm kur s'mbetet askush; nëse largohet hosti, dhoma i kalon lojtarit të radhës
    const remaining = players.filter((p) => p.player_id !== currentPlayerId && !BOT_IDS.includes(p.player_id));
    if (currentPlayerId) {
      try { await leaveRoom(currentPlayerId, roomCode, remaining.map((p) => p.player_id), room?.host_id === currentPlayerId); } catch { /* largohet gjithsesi */ }
    }
    router.push('/');
  };

  /** Krijuesi nis lojë të re me të gjithë lojtarët që janë në dhomë (edhe gjatë lojës). */
  const handleNewGame = async (ask: boolean) => {
    if (!room || !amHost || newGameBusy) return;
    if (ask && !window.confirm('Të niset një lojë e re me lojtarët në dhomë? Loja që po luhet tani përfundon.')) return;
    setNewGameBusy(true);
    try {
      // Ludo/Okey: serveri nis lojë të re vetëm kur dhoma s'është "duke luajtur"
      if (SEAT_GAMES.includes(room.game_type) && room.status === 'playing') {
        await updateRoom(currentPlayerId, roomCode, { status: 'waiting' });
      }
      await handleStartGame();
    } catch {
      alert('Loja e re nuk u nis. Kontrollo internetin dhe provo përsëri.');
    } finally {
      setNewGameBusy(false);
    }
  };

  const handleStartGame = async () => {
    if (!room || players.length === 0) return;
    resetActivity();
    logGameStart(roomCode, room.game_type, players.length);
    const real = players.filter((p) => !BOT_IDS.includes(p.player_id));
    if (real.length === 1) {
      // vetëm në dhomë: luan kundër botit
      if (await serverHandled(room.game_type, roomCode, currentPlayerId, 'start')) return;
      const gs = await buildInitialGameState(room.game_type, real, true);
      if (gs) await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: gs });
      return;
    }

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

      await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: initialState });
    } else if (room.game_type === 'pishpirik') {
      const initialState = initPishpirikGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: initialState });
    } else if (room.game_type === 'shah') {
      const initialState = initChessGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: initialState });
    } else if (room.game_type === 'uno') {
      const initialState = initUnoGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: initialState });
    } else if (room.game_type === 'ludo') {
      if (await ludoServerHandled(roomCode, currentPlayerId, { type: 'start' })) return;
      const initialState = initLudoGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: initialState });
    } else if (room.game_type === 'rummy') {
      if (await okeyServerHandled(roomCode, currentPlayerId, { type: 'start' })) return;
      const initialState = initRummyGame(
        players.map((p) => ({ id: p.player_id, nickname: p.nickname }))
      );
      await updateRoom(currentPlayerId, roomCode, { status: 'playing', state: initialState });
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

  // Baneri "Duke luajtur me Bot AI" — u largua sipas kërkesës
  const BotBanner = null;

  /* misionet ditore: numëro lojën kur nis */
  const gameKey = room?.status === 'playing' && room.game_state && players.some((p) => p.player_id === currentPlayerId)
    ? `${room.code}|${(room.game_state as { gameId?: number }).gameId ?? 'x'}` : '';
  useEffect(() => { if (gameKey && room) trackGame(room.game_type, gameKey); }, [gameKey, room]);

  /* chat-i i dhomës (Ludo, UNO, Yamb, Okey) */
  const chatEnabled = !!room && room.status === 'playing' && CHAT_GAMES.includes(room.game_type) && !!currentPlayerId;
  const chat = useRoomChat(roomCode, currentPlayerId, chatEnabled);
  const chatButton = chatEnabled ? <ChatButton onSend={chat.send} /> : null;
  // loja + flluskat e vogla të mesazheve (pa panel, tabela mbetet e plotë)
  const withChat = (game: React.ReactNode) => (
    <div className="relative h-dvh flex flex-col overflow-hidden text-white">
      {InactivityWarningBanner}
      {BotBanner}
      <div className="relative flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden" style={{ containerType: 'size' }}>{game}</div>
      {chatEnabled && <ChatBubbles bubbles={chat.bubbles} />}
    </div>
  );

  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-mute">
        {InactivityWarningBanner}
        <span className="w-12 h-12 rounded-full border-4 border-white/10 border-t-gold animate-spin" />
        <span className="font-display text-lg">Duke ngarkuar dhomën...</span>
      </div>
    );
  }

  const outsideGame =
    room.status === 'playing' &&
    !!room.game_state &&
    !!currentPlayerId &&
    room.host_id !== currentPlayerId &&
    !JSON.stringify(room.game_state).includes(currentPlayerId);
  const seatGame = SEAT_GAMES.includes(room.game_type);
  const botMatch = outsideGame && hasBot(room.game_state);
  const canTakeSeat = outsideGame && (botMatch || (seatGame && hasFreeSeat(room.game_type, room.game_state)));
  if (outsideGame && (canTakeSeat || !seatGame)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        {InactivityWarningBanner}
        <span className="w-12 h-12 rounded-full border-4 border-white/10 border-t-gold animate-spin" />
        <span className="font-display text-xl">{canTakeSeat ? 'Duke u bashkuar në lojë...' : 'Loja është plot'}</span>
        <span className="text-sm text-mute">
          {!canTakeSeat ? 'Prit derisa të lirohet një vend.' : botMatch && !seatGame ? `Boti po largohet — do të filloni një lojë të re me ${hostNick}.` : 'Po të zihet vendi në tavolinë.'}
        </span>
        <button onClick={handleLeaveRoom} className="mt-2 text-sm font-bold text-mute hover:text-ink underline cursor-pointer">Dil</button>
      </div>
    );
  }

  if (outsideGame && seatGame && !canTakeSeat) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        {InactivityWarningBanner}
        <span className="font-display text-2xl">Tavolina është plot</span>
        <span className="text-sm text-mute max-w-xs">Të gjitha vendet janë zënë nga lojtarë. Sapo të largohet dikush, do të hysh automatikisht.</span>
        <button onClick={handleLeaveRoom} className="mt-2 text-sm font-bold text-mute hover:text-ink underline cursor-pointer">Dil</button>
      </div>
    );
  }

  // Butoni "Lojë e re": vetëm krijuesi i dhomës (kur ai del, dhoma dhe butoni i kalojnë lojtarit tjetër)
  const restartGame = amHost ? () => handleNewGame(false) : undefined;
  const newGameButton = amHost ? (
    <button
      onClick={() => void handleNewGame(true)}
      disabled={newGameBusy}
      title="Nis një lojë të re me lojtarët në dhomë"
      className="flex items-center gap-1.5 bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold text-xs font-extrabold px-3 py-1.5 rounded-full transition cursor-pointer disabled:opacity-50 shrink-0"
    >
      <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden min-[380px]:inline">Lojë e re</span>
    </button>
  ) : null;

  // Shiriti i përbashkët i lojërave: Dil · loja, dhoma dhe lojtarët · zëri
  const gameBar = (
    <div className="w-full max-w-5xl mx-auto px-3 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0">
      <button
        onClick={handleLeaveRoom}
        className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-mute hover:text-ink text-sm font-bold pl-2.5 pr-3.5 py-1.5 rounded-full transition cursor-pointer shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
        Dil
      </button>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="flex items-center gap-2 min-w-0 bg-white/5 border border-white/10 pl-1 pr-3 py-1 rounded-full" title="Informacioni i dhomës">
          <GameArt game={room.game_type} className="w-7 h-7 rounded-full shrink-0" />
          <span className="text-xs font-bold truncate hidden sm:inline">{GAME_NAMES[room.game_type] || room.game_type}</span>
          <span className="text-xs font-bold text-mute whitespace-nowrap">
            <strong className="font-display text-gold tracking-widest">{room.code}</strong>
            <span className="mx-1.5 opacity-50">·</span>
            <Users className="inline w-3.5 h-3.5 -mt-0.5" /> {players.length}
          </span>
        </span>
        {newGameButton}
        {chatButton}
        <SoundToggle />
      </div>
    </div>
  );

  // 1. Rummy / Remi 51 (JOL)
  if (room.status === 'playing' && room.game_type === 'rummy' && room.game_state) {
    return withChat(
      <RummyGame
        gameState={room.game_state as RummyGameState}
        currentPlayerId={currentPlayerId}
        isHost={room.host_id === currentPlayerId}
        roomCode={room.code}
        onUpdateState={async (ns) => {
          resetActivity();
          await saveRoomState(roomCode, ns, currentPlayerId);
        }}
        onRestartGame={restartGame}
        onNewGame={amHost ? () => void handleNewGame(true) : undefined}
        onLeaveRoom={handleLeaveRoom}
        chatButton={chatEnabled ? <ChatButton onSend={chat.send} className="!w-[34px] !h-[34px]" /> : null}
        remote={(a) => okeyAction(roomCode, currentPlayerId, a)}
      />
    );
  }

  // 2. Ludo (Mos u zemëro)
  if (room.status === 'playing' && room.game_type === 'ludo' && room.game_state) {
    return withChat(
      <div className="h-full flex flex-col">
        {gameBar}
        <div className="flex-1 min-h-0">
          <LudoGame
            gameState={room.game_state as LudoGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await saveRoomState(roomCode, newState, currentPlayerId);
            }}
            onRestartGame={restartGame}
            remote={(a) => ludoAction(roomCode, currentPlayerId, a)}
          />
        </div>
      </div>
    );
  }

  // 3. Yamb (Jamb)
  if (room.status === 'playing' && room.game_type === 'yamb') {
    return withChat(
      <div className="relative min-h-full">
        {gameBar}
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
      <div className="relative min-h-screen text-white pb-6">
        {InactivityWarningBanner}
        {BotBanner}
        {gameBar}
        <div className="px-3">
          <PishpirikGame
            gameState={room.game_state as PishpirikGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await updateRoom(currentPlayerId, roomCode, { state: newState });
            }}
            onRestartGame={restartGame}
          />
        </div>
      </div>
    );
  }

  // 5. Shah (Chess)
  if (room.status === 'playing' && room.game_type === 'shah' && room.game_state) {
    return (
      <div className="relative min-h-screen text-white pb-6">
        {InactivityWarningBanner}
        {BotBanner}
        {gameBar}
        <div className="px-3">
          <ChessGame
            gameState={room.game_state as ChessGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await updateRoom(currentPlayerId, roomCode, { state: newState });
            }}
            onRestartGame={restartGame}
          />
        </div>
      </div>
    );
  }

  // 6. UNO Shqip
  if (room.status === 'playing' && room.game_type === 'uno' && room.game_state) {
    return withChat(
      <div className="relative min-h-full pb-6">
        {gameBar}
        <div className="px-3">
          <UnoGame
            gameState={room.game_state as UnoGameState}
            currentPlayerId={currentPlayerId}
            isHost={room.host_id === currentPlayerId}
            onUpdateState={async (newState) => {
              resetActivity();
              await updateRoom(currentPlayerId, roomCode, { state: newState });
            }}
            onRestartGame={restartGame}
          />
        </div>
      </div>
    );
  }

  // 7. Lobby (Pritja e lojtarëve)
  const isHost = room.host_id === currentPlayerId;
  const emptySeats = Math.max(0, (MAX_SEATS[room.game_type] ?? 4) - players.length);
  const notice = (room.game_state as { notice?: string; joined?: string[] } | null);
  const botLeft = notice?.notice === 'bot-left';
  const canStart = isHost || players.length >= 2;
  const alone = players.filter((p) => !BOT_IDS.includes(p.player_id)).length === 1;

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
            <InviteButtons code={room.code} game={GAME_NAMES[room.game_type] || 'GameZone'} />

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
                    <UserAvatar src={p.avatar_url} name={p.nickname} className="w-full h-full rounded-xl" />
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
              {botLeft && (
                <p role="status" className="mb-3 flex items-center gap-2 rounded-2xl bg-mint/10 border border-mint/40 text-mint text-sm font-bold px-4 py-3">
                  🤖➜👋 Boti u largua — u bashkua {notice?.joined?.join(', ') || 'një lojtar'}. Filloni një lojë të re bashkë!
                </p>
              )}
              {canStart && alone && !botLeft && (
                <p className="mb-3 text-center text-sm text-mute">
                  Fto një shok me kodin ose me WhatsApp — ose fillo menjëherë kundër botit.
                </p>
              )}
              {canStart ? (
                <button
                  onClick={handleStartGame}
                  data-testid="start-game"
                  className="gz-btn w-full flex items-center justify-center gap-2 font-display font-semibold text-xl py-4 rounded-2xl cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  {botLeft ? 'Filloni një lojë të re' : alone ? 'Fillo me bot 🤖' : 'Fillo lojën'}
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
