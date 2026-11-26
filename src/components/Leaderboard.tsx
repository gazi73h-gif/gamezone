'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Crown, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LeaderEntry {
  nickname: string;
  wins: number;
  points: number;
  last_game: string | null;
}

const MEDAL = [
  { ring: 'from-[#ffe08a] to-[#f5a300]', text: 'text-[#3a2400]' },
  { ring: 'from-[#eef2ff] to-[#a5b4fc]', text: 'text-[#1e1b4b]' },
  { ring: 'from-[#ffc8a2] to-[#c2652a]', text: 'text-[#3b1600]' },
];

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<Array<LeaderEntry>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchLeaders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leaderboard')
      .select('nickname, wins, points, last_game')
      .order('points', { ascending: false })
      .order('wins', { ascending: false })
      .limit(10);

    if (data) setLeaders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLeaders();
  }, []);

  return (
    <div className="gz-panel rounded-[28px] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-gold to-gold-2 shadow-[0_4px_0_#b86a00]">
            <Trophy className="w-5 h-5 text-[#3a2400]" />
          </span>
          <div>
            <h2 className="font-display font-semibold text-xl sm:text-2xl">Kampionët</h2>
            <p className="text-xs sm:text-sm text-mute">Luaj me të njëjtën nofkë për të mbledhur pikë</p>
          </div>
        </div>
        <button
          onClick={fetchLeaders}
          className="grid place-items-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-mute hover:text-ink transition cursor-pointer"
          title="Rifresko renditjen"
          aria-label="Rifresko renditjen"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {leaders.length === 0 ? (
        <div className="text-center py-5 rounded-3xl border border-dashed border-white/15">
          <Crown className="w-7 h-7 text-gold/70 mx-auto mb-1" />
          <p className="font-display font-semibold text-lg">Ende pa kampionë!</p>
          <p className="text-sm text-mute mt-1">Fito një lojë dhe emri yt del i pari këtu.</p>
        </div>
      ) : (
        <ol className="grid sm:grid-cols-2 gap-2">
          {leaders.map((player, index) => {
            const medal = MEDAL[index];
            return (
              <li
                key={player.nickname}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${
                  index === 0 ? 'bg-gold/10 border-gold/40' : 'bg-night/40 border-white/5'
                }`}
              >
                <span
                  className={`grid place-items-center w-9 h-9 shrink-0 rounded-full font-display font-bold ${
                    medal ? `bg-gradient-to-br ${medal.ring} ${medal.text}` : 'bg-white/5 text-mute'
                  }`}
                >
                  {index === 0 ? <Crown className="w-4 h-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{player.nickname}</p>
                  {player.last_game && <p className="text-xs text-mute truncate">{player.last_game}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className="block font-display font-semibold text-gold leading-tight">{player.points}</span>
                  <span className="block text-[11px] text-mint font-bold">{player.wins} fitore</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
