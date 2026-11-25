'use client';
// Chat-i i dhomës: mesazhet vijnë me Supabase Realtime (WebSocket) + kontroll çdo 4 s si rezervë.
// Dërgimi bëhet VETËM përmes funksionit send_room_message në server, i cili i filtron
// fyerjet dhe kërkimet e kontaktit (shih supabase/migrations/20261126_room_chat.sql).
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { supabase } from './supabase';
import { playSound } from './sound';

export type ChatMessage = {
  id: number;
  room_code: string;
  player_id: string;
  nickname: string;
  body: string;
  created_at: string;
};

/** Lojërat me chat */
export const CHAT_GAMES = ['ludo', 'uno', 'yamb', 'rummy'];

const REASONS: Record<string, string> = {
  fyerje: '🚫 Mesazhi nuk u dërgua: shajet dhe fyerjet nuk lejohen.',
  kontakt: '🚫 Mesazhi nuk u dërgua: nuk lejohet kërkimi i numrit të telefonit, Instagram-it apo Facebook-ut.',
  slow_down: '⏳ Prit pak — po shkruan shumë shpejt.',
  too_long: 'Mesazhi është shumë i gjatë (maksimumi 200 shkronja).',
  not_in_room: 'Nuk je më në këtë dhomë.',
  empty: '',
};

export function useRoomChat(roomCode: string, playerId: string, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing'>('loading');
  const seen = useRef(new Set<number>());
  const lastId = useRef(0);
  const refresh = useRef<() => void>(() => {});

  const add = useEffectEvent((list: ChatMessage[], notify: boolean) => {
    const fresh = list.filter((m) => !seen.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach((m) => seen.current.add(m.id));
    lastId.current = Math.max(lastId.current, ...fresh.map((m) => m.id));
    setMessages((prev) => [...prev, ...fresh].sort((a, b) => a.id - b.id).slice(-100));
    if (notify && fresh.some((m) => m.player_id !== playerId)) playSound('chat');
  });

  useEffect(() => {
    if (!enabled || !roomCode) return;
    let alive = true;
    let missing = false;
    const load = async (initial: boolean) => {
      if (missing) return;
      const q = supabase.from('room_messages').select('*').eq('room_code', roomCode);
      const { data, error } = initial
        ? await q.order('id', { ascending: false }).limit(60)
        : await q.gt('id', lastId.current).order('id', { ascending: true }).limit(60);
      if (!alive) return;
      if (error) {
        if (initial && (error.code === '42P01' || error.code === 'PGRST205')) { missing = true; setStatus('missing'); }
        return;
      }
      if (initial) setStatus('ok');
      add((data ?? []) as ChatMessage[], !initial);
    };
    refresh.current = () => { void load(false); };
    void load(true);
    const ch = supabase
      .channel(`chat:${roomCode}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_code=eq.${roomCode}` },
        (p) => add([p.new as ChatMessage], true))
      .subscribe();
    const poll = setInterval(() => void load(false), 4000);
    return () => { alive = false; clearInterval(poll); void supabase.removeChannel(ch); };
  }, [enabled, roomCode]);

  /** Dërgon mesazhin; kthen null kur u dërgua, përndryshe tekstin e njoftimit për dërguesin. */
  const send = async (text: string): Promise<string | null> => {
    const body = text.trim();
    if (!body) return null;
    const { data, error } = await supabase.rpc('send_room_message', { p_room: roomCode, p_player: playerId, p_body: body });
    if (error) {
      return error.code === 'PGRST202' ? 'Chat-i nuk është aktivizuar ende në server.' : 'Mesazhi nuk u dërgua. Kontrollo internetin.';
    }
    const res = data as { ok?: boolean; reason?: string } | null;
    if (!res?.ok) return REASONS[res?.reason ?? ''] ?? 'Mesazhi nuk u dërgua.';
    refresh.current();
    return null;
  };

  return { messages, status, send };
}
