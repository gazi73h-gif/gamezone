'use client';

import React, { useState } from 'react';
import { Radio, Play, Square } from 'lucide-react';

const LIVE_RADIO_VIDEO_ID = 'b-bK2Vn3D38';

export default function RadioPlayer() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  return (
    <div className="fixed bottom-3 right-3 z-50">
      {/* Transmetim Live 24/7 vetëm me zë (pa video në ekran) */}
      {isPlaying && (
        <iframe
          src={`https://youtube.com{LIVE_RADIO_VIDEO_ID}?autoplay=1`}
          title="GameZone Radio Live"
          allow="autoplay; encrypted-media"
          className="w-0 h-0 opacity-0 pointer-events-none absolute"
        />
      )}

      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl border text-xs font-extrabold transition cursor-pointer ${
          isPlaying
            ? 'bg-red-600/95 hover:bg-red-500 border-red-400 text-white'
            : 'bg-slate-900/95 hover:bg-slate-800 border-amber-500/50 text-white'
        }`}
        title={isPlaying ? 'Ndalo radion për veten' : 'Dëgjo radion live'}
      >
        <Radio className={`w-4 h-4 ${isPlaying ? 'text-white animate-pulse' : 'text-amber-400'}`} />
        <span>{isPlaying ? 'Ndalo Radion' : 'Radio Live'}</span>
        {isPlaying ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
        )}
      </button>
    </div>
  );
}
