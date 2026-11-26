-- ═══════════════════════════════════════════════════════════════════
-- Okey me rregulla në server — pjesa 2: mbyllja
--
-- KUJDES: ekzekutoje VETËM pasi funksioni "okey-action" është vendosur te Supabase
-- dhe e ke provuar një lojë Okey që punon.
--
-- Pas këtij skedari, shfletuesi nuk mund ta ndryshojë më lojën e Okey-t (as të Ludos):
-- gurët i përzien, i ndan dhe i kontrollon vetëm serveri.
-- Mund të ekzekutohet sërish pa dëm.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.update_room(
  p_player text, p_secret text, p_code text,
  p_state jsonb default null, p_status text default null, p_prev_rev int default null, p_set_state boolean default true
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  perform _require_player(p_player, p_secret);
  perform _require_seat(p_player, p_code);
  if p_status is not null and p_status not in ('waiting', 'playing', 'finished') then raise exception 'bad_status'; end if;
  if p_set_state and p_state is not null and pg_column_size(p_state) > 300000 then raise exception 'too_big'; end if;
  select game_type into v_type from rooms where code = p_code;
  -- Ludo dhe Okey: gjendja e lojës shkruhet vetëm nga serveri
  -- (lejohet vetëm njoftimi "boti u largua", që e kthen dhomën në pritje)
  if v_type in ('ludo', 'rummy') and (p_set_state or p_status = 'playing') and coalesce(p_status, '') <> 'waiting' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  update rooms set
    game_state = case when p_set_state then p_state else game_state end,
    status = coalesce(p_status, status)
  where code = p_code
    and (p_prev_rev is null
      or (p_prev_rev = 0 and coalesce(game_state->>'rev', '0') = '0')
      or (p_prev_rev > 0 and game_state->>'rev' = p_prev_rev::text));
  return found;
end $$;
grant execute on function public.update_room(text, text, text, jsonb, text, int, boolean) to anon, authenticated;
