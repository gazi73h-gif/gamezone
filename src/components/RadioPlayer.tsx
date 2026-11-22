'use client';

import React, { useState, useRef } from 'react';
import { Radio, Play, Square, SkipForward } from 'lucide-react';

const STATIONS = [
  { name: 'Radio Shqip 92.0', url: '/api/radio?station=shqip' },
  { name: 'Radio Dukagjini', url: '/api/radio?station=dukagjini' },
];

export default function RadioPlayer() {
  const [stationIndex, setStationIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentStation = STATIONS[stationIndex];

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

  const handleNextStation = () => {
    const nextIdx = (stationIndex + 1) % STATIONS.length;
    setStationIndex(nextIdx);
    setErrorMsg('');
    if (isPlaying) {
      setIsLoading(true);
      setTimeout(async () => {
        const audio = audioRef.current;
        if (!audio) return;
        try {
          audio.load();
          await audio.play();
        } catch {
          setIsPlaying(false);
          setErrorMsg('S’u lidh');
        } finally {
          setIsLoading(false);
        }
      }, 150);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5">
      <audio
        key={currentStation.url}
        ref={audioRef}
        src={currentStation.url}
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
            ? `${currentStation.name} (${errorMsg})`
            : currentStation.name}
        </span>
        {isPlaying ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
        )}
      </button>

      <button
        onClick={handleNextStation}
        title="Ndërro stacionin"
        className="p-2.5 rounded-full bg-slate-900/95 hover:bg-slate-800 border border-slate-700 text-amber-400 shadow-2xl transition cursor-pointer"
      >
        <SkipForward className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
