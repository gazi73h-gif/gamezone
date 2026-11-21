'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LeaderEntry {
  nickname: string;
  wins: number;
  points: number;
  last_game: string | null;
}

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
    <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/40">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Kampionët e GameZone
            </h2>
            <p className="text-xs text-slate-400">
              Luaj me të njëjtën nofkë për të mbledhur fitore & pikë
            </p>
          </div>
        </div>

        <button
          onClick={fetchLeaders}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
          title="Rifresko renditjen"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {leaders.length === 0 ? (
        <div className="text-center py-8 bg-slate-950/60 rounded-2xl border border-slate-800">
          <Crown className="w-8 h-8 text-amber-400/60 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-300">
            Ende nuk ka kampionë të regjistruar!
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Fito një lojë dhe emri yt do të shfaqet i pari këtu.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaders.map((player, index) => {
            const isFirst = index === 0;
            const isSecond = index === 1;
            const isThird = index === 2;

            return (
              <div
                key={player.nickname}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition ${
                  isFirst
                    ? 'bg-gradient-to-r from-amber-500/20 to-yellow-600/10 border-amber-400/50'
                    : isSecond
                    ? 'bg-slate-800/80 border-slate-600/60'
                    : isThird
                    ? 'bg-amber-900/20 border-amber-700/40'
                    : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 bg-slate-900 border border-slate-700">
                    {isFirst ? (
                      <Crown className="w-4 h-4 text-amber-400" />
                    ) : isSecond ? (
                      <Medal className="w-4 h-4 text-slate-300" />
                    ) : isThird ? (
                      <Medal className="w-4 h-4 text-amber-600" />
                    ) : (
                      <span className="text-slate-400">#{index + 1}</span>
                    )}
                  </div>

                  <div className="truncate">
                    <p className="font-bold text-sm text-white truncate">
                      {player.nickname}
                    </p>
                    {player.last_game && (
                      <p className="text-[11px] text-slate-400 truncate">
                        Fitorja e fundit: {player.last_game}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="block text-sm font-black text-amber-400">
                      {player.points} pikë
                    </span>
                    <span className="block text-[11px] text-emerald-400 font-semibold">
                      {player.wins} {player.wins === 1 ? 'fitore' : 'fitore'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
