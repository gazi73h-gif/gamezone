-- GameZone: llogaritë e lojtarëve dhe tokens në server
-- Ekzekutoje një herë te Supabase → SQL Editor → New query → Run.
-- Mund të ekzekutohet sërish pa dëm (përdor "if not exists" / "or replace").

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null default 'Lojtar' check (char_length(nickname) between 1 and 18),
  tokens integer not null default 1000 check (tokens >= 0),
  last_bonus date,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Lojtari lexon vetëm profilin e vet. Nuk ka leje për insert/update/delete nga shfletuesi:
-- tokens ndryshojnë vetëm përmes funksioneve më poshtë, që kontrollojnë rregullat në server.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);

-- Krijon profilin herën e parë (me nofkën që ka zgjedhur si mysafir) dhe e kthen
create or replace function public.ensure_profile(p_nickname text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'Duhet të jesh i kyçur'; end if;
  insert into public.profiles (id, nickname)
  values (auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Lojtar'), 18))
  on conflict (id) do nothing;
  select * into r from public.profiles where id = auth.uid();
  return r;
end $$;

-- Ndryshon nofkën (1–18 shkronja)
create or replace function public.set_nickname(p_nickname text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'Duhet të jesh i kyçur'; end if;
  if char_length(trim(coalesce(p_nickname, ''))) = 0 then raise exception 'Nofka është bosh'; end if;
  update public.profiles set nickname = left(trim(p_nickname), 18) where id = auth.uid() returning * into r;
  return r;
end $$;

-- Bonusi ditor +250: vetëm një herë në ditë (data e serverit)
create or replace function public.claim_daily_bonus()
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'Duhet të jesh i kyçur'; end if;
  update public.profiles
     set tokens = tokens + 250, last_bonus = current_date
   where id = auth.uid() and (last_bonus is null or last_bonus < current_date)
  returning * into r;
  if not found then select * into r from public.profiles where id = auth.uid(); end if;
  return r;
end $$;

revoke all on function public.ensure_profile(text) from public, anon;
revoke all on function public.set_nickname(text) from public, anon;
revoke all on function public.claim_daily_bonus() from public, anon;
grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.set_nickname(text) to authenticated;
grant execute on function public.claim_daily_bonus() to authenticated;
