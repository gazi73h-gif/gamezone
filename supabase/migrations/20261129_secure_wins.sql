-- ═══════════════════════════════════════════════════════════════════
-- Kampionët pa pikë të rreme: fitorja regjistrohet vetëm nga serveri.
--
-- • Thirret nga një lojtar i ulur në dhomë (me çelësin e tij, si te 20261128_secure_rooms.sql).
-- • Fituesi lexohet nga gjendja e lojës në server, jo nga ajo që thotë shfletuesi.
-- • Pikët i cakton serveri sipas lojës; çdo lojë numërohet vetëm një herë.
-- • Funksioni i vjetër add_player_win (që pranonte çdo emër dhe çdo pikë) çaktivizohet.
--
-- Ekzekutoje PAS 20261128_secure_rooms.sql. Mund të ekzekutohet sërish pa dëm.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.win_log (
  game_key text primary key,
  room_code text not null,
  player_id text not null,
  game_type text not null,
  points int not null,
  created_at timestamptz not null default now()
);
alter table public.win_log enable row level security; -- pa politika

create or replace function public.record_win(p_player text, p_secret text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_state jsonb;
  v_winner text;
  v_nick text;
  v_points int;
  v_name text;
  v_key text;
begin
  perform _require_player(p_player, p_secret);
  perform _require_seat(p_player, p_code);
  select game_type, game_state into v_type, v_state from rooms where code = p_code;
  if v_state is null then return false; end if;

  -- fituesi sipas gjendjes së lojës në server
  v_winner := v_state->>'winnerId';
  if v_winner is null and v_type = 'pishpirik' and v_state->>'status' = 'finished' then
    select key into v_winner from jsonb_each(v_state->'players') order by (value->>'score')::int desc nulls last limit 1;
  end if;
  if v_winner is null or v_winner like 'BOT%' then return false; end if;
  select nickname into v_nick from room_players where room_code = p_code and player_id = v_winner limit 1;
  if v_nick is null then v_nick := coalesce(v_state->'players'->v_winner->>'nickname', v_state->>'winnerName'); end if;
  if v_nick is null or btrim(v_nick) = '' then return false; end if;

  v_points := case v_type
    when 'ludo' then 100 when 'rummy' then 150 when 'shah' then 150 when 'uno' then 50
    when 'pishpirik' then least(greatest(coalesce((v_state->'players'->v_winner->>'score')::int, 0), 10), 300)
    when 'yamb' then 100 else 0 end;
  v_name := case v_type
    when 'ludo' then 'Ludo (Mos u zemëro)' when 'rummy' then 'Okey' when 'shah' then 'Shah (Chess)'
    when 'uno' then 'UNO Shqip' when 'pishpirik' then 'Pishpirik' when 'yamb' then 'Yamb' else v_type end;
  if v_points = 0 then return false; end if;

  -- një herë për lojë (edhe kur e thërrasin disa lojtarë njëkohësisht)
  v_key := p_code || ':' || coalesce(v_state->>'gameId', md5(v_state::text));
  insert into win_log (game_key, room_code, player_id, game_type, points)
    values (v_key, p_code, v_winner, v_type, v_points) on conflict (game_key) do nothing;
  if not found then return false; end if;

  update leaderboard set wins = wins + 1, points = points + v_points, last_game = v_name, updated_at = now()
    where nickname = btrim(v_nick);
  if not found then
    insert into leaderboard (nickname, wins, points, last_game, updated_at) values (btrim(v_nick), 1, v_points, v_name, now());
  end if;
  return true;
end $$;
revoke all on function public.record_win(text, text, text) from public;
grant execute on function public.record_win(text, text, text) to anon, authenticated;

-- funksioni i vjetër: s'thirret më nga shfletuesi
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'add_player_win' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- tabela e kampionëve: lexohet nga të gjithë, shkruhet vetëm nga record_win
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'leaderboard' loop
    execute format('drop policy %I on public.leaderboard', p.policyname);
  end loop;
end $$;
alter table public.leaderboard enable row level security;
create policy "leaderboard: lexohet nga te gjithe" on public.leaderboard for select using (true);
revoke insert, update, delete on public.leaderboard from anon, authenticated;
