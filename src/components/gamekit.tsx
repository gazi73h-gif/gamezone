'use client';
// Pjesët e përbashkëta të pamjes për lojërat: lojtari me unazën e radhës, tavolina me çohë,
// letrat dhe dora në formë freskore. Ngjyrat dhe hijet janë si te Okey-u, që të gjitha lojërat të ngjajnë.
import React from 'react';
import { useAvatar, UserAvatar } from '@/lib/avatars';

export const SEAT_COLORS = ['#ffc83d', '#4dabf7', '#ff6b6b', '#51cf66', '#cc5de8', '#ff922b'];

/* ── lojtari: avatar me unazë që ndriçon kur ka radhën ── */
export function PlayerChip({ id, name, active, bot, color, sub, badge, me, onClick, selected }: {
  id?: string; name: string; active: boolean; bot?: boolean; color: string; sub?: React.ReactNode; badge?: React.ReactNode;
  me?: boolean; onClick?: () => void; selected?: boolean;
}) {
  const photo = useAvatar(id);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`gk-chip ${active ? 'gk-chip-active' : ''} ${selected ? 'gk-chip-selected' : ''} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ ['--seat' as string]: color }}
    >
      <span className="gk-avatar" aria-hidden>
        <UserAvatar src={photo} name={name} bot={bot} className="w-full h-full rounded-full" />
      </span>
      <span className="min-w-0 flex flex-col items-start">
        <span className="flex items-center gap-1 max-w-full">
          <span className="font-bold text-[13px] text-white truncate">{me ? 'Ti' : bot ? name.replace(/^🤖\s*/u, '') : name}</span>
          {badge}
        </span>
        {sub && <span className="text-[11px] font-semibold text-white/70 truncate max-w-full">{sub}</span>}
      </span>
      {active && <span className="sr-only">(ka radhën)</span>}
    </Tag>
  );
}

/* ── tavolina me buzë druri dhe çohë ── */
export function FeltTable({ children, tone = 'green', className = '' }: { children: React.ReactNode; tone?: 'green' | 'blue' | 'red'; className?: string }) {
  return (
    <div className={`gk-rim ${className}`}>
      <div className={`gk-felt gk-felt-${tone}`}>{children}</div>
    </div>
  );
}

/* ── letra e lojës (Pishpirik) ── */
export const SUIT_SYMBOL: Record<string, { s: string; red: boolean }> = {
  hearts: { s: '♥', red: true }, diamonds: { s: '♦', red: true }, clubs: { s: '♣', red: false }, spades: { s: '♠', red: false },
};

export function PlayingCard({ rank, suit, size = 'md', glow }: { rank: string; suit: string; size?: 'sm' | 'md'; glow?: boolean }) {
  const { s, red } = SUIT_SYMBOL[suit] ?? { s: '?', red: false };
  return (
    <div className={`gk-card gk-card-${size} ${glow ? 'gk-card-glow' : ''}`} style={{ color: red ? '#d62828' : '#1c1917' }}>
      <span className="gk-corner"><b>{rank}</b><i>{s}</i></span>
      <span className="gk-pip">{['J', 'Q', 'K'].includes(rank) ? <span className="gk-face">{rank}</span> : s}</span>
      <span className="gk-corner gk-corner-flip"><b>{rank}</b><i>{s}</i></span>
    </div>
  );
}

export const CardBack = ({ size = 'md', label }: { size?: 'sm' | 'md'; label?: React.ReactNode }) => (
  <div className={`gk-card gk-card-${size} gk-back`}>{label}</div>
);

/* ── dora në formë freskore: letrat mbivendosen dhe ngrihen kur kalon mbi to ── */
export function CardFan<T>({ items, render, keyOf }: { items: T[]; render: (item: T, i: number) => React.ReactNode; keyOf: (item: T) => string }) {
  const n = items.length;
  return (
    <div className="gk-fan" style={{ ['--n' as string]: n }}>
      {items.map((item, i) => {
        const t = n > 1 ? i / (n - 1) - 0.5 : 0; // -0.5..0.5
        return (
          <div key={keyOf(item)} className="gk-fan-slot"
            style={{ ['--rot' as string]: `${t * Math.min(40, n * 5)}deg`, ['--lift' as string]: `${Math.abs(t) * Math.min(26, n * 3)}px`, zIndex: i }}>
            {render(item, i)}
          </div>
        );
      })}
    </div>
  );
}

/* ── dritarja e rezultateve ── */
export function ResultPanel({ title, subtitle, children, actions }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-4 py-8">
      <div className="gz-panel rounded-[28px] p-6 w-full max-w-md text-center">
        <div className="text-5xl mb-2 gk-bounce" aria-hidden>🏆</div>
        <h2 className="font-display font-bold text-3xl">{title}</h2>
        {subtitle && <p className="text-gold font-display font-semibold text-lg mt-1">{subtitle}</p>}
        {children && <div className="mt-4 text-left">{children}</div>}
        {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function GameKitStyles() {
  return (
    <style>{`
      .gk-chip { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 12px 5px 5px; border-radius: 999px;
        background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); transition: transform .15s, background .15s; text-align: left; }
      .gk-chip-selected { background: rgba(255,200,61,0.15); border-color: rgba(255,200,61,0.5); }
      .gk-avatar { position: relative; flex-shrink: 0; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px;
        font-family: var(--font-display); font-weight: 700; font-size: 13px; color: #fff;
        background: radial-gradient(circle at 35% 30%, var(--seat), #1b1340); box-shadow: 0 0 0 2px rgba(255,255,255,0.15); }
      .gk-chip-active { background: rgba(0,0,0,0.5); border-color: var(--seat); transform: translateY(-1px); }
      .gk-chip-active .gk-avatar { box-shadow: 0 0 0 3px var(--seat), 0 0 16px var(--seat); animation: gk-glow 1.6s ease-in-out infinite; }
      @keyframes gk-glow { 50% { box-shadow: 0 0 0 3px var(--seat), 0 0 26px var(--seat); } }

      .gk-rim { border-radius: 30px; padding: 8px; background: linear-gradient(160deg, #a0612f, #6b3a19 45%, #8a4f24 70%, #5a2f13);
        box-shadow: 0 18px 40px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,220,170,0.35), inset 0 -3px 0 rgba(0,0,0,0.35); }
      .gk-felt { position: relative; border-radius: 23px; overflow: hidden; box-shadow: inset 0 0 0 2px rgba(255,214,140,0.3), inset 0 10px 30px rgba(0,0,0,0.45); }
      .gk-felt::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35; background-image: radial-gradient(rgba(0,0,0,0.25) 1px, transparent 1px); background-size: 4px 4px; }
      .gk-felt > * { position: relative; }
      .gk-felt-green { background: radial-gradient(70% 60% at 50% 45%, #2f9a72 0%, #1d7457 45%, #12503d 100%); }
      .gk-felt-blue { background: radial-gradient(70% 60% at 50% 45%, #2b6cb0 0%, #1d4f8a 45%, #12325c 100%); }
      .gk-felt-red { background: radial-gradient(70% 60% at 50% 45%, #b83a3a 0%, #8c2424 45%, #5c1414 100%); }

      .gk-card { position: relative; flex-shrink: 0; border-radius: 10px; background: linear-gradient(180deg, #fff 0%, #f6f1e7 100%);
        box-shadow: 0 1px 0 rgba(0,0,0,0.08), 0 6px 14px rgba(0,0,0,0.35); border: 1px solid rgba(0,0,0,0.12);
        display: flex; align-items: center; justify-content: center; font-family: var(--font-display); }
      .gk-card-md { width: clamp(58px, 15vw, 84px); height: clamp(84px, 21.5vw, 120px); }
      .gk-card-sm { width: 44px; height: 63px; border-radius: 7px; }
      .gk-card-glow { box-shadow: 0 0 0 3px #ffc83d, 0 0 20px rgba(255,200,61,0.7), 0 6px 14px rgba(0,0,0,0.35); }
      .gk-corner { position: absolute; top: 5px; left: 6px; display: flex; flex-direction: column; align-items: center; line-height: .9; }
      .gk-corner b { font-size: clamp(14px, 3.6vw, 19px); font-weight: 700; }
      .gk-corner i { font-style: normal; font-size: clamp(11px, 2.8vw, 15px); }
      .gk-corner-flip { top: auto; left: auto; bottom: 5px; right: 6px; transform: rotate(180deg); }
      .gk-pip { font-size: clamp(28px, 8vw, 42px); }
      .gk-face { display: grid; place-items: center; width: 1.5em; height: 1.9em; border-radius: 8px; font-size: .75em; font-weight: 700;
        background: linear-gradient(160deg, #fde68a, #f59e0b); color: #7c2d12; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6); }
      .gk-card-sm .gk-corner b { font-size: 12px; } .gk-card-sm .gk-corner i { font-size: 10px; } .gk-card-sm .gk-pip { font-size: 22px; }
      .gk-back { background: repeating-linear-gradient(45deg, #1e3a8a 0 6px, #1d4ed8 6px 12px); border: 3px solid #fff; color: #fff; font-weight: 800; font-size: 12px; text-align: center; }

      .gk-fan { display: flex; justify-content: center; align-items: flex-end; padding: 22px 12px 6px; min-height: 140px; }
      .gk-fan-slot { margin-left: calc(-1 * clamp(18px, calc(160px / var(--n)), 34px)); transform: translateY(var(--lift)) rotate(var(--rot)); transform-origin: 50% 120%; transition: transform .18s ease-out; }
      .gk-fan-slot:first-child { margin-left: 0; }
      .gk-fan-slot:has(button:not(:disabled)):hover, .gk-fan-slot:focus-within { transform: translateY(calc(var(--lift) - 18px)) rotate(var(--rot)) scale(1.06); z-index: 100 !important; }

      .gk-bounce { animation: gk-bounce 1.4s ease-in-out infinite; }
      @keyframes gk-bounce { 50% { transform: translateY(-8px); } }
      @media (prefers-reduced-motion: reduce) { .gk-chip-active .gk-avatar, .gk-bounce { animation: none; } .gk-fan-slot { transition: none; } }
    `}</style>
  );
}
