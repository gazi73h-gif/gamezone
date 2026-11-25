// Tingujt e lojërave, të krijuar me Web Audio API (pa skedarë MP3, pa vonesë).
// Një AudioContext i vetëm; shfletuesit e lejojnë zërin vetëm pas prekjes së parë të faqes.

export type SoundName =
  | 'hop' | 'dice' | 'diceLand' | 'yes' | 'ouch' | 'knock' // Ludo
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

/* zë i shkurtër (p.sh. "Yesss!") me zërin e shfletuesit */
function say(text: string, pitch: number) {
  try {
    const sp = window.speechSynthesis;
    if (!sp || typeof SpeechSynthesisUtterance === 'undefined') return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    u.pitch = pitch;
    u.volume = 0.9;
    sp.cancel();
    sp.speak(u);
  } catch { /* s'ka rëndësi */ }
}

/* ── tingujt ── */

const SOUNDS: Record<SoundName, (c: AudioContext, t: number) => void> = {
  // "pup" i butë druri për çdo hap të figurës
  hop: (c, t) => {
    const f = 480 + Math.random() * 60;
    tone(c, t, f, f * 0.55, 0.1, 0.22);
    tone(c, t, f * 0.5, f * 0.35, 0.08, 0.12, 'triangle');
    noise(c, t, 0.025, 0.06, 'lowpass', 1200, 600, 0.7);
  },
  // zari që rrokulliset në gotë druri: trokitje të buta, pa zhurmë të ashpër
  dice: (c, t) => {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.07 + Math.random() * 0.03;
      noise(c, at, 0.035, 0.14 - i * 0.02, 'lowpass', 1500 + Math.random() * 400, 700, 0.8);
      tone(c, at, 620 + Math.random() * 260, 420, 0.04, 0.07);
    }
  },
  // zari ndalet: dy trokitje dhe një "ding" i lehtë
  diceLand: (c, t) => {
    tone(c, t, 520, 300, 0.08, 0.2);
    tone(c, t + 0.09, 460, 280, 0.07, 0.12);
    tone(c, t + 0.16, 1046.5, 1046.5, 0.35, 0.08);
    tone(c, t + 0.16, 1568, 1568, 0.3, 0.04);
  },
  // "Yesss!" — fanfarë e gëzuar për atë që rrëzon figurën
  yes: (c, t) => {
    [392, 523.25, 659.25].forEach((f, i) => tone(c, t + i * 0.08, f, f, 0.16, 0.2, 'triangle'));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(c, t + 0.26, f, f * 1.01, 0.6, 0.11, 'triangle'));
    tone(c, t + 0.26, 1568, 2093, 0.25, 0.05);
    say('Yesss!', 1.25);
  },
  // figura jote u rrëzua: "ua-ua-uaaa" që zbret
  ouch: (c, t) => {
    tone(c, t, 392, 370, 0.22, 0.18, 'triangle');
    tone(c, t + 0.25, 370, 349, 0.22, 0.18, 'triangle');
    tone(c, t + 0.5, 349, 233, 0.6, 0.2, 'triangle');
    say('Oh no!', 0.8);
  },
  // të tjerët dëgjojnë një "bonk"
  knock: (c, t) => {
    tone(c, t, 300, 90, 0.18, 0.3, 'triangle');
    tone(c, t + 0.05, 900, 500, 0.08, 0.06);
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
