'use client';
import React, { useState } from 'react';
import { Check, Coins, ShoppingBag } from 'lucide-react';
import { buy, DICE, equip, feltBackground, TABLES, useShop, type DiceSkin, type TableSkin } from '@/lib/shop';
import { playSound } from '@/lib/sound';

function DicePreview({ skin }: { skin: DiceSkin }) {
  const pips: [number, number][] = [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]];
  return (
    <span className="block w-12 h-12 rounded-xl shadow-lg" style={{ background: skin.face, boxShadow: 'inset -3px -4px 8px rgba(0,0,0,0.2), 0 6px 14px rgba(0,0,0,0.35)' }}>
      <svg viewBox="0 0 100 100" className="w-full h-full">{pips.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="10" fill={i === 2 ? skin.one : skin.pip} />)}</svg>
    </span>
  );
}

function TablePreview({ skin }: { skin: TableSkin }) {
  return (
    <span className="block w-16 h-12 rounded-xl" style={{ background: feltBackground(skin), boxShadow: '0 0 0 3px #7c4520, inset 0 0 0 1px rgba(255,214,140,0.35), 0 6px 14px rgba(0,0,0,0.35)' }} />
  );
}

/** Dyqani me tokens. tokens = gjendja e tanishme; onChange merr tokens e reja pas blerjes. */
export default function Shop({ tokens, onChange }: { tokens: number; onChange: (tokens: number) => void }) {
  const shop = useShop();
  const [tab, setTab] = useState<'dice' | 'table'>('dice');
  const [note, setNote] = useState('');
  if (!shop.ready) return null;
  const items = tab === 'dice' ? DICE : TABLES;
  const active = tab === 'dice' ? shop.dice : shop.table;

  const onPick = (id: string, price: number) => {
    const owned = shop.owned.includes(`${tab}:${id}`);
    if (owned) { equip(tab, id); playSound('tileDrop'); setNote(''); return; }
    const left = buy(tab, id);
    if (left === null) { setNote(`Të duhen edhe ${price - tokens} tokens — kryej misionet e sotme!`); return; }
    onChange(left);
    playSound('win');
    setNote('');
  };

  return (
    <section className="gz-panel rounded-[28px] p-5 sm:p-6" data-testid="shop">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff8fd8] to-[#8b5cf6]"><ShoppingBag className="w-5 h-5" /></span>
          <div>
            <h2 className="font-display font-semibold text-xl sm:text-2xl">Dyqani</h2>
            <p className="text-sm text-mute">Shpenzo tokens për pamje të reja</p>
          </div>
        </div>
        <div className="flex gap-1.5 bg-black/25 p-1 rounded-full" role="tablist">
          {([['dice', '🎲 Zari i Ludos'], ['table', '🟩 Tavolina']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setNote(''); }}
              className={`px-3.5 py-1.5 rounded-full text-sm font-bold cursor-pointer transition ${tab === id ? 'bg-white/15 text-ink' : 'text-mute hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'table' && <p className="text-xs text-mute -mt-2 mb-3">Ngjyra vlen për tavolinën e Okey-t dhe të Pishpirikut.</p>}
      <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {items.map((it) => {
          const owned = shop.owned.includes(`${tab}:${it.id}`);
          const using = active === it.id;
          return (
            <li key={it.id}>
              <button type="button" onClick={() => onPick(it.id, it.price)} disabled={using} data-item={it.id}
                className={`w-full h-full flex flex-col items-center gap-2 p-3 rounded-2xl border transition cursor-pointer disabled:cursor-default
                  ${using ? 'bg-mint/10 border-mint/50' : 'bg-white/[0.04] border-white/10 hover:border-gold/60 hover:bg-white/[0.07]'}`}>
                {tab === 'dice' ? <DicePreview skin={it as DiceSkin} /> : <TablePreview skin={it as TableSkin} />}
                <span className="font-bold text-sm">{it.name}</span>
                {using ? (
                  <span className="flex items-center gap-1 text-xs font-extrabold text-mint"><Check className="w-3.5 h-3.5" /> Në përdorim</span>
                ) : owned ? (
                  <span className="text-xs font-extrabold text-ink bg-white/10 px-2.5 py-0.5 rounded-full">Përdor</span>
                ) : (
                  <span className={`flex items-center gap-1 text-xs font-extrabold px-2.5 py-0.5 rounded-full ${tokens >= it.price ? 'bg-gold text-night' : 'bg-white/10 text-mute'}`}>
                    <Coins className="w-3.5 h-3.5" /> {it.price.toLocaleString()}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {note && <p role="status" className="mt-3 text-sm font-bold text-coral">{note}</p>}
    </section>
  );
}
