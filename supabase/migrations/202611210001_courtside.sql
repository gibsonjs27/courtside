begin;

create table public.tracker_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.public_profile (
  id smallint primary key check (id = 1),
  name text not null,
  team text not null,
  number text not null,
  position text not null,
  season text not null
);
create table public.private_games (
  id uuid primary key,
  owner_id uuid not null references public.tracker_admins(user_id) on delete cascade,
  revision integer not null check (revision > 0),
  data jsonb not null
);
create index private_games_owner_idx on public.private_games(owner_id);
create table public.approved_games (
  id uuid primary key references public.private_games(id) on delete cascade,
  date date not null,
  opponent text not null,
  us integer not null,
  them integer not null,
  pts integer not null,
  reb integer not null,
  ast integer not null,
  stl integer not null,
  blk integer not null
);
create table public.game_command_receipts (
  owner_id uuid not null references public.tracker_admins(user_id) on delete cascade,
  command_id uuid not null,
  primary key (owner_id, command_id)
);

alter table public.tracker_admins enable row level security;
alter table public.public_profile enable row level security;
alter table public.private_games enable row level security;
alter table public.approved_games enable row level security;
alter table public.game_command_receipts enable row level security;

revoke all on public.tracker_admins, public.public_profile, public.private_games,
  public.approved_games, public.game_command_receipts from public, anon, authenticated;
grant select on public.public_profile, public.approved_games to anon, authenticated;
grant select on public.tracker_admins, public.private_games to authenticated;

create policy read_profile on public.public_profile for select to anon, authenticated using (true);
create policy read_approved on public.approved_games for select to anon, authenticated using (true);
create policy read_admin_membership on public.tracker_admins for select to authenticated using (user_id = (select auth.uid()));
create policy read_own_games on public.private_games for select to authenticated using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.tracker_admins where user_id = (select auth.uid())
  )
);

create function public.apply_game_command(expected_owner uuid, command_id uuid, action text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  game_id uuid := (payload->>'id')::uuid;
  incoming_revision integer := (payload->>'rev')::integer;
  existing public.private_games%rowtype;
  game_data jsonb;
  counts jsonb;
begin
  if caller is null or caller is distinct from expected_owner or not exists (select 1 from public.tracker_admins where user_id = caller) then
    raise exception 'Tracker admin access required' using errcode = '42501';
  end if;
  if action is null or action not in ('save', 'publish', 'unpublish')
    or game_id is null or incoming_revision is null then
    raise exception 'Invalid game command';
  end if;

  -- The receipt and game update commit together. Duplicate requests wait here.
  insert into public.game_command_receipts values (caller, command_id) on conflict do nothing;
  if not found then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(game_id::text, 0));
  select * into existing from public.private_games where id = game_id;
  if existing.id is not null and existing.owner_id <> caller then
    raise exception 'Tracker admin access required' using errcode = '42501';
  end if;
  if incoming_revision <> coalesce(existing.revision, 0) + 1 then
    raise exception 'Game changed on another device. Export local changes before discarding this queue.';
  end if;

  if action = 'save' then
    if coalesce(length(trim(payload->>'opponent')), 0) not between 1 and 80
      or (payload->>'date')::date is null
      or coalesce(payload->>'status', '') not in ('live', 'final')
      or coalesce(payload->>'mode', '') not in ('live', 'box')
      or not coalesce((payload->>'us')::integer between 0 and 999, false)
      or not coalesce((payload->>'them')::integer between 0 and 999, false)
      or jsonb_typeof(payload->'events') is distinct from 'array'
      or jsonb_typeof(payload->'counts') is distinct from 'object' then
      raise exception 'Invalid game data';
    end if;
    game_data := jsonb_set(payload, '{published}', to_jsonb(exists (
      select 1 from public.approved_games where id = game_id
    )));
    insert into public.private_games (id, owner_id, revision, data)
    values (game_id, caller, incoming_revision, game_data)
    on conflict (id) do update set revision = excluded.revision, data = excluded.data;
    return;
  end if;

  if existing.id is null then raise exception 'Save the game first'; end if;
  game_data := existing.data;
  if action = 'publish' then
    if game_data->>'status' <> 'final' then raise exception 'Finalize the game before publishing'; end if;
    if game_data->>'mode' = 'live' then
      select coalesce(jsonb_object_agg(stat, quantity), '{}'::jsonb) into counts
      from (
        select event->>'stat' as stat, count(*) as quantity
        from jsonb_array_elements(game_data->'events') event
        where event->>'stat' in ('two','three','free','reb','ast','stl','blk')
        group by event->>'stat'
      ) totals;
    else
      counts := game_data->'counts';
    end if;
    insert into public.approved_games values (
      game_id, (game_data->>'date')::date, game_data->>'opponent',
      (game_data->>'us')::integer, (game_data->>'them')::integer,
      2 * coalesce((counts->>'two')::integer, 0) + 3 * coalesce((counts->>'three')::integer, 0) + coalesce((counts->>'free')::integer, 0),
      coalesce((counts->>'reb')::integer, 0), coalesce((counts->>'ast')::integer, 0),
      coalesce((counts->>'stl')::integer, 0), coalesce((counts->>'blk')::integer, 0)
    )
    on conflict (id) do update set date = excluded.date, opponent = excluded.opponent,
      us = excluded.us, them = excluded.them, pts = excluded.pts, reb = excluded.reb,
      ast = excluded.ast, stl = excluded.stl, blk = excluded.blk;
  else
    delete from public.approved_games where id = game_id;
  end if;
  update public.private_games
  set revision = incoming_revision,
      data = game_data || jsonb_build_object('rev', incoming_revision, 'published', action = 'publish')
  where id = game_id;
end;
$$;

revoke all on function public.apply_game_command(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_game_command(uuid, uuid, text, jsonb) to authenticated;
commit;
