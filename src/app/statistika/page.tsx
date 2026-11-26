'use client';
// Statistikat e GameZone — vetëm për administratorin (kontrolli bëhet në server: admin_stats)
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/lib/account';
import { useOnlineCount } from '@/lib/online';

type Stats = {
  users_total: number; users_today: number; users_7d: number;
  games_total: number; games_today: number; games_7d: number;
  rooms_playing: number; rooms_waiting: number;
  daily: { day: string; games: number; users: number }[];
  by_game: { game: string; n: number }[];
  chat_today: number; chat_7d: number;
  phrases: { phrase: string; n: number }[];
};

const GAME_NAMES: Record<string, string> = {
  ludo: 'Ludo', rummy: 'Okey', uno: 'UNO', yamb: 'Yamb', pishpirik: 'Pishpirik', shah: 'Shah',
};
const BAR = '#c98d17'; // ari i faqes, i kontrolluar për kontrast në sfondin e errët
const dayLabel = (d: string) => { const [, m, day] = d.split('-'); return `${day}.${m}`; };

function Tile({ label, value, sub, live }: { label: string; value: number | string; sub?: string; live?: boolean }) {
  return (
    <div className="gz-panel rounded-2xl p-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-mute flex items-center gap-1.5">
        {live && <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />}{label}
      </p>
      <p className="font-display font-bold text-4xl mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-mute mt-1">{sub}</p>}
    </div>
  );
}

/** Shtylla vertikale për 14 ditët e fundit, me tooltip kur prek/kalon mbi një ditë. */
function DailyBars({ title, data, unit }: { title: string; data: { day: string; value: number }[]; unit: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const shown = hover ?? data.length - 1;
  return (
    <section className="gz-panel rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-display font-semibold text-lg">{title}</h2>
        <span className="text-xs text-mute">{total} në 14 ditë</span>
      </div>
      <p className="text-sm mb-2 h-5" aria-live="polite">
        <b className="tabular-nums">{data[shown]?.value ?? 0}</b> {(data[shown]?.value ?? 0) === 1 ? unit[0] : unit[1]} · <span className="text-mute">{hover === null ? 'sot' : dayLabel(data[shown].day)}</span>
      </p>
      <div className="relative h-36 flex items-end gap-[2px] border-b border-white/25" onPointerLeave={() => setHover(null)}>
        <span className="absolute -top-1 left-0 text-[10px] text-mute">{max}</span>
        <span className="absolute top-1 left-0 right-0 border-t border-dashed border-white/10" />
        {data.map((d, i) => (
          <button
            key={d.day}
            type="button"
            className="flex-1 h-full flex items-end cursor-pointer"
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${dayLabel(d.day)}: ${d.value} ${d.value === 1 ? unit[0] : unit[1]}`}
          >
            <span
              className="w-full rounded-t-[4px] transition-opacity"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0, background: BAR, opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {data.map((d, i) => (
          <span key={d.day} className="flex-1 text-center text-[10px] text-mute">{i % 2 === 1 ? dayLabel(d.day) : ''}</span>
        ))}
      </div>
      <details className="mt-2 text-xs text-mute">
        <summary className="cursor-pointer">Shiko si tabelë</summary>
        <table className="mt-2 w-full">
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day} className="border-t border-white/5"><td className="py-0.5">{dayLabel(d.day)}</td><td className="text-right tabular-nums text-ink">{d.value}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** Shtylla horizontale (renditje), me numrin pranë. */
function RankBars({ title, rows, empty }: { title: string; rows: { label: string; n: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="gz-panel rounded-2xl p-4">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-mute">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate font-bold">{r.label}</span>
              <span className="h-3"><span className="block h-full rounded-r-[4px]" style={{ width: `${(r.n / max) * 100}%`, minWidth: 3, background: BAR }} /></span>
              <span className="tabular-nums text-right w-8">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Kyçja e administratorit (lojtarët e tjerë luajnë vetëm me nofkë). */
function AdminLogin({ onSend }: { onSend: (email: string) => Promise<string | null> }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'' | 'sending' | 'sent'>('');
  const [error, setError] = useState('');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state === 'sending') return;
    setState('sending'); setError('');
    const err = await onSend(email);
    if (err) {
      setState('');
      setError(/rate|security purposes|seconds/i.test(err) ? 'Prit pak dhe provo përsëri (shumë kërkesa). Shiko edhe email-in, ndoshta linku ka ardhur.' : err);
      return;
    }
    setState('sent');
  };
  return (
    <form onSubmit={send} className="gz-panel rounded-2xl p-6 max-w-sm mx-auto space-y-3" data-testid="admin-login">
      <p className="font-display font-semibold text-lg">Vetëm për administratorin</p>
      {state === 'sent' ? (
        <p className="text-sm text-mint">✓ Linku u dërgua. Hap email-in (shiko edhe Spam) dhe kliko linkun.</p>
      ) : (
        <>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Emaili yt" aria-label="Emaili"
            className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-base outline-none focus:border-gold" />
          {error && <p className="text-sm text-coral">{error}</p>}
          <button type="submit" disabled={state === 'sending'} className="gz-btn w-full font-display font-semibold py-3 rounded-xl cursor-pointer">
            {state === 'sending' ? 'Duke dërguar…' : 'Më dërgo linkun'}
          </button>
        </>
      )}
    </form>
  );
}

export default function StatsPage() {
  const account = useAccount();
  const online = useOnlineCount();
  const [stats, setStats] = useState<Stats | null>(null);
  const [problem, setProblem] = useState<'' | 'not_admin' | 'missing' | 'net'>('');
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_stats');
    setLoading(false);
    if (error) {
      setProblem(error.code === '42501' || /not_admin/.test(error.message) ? 'not_admin' : error.code === 'PGRST202' ? 'missing' : 'net');
      return;
    }
    setProblem('');
    setStats(data as Stats);
    setUpdated(new Date().toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, []);

  const userId = account.user?.id;
  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 30000); // rifreskohet vetë çdo 30 sekonda
    return () => { clearTimeout(first); clearInterval(t); };
  }, [userId, load]);

  const shell = (body: React.ReactNode) => (
    <main className="max-w-5xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between gap-2 mb-5">
        <Link href="/" className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold pl-2.5 pr-3.5 py-1.5 rounded-full">
          <ArrowLeft className="w-4 h-4" /> GameZone
        </Link>
        <h1 className="font-display font-bold text-2xl">📊 Statistikat</h1>
        {stats ? (
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Rifresko"
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold px-3 py-1.5 rounded-full cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">{updated}</span>
          </button>
        ) : <span className="w-20" />}
      </header>
      {body}
    </main>
  );

  const note = (text: React.ReactNode) => shell(<div className="gz-panel rounded-2xl p-6 text-center text-mute max-w-md mx-auto">{text}</div>);

  if (!account.ready) return note('Duke u ngarkuar…');
  if (!account.user) return shell(<AdminLogin onSend={(email) => account.signIn(email, '/statistika')} />);
  if (problem === 'not_admin') return note('Kjo faqe është vetëm për administratorin e GameZone.');
  if (problem === 'missing') return note('Statistikat nuk janë aktivizuar ende: ekzekuto skedarin 20261127_admin_stats.sql te Supabase → SQL Editor.');
  if (problem === 'net' && !stats) return note('Statistikat nuk u ngarkuan. Kontrollo internetin dhe provo përsëri.');
  if (!stats) return note('Duke u ngarkuar…');

  const games = stats.by_game.map((g) => ({ label: GAME_NAMES[g.game] ?? g.game, n: g.n }));
  return shell(
    <div className="space-y-4" data-testid="stats">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Online tani" value={online} sub="lojtarë me faqen hapur" live />
        <Tile label="Të regjistruar" value={stats.users_total} sub={`+${stats.users_today} sot · +${stats.users_7d} këtë javë`} />
        <Tile label="Lojëra sot" value={stats.games_today} sub={`${stats.games_7d} këtë javë · ${stats.games_total} gjithsej`} />
        <Tile label="Dhoma tani" value={stats.rooms_playing} sub={`duke luajtur · ${stats.rooms_waiting} në pritje`} />
        <Tile label="Mesazhe sot" value={stats.chat_today} sub={`${stats.chat_7d} këtë javë`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <DailyBars title="Lojëra të nisura" unit={["lojë", "lojëra"]} data={stats.daily.map((d) => ({ day: d.day, value: d.games }))} />
        <DailyBars title="Lojtarë të rinj të regjistruar" unit={["lojtar", "lojtarë"]} data={stats.daily.map((d) => ({ day: d.day, value: d.users }))} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <RankBars title="Lojërat më të luajtura · 7 ditë" rows={games} empty="Ende s'ka lojëra këtë javë." />
        <RankBars title="Mesazhet më të përdorura · 7 ditë" rows={stats.phrases.map((p) => ({ label: p.phrase, n: p.n }))} empty="Ende s'ka mesazhe këtë javë." />
      </div>
      <p className="text-xs text-mute text-center">Rifreskohet vetë çdo 30 sekonda. Lojërat numërohen nga sot e tutje (çdo fillim dhe &quot;Luaj përsëri&quot;).</p>
    </div>
  );
}
