'use client';

import React, { useState } from 'react';
import { Radio, X, Minimize2 } from 'lucide-react';

const LIVE_RADIO_VIDEO_ID = 'b-bK2Vn3D38';

export default function RadioPlayer() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isHidden, setIsHidden] = useState<boolean>(false);

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {/* Dritarja e vogel e YouTube qe rri e hapur ne sfond edhe kur minimizohet */}
      {isOpen && (
        <div
          className={`bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden transition-all ${
            isHidden
              ? 'w-1 h-1 opacity-0 pointer-events-none fixed bottom-0 right-0'
              : 'w-64 p-2'
          }`}
        >
          <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] text-slate-300">
            <span className="font-bold text-amber-400">Kliko Play dhe fshihe ↓</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsHidden(true)}
                className="p-1 hover:text-white bg-slate-800 rounded-lg cursor-pointer"
                title="Fshihe nga ekrani (muzika vazhdon)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsHidden(false);
                }}
                className="p-1 hover:text-red-400 bg-slate-800 rounded-lg cursor-pointer"
                title="Mbylle radion"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="w-full h-36 rounded-xl overflow-hidden bg-black">
            <iframe
              width="100%"
              height="100%"
              src={`https://youtube.com{LIVE_RADIO_VIDEO_ID}?autoplay=1&playsinline=1&rel=0`}
              title="GameZone Radio Live"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Susta e vogel ne cep */}
      <button
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            setIsHidden(false);
          } else {
            setIsHidden(!isHidden);
          }
        }}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl border text-xs font-extrabold transition cursor-pointer ${
          isOpen
            ? 'bg-emerald-600/95 hover:bg-emerald-500 border-emerald-400 text-white'
            : 'bg-slate-900/95 hover:bg-slate-800 border-amber-500/50 text-white'
        }`}
      >
        <Radio className={`w-4 h-4 ${isOpen ? 'text-white animate-pulse' : 'text-amber-400'}`} />
        <span>
          {!isOpen ? 'Radio Live' : isHidden ? 'Shfaq Radion' : 'Fshihe (Muzika vazhdon)'}
        </span>
      </button>
    </div>
  );
}
