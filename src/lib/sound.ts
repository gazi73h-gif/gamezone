// Tingujt e lojërave, të krijuar me Web Audio API (pa skedarë MP3, pa vonesë).
// Një AudioContext i vetëm; shfletuesit e lejojnë zërin vetëm pas prekjes së parë të faqes.

export type SoundName =
  | 'hop' | 'dice' | 'diceLand' | 'six' | 'enter' | 'home' | 'yes' | 'ouch' | 'knock' | 'firework' | 'victory' // Ludo
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
  if (m) endMusic(); else if (musicWanted && !musicOff) beginMusic();
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
    say('Yesss!', 1.2);
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

export function playSound(name: SoundName, n = 0) {
  if (muted) return;
  const c = audio();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { SOUNDS[name](c, c.currentTime + 0.005, n); } catch { /* s'ka rëndësi */ }
}

/* ── muzika e sfondit: melodi e gëzuar me marimbë, bas dhe shushurimë ── */
const MUSIC_KEY = 'gz_music_off';
let musicOff = false;
let musicWanted = false;
let musicBus: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextNote = 0;
let musicStep = 0;
const musicListeners = new Set<(off: boolean) => void>();
if (typeof window !== 'undefined') {
  try { musicOff = window.localStorage.getItem(MUSIC_KEY) === '1'; } catch { /* s'ka rëndësi */ }
}

const EIGHTH = 60 / 112 / 2;
// C – G – Am – F
const CHORDS: [number, number[]][] = [[48, [0, 4, 7]], [43, [0, 4, 7]], [45, [0, 3, 7]], [41, [0, 4, 7]]];
// dy fraza melodie (16 të teta secila), -1 = pushim
const MELODY = [
  [76, -1, 79, 76, 72, -1, 74, 76, 79, -1, 81, 79, 76, -1, -1, -1, 74, -1, 76, 74, 72, -1, 69, 72, 74, -1, 72, -1, -1, -1, -1, -1],
  [72, 74, 76, -1, 79, -1, 76, -1, 81, 79, 76, 79, -1, -1, -1, -1, 77, -1, 76, 74, 72, -1, 74, -1, 76, -1, 72, -1, -1, -1, -1, -1],
];

function scheduleMusic() {
  const c = ctx;
  if (!c || !musicBus) return;
  if (nextNote < c.currentTime - 0.1) nextNote = c.currentTime + 0.05; // skeda ishte në sfond
  while (nextNote < c.currentTime + 0.3) {
    const at = nextNote, st = musicStep;
    const bar = Math.floor(st / 8) % 4, beat = st % 8;
    const [root, chord] = CHORDS[bar];
    if (beat === 0) tone(c, at, midi(root), midi(root), 0.4, 0.2, 'triangle', musicBus);
    if (beat === 4) tone(c, at, midi(root + 7), midi(root + 7), 0.35, 0.16, 'triangle', musicBus);
    if (beat === 6) tone(c, at, midi(root + 12), midi(root + 12), 0.18, 0.12, 'triangle', musicBus);
    if (beat === 2 || beat === 6) chord.forEach((x) => mallet(c, at, midi(root + 24 + x), 0.25, 0.035, musicBus!));
    const phrase = MELODY[Math.floor(st / 64) % 2];
    const note = phrase[st % 32];
    if (note > 0) mallet(c, at, midi(note), 0.35, 0.075, musicBus);
    noise(c, at, 0.03, beat % 2 ? 0.025 : 0.012, 'bandpass', 7000, 7000, 1, musicBus);
    nextNote += EIGHTH;
    musicStep++;
  }
}

function beginMusic() {
  const c = audio();
  if (!c || !master || musicTimer) return;
  musicBus = c.createGain();
  musicBus.gain.setValueAtTime(0.0001, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(0.55, c.currentTime + 2);
  musicBus.connect(master);
  nextNote = c.currentTime + 0.1;
  musicStep = 0;
  musicTimer = setInterval(scheduleMusic, 100);
}

function endMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  const g = musicBus, c = ctx;
  musicBus = null;
  if (g && c) {
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(g.gain.value, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
    setTimeout(() => g.disconnect(), 700);
  }
}

/** Nis muzikën e sfondit (luhet vetëm kur zëri dhe muzika janë ndezur). */
export function startMusic() {
  musicWanted = true;
  if (!muted && !musicOff) beginMusic();
}
export function stopMusic() {
  musicWanted = false;
  endMusic();
}
export const isMusicOff = () => musicOff;
export function setMusicOff(off: boolean) {
  musicOff = off;
  try { window.localStorage.setItem(MUSIC_KEY, off ? '1' : '0'); } catch { /* s'ka rëndësi */ }
  if (off) endMusic(); else if (musicWanted && !muted) beginMusic();
  musicListeners.forEach((fn) => fn(off));
}
export function onMusicChange(fn: (off: boolean) => void) {
  musicListeners.add(fn);
  return () => { musicListeners.delete(fn); };
}
