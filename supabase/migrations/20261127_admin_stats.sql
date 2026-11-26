-- ═══════════════════════════════════════════════════════════════════
-- Statistikat për administratorin (faqja /statistika)
--
-- 1) Ekzekuto gjithë këtë skedar te Supabase → SQL Editor → Run.
-- 2) Bëhu administrator (vetëm një herë), duke vendosur email-in me të cilin kyçesh në GameZone:
--
--      insert into public.admins (user_id)
--      select id from auth.users where email = 'EMAILI_YT@shembull.com'
--      on conflict do nothing;
--
-- Askush tjetër nuk i sheh statistikat: kontrolli bëhet në server (admin_stats).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security; -- pa politika: askush s'e lexon nga shfletuesi

-- çdo lojë që niset (edhe "Luaj përsëri")
create table if not exists public.game_log (
  id bigint generated always as identity primary key,
  room_code text not null,
  game_type text not null,
  players int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists game_log_created_idx on public.game_log (created_at);
alter table public.game_log enable row level security; -- shkruhet vetëm përmes log_game_start()

create or replace function public.log_game_start(p_room text, p_game text, p_players int) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- vetëm dhoma që ekzistojnë, me të njëjtën lojë; një regjistrim në 15 sekonda për dhomë
  if not exists (select 1 from rooms where code = p_room and game_type = p_game) then return; end if;
  if exists (select 1 from game_log where room_code = p_room and created_at > now() - interval '15 seconds') then return; end if;
  insert into game_log (room_code, game_type, players) values (p_room, p_game, greatest(1, least(coalesce(p_players, 1), 8)));
end $$;
revoke all on function public.log_game_start(text, text, int) from public;
grant execute on function public.log_game_start(text, text, int) to anon, authenticated;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'Europe/Belgrade';
  today date := (now() at time zone tz)::date;
  res jsonb;
  chat_today bigint := 0;
  chat_7d bigint := 0;
  phrases jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  -- chat-i (nëse është aktivizuar)
  if to_regclass('public.room_messages') is not null then
    execute 'select count(*) from room_messages where (created_at at time zone $1)::date = $2' into chat_today using tz, today;
    execute 'select count(*) from room_messages where (created_at at time zone $1)::date >= $2 - 6' into chat_7d using tz, today;
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''phrase'', body, ''n'', n) order by n desc), ''[]'')
             from (select body, count(*) n from room_messages where (created_at at time zone $1)::date >= $2 - 6
                   group by body order by count(*) desc limit 8) q' into phrases using tz, today;
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_today', (select count(*) from auth.users where (created_at at time zone tz)::date = today),
    'users_7d', (select count(*) from auth.users where (created_at at time zone tz)::date >= today - 6),
    'games_total', (select count(*) from game_log),
    'games_today', (select count(*) from game_log where (created_at at time zone tz)::date = today),
    'games_7d', (select count(*) from game_log where (created_at at time zone tz)::date >= today - 6),
    'rooms_playing', (select count(*) from rooms where status = 'playing'),
    'rooms_waiting', (select count(*) from rooms where status = 'waiting'),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d,
        'games', (select count(*) from game_log g where (g.created_at at time zone tz)::date = d),
        'users', (select count(*) from auth.users u where (u.created_at at time zone tz)::date = d)
      ) order by d)
      from (select (today - k) as d from generate_series(0, 13) as k) days
    ),
    'by_game', (
      select coalesce(jsonb_agg(jsonb_build_object('game', game_type, 'n', n) order by n desc), '[]'::jsonb)
      from (select game_type, count(*) n from game_log where (created_at at time zone tz)::date >= today - 6 group by game_type) q
    ),
    'chat_today', chat_today,
    'chat_7d', chat_7d,
    'phrases', phrases
  ) into res;
  return res;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
