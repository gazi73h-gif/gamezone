'use client';
import React, { useState } from 'react';
import { LogIn, LogOut, Mail, ShieldCheck, Trash2, X } from 'lucide-react';
import type { useAccount, OAuthProvider } from '@/lib/account';
import { UserAvatar } from '@/lib/avatars';

type Account = ReturnType<typeof useAccount>;

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" /></svg>
);
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
  </svg>
);

// Butoni "Kyçu" / llogaria në krye të faqes
export default function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!account.ready) return null;
  const showLinkError = !!account.linkError && !open;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Shkruaj një email të saktë.'); return; }
    setBusy(true); setError('');
    const err = await account.signIn(email);
    setBusy(false);
    if (err) setError(/rate|limit|seconds/i.test(err) ? 'Prit pak dhe provo përsëri (shumë kërkesa).' : 'Nuk u dërgua emaili. Provo përsëri.');
    else setSent(email.trim());
  };

  const social = async (p: OAuthProvider) => {
    setBusy(true); setError('');
    const err = await account.signInWith(p); // faqja kalon te Facebook/Google dhe kthehet e kyçur
    if (err) { setBusy(false); setError('Kyçja nuk u nis. Provo përsëri.'); }
  };

  const remove = async () => {
    setBusy(true);
    const err = await account.deleteAccount();
    setBusy(false);
    if (err) setError('Llogaria nuk u fshi. Provo përsëri pas pak.');
    else { setConfirmDelete(false); setOpen(false); }
  };

  const name = account.profile?.nickname || (account.user?.user_metadata?.full_name as string) || account.user?.email || '';
  const anySocial = account.providers.facebook || account.providers.google;

  return (
    <>
      {showLinkError && (
        <div role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,420px)] gz-panel rounded-2xl p-4 border-2 !border-coral/60">
          <p className="text-sm font-bold">{account.linkError}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => { account.clearLinkError(); setSent(''); setOpen(true); }} className="gz-btn flex-1 py-2 rounded-xl font-display font-semibold cursor-pointer">Kërko link të ri</button>
            <button onClick={account.clearLinkError} className="px-4 py-2 rounded-xl bg-white/10 font-bold cursor-pointer">Mbyll</button>
          </div>
        </div>
      )}
      {account.user ? (
        <button onClick={() => setOpen(true)} aria-label="Llogaria ime"
          className="flex items-center gap-1.5 bg-night-2/80 border border-white/15 hover:border-white/30 pl-1 pr-3 py-1 rounded-full cursor-pointer transition">
          <UserAvatar src={account.avatar} name={name} className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8b7cf6] to-[#ff5db1] font-display font-bold text-xs" />
          <ShieldCheck className="w-4 h-4 text-mint" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold text-sm font-extrabold px-3 py-2 rounded-full cursor-pointer transition whitespace-nowrap">
          <LogIn className="w-4 h-4" /> Kyçu
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={() => { setOpen(false); setConfirmDelete(false); }}>
          <div className="gz-panel rounded-[28px] p-6 w-full max-w-sm relative" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Llogaria">
            <button onClick={() => { setOpen(false); setConfirmDelete(false); }} aria-label="Mbyll" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>

            {account.user ? (
              <>
                <div className="flex items-center gap-3">
                  <UserAvatar src={account.avatar} name={name} className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8b7cf6] to-[#ff5db1] font-display font-bold text-xl" />
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-2xl truncate">{account.profile?.nickname || 'Llogaria ime'}</h2>
                    <p className="text-sm text-mute break-all">{account.user.email}</p>
                  </div>
                </div>
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
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)} className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-bold text-mute hover:text-coral cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> Fshi llogarinë
                  </button>
                ) : (
                  <div className="mt-4 rounded-2xl border border-coral/50 bg-coral/10 p-3">
                    <p className="text-sm font-bold">Ta fshij llogarinë? Humbasin tokens dhe nofka; kjo s’kthehet më.</p>
                    {error && <p role="alert" className="mt-2 text-sm font-bold text-coral">{error}</p>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={remove} disabled={busy} className="flex-1 py-2 rounded-xl bg-coral text-white font-bold cursor-pointer disabled:opacity-50">{busy ? 'Duke fshirë…' : 'Po, fshije'}</button>
                      <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-xl bg-white/10 font-bold cursor-pointer">Jo</button>
                    </div>
                  </div>
                )}
              </>
            ) : sent ? (
              <>
                <Mail className="w-10 h-10 text-gold" />
                <h2 className="font-display font-bold text-2xl mt-2">Kontrollo emailin</h2>
                <p className="text-sm text-mute mt-2">
                  Të dërguam një link te <strong className="text-ink break-all">{sent}</strong>. Hape nga ky telefon ose kompjuter dhe do të kyçesh menjëherë.
                </p>
                <p className="text-xs text-mute mt-3 bg-white/5 rounded-xl p-3">
                  📱 Në telefon: nëse linku hapet brenda aplikacionit të emailit, zgjidh <strong className="text-ink">⋮ → Hape në Chrome/Safari</strong>, që të kyçesh në shfletuesin ku luan.
                </p>
                <button onClick={() => { setSent(''); setEmail(''); }} className="mt-5 text-sm font-bold text-mute underline cursor-pointer">Përdor një email tjetër</button>
              </>
            ) : (
              <div>
                <h2 className="font-display font-bold text-2xl">Kyçu në GameZone</h2>
                <ul className="text-sm text-mute mt-2 space-y-1">
                  <li>✓ Tokens dhe bonusi ditor ruhen në server</li>
                  <li>✓ E njëjta nofkë në telefon dhe kompjuter</li>
                  {anySocial && <li>✓ Me foton tënde të profilit</li>}
                </ul>

                {anySocial && (
                  <div className="mt-5 flex flex-col gap-2">
                    {account.providers.facebook && (
                      <button onClick={() => social('facebook')} disabled={busy}
                        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl bg-[#1877F2] hover:brightness-110 text-white font-bold cursor-pointer disabled:opacity-60">
                        <FacebookIcon /> Vazhdo me Facebook
                      </button>
                    )}
                    {account.providers.google && (
                      <button onClick={() => social('google')} disabled={busy}
                        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl bg-white hover:bg-white/90 text-[#1f1f1f] font-bold cursor-pointer disabled:opacity-60">
                        <GoogleIcon /> Vazhdo me Google
                      </button>
                    )}
                    <div className="flex items-center gap-3 my-2 text-xs font-bold uppercase tracking-widest text-mute/70">
                      <span className="h-px flex-1 bg-white/10" /> ose me email <span className="h-px flex-1 bg-white/10" />
                    </div>
                  </div>
                )}

                <form onSubmit={send}>
                  <label htmlFor="acc-email" className={`block text-sm font-bold mb-2 ${anySocial ? '' : 'mt-5'}`}>Emaili yt</label>
                  <input id="acc-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="emri@shembull.com" className="gz-input w-full rounded-2xl px-4 py-3 text-ink placeholder:text-mute/60 font-semibold" />
                  {error && <p role="alert" className="mt-2 text-sm font-bold text-coral">{error}</p>}
                  <button type="submit" disabled={busy} className="gz-btn mt-4 w-full flex items-center justify-center gap-2 font-display font-semibold text-lg py-3 rounded-2xl cursor-pointer">
                    <Mail className="w-5 h-5" /> {busy ? 'Duke dërguar…' : 'Më dërgo linkun'}
                  </button>
                </form>
                <p className="text-xs text-mute mt-3 text-center">
                  Mund të luash edhe pa llogari. <a href="/privatesia" className="underline">Privatësia</a>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
