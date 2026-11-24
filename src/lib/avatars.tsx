'use client';
// Fotot e profilit (Facebook/Google). Faqja e dhomës i vendos këtu fotot e lojtarëve,
// dhe çdo lojë i lexon sipas ID-së së lojtarit, pa i kaluar nëpër çdo komponent.
import React, { useState, useSyncExternalStore } from 'react';

let avatars: Record<string, string> = {};
const listeners = new Set<() => void>();

export function setRoomAvatars(next: Record<string, string>) {
  const same = Object.keys(next).length === Object.keys(avatars).length && Object.entries(next).every(([k, v]) => avatars[k] === v);
  if (same) return;
  avatars = next;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => avatars;
const serverSnapshot = () => ({} as Record<string, string>);

export function useAvatar(id?: string | null): string | undefined {
  const map = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return id ? map[id] : undefined;
}

// Foto e rrumbullakët; nëse s'ka foto ose s'hapet, inicialet (ose 🤖 për botin)
export function UserAvatar({ src, name, bot, className = '' }: { src?: string | null; name: string; bot?: boolean; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src && !bot) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto nga Facebook/Google, pa optimizim të Next
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} className={`object-cover ${className}`} />
    );
  }
  return <span className={`grid place-items-center ${className}`}>{bot ? '🤖' : name.trim().slice(0, 2).toUpperCase() || '?'}</span>;
}
