'use client';
// Llogaria e lojtarit: hyrja me link në email (Supabase Auth) dhe profili me tokens në server.
// Pa llogari, lojtari vazhdon si mysafir (ID dhe tokens në këtë shfletues), si më parë.
// Nëse tabela "profiles" ende s'është krijuar në Supabase, faqja kalon vetë te mënyra mysafir.
import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  nickname: string;
  tokens: number;
  last_bonus: string | null;
}

const ID_KEY = 'gamezone_player_id';
const GUEST_KEY = 'gamezone_guest_id';
const NICK_KEY = 'gamezone_nickname';

const today = () => new Date().toISOString().slice(0, 10);
export const bonusAvailable = (p: Profile | null) => !!p && (!p.last_bonus || p.last_bonus < today());

// ID-ja e lojtarit në dhoma: me llogari është ID e llogarisë (e njëjtë në çdo pajisje)
function syncAccountId(user: User | null) {
  if (typeof window === 'undefined') return;
  try {
    const current = window.localStorage.getItem(ID_KEY);
    if (user) {
      if (current && current !== user.id && current.startsWith('player_')) window.localStorage.setItem(GUEST_KEY, current);
      window.localStorage.setItem(ID_KEY, user.id);
    } else if (current && !current.startsWith('player_')) {
      window.localStorage.setItem(ID_KEY, window.localStorage.getItem(GUEST_KEY) || 'player_' + Math.random().toString(36).slice(2, 10));
    }
  } catch { /* s'ka rëndësi */ }
}

export function useAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      // linku nga emaili ka dështuar (skaduar, përdorur, ose i gabuar): Supabase e tregon në "#error=..."
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const err = hash.get('error_code') || hash.get('error');
      if (err && !data.session) {
        setLinkError(err === 'otp_expired'
          ? 'Linku i kyçjes ka skaduar ose është përdorur njëherë. Kërko një link të ri.'
          : 'Kyçja nuk u krye. Kërko një link të ri dhe hape në të njëjtin shfletues ku luan.');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return; // prit sesionin, që lojtari i kyçur të mos kthehet për një çast te mysafiri
    syncAccountId(user);
    if (!user) return;
    let alive = true;
    const nick = (() => { try { return window.localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } })();
    supabase.rpc('ensure_profile', { p_nickname: nick }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setServerReady(false); return; }
      const p = data as Profile;
      setServerReady(true);
      setProfile(p);
      try { window.localStorage.setItem(NICK_KEY, p.nickname); } catch { /* s'ka rëndësi */ }
    });
    return () => { alive = false; };
  }, [user, ready]);

  const signIn = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setServerReady(null);
  }, []);

  const claimBonus = useCallback(async () => {
    const { data, error } = await supabase.rpc('claim_daily_bonus');
    if (!error && data) setProfile(data as Profile);
    return !error;
  }, []);

  const saveNickname = useCallback(async (nickname: string) => {
    if (!nickname.trim()) return;
    const { data, error } = await supabase.rpc('set_nickname', { p_nickname: nickname });
    if (!error && data) setProfile(data as Profile);
  }, []);

  const clearLinkError = useCallback(() => setLinkError(''), []);
  return { ready, user, profile, serverReady, signIn, signOut, claimBonus, saveNickname, linkError, clearLinkError };
}
