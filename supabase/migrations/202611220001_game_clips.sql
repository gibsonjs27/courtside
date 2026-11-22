begin;
create table public.game_clips (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.private_games(id) on delete cascade,
  owner_id uuid not null references public.tracker_admins(user_id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  item_id text not null,
  permission_id text,
  embed_url text check (embed_url like 'https://onedrive.live.com/embed?%'),
  created_at timestamptz not null default now(),
  check ((permission_id is null) = (embed_url is null)),
  unique (owner_id, item_id)
);
alter table public.game_clips enable row level security;
revoke all on public.game_clips from public, anon, authenticated;
grant select, insert, update, delete on public.game_clips to authenticated;
create policy manage_own_clips on public.game_clips for all to authenticated
using (owner_id = (select auth.uid()) and exists (
  select 1 from public.tracker_admins where user_id = (select auth.uid())
))
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.private_games where id = game_id and owner_id = (select auth.uid()))
);

create view public.published_highlights as
select c.id, c.game_id, c.title, c.embed_url, c.created_at, g.opponent, g.date
from public.game_clips c
left join public.approved_games g on g.id = c.game_id
where c.embed_url is not null;
revoke all on public.published_highlights from public, anon, authenticated;
grant select on public.published_highlights to anon, authenticated;
create function public.protect_games_with_clips() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.data @> '{"deleted":true}' and exists (
    select 1 from public.game_clips where game_id = old.id
  ) then
    raise exception 'Remove the game’s video clips before deleting the game.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_games_with_clips() from public, anon, authenticated;
create trigger protect_games_with_clips before update on public.private_games
for each row execute function public.protect_games_with_clips();
commit;
