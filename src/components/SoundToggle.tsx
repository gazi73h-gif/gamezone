'use client';
import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, onMuteChange, playSound, setMuted } from '@/lib/sound';

// Butoni i zërit; zgjedhja vlen për të gjitha lojërat dhe ruhet pas refresh-it
export default function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setState] = useState(false);
  useEffect(() => {
    setState(isMuted()); // eslint-disable-line react-hooks/set-state-in-effect -- lexohet nga shfletuesi vetëm pas hapjes
    return onMuteChange(setState);
  }, []);
  return (
    <button
      type="button"
      onClick={() => { setMuted(!muted); if (muted) playSound('turn'); }}
      aria-label={muted ? 'Ndize zërin' : 'Fike zërin'}
      aria-pressed={muted}
      title={muted ? 'Ndize zërin' : 'Fike zërin'}
      className={`grid place-items-center w-9 h-9 rounded-full bg-black/45 hover:bg-black/60 border border-white/15 text-white cursor-pointer transition ${className}`}
    >
      {muted ? <VolumeX className="w-4 h-4 text-coral" /> : <Volume2 className="w-4 h-4" />}
    </button>
  );
}
