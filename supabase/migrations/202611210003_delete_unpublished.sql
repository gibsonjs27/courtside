begin;

create or replace function public.delete_unpublished_game(
  expected_owner uuid, command_id uuid, game_id uuid, expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  existing public.private_games%rowtype;
begin
  if caller is null or caller is distinct from expected_owner
    or not exists (select 1 from public.tracker_admins where user_id = caller) then
    raise exception 'Tracker admin access required' using errcode = '42501';
  end if;
  insert into public.game_command_receipts values (caller, command_id) on conflict do nothing;
  if not found then return; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(game_id::text, 0));
  select * into existing from public.private_games where id = game_id and owner_id = caller;
  if existing.id is null then raise exception 'Game not found'; end if;
  if exists (select 1 from public.approved_games where id = game_id) then
    raise exception 'Published games cannot be deleted';
  end if;
  if existing.data @> '{"deleted":true}' then return; end if;
  if existing.revision is distinct from expected_revision then
    raise exception 'Game changed on another device. Review pending changes before deleting it.';
  end if;

  -- Retain only a revision marker so stale devices cannot recreate the game.
  update public.private_games set
    revision = existing.revision + 1,
    data = jsonb_build_object('id', game_id, 'deleted', true)
  where id = game_id and owner_id = caller;
end;
$$;

revoke all on function public.delete_unpublished_game(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.delete_unpublished_game(uuid, uuid, uuid, integer) to authenticated;

alter policy read_own_games on public.private_games using (
  owner_id = (select auth.uid())
  and not (data @> '{"deleted":true}')
  and exists (select 1 from public.tracker_admins where user_id = (select auth.uid()))
);

commit;
