'use client';
import React from 'react';
import { Check, Gift } from 'lucide-react';
import { claimMission, useDaily } from '@/lib/daily';
import { playSound } from '@/lib/sound';

/** Misionet e sotme + ditët radhazi. onReward merr tokens e reja pas çdo shpërblimi. */
export default function DailyMissions({ onReward }: { onReward: (tokens: number) => void }) {
  const { ready, missions, streak } = useDaily();
  if (!ready) return null;
  const done = missions.filter((m) => m.claimed).length;
  return (
    <section className="gz-panel rounded-[28px] p-5 sm:p-6" data-testid="daily-missions">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-semibold text-xl sm:text-2xl">Misionet e sotme</h2>
          <p className="text-sm text-mute">Kryeji çdo ditë dhe fito tokens · {done}/{missions.length} të marra</p>
        </div>
        <div className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-2xl border ${streak ? 'bg-[#ff7a1a]/15 border-[#ff7a1a]/50' : 'bg-white/5 border-white/10'}`}
          title="Ditë radhazi me të paktën një lojë">
          <span className={`text-2xl leading-none ${streak ? 'gz-flame' : 'grayscale opacity-60'}`}>🔥</span>
          <span className="font-display font-bold text-sm leading-tight mt-0.5" data-testid="streak">{streak} {streak === 1 ? 'ditë' : 'ditë'}</span>
        </div>
      </div>
      <ul className="grid sm:grid-cols-3 gap-3">
        {missions.map((m) => {
          const complete = m.progress >= m.target;
          return (
            <li key={m.id} className={`rounded-2xl p-3.5 border ${m.claimed ? 'bg-mint/10 border-mint/30' : complete ? 'bg-gold/10 border-gold/50' : 'bg-white/[0.04] border-white/10'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-sm">{m.title}</p>
                <span className="text-xs font-extrabold text-gold whitespace-nowrap">+{m.reward}</span>
              </div>
              <div className="h-2 rounded-full bg-black/30 mt-2.5 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.progress} aria-label={m.title}>
                <div className="h-full rounded-full bg-gradient-to-r from-gold to-[#ff8f6b] transition-all" style={{ width: `${(m.progress / m.target) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-mute tabular-nums">{m.progress}/{m.target}</span>
                {m.claimed ? (
                  <span className="flex items-center gap-1 font-bold text-mint"><Check className="w-3.5 h-3.5" /> U mor</span>
                ) : complete ? (
                  <button type="button" onClick={() => { const t = claimMission(m.id); if (t !== null) { onReward(t); playSound('win'); } }}
                    className="gz-btn flex items-center gap-1 font-extrabold px-3 py-1 rounded-full cursor-pointer animate-pulse">
                    <Gift className="w-3.5 h-3.5" /> Merr
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <style>{`.gz-flame { animation: gz-flame 1.4s ease-in-out infinite; display: inline-block; } @keyframes gz-flame { 50% { transform: scale(1.15) rotate(-4deg); } }`}</style>
    </section>
  );
}
