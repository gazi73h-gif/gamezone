import { updateRoom } from './rooms';

// Gjendja në server ka ndryshuar ndërkohë (p.sh. dy veprime njëkohësisht): ky veprim refuzohet.
export class StaleStateError extends Error {
  constructor() {
    super('Gjendja e lojës ka ndryshuar ndërkohë.');
    this.name = 'StaleStateError';
  }
}

/**
 * Ruaj gjendjen vetëm nëse në server është ende versioni paraprak (rev - 1).
 * Kështu dy lojtarë s'mund ta mbishkruajnë njëri-tjetrin dhe asnjë veprim s'ndodh dy herë.
 */
export async function saveRoomState(code: string, next: { rev?: number }, player: string): Promise<void> {
  const saved = await updateRoom(player, code, { state: next, prevRev: (next.rev ?? 1) - 1 });
  if (!saved) throw new StaleStateError();
}
