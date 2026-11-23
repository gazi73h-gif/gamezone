import React from 'react';

/* Ilustrime të vogla për çdo lojë (SVG, pa skedarë të jashtëm) */

export const GAME_THEME: Record<string, { from: string; to: string; glow: string }> = {
  yamb:      { from: '#ff9a3c', to: '#ff5e3a', glow: 'rgb(255 122 60 / 0.45)' },
  pishpirik: { from: '#1fd1a0', to: '#0b8f73', glow: 'rgb(31 209 160 / 0.4)' },
  shah:      { from: '#8b7cf6', to: '#4c3bc4', glow: 'rgb(139 124 246 / 0.45)' },
  uno:       { from: '#ff5d73', to: '#d61f4a', glow: 'rgb(255 93 115 / 0.45)' },
  ludo:      { from: '#38bdf8', to: '#2563eb', glow: 'rgb(56 189 248 / 0.45)' },
  rummy:     { from: '#e879f9', to: '#9333ea', glow: 'rgb(232 121 249 / 0.4)' },
};

const Die = ({ x, y, r, pips, fill = '#fff' }: { x: number; y: number; r: number; pips: [number, number][]; fill?: string }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <rect x="-22" y="-22" width="44" height="44" rx="10" fill={fill} />
    <rect x="-22" y="14" width="44" height="8" rx="4" fill="#000" opacity="0.08" />
    {pips.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="4.6" fill="#2b1a3f" />)}
  </g>
);

const Card = ({ x, y, r, children, fill = '#fff' }: { x: number; y: number; r: number; children?: React.ReactNode; fill?: string }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <rect x="-24" y="-34" width="48" height="68" rx="7" fill={fill} stroke="#fff" strokeWidth="3" />
    {children}
  </g>
);

function Art({ game }: { game: string }) {
  switch (game) {
    case 'yamb':
      return (
        <>
          <Die x={72} y={66} r={-14} pips={[[-11, -11], [11, -11], [0, 0], [-11, 11], [11, 11]]} />
          <Die x={124} y={58} r={12} pips={[[-11, -11], [11, 11]]} />
          <Die x={100} y={104} r={4} pips={[[-11, -12], [11, -12], [-11, 0], [11, 0], [-11, 12], [11, 12]]} />
        </>
      );
    case 'pishpirik':
      return (
        <>
          <Card x={70} y={76} r={-18}>
            <text x="0" y="10" textAnchor="middle" fontSize="30" fill="#0b8f73">♣</text>
          </Card>
          <Card x={100} y={68} r={0}>
            <text x="0" y="10" textAnchor="middle" fontSize="30" fill="#e11d48">♥</text>
          </Card>
          <Card x={130} y={76} r={18}>
            <text x="0" y="10" textAnchor="middle" fontSize="30" fill="#1f2937">♠</text>
          </Card>
        </>
      );
    case 'shah':
      return (
        <g transform="translate(100 74)">
          <ellipse cx="0" cy="42" rx="34" ry="7" fill="#000" opacity="0.2" />
          <path d="M-26 40 h52 l-4 -10 h-44 z M-18 30 l6 -34 h24 l6 34 z M-14 -4 c-8 -6 -8 -18 0 -24 h28 c8 6 8 18 0 24 z" fill="#fff" />
          <rect x="-4" y="-44" width="8" height="20" rx="2" fill="#fff" />
          <rect x="-11" y="-38" width="22" height="7" rx="2" fill="#fff" />
        </g>
      );
    case 'uno':
      return (
        <>
          <Card x={78} y={74} r={-14} fill="#facc15" />
          <Card x={122} y={74} r={14} fill="#22c55e" />
          <Card x={100} y={66} r={0} fill="#1d1d2b">
            <ellipse cx="0" cy="0" rx="17" ry="27" transform="rotate(25)" fill="#ef4444" />
            <text x="0" y="6" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" fontFamily="sans-serif" transform="rotate(-12)">UNO</text>
          </Card>
        </>
      );
    case 'ludo':
      return (
        <g transform="translate(100 72)">
          <rect x="-44" y="-44" width="88" height="88" rx="12" fill="#fff" />
          <rect x="-40" y="-40" width="34" height="34" rx="7" fill="#ef4444" />
          <rect x="6" y="-40" width="34" height="34" rx="7" fill="#3b82f6" />
          <rect x="6" y="6" width="34" height="34" rx="7" fill="#facc15" />
          <rect x="-40" y="6" width="34" height="34" rx="7" fill="#22c55e" />
          <path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill="#a78bfa" />
          <g transform="translate(26 -2)">
            <ellipse cx="0" cy="22" rx="12" ry="4" fill="#000" opacity="0.25" />
            <path d="M-11 21 C-11 14 -5 12 -5 4 L5 4 C5 12 11 14 11 21 Z" fill="#7c3aed" stroke="#fff" strokeWidth="2.5" />
            <circle cx="0" cy="-3" r="9" fill="#7c3aed" stroke="#fff" strokeWidth="2.5" />
            <circle cx="-3" cy="-6" r="3" fill="#fff" opacity="0.7" />
          </g>
        </g>
      );
    case 'rummy':
      return (
        <>
          {[-36, -12, 12, 36].map((dx, i) => (
            <g key={i} transform={`translate(${100 + dx} ${72 + Math.abs(dx) / 6}) rotate(${dx / 3})`}>
              <rect x="-15" y="-24" width="30" height="48" rx="5" fill="#fff8e7" stroke="#fff" strokeWidth="2" />
              <text x="0" y="6" textAnchor="middle" fontSize="20" fontWeight="900" fontFamily="sans-serif"
                fill={['#ef4444', '#2563eb', '#111827', '#f59e0b'][i]}>{[7, 8, 9, 10][i]}</text>
              <circle cx="0" cy="15" r="2.5" fill={['#ef4444', '#2563eb', '#111827', '#f59e0b'][i]} />
            </g>
          ))}
        </>
      );
    default:
      return <Die x={100} y={72} r={0} pips={[[0, 0]]} />;
  }
}

/* Kartela me ngjyrën e lojës, rrathë dekorativë dhe ilustrimin */
export default function GameArt({ game, className = '', align = 'xMidYMid slice' }: { game: string; className?: string; align?: string }) {
  const t = GAME_THEME[game] ?? GAME_THEME.ludo;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
    >
      <svg viewBox="0 0 200 144" className="absolute inset-0 w-full h-full" preserveAspectRatio={align} aria-hidden>
        <circle cx="18" cy="12" r="46" fill="#fff" opacity="0.12" />
        <circle cx="190" cy="140" r="56" fill="#fff" opacity="0.1" />
        <circle cx="172" cy="22" r="7" fill="#fff" opacity="0.35" />
        <circle cx="28" cy="122" r="5" fill="#fff" opacity="0.3" />
        <g style={{ filter: 'drop-shadow(0 6px 6px rgb(0 0 0 / 0.25))' }}>
          <Art game={game} />
        </g>
      </svg>
    </div>
  );
}
