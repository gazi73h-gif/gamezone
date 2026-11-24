// Tingujt e lojërave, të krijuar me Web Audio API (pa skedarë MP3, pa vonesë).
// Një AudioContext i vetëm; shfletuesit e lejojnë zërin vetëm pas prekjes së parë të faqes.

export type SoundName =
  | 'hop' | 'dice' // Ludo
  | 'tileDraw' | 'tileDrop' | 'tileMove' // Okey
  | 'cardDraw' | 'cardPlay' // Pishpirik, UNO
  | 'move' | 'capture' | 'check' // Shah
  | 'turn' | 'win';

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

function tone(c: AudioContext, at: number, freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(c: AudioContext, at: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1) {
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
  src.connect(bq).connect(g).connect(master!);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

/* ── tingujt ── */

const SOUNDS: Record<SoundName, (c: AudioContext, t: number) => void> = {
  // trokitje e butë druri për çdo hap të figurës
  hop: (c, t) => {
    tone(c, t, 210 + Math.random() * 40, 120, 0.07, 0.35, 'triangle');
    noise(c, t, 0.03, 0.18, 'bandpass', 1800, 1800, 3);
  },
  // zari që rrokulliset
  dice: (c, t) => {
    for (let i = 0; i < 5; i++) {
      const at = t + i * 0.045 + Math.random() * 0.02;
      noise(c, at, 0.025, 0.25 - i * 0.03, 'bandpass', 2400 + Math.random() * 1200, 2400, 4);
      tone(c, at, 900 + Math.random() * 400, 600, 0.03, 0.08, 'square');
    }
  },
  // guri rrëshqet nga stiva
  tileDraw: (c, t) => {
    noise(c, t, 0.13, 0.22, 'bandpass', 900, 2600, 1.4);
    tone(c, t + 0.1, 1500, 1100, 0.03, 0.05);
  },
  // goditje e fortë qeramike/druri kur hidhet guri
  tileDrop: (c, t) => {
    noise(c, t, 0.035, 0.45, 'highpass', 2500);
    tone(c, t, 1850, 1600, 0.06, 0.18);
    tone(c, t, 2650, 2300, 0.045, 0.1);
    tone(c, t, 160, 90, 0.08, 0.3, 'triangle');
  },
  // zhvendosje e lehtë në raft
  tileMove: (c, t) => {
    noise(c, t, 0.025, 0.18, 'highpass', 3200);
    tone(c, t, 2100, 1900, 0.03, 0.06);
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
  turn: (c, t) => {
    tone(c, t, 660, 660, 0.12, 0.12);
    tone(c, t + 0.09, 880, 880, 0.16, 0.12);
  },
  win: (c, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t + i * 0.12, f, f, i === 3 ? 0.5 : 0.22, 0.25, 'triangle'));
  },
};

export function playSound(name: SoundName) {
  if (muted) return;
  const c = audio();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { SOUNDS[name](c, c.currentTime + 0.005); } catch { /* s'ka rëndësi */ }
}
