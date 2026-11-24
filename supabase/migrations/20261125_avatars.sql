-- GameZone: fotot e profilit (Facebook/Google) dhe fshirja e llogarisë
-- Ekzekutoje një herë te Supabase → SQL Editor → New query → Run (pas skriptit 20261124_profiles.sql).
-- Mund të ekzekutohet sërish pa dëm.

-- foto e profilit në llogari dhe te lojtarët e dhomave (që ta shohin edhe të tjerët në tavolinë)
alter table public.profiles add column if not exists avatar_url text;
alter table public.room_players add column if not exists avatar_url text;

-- ensure_profile tani merr edhe foton; foto e re (p.sh. pas ndryshimit në Facebook) zëvendëson të vjetrën
drop function if exists public.ensure_profile(text);
create or replace function public.ensure_profile(p_nickname text, p_avatar text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'Duhet të jesh i kyçur'; end if;
  insert into public.profiles (id, nickname, avatar_url)
  values (auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Lojtar'), 18), nullif(p_avatar, ''))
  on conflict (id) do update set avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url);
  select * into r from public.profiles where id = auth.uid();
  return r;
end $$;

-- "Fshi llogarinë": fshin llogarinë, profilin (me tokens) dhe vendet në dhoma
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Duhet të jesh i kyçur'; end if;
  delete from public.room_players where player_id = auth.uid()::text;
  delete from auth.users where id = auth.uid(); -- profili fshihet bashkë me të (on delete cascade)
end $$;

revoke all on function public.ensure_profile(text, text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.ensure_profile(text, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
