'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Radio, Play, Square } from 'lucide-react';

const LIVE_RADIO_VIDEO_ID = 'b-bK2Vn3D38';

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height?: string;
          width?: string;
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
}

export default function RadioPlayer() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || playerRef.current) return;
      playerRef.current = new window.YT.Player('gamezone-yt-audio', {
        height: '1',
        width: '1',
        videoId: LIVE_RADIO_VIDEO_ID,
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            setIsReady(true);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://youtube.com"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://youtube.com';
        document.body.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }
  }, []);

  const handleToggle = () => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.pauseVideo();
      setIsPlaying(false);
    } else {
      player.unMute();
      player.setVolume(80);
      player.playVideo();
      setIsPlaying(true);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50">
      {/* Player i padukshem 1x1px qe rri gati ne sfond */}
      <div className="fixed bottom-0 right-0 w-px h-px opacity-0 pointer-events-none overflow-hidden">
        <div id="gamezone-yt-audio" />
      </div>

      <button
        onClick={handleToggle}
        disabled={!isReady}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl border text-xs font-extrabold transition cursor-pointer ${
          isPlaying
            ? 'bg-red-600/95 hover:bg-red-500 border-red-400 text-white'
            : 'bg-slate-900/95 hover:bg-slate-800 border-amber-500/50 text-white'
        } ${!isReady ? 'opacity-70' : ''}`}
        title={isPlaying ? 'Ndalo radion për veten' : 'Dëgjo radion live'}
      >
        <Radio className={`w-4 h-4 ${isPlaying ? 'text-white animate-pulse' : 'text-amber-400'}`} />
        <span>{!isReady ? 'Duke ngarkuar...' : isPlaying ? 'Ndalo Radion' : 'Radio Live'}</span>
        {isPlaying ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
        )}
      </button>
    </div>
  );
}
