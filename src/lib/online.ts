'use client';
// Sa lojtarë janë online tani: çdo skedë e hapur e faqes futet në një kanal "presence" të Supabase
// (WebSocket). Çelësi është ID-ja e lojtarit, prandaj disa skeda të të njëjtit lojtar numërohen një herë.
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { LOBBY_CHANNEL } from './lobby';

export const ONLINE_CHANNEL = `${LOBBY_CHANNEL}_online`;

let count = 0;
let started = false;
const subs = new Set<() => void>();

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let key = '';
  try { key = window.localStorage.getItem('gamezone_player_id') || ''; } catch { /* s'ka rëndësi */ }
  if (!key) key = 'guest_' + Math.random().toString(36).slice(2, 10);
  const ch = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key } } });
  ch.on('presence', { event: 'sync' }, () => {
    count = Object.keys(ch.presenceState()).length;
    subs.forEach((fn) => fn());
  }).subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track({ online_at: new Date().toISOString() });
  });
}

/** Vendoset një herë në layout: e numëron këtë vizitor si online në çdo faqe. */
export function OnlinePresence() {
  useEffect(() => { start(); }, []);
  return null;
}

/** Numri i lojtarëve online (0 derisa të vijë përgjigjja e parë). */
export function useOnlineCount() {
  useEffect(() => { start(); }, []);
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => count,
    () => 0,
  );
}
