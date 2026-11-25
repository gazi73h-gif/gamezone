'use client';
import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import type { ChatMessage } from '@/lib/chat';

const QUICK = ['👋 Përshëndetje!', '👍', '😂', '🔥 Bravo!', '🍀 Fat të mbarë!', '😅 Ups'];
const NICK_COLORS = ['#ffc83d', '#4cc9f0', '#3ddc97', '#ff8fa3', '#b388ff', '#ff9f1c'];
const colorOf = (id: string) => NICK_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % NICK_COLORS.length];
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit' });

/** Butoni i chat-it në shiritin e lojës, me numrin e mesazheve të palexuara. */
export function ChatButton({ open, unread, onClick, className = '' }: { open: boolean; unread: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Mbyll chat-in' : 'Hap chat-in'}
      aria-pressed={open}
      title="Chat"
      data-testid="chat-toggle"
      className={`relative grid place-items-center w-9 h-9 rounded-full border text-white cursor-pointer transition shrink-0
        ${open ? 'bg-gold/25 border-gold/60' : 'bg-black/45 hover:bg-black/60 border-white/15'} ${unread ? 'gz-chat-ping' : ''} ${className}`}
    >
      <MessageCircle className="w-4 h-4" />
      {unread > 0 && (
        <span data-testid="chat-unread" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-white text-[10px] font-extrabold grid place-items-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

/** Paneli i chat-it: qëndron NË ANË të lojës (djathtas në horizontal, poshtë në vertikal), pa e mbuluar tabelën. */
export function ChatPanel({ messages, me, status, onSend, onClose }: {
  messages: ChatMessage[];
  me: string;
  status: 'loading' | 'ok' | 'missing';
  onSend: (text: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async (value: string) => {
    if (!value.trim() || sending) return;
    setSending(true);
    const err = await onSend(value);
    setSending(false);
    if (err) { setNotice(err); return; } // mesazhi i bllokuar mbetet vetëm te dërguesi, që ta ndreqë
    setNotice('');
    if (value === text) setText('');
  };

  return (
    <aside className="gz-chat" data-testid="chat-panel" aria-label="Chat-i i dhomës">
      <div className="gz-chat-head">
        <span className="flex items-center gap-1.5 font-display font-semibold"><MessageCircle className="w-4 h-4 text-gold" /> Chat</span>
        <button type="button" onClick={onClose} aria-label="Mbyll chat-in" className="grid place-items-center w-7 h-7 rounded-full hover:bg-white/10 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={listRef} className="gz-chat-list" data-testid="chat-list">
        {status === 'missing' && <p className="gz-chat-empty">Chat-i nuk është aktivizuar ende në server.</p>}
        {status === 'ok' && messages.length === 0 && <p className="gz-chat-empty">Ende s&apos;ka mesazhe. Përshëndeti lojtarët! 👋</p>}
        {messages.map((m) => {
          const mine = m.player_id === me;
          return (
            <div key={m.id} className={`gz-msg ${mine ? 'gz-msg-me' : ''}`} data-chat-msg>
              {!mine && <span className="gz-msg-nick" style={{ color: colorOf(m.player_id) }}>{m.nickname}</span>}
              <span className="gz-msg-body">{m.body}</span>
              <span className="gz-msg-time">{timeOf(m.created_at)}</span>
            </div>
          );
        })}
      </div>

      <div className="gz-chat-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => void submit(q)} disabled={sending} className="gz-chip">{q}</button>
        ))}
      </div>
      {notice && <p role="status" className="gz-chat-notice" data-testid="chat-notice">{notice}</p>}
      <form className="gz-chat-form" onSubmit={(e) => { e.preventDefault(); void submit(text); }}>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); if (notice) setNotice(''); }}
          maxLength={200}
          placeholder="Shkruaj një mesazh…"
          aria-label="Mesazhi"
          enterKeyHint="send"
          autoComplete="off"
        />
        <button type="submit" disabled={sending || !text.trim()} aria-label="Dërgo" className="gz-send"><Send className="w-4 h-4" /></button>
      </form>
    </aside>
  );
}

/** Ndarja e ekranit: loja + chat-i krah për krah (horizontal) ose njëri mbi tjetrin (vertikal). */
export function ChatStyles() {
  return (
    <style>{`
      .gz-split { display: flex; flex-direction: column; }
      .gz-chat { flex: 0 0 40%; min-height: 190px; display: flex; flex-direction: column; min-width: 0;
        background: linear-gradient(180deg, rgba(30,24,72,0.97), rgba(18,14,46,0.98)); border-top: 1px solid rgba(255,255,255,0.12); color: #fff; }
      @media (orientation: landscape) {
        .gz-split { flex-direction: row; }
        .gz-chat { flex: 0 0 clamp(230px, 28vw, 340px); min-height: 0; border-top: 0; border-left: 1px solid rgba(255,255,255,0.12); }
      }
      .gz-chat-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .gz-chat-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain; }
      .gz-chat-empty { margin: auto; text-align: center; font-size: 13px; color: rgba(255,255,255,0.55); padding: 0 12px; }
      .gz-msg { align-self: flex-start; max-width: 88%; background: rgba(255,255,255,0.08); border-radius: 14px 14px 14px 4px; padding: 5px 10px 4px; display: flex; flex-direction: column; animation: gz-msg-in .25s ease-out; }
      .gz-msg-me { align-self: flex-end; background: linear-gradient(180deg, #ffd45e, #f5b82e); color: #2a1d00; border-radius: 14px 14px 4px 14px; }
      .gz-msg-nick { font-size: 11px; font-weight: 800; }
      .gz-msg-body { font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
      .gz-msg-time { font-size: 9.5px; opacity: 0.55; align-self: flex-end; }
      @keyframes gz-msg-in { from { opacity: 0; transform: translateY(6px); } }
      .gz-chat-quick { display: flex; gap: 5px; overflow-x: auto; padding: 4px 8px; scrollbar-width: none; }
      .gz-chip { flex: none; font-size: 12px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); cursor: pointer; white-space: nowrap; }
      .gz-chip:hover { background: rgba(255,255,255,0.16); }
      .gz-chat-notice { margin: 0 8px 4px; font-size: 12px; font-weight: 700; color: #ffb3bd; background: rgba(255,93,115,0.12); border: 1px solid rgba(255,93,115,0.4); border-radius: 10px; padding: 5px 8px; }
      .gz-chat-form { display: flex; gap: 6px; padding: 6px 8px 8px; }
      .gz-chat-form input { flex: 1; min-width: 0; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 8px 14px; color: #fff; font-size: 16px; outline: none; }
      .gz-chat-form input:focus { border-color: #ffc83d; }
      .gz-send { display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: 999px; background: #ffc83d; color: #2a1d00; cursor: pointer; }
      .gz-send:disabled { opacity: 0.45; cursor: default; }
      .gz-chat-ping { animation: gz-ping 1.2s ease-in-out infinite; }
      @keyframes gz-ping { 50% { box-shadow: 0 0 0 4px rgba(255,93,115,0.35); } }
    `}</style>
  );
}
