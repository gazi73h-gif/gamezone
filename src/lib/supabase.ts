import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export async function recordWin(nickname: string, points: number, gameName: string) {
  const clean = nickname.trim();
  if (!clean) return;
  await supabase.rpc('add_player_win', {
    p_nickname: clean,
    p_points: points,
    p_game: gameName,
  });
}
