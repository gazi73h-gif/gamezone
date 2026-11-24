'use client';
import React, { useState } from 'react';
import { LogIn, LogOut, Mail, ShieldCheck, X } from 'lucide-react';
import type { useAccount } from '@/lib/account';

type Account = ReturnType<typeof useAccount>;

// Butoni "Kyçu" / llogaria në krye të faqes
export default function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!account.ready) return null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Shkruaj një email të saktë.'); return; }
    setBusy(true); setError('');
    const err = await account.signIn(email);
    setBusy(false);
    if (err) setError(/rate|limit|seconds/i.test(err) ? 'Prit pak dhe provo përsëri (shumë kërkesa).' : 'Nuk u dërgua emaili. Provo përsëri.');
    else setSent(email.trim());
  };

  const name = account.profile?.nickname || account.user?.email || '';

  return (
    <>
      {account.user ? (
        <button onClick={() => setOpen(true)} aria-label="Llogaria ime"
          className="flex items-center gap-1.5 bg-night-2/80 border border-white/15 hover:border-white/30 pl-1 pr-3 py-1 rounded-full cursor-pointer transition">
          <span className="grid place-items-center w-7 h-7 rounded-full bg-gradient-to-br from-[#8b7cf6] to-[#ff5db1] font-display font-bold text-xs">
            {name.slice(0, 2).toUpperCase()}
          </span>
          <ShieldCheck className="w-4 h-4 text-mint" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-extrabold px-3.5 py-2 rounded-full cursor-pointer transition">
          <LogIn className="w-4 h-4" /> Kyçu
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="gz-panel rounded-[28px] p-6 w-full max-w-sm relative" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Llogaria">
            <button onClick={() => setOpen(false)} aria-label="Mbyll" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>

            {account.user ? (
              <>
                <h2 className="font-display font-bold text-2xl">Llogaria ime</h2>
                <p className="text-sm text-mute mt-1 break-all">{account.user.email}</p>
                {account.serverReady === false ? (
                  <p className="mt-4 text-sm font-semibold text-gold bg-gold/10 border border-gold/30 rounded-2xl p-3">
                    Je i kyçur, por tokens ruhen ende vetëm në këtë pajisje derisa të përditësohet databaza.
                  </p>
                ) : (
                  <p className="mt-4 text-sm font-semibold text-mint bg-mint/10 border border-mint/30 rounded-2xl p-3">
                    ✓ Tokens dhe nofka jote ruhen në server — i gjen në çdo pajisje.
                  </p>
                )}
                <button onClick={async () => { await account.signOut(); setOpen(false); }}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 hover:bg-white/15 font-bold cursor-pointer">
                  <LogOut className="w-4 h-4" /> Dil nga llogaria
                </button>
              </>
            ) : sent ? (
              <>
                <Mail className="w-10 h-10 text-gold" />
                <h2 className="font-display font-bold text-2xl mt-2">Kontrollo emailin</h2>
                <p className="text-sm text-mute mt-2">
                  Të dërguam një link te <strong className="text-ink break-all">{sent}</strong>. Hape nga ky telefon ose kompjuter dhe do të kyçesh menjëherë.
                </p>
                <button onClick={() => { setSent(''); setEmail(''); }} className="mt-5 text-sm font-bold text-mute underline cursor-pointer">Përdor një email tjetër</button>
              </>
            ) : (
              <form onSubmit={send}>
                <h2 className="font-display font-bold text-2xl">Kyçu në GameZone</h2>
                <ul className="text-sm text-mute mt-2 space-y-1">
                  <li>✓ Tokens dhe bonusi ditor ruhen në server</li>
                  <li>✓ E njëjta nofkë në telefon dhe kompjuter</li>
                  <li>✓ Pa fjalëkalim — vetëm një link në email</li>
                </ul>
                <label htmlFor="acc-email" className="block text-sm font-bold mt-5 mb-2">Emaili yt</label>
                <input id="acc-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="emri@shembull.com" className="gz-input w-full rounded-2xl px-4 py-3 text-ink placeholder:text-mute/60 font-semibold" />
                {error && <p role="alert" className="mt-2 text-sm font-bold text-coral">{error}</p>}
                <button type="submit" disabled={busy} className="gz-btn mt-4 w-full flex items-center justify-center gap-2 font-display font-semibold text-lg py-3 rounded-2xl cursor-pointer">
                  <Mail className="w-5 h-5" /> {busy ? 'Duke dërguar…' : 'Më dërgo linkun'}
                </button>
                <p className="text-xs text-mute mt-3 text-center">Mund të vazhdosh të luash edhe pa llogari.</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
