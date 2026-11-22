'use client';

import React, { useState, useRef } from 'react';
import { Radio, Play, Square } from 'lucide-react';

export default function RadioPlayer() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setErrorMsg('');

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      try {
        audio.load();
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        setErrorMsg('S’u lidh');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50">
      <audio
        ref={audioRef}
        src="https://sednastream.com"
        preload="none"
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoading(false);
          setErrorMsg('');
        }}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          setIsLoading(false);
          setErrorMsg('Gabim stream');
        }}
      />

      <button
        onClick={handleToggle}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl border text-xs font-extrabold transition cursor-pointer ${
          isPlaying
            ? 'bg-red-600/95 hover:bg-red-500 border-red-400 text-white'
            : 'bg-slate-900/95 hover:bg-slate-800 border-amber-500/50 text-white'
        }`}
      >
        <Radio className={`w-4 h-4 ${isPlaying ? 'text-white animate-pulse' : 'text-amber-400'}`} />
        <span>
          {isLoading
            ? 'Duke u lidhur...'
            : errorMsg
            ? `Radio Shqip (${errorMsg})`
            : isPlaying
            ? 'Radio Shqip (Ndalo)'
            : 'Radio Shqip Live'}
        </span>
        {isPlaying ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
        )}
      </button>
    </div>
  );
}
