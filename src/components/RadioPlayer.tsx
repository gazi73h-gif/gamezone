'use client';

import React, { useState, useRef } from 'react';
import { Radio, Play, Square, SkipForward, ExternalLink } from 'lucide-react';

const STATIONS = [
  { name: 'Chill Lounge', url: 'https://somafm.com' },
  { name: 'Radio Paradise', url: 'https://radioparadise.com' },
];

export default function RadioPlayer() {
  const [stationIndex, setStationIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentStation = STATIONS[stationIndex];

  const handleToggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

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
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleNextStation = () => {
    const nextIdx = (stationIndex + 1) % STATIONS.length;
    setStationIndex(nextIdx);
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
        } finally {
          setIsLoading(false);
        }
      }, 150);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded-full border border-slate-800 text-[10px] font-bold text-slate-300 shadow-lg">
        <span>Radio Shqip:</span>
        <a
          href="https://shqipfm.al/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 hover:underline flex items-center gap-0.5"
        >
          Shqip FM <ExternalLink className="w-2.5 h-2.5" />
        </a>
        <span>•</span>
        <a
          href="https://dukagjini.com/radio/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 hover:underline flex items-center gap-0.5"
        >
          Dukagjini <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      <div className="flex items-center gap-1.5">
        <audio
          ref={audioRef}
          src={currentStation.url}
          preload="none"
          onPlaying={() => {
            setIsPlaying(true);
            setIsLoading(false);
          }}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
            setIsLoading(false);
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
          <span>{isLoading ? 'Duke u lidhur...' : currentStation.name}</span>
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
    </div>
  );
}
