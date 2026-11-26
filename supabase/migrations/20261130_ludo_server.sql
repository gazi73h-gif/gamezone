-- ═══════════════════════════════════════════════════════════════════
-- Ludo me rregulla në server — pjesa 1 (e sigurt, ekzekutoje kur të duash)
--
-- Krijon game_auth: funksioni "ludo-action" (Edge Function) e përdor për të pyetur
-- a është lojtari ai që thotë (çelësi) dhe a është ulur në dhomë.
-- Kërkon 20261128_secure_rooms.sql. Mund të ekzekutohet sërish pa dëm.
--
-- Radha e plotë:
--   1) ky skedar  2) vendos funksionin "ludo-action"  3) provo Ludon
--   4) 20261130b_ludo_lock.sql (mbyll rrugën e vjetër)
-- ═══════════════════════════════════════════════════════════════════

-- funksioni (me çelësin e shërbimit) pyet: a është ky lojtar dhe a është ulur në dhomë?
create or replace function public.game_auth(p_player text, p_secret text, p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return _is_player(p_player, p_secret)
    and exists (select 1 from room_players where room_code = p_code and player_id = p_player);
end $$;
revoke all on function public.game_auth(text, text, text) from public, anon, authenticated;
grant execute on function public.game_auth(text, text, text) to service_role;
