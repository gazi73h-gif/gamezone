'use client';

import React, { useState, useRef } from 'react';
import { Radio, Play, Square, SkipForward } from 'lucide-react';

const STATIONS = [
  { name: 'Chill Lounge', url: 'https://somafm.com' },
  { name: 'Deep House', url: 'https://somafm.com' },
  { name: 'Lush Vocals', url: 'https://somafm.com' },
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
        if (!audio.src || audio.src !== currentStation.url) {
          audio.src = currentStation.url;
        }
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

  const handleNextStation = async () => {
    const nextIdx = (stationIndex + 1) % STATIONS.length;
    setStationIndex(nextIdx);
    setErrorMsg('');
    const audio = audioRef.current;
    if (audio && isPlaying) {
      setIsLoading(true);
      try {
        audio.pause();
        audio.src = STATIONS[nextIdx].url;
        await audio.play();
      } catch {
        setIsPlaying(false);
        setErrorMsg('S’u lidh');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5">
      <audio
        ref={audioRef}
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
