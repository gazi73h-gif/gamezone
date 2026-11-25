// Tingujt e lojërave, të krijuar me Web Audio API (pa skedarë MP3, pa vonesë).
// Një AudioContext i vetëm; shfletuesit e lejojnë zërin vetëm pas prekjes së parë të faqes.

export type SoundName =
  | 'hop' | 'dice' | 'diceLand' | 'six' | 'enter' | 'home' | 'yes' | 'ouch' | 'knock' | 'firework' | 'victory' // Ludo
  | 'tileDraw' | 'tileDrop' | 'tileMove' // Okey
  | 'cardDraw' | 'cardPlay' // Pishpirik, UNO
  | 'move' | 'capture' | 'check' // Shah
  | 'turn' | 'win' | 'chat';

const MUTE_KEY = 'gz_muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
const listeners = new Set<(m: boolean) => void>();

if (typeof window !== 'undefined') {
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch { /* s'ka rëndësi */ }
  // zgjo audion me prekjen e parë (rregull i shfletuesve në telefon)
  const unlock = () => { audio()?.resume().catch(() => {}); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export const isMuted = () => muted;

export function setMuted(m: boolean) {
  muted = m;
  try { window.localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* s'ka rëndësi */ }
  listeners.forEach((fn) => fn(m));
}

export function onMuteChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/* ── blloqet ndërtuese ── */

function tone(c: AudioContext, at: number, freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType = 'sine', out: AudioNode = master!) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(c: AudioContext, at: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1, out: AudioNode = master!) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const bq = c.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bq).connect(g).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// tingull marimbe: i ngrohtë, me goditje të butë
function mallet(c: AudioContext, at: number, freq: number, dur: number, vol: number, out: AudioNode = master!) {
  tone(c, at, freq, freq, dur, vol, 'sine', out);
  tone(c, at, freq * 4, freq * 4, dur * 0.25, vol * 0.12, 'sine', out);
  tone(c, at, freq * 2, freq * 2, dur * 0.5, vol * 0.18, 'triangle', out);
}
// shkallë pentatonike: çdo hap i figurës ngjitet një notë më lart
const STEPS = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86];

/* zë "vokal" pa fjalë: valë sharrë përmes dy filtrave të zanores "u" (si një brohoritje) */
function whoop(c: AudioContext, at: number, pts: [number, number][], vol: number) {
  const dur = pts[pts.length - 1][0];
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(pts[0][1], at);
  pts.slice(1).forEach(([tt, f]) => o.frequency.exponentialRampToValueAtTime(f, at + tt));
  // dridhje e lehtë si te zëri i njeriut
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 6.5;
  depth.gain.value = 9;
  lfo.connect(depth).connect(o.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.05);
  g.gain.setValueAtTime(vol, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  for (const [f, q, v] of [[380, 4, 1], [950, 7, 0.45], [2400, 9, 0.12]] as const) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const fg = c.createGain();
    fg.gain.value = v;
    o.connect(bp).connect(fg).connect(g);
  }
  g.connect(master!);
  o.start(at); lfo.start(at);
  o.stop(at + dur + 0.05); lfo.stop(at + dur + 0.05);
}

/* ── tingujt ── */

const SOUNDS: Record<SoundName, (c: AudioContext, t: number, n?: number) => void> = {
  // çdo hap: notë marimbe që ngjitet (do-re-mi...), me një "pup" të lehtë
  hop: (c, t, n = 0) => {
    mallet(c, t, midi(STEPS[n % STEPS.length]), 0.28, 0.2);
    tone(c, t, 300, 160, 0.06, 0.08, 'triangle');
  },
  // zari rrokulliset: trokitje të buta
  dice: (c, t) => {
    for (let i = 0; i < 5; i++) {
      const at = t + i * 0.06 + Math.random() * 0.025;
      noise(c, at, 0.035, 0.13 - i * 0.015, 'lowpass', 1600 + Math.random() * 500, 700, 0.8);
      tone(c, at, 640 + Math.random() * 300, 430, 0.04, 0.07);
    }
  },
  // zari ndalet
  diceLand: (c, t) => {
    tone(c, t, 520, 300, 0.08, 0.2);
    mallet(c, t + 0.08, midi(79), 0.4, 0.12);
    mallet(c, t + 0.08, midi(84), 0.4, 0.07);
  },
  // gjashtëshe! xhingël e gëzuar
  six: (c, t) => {
    tone(c, t, 520, 300, 0.08, 0.2);
    [72, 76, 79, 84].forEach((n, i) => mallet(c, t + 0.07 + i * 0.07, midi(n), 0.3, 0.15));
    [88, 91].forEach((n, i) => tone(c, t + 0.4 + i * 0.05, midi(n), midi(n), 0.4, 0.05));
  },
  // figura del nga baza: "fiuu-pop"
  enter: (c, t) => {
    tone(c, t, 300, 1200, 0.18, 0.09);
    noise(c, t, 0.18, 0.06, 'bandpass', 800, 3000, 1.2);
    mallet(c, t + 0.17, midi(79), 0.3, 0.18);
  },
  // figura arrin në shtëpi: shkëndija
  home: (c, t) => {
    [76, 79, 84, 88, 91].forEach((n, i) => mallet(c, t + i * 0.06, midi(n), 0.45, 0.13));
    tone(c, t + 0.3, midi(96), midi(96), 0.5, 0.04);
  },
  // "Juuu-huuu!" — brohoritje e gëzuar për atë që rrëzon figurën
  yes: (c, t) => {
    whoop(c, t, [[0, 280], [0.18, 420], [0.45, 470]], 0.5); // juuu
    noise(c, t + 0.5, 0.07, 0.05, 'bandpass', 1800, 1200, 1); // h
    whoop(c, t + 0.52, [[0, 430], [0.2, 700], [0.55, 760], [0.85, 640]], 0.55); // huuuu
    // konfeti dhe duartrokitje
    [0.55, 0.7, 0.85, 1.0, 1.15].forEach((d) => noise(c, t + d + Math.random() * 0.04, 0.05, 0.12, 'bandpass', 1400 + Math.random() * 600, 1200, 1.5));
    [784, 1046.5, 1318.5].forEach((f, i) => tone(c, t + 0.6 + i * 0.07, f, f, 0.35, 0.05, 'triangle'));
  },
  // figura jote u rrëzua: "ua-ua-uaaa" që zbret
  ouch: (c, t) => {
    tone(c, t, 392, 370, 0.22, 0.18, 'triangle');
    tone(c, t + 0.25, 370, 349, 0.22, 0.18, 'triangle');
    tone(c, t + 0.5, 349, 233, 0.6, 0.2, 'triangle');
  },
  // të tjerët dëgjojnë një "bonk"
  knock: (c, t) => {
    tone(c, t, 300, 90, 0.18, 0.3, 'triangle');
    tone(c, t + 0.05, 900, 500, 0.08, 0.06);
  },
  // fishekzjarr: fishkëllimë, shpërthim, kërcitje
  firework: (c, t) => {
    const d = 0.55 + Math.random() * 0.3;
    tone(c, t, 700 + Math.random() * 300, 2200, d, 0.03);
    tone(c, t + d, 110, 40, 0.7, 0.3, 'triangle');
    noise(c, t + d, 0.9, 0.22, 'lowpass', 1400, 120, 0.7);
    for (let i = 0; i < 14; i++) noise(c, t + d + 0.15 + Math.random() * 0.8, 0.015, 0.05, 'bandpass', 3000 + Math.random() * 3000, 3000, 2);
  },
  // fanfara e fitores
  victory: (c, t) => {
    const seq: [number, number, number][] = [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.3], [76, 0.78, 0.14], [79, 0.93, 0.8]];
    seq.forEach(([n, at, d]) => {
      tone(c, t + at, midi(n), midi(n), d + 0.1, 0.16, 'triangle');
      tone(c, t + at, midi(n) * 2, midi(n) * 2, d, 0.04, 'sine');
    });
    [60, 64, 67, 72].forEach((n) => tone(c, t + 0.93, midi(n), midi(n), 1.1, 0.07, 'triangle'));
  },
  // guri rrëshqet butë nga stiva
  tileDraw: (c, t) => {
    noise(c, t, 0.16, 0.1, 'bandpass', 500, 1500, 0.8);
    tone(c, t + 0.12, 784, 659, 0.08, 0.07);
  },
  // "tok" i ngrohtë druri kur hidhet guri
  tileDrop: (c, t) => {
    tone(c, t, 400, 210, 0.12, 0.3);
    tone(c, t, 800, 560, 0.05, 0.06, 'triangle');
    noise(c, t, 0.04, 0.1, 'lowpass', 900, 400, 0.7);
  },
  // zhvendosje e lehtë në raft
  tileMove: (c, t) => {
    noise(c, t, 0.025, 0.07, 'lowpass', 1800, 900, 0.7);
    tone(c, t, 1100, 850, 0.035, 0.05);
  },
  // letra rrëshqet nga pakoja
  cardDraw: (c, t) => {
    noise(c, t, 0.16, 0.3, 'highpass', 1200, 5200, 0.8);
  },
  // letra përplaset në tavolinë
  cardPlay: (c, t) => {
    noise(c, t, 0.06, 0.5, 'lowpass', 4200, 900, 0.7);
    tone(c, t, 140, 70, 0.07, 0.25, 'triangle');
  },
  move: (c, t) => {
    tone(c, t, 190, 70, 0.09, 0.4, 'triangle');
    noise(c, t, 0.03, 0.15, 'bandpass', 1600, 1600, 2);
  },
  capture: (c, t) => {
    tone(c, t, 160, 50, 0.14, 0.45, 'triangle');
    noise(c, t, 0.06, 0.3, 'bandpass', 1200, 600, 2);
  },
  check: (c, t) => {
    tone(c, t, 740, 740, 0.25, 0.22);
    tone(c, t + 0.12, 988, 988, 0.3, 0.25);
  },
  // mesazh i ri në chat: "plop" i butë
  chat: (c, t) => {
    tone(c, t, 560, 880, 0.07, 0.1);
    tone(c, t + 0.06, 880, 1180, 0.08, 0.07);
  },
  turn: (c, t) => {
    tone(c, t, 660, 660, 0.12, 0.12);
    tone(c, t + 0.09, 880, 880, 0.16, 0.12);
  },
  win: (c, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t + i * 0.12, f, f, i === 3 ? 0.5 : 0.22, 0.25, 'triangle'));
  },
};

export function playSound(name: SoundName, n = 0) {
  if (muted) return;
  const c = audio();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { SOUNDS[name](c, c.currentTime + 0.005, n); } catch { /* s'ka rëndësi */ }
}
