begin;

alter table public.approved_games
  add column if not exists grade text check (grade in ('9', '10', '11', '12')),
  add column if not exists venue text check (venue in ('Home', 'Away', 'Neutral'));

-- Only explicit publication writes to this table. Keep private box scores and
-- play logs out of the public projection.
create or replace function public.approved_game_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_data jsonb;
begin
  select data into game_data from public.private_games where id = new.id;
  new.grade := case when game_data->>'grade' in ('9','10','11','12') then game_data->>'grade' end;
  new.venue := case when game_data->>'venue' in ('Home','Away','Neutral') then game_data->>'venue' end;
  return new;
end;
$$;

revoke all on function public.approved_game_context() from public, anon, authenticated;

create or replace trigger approved_game_context
before insert or update on public.approved_games
for each row execute function public.approved_game_context();

commit;
