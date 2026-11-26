import { trackWin } from './daily';
import { playerSecret } from './playerKey';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
/**
 * Regjistron fitoren te kampionët. Serveri (record_win) e lexon fituesin nga gjendja e lojës,
 * cakton pikët vetë dhe e numëron çdo lojë vetëm një herë. Rruga e vjetër mbetet vetëm
 * derisa të ekzekutohet migrimi 20261129_secure_wins.sql.
 */
export async function recordWin(nickname: string, points: number, gameName: string, mine = true) {
  if (mine) trackWin(); // misioni "Fito 1 lojë"
  if (typeof window !== 'undefined') {
    const code = window.location.pathname.match(/\/room\/(\d{4})/)?.[1];
    const player = window.localStorage.getItem('gamezone_player_id');
    if (code && player) {
      const { error } = await supabase.rpc('record_win', { p_player: player, p_secret: playerSecret(), p_code: code });
      if (!error || (error.code !== 'PGRST202' && !/could not find the function/i.test(error.message))) return;
    }
  }
  const clean = nickname.trim();
  if (!clean) return;
  await supabase.rpc('add_player_win', {
    p_nickname: clean,
    p_points: points,
    p_game: gameName,
  });
}
