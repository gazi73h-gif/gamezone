-- ═══════════════════════════════════════════════════════════════════
-- Okey me rregulla në server — pjesa 1 (e sigurt, ekzekutoje kur të duash)
--
-- • game_secrets: gjendja e plotë e lojës (dora e secilit, stiva). Askush s'e lexon nga
--   shfletuesi; vetëm funksioni "okey-action" (me çelësin e shërbimit).
-- • Te "rooms" ruhet vetëm pamja publike, me gurët e të tjerëve të mbuluar.
-- Kërkon 20261128_secure_rooms.sql dhe 20261130_ludo_server.sql (game_auth).
-- Mund të ekzekutohet sërish pa dëm.
--
-- Radha e plotë:
--   1) ky skedar  2) vendos funksionin "okey-action"  3) provo Okey-n
--   4) 20261201b_okey_lock.sql (mbyll rrugën e vjetër)
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.game_secrets (
  room_code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_secrets enable row level security; -- pa politika: askush s'e lexon nga shfletuesi

-- dhoma + gjendja e plotë (vetëm për funksionin)
create or replace function public.okey_load(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('game_type', r.game_type, 'status', r.status, 'host_id', r.host_id, 'full', s.state)
  from rooms r left join game_secrets s on s.room_code = r.code
  where r.code = p_code
$$;

-- ruan pamjen publike te rooms dhe gjendjen e plotë te game_secrets, njëherësh;
-- vetëm kur në server është ende versioni p_prev_rev (null = pa kontroll, p.sh. lojë e re)
create or replace function public.okey_save(p_code text, p_prev_rev int, p_full jsonb, p_public jsonb, p_status text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update rooms set game_state = p_public, status = coalesce(p_status, status)
  where code = p_code
    and (p_prev_rev is null or coalesce((select (state->>'rev')::int from game_secrets where room_code = p_code), -1) = p_prev_rev);
  if not found then return false; end if;
  insert into game_secrets (room_code, state, updated_at) values (p_code, p_full, now())
  on conflict (room_code) do update set state = excluded.state, updated_at = now();
  return true;
end $$;

revoke all on function public.okey_load(text) from public, anon, authenticated;
revoke all on function public.okey_save(text, int, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.okey_load(text) to service_role;
grant execute on function public.okey_save(text, int, jsonb, jsonb, text) to service_role;

-- kur fshihet dhoma, fshihet edhe gjendja e fshehur
create or replace function public._drop_game_secret() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from game_secrets where room_code = old.code;
  return old;
end $$;
drop trigger if exists rooms_drop_secret on public.rooms;
create trigger rooms_drop_secret after delete on public.rooms for each row execute function public._drop_game_secret();
