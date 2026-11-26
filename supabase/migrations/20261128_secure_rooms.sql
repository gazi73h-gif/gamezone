-- ═══════════════════════════════════════════════════════════════════
-- Siguria e dhomave: shfletuesi NUK shkruan më direkt te rooms / room_players.
--
-- Çdo lojtar ka një çelës sekret në shfletuesin e vet (serveri ruan vetëm gjurmën md5 të tij).
-- Çdo veprim (krijo, hyr, dil, ruaj lojën, mbyll dhomën) kalon përmes funksioneve më poshtë,
-- që kontrollojnë: (1) a je vërtet ai lojtar, (2) a je ulur në atë dhomë.
--
-- Ekzekutoje gjithë skedarin te Supabase → SQL Editor → Run. Mund të ekzekutohet sërish pa dëm.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.player_keys (
  player_id text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.player_keys enable row level security; -- pa politika: askush s'e lexon nga shfletuesi

-- a është ky vërtet lojtari? (llogaria e kyçur, ose çelësi sekret i shfletuesit)
create or replace function public._is_player(p_player text, p_secret text) returns boolean
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if p_player is null or length(p_player) < 1 or length(p_player) > 64 or p_player like 'BOT%' then return false; end if;
  if auth.uid() is not null and auth.uid()::text = p_player then return true; end if;
  if p_secret is null or length(p_secret) < 16 or length(p_secret) > 128 then return false; end if;
  select secret_hash into h from player_keys where player_id = p_player;
  if h is null then
    -- herën e parë: ky shfletues e merr këtë ID
    insert into player_keys (player_id, secret_hash) values (p_player, md5(p_secret)) on conflict (player_id) do nothing;
    select secret_hash into h from player_keys where player_id = p_player;
  end if;
  return h = md5(p_secret);
end $$;

create or replace function public._require_player(p_player text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _is_player(p_player, p_secret) then raise exception 'not_allowed' using errcode = '42501'; end if;
end $$;

create or replace function public._require_seat(p_player text, p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from room_players where room_code = p_code and player_id = p_player) then
    raise exception 'not_in_room' using errcode = '42501';
  end if;
end $$;

-- ── krijo dhomë: kodi zgjidhet në server ──
create or replace function public.create_room(p_player text, p_secret text, p_game text, p_nickname text, p_avatar text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_nick text := left(btrim(coalesce(p_nickname, '')), 18);
begin
  perform _require_player(p_player, p_secret);
  if p_game not in ('ludo', 'rummy', 'uno', 'yamb', 'pishpirik', 'shah') then raise exception 'bad_game'; end if;
  if v_nick = '' then v_nick := 'Lojtar'; end if;
  if (select count(*) from rooms where host_id = p_player and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'slow_down';
  end if;
  for i in 1..30 loop
    v_code := (1000 + floor(random() * 9000))::int::text;
    exit when not exists (select 1 from rooms where code = v_code);
    v_code := null;
  end loop;
  if v_code is null then raise exception 'no_code'; end if;
  insert into rooms (code, game_type, host_id, status) values (v_code, p_game, p_player, 'waiting');
  insert into room_players (room_code, player_id, nickname, seat_order, avatar_url)
    values (v_code, p_player, v_nick, 1, left(p_avatar, 500));
  return v_code;
end $$;

-- ── hyr në dhomë me kod ──
create or replace function public.join_room(p_player text, p_secret text, p_code text, p_nickname text, p_avatar text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_nick text := left(btrim(coalesce(p_nickname, '')), 18);
begin
  perform _require_player(p_player, p_secret);
  if not exists (select 1 from rooms where code = p_code) then raise exception 'no_room'; end if;
  if v_nick = '' then v_nick := 'Lojtar'; end if;
  if (select count(*) from room_players where room_code = p_code) >= 8
     and not exists (select 1 from room_players where room_code = p_code and player_id = p_player) then
    raise exception 'room_full';
  end if;
  insert into room_players (room_code, player_id, nickname, seat_order, avatar_url)
    values (p_code, p_player, v_nick, coalesce((select max(seat_order) from room_players where room_code = p_code), 0) + 1, left(p_avatar, 500))
  on conflict (room_code, player_id) do update set nickname = excluded.nickname, avatar_url = coalesce(excluded.avatar_url, room_players.avatar_url);
  return true;
end $$;

-- ── dil nga dhoma: kur s'mbetet askush, dhoma fshihet; kur del krijuesi, dhoma i kalon tjetrit ──
create or replace function public.leave_room(p_player text, p_secret text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_next text;
begin
  perform _require_player(p_player, p_secret);
  delete from room_players where room_code = p_code and player_id = p_player;
  select player_id into v_next from room_players
    where room_code = p_code and player_id not like 'BOT%' order by seat_order, joined_at limit 1;
  if v_next is null then
    delete from room_players where room_code = p_code;
    delete from rooms where code = p_code;
  else
    update rooms set host_id = v_next where code = p_code and host_id = p_player;
  end if;
end $$;

-- ── ruaj lojën / ndrysho gjendjen e dhomës (vetëm lojtarët e dhomës) ──
-- p_prev_rev: nëse jepet, ruhet vetëm kur në server është ende ai version (dy veprime njëkohësisht s'mbishkruajnë njëri-tjetrin)
create or replace function public.update_room(
  p_player text, p_secret text, p_code text,
  p_state jsonb default null, p_status text default null, p_prev_rev int default null, p_set_state boolean default true
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform _require_player(p_player, p_secret);
  perform _require_seat(p_player, p_code);
  if p_status is not null and p_status not in ('waiting', 'playing', 'finished') then raise exception 'bad_status'; end if;
  if p_set_state and p_state is not null and pg_column_size(p_state) > 300000 then raise exception 'too_big'; end if;
  update rooms set
    game_state = case when p_set_state then p_state else game_state end,
    status = coalesce(p_status, status)
  where code = p_code
    and (p_prev_rev is null
      or (p_prev_rev = 0 and coalesce(game_state->>'rev', '0') = '0')
      or (p_prev_rev > 0 and game_state->>'rev' = p_prev_rev::text));
  return found;
end $$;

-- ── mbyll dhomën (p.sh. pas 5 minutash pa aktivitet) — vetëm një lojtar i dhomës ──
create or replace function public.close_room(p_player text, p_secret text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_player(p_player, p_secret);
  perform _require_seat(p_player, p_code);
  delete from room_players where room_code = p_code;
  delete from rooms where code = p_code;
end $$;

-- ── pastro dhomat e harruara: në pritje mbi 5 minuta dhe pa asnjë lojtar ──
create or replace function public.cleanup_rooms()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with gone as (
    delete from rooms r
    where r.status = 'waiting' and r.created_at < now() - interval '5 minutes'
      and not exists (select 1 from room_players p where p.room_code = r.code)
    returning 1
  ) select count(*) into n from gone;
  return n;
end $$;

-- të drejtat: funksionet ndihmëse s'thirren nga jashtë
revoke all on function public._is_player(text, text) from public, anon, authenticated;
revoke all on function public._require_player(text, text) from public, anon, authenticated;
revoke all on function public._require_seat(text, text) from public, anon, authenticated;
grant execute on function public.create_room(text, text, text, text, text) to anon, authenticated;
grant execute on function public.join_room(text, text, text, text, text) to anon, authenticated;
grant execute on function public.leave_room(text, text, text) to anon, authenticated;
grant execute on function public.update_room(text, text, text, jsonb, text, int, boolean) to anon, authenticated;
grant execute on function public.close_room(text, text, text) to anon, authenticated;
grant execute on function public.cleanup_rooms() to anon, authenticated;

-- ── mbyllja: tabelat lexohen nga të gjithë, por shkruhen VETËM përmes funksioneve ──
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('rooms', 'room_players') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
create policy "rooms: lexohen nga te gjithe" on public.rooms for select using (true);
create policy "room_players: lexohen nga te gjithe" on public.room_players for select using (true);
revoke insert, update, delete on public.rooms, public.room_players from anon, authenticated;
