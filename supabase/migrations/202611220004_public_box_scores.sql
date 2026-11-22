begin;

alter table public.approved_games add column box jsonb;

-- Freeze only numeric stat totals at publication. Never read unsaved changes
-- into an existing public snapshot or copy notes or individual play events.
create function public.capture_approved_box_score() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  game_data jsonb;
  counts jsonb;
begin
  select data into game_data from public.private_games where id = new.id;
  if game_data->>'mode' = 'live' then
    select coalesce(jsonb_object_agg(stat, quantity), '{}'::jsonb) into counts
    from (
      select event->>'stat' as stat, count(*) as quantity
      from jsonb_array_elements(game_data->'events') event
      where event->>'stat' in ('two','three','free','missTwo','missThree','missFree','reb','ast','stl','blk','tov','foul')
      group by event->>'stat'
    ) totals;
  else
    counts := game_data->'counts';
  end if;

  select jsonb_object_agg(stat, coalesce((counts->>stat)::integer, 0)) into new.box
  from unnest(array['two','three','free','missTwo','missThree','missFree','reb','ast','stl','blk','tov','foul']) as allowed(stat);
  return new;
end;
$$;

revoke all on function public.capture_approved_box_score() from public, anon, authenticated;
create trigger capture_approved_box_score before insert or update on public.approved_games
for each row execute function public.capture_approved_box_score();

commit;
