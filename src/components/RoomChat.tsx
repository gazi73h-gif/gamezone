'use client';
import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { CHAT_PHRASES, type ChatBubble } from '@/lib/chat';

/** Butoni i chat-it: hap një listë të vogël me fraza të gatshme (pa shkruar). */
export function ChatButton({ onSend, className = '' }: { onSend: (text: string) => Promise<string | null>; className?: string }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const pick = async (text: string) => {
    setOpen(false);
    const err = await onSend(text);
    if (err) { setNotice(err); setTimeout(() => setNotice(''), 3000); }
  };
  return (
    <span className="relative inline-grid shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mesazhet e shpejta"
        aria-expanded={open}
        title="Mesazhet e shpejta"
        data-testid="chat-toggle"
        className={`grid place-items-center w-9 h-9 rounded-full border text-white cursor-pointer transition
          ${open ? 'bg-gold/25 border-gold/60' : 'bg-black/45 hover:bg-black/60 border-white/15'} ${className}`}
      >
        <MessageCircle className="w-4 h-4" />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden />
          <span role="menu" data-testid="chat-menu" className="gz-qmenu">
            {CHAT_PHRASES.map((p) => (
              <button key={p} type="button" role="menuitem" onClick={() => void pick(p)} className="gz-qbtn">{p}</button>
            ))}
          </span>
        </>
      )}
      {notice && <span role="status" className="gz-qnotice">{notice}</span>}
      <style>{`
        .gz-qmenu { position: absolute; top: calc(100% + 6px); right: -4px; z-index: 71; display: grid; grid-template-columns: repeat(2, max-content); gap: 5px;
          padding: 7px; border-radius: 16px; background: rgba(20,16,52,0.97); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 14px 34px rgba(0,0,0,0.5);
          animation: gz-qin .15s ease-out; }
        @keyframes gz-qin { from { opacity: 0; transform: translateY(-4px) scale(0.96); } }
        .gz-qbtn { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; text-align: left; padding: 5px 10px; border-radius: 999px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); cursor: pointer; }
        .gz-qbtn:hover { background: rgba(255,200,61,0.2); border-color: rgba(255,200,61,0.5); }
        .gz-qnotice { position: absolute; top: calc(100% + 6px); right: 0; z-index: 71; width: max-content; max-width: 220px; font-size: 11px; font-weight: 700;
          color: #ffb3bd; background: rgba(20,16,52,0.97); border: 1px solid rgba(255,93,115,0.5); border-radius: 10px; padding: 4px 8px; }
      `}</style>
    </span>
  );
}

/** Flluska të vogla me mesazhet e fundit; zhduken vetë pas pak sekondash dhe nuk prekin lojën. */
export function ChatBubbles({ bubbles }: { bubbles: ChatBubble[] }) {
  if (!bubbles.length) return null;
  return (
    <div className="gz-bubbles" aria-live="polite" data-testid="chat-bubbles">
      {bubbles.map((b) => (
        <div key={b.id} className={`gz-bubble ${b.mine ? 'gz-bubble-me' : ''}`} data-chat-msg>
          <b>{b.mine ? 'Ti' : b.nickname}:</b> <span className="gz-msg-body">{b.body}</span>
        </div>
      ))}
      <style>{`
        .gz-bubbles { position: absolute; top: 54px; left: 50%; transform: translateX(-50%); z-index: 65; pointer-events: none;
          display: flex; flex-direction: column; align-items: center; gap: 4px; max-width: 92%; }
        .gz-bubble { font-size: 12.5px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
          padding: 4px 11px; border-radius: 999px; background: rgba(20,16,52,0.88); border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 6px 16px rgba(0,0,0,0.35); animation: gz-bub 4s ease-out forwards; }
        .gz-bubble b { color: #ffc83d; font-weight: 800; }
        .gz-bubble-me { border-color: rgba(255,200,61,0.55); }
        @keyframes gz-bub { 0% { opacity: 0; transform: translateY(-6px) scale(0.9); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}
