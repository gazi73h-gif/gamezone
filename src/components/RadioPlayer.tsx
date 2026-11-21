'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Radio, Play, Pause, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';

interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  country: string;
}

const FALLBACK_STATIONS: Array<RadioStation> = Array.of(
  {
    stationuuid: 'soma-groove',
    name: 'Groove Salad (Chill & Lounge)',
    url_resolved: 'https://somafm.com',
    country: 'Live',
  },
  {
    stationuuid: 'soma-lush',
    name: 'Lush (Muzikë e qetë)',
    url_resolved: 'https://somafm.com',
    country: 'Live',
  },
  {
    stationuuid: 'soma-beat',
    name: 'Beat Blender (Hits & Ritëm)',
    url_resolved: 'https://somafm.com',
    country: 'Live',
  },
  {
    stationuuid: 'soma-pop',
    name: 'PopTron (Pop & Energy)',
    url_resolved: 'https://somafm.com',
    country: 'Live',
  }
);

export default function RadioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [stations, setStations] = useState<Array<RadioStation>>(FALLBACK_STATIONS);
  const [selectedStation, setSelectedStation] = useState<RadioStation>(FALLBACK_STATIONS.at(0)!);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.6);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [minimized, setMinimized] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Ngarko radiot e Kosovës & Shqipërisë me HTTPS
  useEffect(() => {
    const loadAlbanianRadios = async () => {
      try {
        const res = await fetch(
          'https://radio-browser.info'
        );
        if (!res.ok) return;
        const data: Array<RadioStation> = await res.json();
        const httpsOnly = data.filter(
          (s) => s.url_resolved && s.url_resolved.startsWith('https://')
        );
        if (httpsOnly.length > 0) {
          const combined = httpsOnly.concat(FALLBACK_STATIONS);
          setStations(combined);
          setSelectedStation(combined.at(0)!);
        }
      } catch {
        // Përdor stacionet rezervë nëse API nuk përgjigjet
      }
    };
    loadAlbanianRadios();
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setStatusMsg('');
    } else {
      setStatusMsg('Duke u lidhur...');
      try {
        audio.src = selectedStation.url_resolved;
        await audio.play();
        setIsPlaying(true);
        setStatusMsg('');
      } catch {
        setIsPlaying(false);
        setStatusMsg('Stacioni është i zënë, provo tjetrin në listë.');
      }
    }
  };

  const handleChangeStation = async (uuid: string) => {
    const found = stations.find((s) => s.stationuuid === uuid);
    if (!found) return;
    setSelectedStation(found);
    setStatusMsg('');

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      setStatusMsg('Duke ndërruar...');
      try {
        audio.src = found.url_resolved;
        await audio.play();
        setStatusMsg('');
      } catch {
        setIsPlaying(false);
        setStatusMsg('Stacioni nuk punon tani, zgjidh tjetër.');
      }
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <audio
        ref={audioRef}
        preload="none"
        onError={() => {
          setIsPlaying(false);
          setStatusMsg('Gabim në lidhje, zgjidh një radio tjetër.');
        }}
      />

      {minimized ? (
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 bg-slate-900/95 border border-amber-500/40 text-white px-4 py-2.5 rounded-full shadow-2xl hover:border-amber-400 transition cursor-pointer"
        >
          <Radio className={`w-4 h-4 text-amber-400 ${isPlaying ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-bold truncate max-w-[140px]">
            {selectedStation.name}
          </span>
          <ChevronUp className="w-4 h-4 text-slate-400" />
        </button>
      ) : (
        <div className="w-76 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-3.5 shadow-2xl text-white">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 text-amber-400 ${isPlaying ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                GameZone Radio Live
              </span>
            </div>
            <button
              onClick={() => setMinimized(true)}
              className="text-slate-400 hover:text-white p-1 cursor-pointer"
              title="Minimizo"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <select
            value={selectedStation.stationuuid}
            onChange={(e) => handleChangeStation(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none mb-2.5"
          >
            {stations.map((s) => (
              <option key={s.stationuuid} value={s.stationuuid}>
                {s.name}
              </option>
            ))}
          </select>

          {statusMsg && (
            <p className="text-[11px] text-amber-300 mb-2">{statusMsg}</p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={togglePlay}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                isPlaying
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Ndalo' : 'Dëgjo'}
            </button>

            <div className="flex items-center gap-1.5 flex-1 justify-end">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setIsMuted(false);
                  setVolume(parseFloat(e.target.value));
                }}
                className="w-20 accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
