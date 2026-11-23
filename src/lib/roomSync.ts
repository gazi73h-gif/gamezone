import { supabase } from './supabase';

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
export async function saveRoomState(code: string, next: { rev?: number }): Promise<void> {
  const prev = (next.rev ?? 1) - 1;
  let q = supabase.from('rooms').update({ game_state: next }).eq('code', code);
  q = prev === 0
    ? q.or('game_state->>rev.is.null,game_state->>rev.eq.0')
    : q.eq('game_state->>rev', String(prev));
  const { data, error } = await q.select('code');
  if (error) throw error;
  if (!data || data.length === 0) throw new StaleStateError();
}
