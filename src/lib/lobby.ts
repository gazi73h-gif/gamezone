// Lista e dhomave të hapura në kohë reale (Supabase Presence).
// Krijuesi i dhomës e "shpall" dhomën sa kohë është online dhe ka vend të lirë;
// kur mbyll faqen, dhoma zhduket vetë nga lista. Nuk ruhet asgjë në databazë.

// Emri mund të ndryshohet vetëm për teste, që dhomat e provës të mos u dalin lojtarëve
export const LOBBY_CHANNEL = process.env.NEXT_PUBLIC_LOBBY_CHANNEL || 'gamezone_lobby';

export const BOT_IDS = ['BOT_YAMB', 'BOT_PISH', 'BOT_AI', 'BOT_UNO', 'BOT_LUDO', 'BOT_RUMMY'];

export const MAX_SEATS: Record<string, number> = {
  yamb: 4, pishpirik: 4, shah: 2, uno: 6, ludo: 4, rummy: 4,
};

export type LobbyStatus = 'waiting' | 'bot' | 'seats';

export interface LobbyRoom {
  code: string;
  game_type: string;
  hostName: string;
  hostAvatar?: string | null;
  playerCount: number;
  status: LobbyStatus; // në pritje / duke luajtur me bot / lojë me vende të lira
}

export function hasBot(gameState: unknown): boolean {
  if (!gameState) return false;
  const text = JSON.stringify(gameState);
  return BOT_IDS.some((id) => text.includes(id));
}

// Mund të hyjë dikush tjetër? Në pritje, ose kur ka vend të lirë / vend me bot.
// Ludo dhe Rummy: lojtari zë vendin pa e rifilluar lojën. Lojërat e tjera rifillojnë me lojtarin e ri.
export function isJoinable(status: string, gameState: unknown, gameType: string, realPlayers: number): boolean {
  if (realPlayers >= (MAX_SEATS[gameType] ?? 4)) return false;
  if (status === 'waiting') return true;
  if (status !== 'playing') return false;
  if (gameType === 'ludo') return true;
  return hasBot(gameState);
}

export function lobbyRoomsFrom(state: Record<string, unknown[]>): LobbyRoom[] {
  const byCode = new Map<string, LobbyRoom>();
  Object.values(state).flat().forEach((meta) => {
    const m = meta as Partial<LobbyRoom>;
    if (m.code && m.game_type) {
      byCode.set(m.code, {
        code: m.code,
        game_type: m.game_type,
        hostName: m.hostName || 'Lojtar',
        hostAvatar: m.hostAvatar || null,
        playerCount: m.playerCount || 1,
        status: m.status === 'bot' || m.status === 'seats' ? m.status : 'waiting',
      });
    }
  });
  return [...byCode.values()];
}
