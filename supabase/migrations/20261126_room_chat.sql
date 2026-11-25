-- ═══════════════════════════════════════════════════════════════════
-- Chat-i i dhomës (Ludo, UNO, Yamb, Okey) me filtrim NË SERVER
--
-- • Mesazhet ruhen te room_messages dhe u shkojnë lojtarëve me Supabase
--   Realtime (WebSocket).
-- • Askush nuk mund të shkruajë direkt në room_messages: e vetmja rrugë
--   është funksioni send_room_message(), i cili e kontrollon mesazhin.
--   Mesazhi i bllokuar NUK ruhet dhe nuk i shkon askujt.
-- • Fjalët e ndaluara janë te tabela chat_banned_words. Shto/hiq fjalë nga
--   Supabase → Table Editor → chat_banned_words (pa ndryshuar kodin).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.room_messages (
  id bigint generated always as identity primary key,
  room_code text not null,
  player_id text not null,
  nickname text not null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists room_messages_room_idx on public.room_messages (room_code, id);
create index if not exists room_messages_created_idx on public.room_messages (created_at);

alter table public.room_messages enable row level security;
drop policy if exists "chat lexohet nga te gjithe" on public.room_messages;
create policy "chat lexohet nga te gjithe" on public.room_messages for select using (true);
-- s'ka politikë për insert/update/delete: shkruhet vetëm përmes send_room_message()

-- ── fjalët e ndaluara ──
-- kind: 'fyerje' (shajnime, fyerje) ose 'kontakt' (telefon, Instagram, Facebook...)
-- whole: true = vetëm fjala e plotë ("fb", "ig"); false = edhe fjalët që fillojnë me të ("kurv" → "kurva", "kurvat")
create table if not exists public.chat_banned_words (
  word text primary key,
  kind text not null default 'fyerje' check (kind in ('fyerje', 'kontakt')),
  whole boolean not null default true
);
alter table public.chat_banned_words enable row level security; -- pa politika: lojtarët nuk e shohin listën

insert into public.chat_banned_words (word, kind, whole) values
  -- shajnime dhe fyerje (shqip)
  ('kurv', 'fyerje', false), ('pidh', 'fyerje', false), ('qifsh', 'fyerje', false), ('qifs', 'fyerje', false),
  ('qi', 'fyerje', true), ('qij', 'fyerje', true), ('qija', 'fyerje', true), ('qire', 'fyerje', true),
  ('kar', 'fyerje', true), ('kari', 'fyerje', true), ('karin', 'fyerje', true), ('karit', 'fyerje', true),
  ('mut', 'fyerje', true), ('muti', 'fyerje', true), ('mutin', 'fyerje', true), ('mutit', 'fyerje', true), ('mutra', 'fyerje', true),
  ('byth', 'fyerje', false), ('lavir', 'fyerje', false), ('putan', 'fyerje', false), ('bushter', 'fyerje', false),
  ('peder', 'fyerje', true), ('pedera', 'fyerje', true), ('pederast', 'fyerje', false),
  ('budall', 'fyerje', false), ('idiot', 'fyerje', false), ('debil', 'fyerje', false), ('kretin', 'fyerje', false),
  ('gomar', 'fyerje', false), ('derr', 'fyerje', true), ('derri', 'fyerje', true), ('derra', 'fyerje', true),
  ('kokederr', 'fyerje', false), ('shkerdhat', 'fyerje', false), ('horr', 'fyerje', false), ('rrugac', 'fyerje', false),
  ('trap', 'fyerje', true), ('majmun', 'fyerje', false), ('cigan', 'fyerje', false), ('magjup', 'fyerje', false),
  -- anglisht / gjuhë të tjera që dëgjohen shpesh
  ('fuck', 'fyerje', false), ('motherf', 'fyerje', false), ('shit', 'fyerje', true), ('bitch', 'fyerje', false),
  ('asshole', 'fyerje', false), ('dick', 'fyerje', true), ('pussy', 'fyerje', false), ('whore', 'fyerje', false),
  ('slut', 'fyerje', false), ('bastard', 'fyerje', false),
  ('jebem', 'fyerje', false), ('jebi', 'fyerje', false), ('picka', 'fyerje', false), ('picku', 'fyerje', false), ('kurac', 'fyerje', false),
  ('cazzo', 'fyerje', false), ('puttana', 'fyerje', false), ('vaffanculo', 'fyerje', false), ('stronzo', 'fyerje', false),
  -- kërkim kontakti
  ('telefon', 'kontakt', false), ('tel', 'kontakt', true), ('celular', 'kontakt', false), ('mobil', 'kontakt', false),
  ('numri', 'kontakt', true), ('numrin', 'kontakt', true), ('numrit', 'kontakt', true),
  ('numer', 'kontakt', true), ('numeri', 'kontakt', true), ('numerin', 'kontakt', true), ('numerit', 'kontakt', true), ('nr', 'kontakt', true),
  ('instagram', 'kontakt', false), ('insta', 'kontakt', false), ('ig', 'kontakt', true),
  ('facebook', 'kontakt', false), ('fejsbuk', 'kontakt', false), ('fejs', 'kontakt', false), ('face', 'kontakt', true), ('fb', 'kontakt', true),
  ('messenger', 'kontakt', false), ('whats', 'kontakt', false), ('wats', 'kontakt', false), ('vatsap', 'kontakt', false),
  ('viber', 'kontakt', false), ('telegram', 'kontakt', false), ('snap', 'kontakt', false), ('tiktok', 'kontakt', false),
  ('email', 'kontakt', false), ('gmail', 'kontakt', false), ('hotmail', 'kontakt', false),
  ('dm', 'kontakt', true), ('inbox', 'kontakt', false), ('privat', 'kontakt', false), ('shkruaj privat', 'kontakt', true),
  ('kontakt', 'kontakt', false)
on conflict (word) do nothing;

-- shënime të mesazheve të bllokuara (vetëm për administratorin, lojtarët s'i shohin)
create table if not exists public.chat_blocked (
  id bigint generated always as identity primary key,
  room_code text, player_id text, body text, reason text,
  created_at timestamptz not null default now()
);
alter table public.chat_blocked enable row level security;

-- ── normalizimi: shkronja të vogla, ë→e, ç→c, 0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, @→a, $→s ──
create or replace function public.chat_norm(t text) returns text
language sql immutable as $$
  select translate(lower(coalesce(t, '')),
    'ëçéèêáàâíìîóòôúùüöä0134578@$!|',
    'eceeeaaaiiiooouuuoaoieastbasii')
$$;

-- ── kontrolli: kthen null nëse mesazhi lejohet, përndryshe arsyen ('fyerje' / 'kontakt') ──
create or replace function public.chat_check(p_body text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  raw text := coalesce(p_body, '');
  n text := chat_norm(raw);
  one text := regexp_replace(n, '(.)\1+', '\1', 'g');      -- "kuuurva" → "kurva"
  two text := regexp_replace(n, '(.)\1{2,}', '\1\1', 'g'); -- "horrrr" → "horr"
  c1 text;
  c2 text;
  w record;
  nw text;
  target text;
  compact text;
begin
  -- numra telefoni: 7+ shifra, edhe me hapësira, pika, vija, kllapa ("044 123 456", "+355-69-...", "0 6 9 1 2 3 4")
  if raw ~ '\d([\s.\-()/_]*\d){6,}' then return 'kontakt'; end if;
  -- prefikset +355 (Shqipëri), +383 (Kosovë), +389 (Maqedoni) dhe 06x / 04x shqiptare
  if raw ~ '(\+|00)\s*3\s*(5\s*5|8\s*3|8\s*9)' then return 'kontakt'; end if;
  if raw ~ '(^|[^0-9])0\s*[4-6]\s*\d([\s.\-]*\d){2,}' then return 'kontakt'; end if;
  -- numri i shkruar me fjalë ("zero gjashte nente ...")
  if (select count(*) from regexp_matches(n, '\m(zero|nje|dy|tre|kater|pese|gjashte|shtate|tete|nente)\M', 'g')) >= 6 then return 'kontakt'; end if;
  -- @emri, linke
  if raw ~ '@[A-Za-z0-9_.]{2,}' or n ~ '(https?://|www\.)' or n ~ '\.(com|al|net|org|me|io)\M' then return 'kontakt'; end if;

  c1 := regexp_replace(regexp_replace(one, '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g'); -- "f.a.c.e b o o k" → "facebok"
  c2 := regexp_replace(two, '[^a-z]', '', 'g');

  for w in select word, kind, whole from chat_banned_words loop
    nw := chat_norm(w.word);
    if nw ~ '(.)\1' then           -- fjalë me shkronja të dyfishta ("horr", "derr"): krahaso me formën "two"
      target := two; compact := c2;
    else
      nw := regexp_replace(nw, '(.)\1+', '\1', 'g');
      target := one; compact := c1;
    end if;
    if target ~ ('\m' || nw || case when w.whole then '\M' else '' end) then return w.kind; end if;
    -- shkronja të ndara me hapësira/pika ("i n s t a g r a m") — vetëm për fjalë të gjata, që të mos ketë gabime
    if not w.whole and length(nw) >= 5 and position(nw in compact) > 0 then return w.kind; end if;
  end loop;
  return null;
end $$;

-- ── dërgimi: e vetmja rrugë për të shkruar në chat ──
create or replace function public.send_room_message(p_room text, p_player text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  nick text;
  recent int;
  reason text;
begin
  if body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(body) > 200 then return jsonb_build_object('ok', false, 'reason', 'too_long'); end if;
  select nickname into nick from room_players where room_code = p_room and player_id = p_player limit 1;
  if nick is null then return jsonb_build_object('ok', false, 'reason', 'not_in_room'); end if;
  select count(*) into recent from room_messages
    where room_code = p_room and player_id = p_player and created_at > now() - interval '10 seconds';
  if recent >= 5 then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;

  reason := chat_check(body);
  if reason is not null then
    insert into chat_blocked (room_code, player_id, body, reason) values (p_room, p_player, body, reason);
    return jsonb_build_object('ok', false, 'reason', reason);
  end if;

  insert into room_messages (room_code, player_id, nickname, body) values (p_room, p_player, nick, body);
  delete from room_messages where created_at < now() - interval '2 days';
  delete from chat_blocked where created_at < now() - interval '30 days';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.send_room_message(text, text, text) from public;
grant execute on function public.send_room_message(text, text, text) to anon, authenticated;
revoke all on function public.chat_check(text) from public, anon, authenticated;

-- mesazhet e reja u shkojnë menjëherë lojtarëve (Realtime / WebSocket)
do $$ begin
  alter publication supabase_realtime add table public.room_messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;
