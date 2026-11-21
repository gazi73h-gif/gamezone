export interface StrokePoint {
  x: number;
  y: number;
}

export interface DrawStroke {
  points: Array<StrokePoint>;
  color: string;
  size: number;
}

export interface ChatGuess {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  isCorrect: boolean;
}

export interface VizatoPlayer {
  id: string;
  nickname: string;
  score: number;
  hasGuessed: boolean;
}

export interface VizatoGameState {
  players: Record<string, VizatoPlayer>;
  playerOrder: Array<string>;
  drawerIndex: number;
  currentDrawerId: string;
  secretWord: string;
  round: number;
  maxRounds: number;
  strokes: Array<DrawStroke>;
  messages: Array<ChatGuess>;
  status: 'playing' | 'finished';
}

const ALBANIAN_WORDS: Array<string> = Array.of(
  'Shtëpi', 'Makinë', 'Dielli', 'Hëna', 'Peshk', 'Mace', 'Qen', 'Shqiponja',
  'Lule', 'Pemë', 'Mollë', 'Banane', 'Picë', 'Kafe', 'Libër', 'Telefon',
  'Kompjuter', 'Aeroplan', 'Anije', 'Tren', 'Biçikletë', 'Top', 'Fushë',
  'Mal', 'Det', 'Lumë', 'Urë', 'Kështjellë', 'Flamuri', 'Kitara', 'Piano',
  'Syze', 'Kapele', 'Këpucë', 'Orë', 'Çelës', 'Yll', 'Re', 'Shi', 'Borë',
  'Flutur', 'Bletë', 'Kalë', 'Luan', 'Elefant', 'Gjarpër', 'Zog', 'Akullore'
);

export function pickRandomWord(exclude?: string): string {
  const pool = ALBANIAN_WORDS.filter((w) => w.toLowerCase() !== exclude?.toLowerCase());
  const idx = Math.floor(Math.random() * pool.length);
  return pool.at(idx) || 'Dielli';
}
export function initVizatoGame(
  playerList: Array<{ id: string; nickname: string }>
): VizatoGameState {
  const players: Record<string, VizatoPlayer> = {};
  const playerOrder = playerList.map((p) => p.id);

  for (const p of playerList) {
    players[p.id] = {
      id: p.id,
      nickname: p.nickname,
      score: 0,
      hasGuessed: false,
    };
  }

  return {
    players,
    playerOrder,
    drawerIndex: 0,
    currentDrawerId: playerOrder.at(0) || '',
    secretWord: pickRandomWord(),
    round: 1,
    maxRounds: Math.max(2, playerOrder.length * 2),
    strokes: Array.of(),
    messages: Array.of({
      id: 'sys_start',
      playerId: 'system',
      nickname: 'Sistemi',
      text: 'Loja filloi! Qëlloni fjalën që po vizatohet!',
      isCorrect: false,
    }),
    status: 'playing',
  };
}

export function submitVizatoGuess(
  state: VizatoGameState,
  playerId: string,
  guessText: string
): VizatoGameState {
  if (state.status !== 'playing' || !guessText.trim()) return state;
  const next: VizatoGameState = JSON.parse(JSON.stringify(state));
  const player = next.players[playerId];
  if (!player) return state;

  const cleanGuess = guessText.trim();
  const isDrawer = playerId === next.currentDrawerId;
  const isMatch =
    !isDrawer &&
    !player.hasGuessed &&
    cleanGuess.toLowerCase() === next.secretWord.toLowerCase();

  if (isMatch) {
    player.hasGuessed = true;
    player.score += 100;
    const drawer = next.players[next.currentDrawerId];
    if (drawer) drawer.score += 50;

    next.messages.push({
      id: `msg_${Date.now()}_${Math.random()}`,
      playerId,
      nickname: player.nickname,
      text: `🎉 ${player.nickname} e gjeti fjalën! (+100 pikë)`,
      isCorrect: true,
    });

    // Kontrollo nëse të gjithë (përveç vizatuesit) e kanë gjetur fjalën
    const nonDrawers = next.playerOrder.filter((id) => id !== next.currentDrawerId);
    const everyoneGuessed = nonDrawers.length > 0 && nonDrawers.every((id) => next.players[id].hasGuessed);

    if (everyoneGuessed) {
      return advanceVizatoTurn(next);
    }
  } else if (!isDrawer) {
    next.messages.push({
      id: `msg_${Date.now()}_${Math.random()}`,
      playerId,
      nickname: player.nickname,
      text: cleanGuess,
      isCorrect: false,
    });
  }

  return next;
}

export function advanceVizatoTurn(state: VizatoGameState): VizatoGameState {
  const next: VizatoGameState = JSON.parse(JSON.stringify(state));

  if (next.round >= next.maxRounds) {
    next.status = 'finished';
    next.messages.push({
      id: `sys_end_${Date.now()}`,
      playerId: 'system',
      nickname: 'Sistemi',
      text: `Loja përfundoi! Fjala e fundit ishte: ${next.secretWord}`,
      isCorrect: true,
    });
    return next;
  }

  const oldWord = next.secretWord;
  next.round += 1;
  next.drawerIndex = (next.drawerIndex + 1) % next.playerOrder.length;
  next.currentDrawerId = next.playerOrder.at(next.drawerIndex)!;
  next.secretWord = pickRandomWord(oldWord);
  next.strokes = Array.of();

  for (const id of next.playerOrder) {
    next.players[id].hasGuessed = false;
  }

  const nextDrawerName = next.players[next.currentDrawerId]?.nickname || 'Lojtari';
  next.messages.push({
    id: `sys_turn_${Date.now()}`,
    playerId: 'system',
    nickname: 'Sistemi',
    text: `Fjala ishte "${oldWord}". Tani vizaton: ${nextDrawerName}!`,
    isCorrect: false,
  });

  return next;
}
