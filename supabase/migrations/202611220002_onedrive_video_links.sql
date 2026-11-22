begin;
alter table public.game_clips
  add column inline_player boolean not null default true,
  add column video_url text check (
    video_url like 'https://onedrive.live.com/embed?%'
    or video_url like 'https://onedrive.live.com/?%'
    or video_url like 'https://1drv.ms/%'
  ),
  add column video_permission_id text,
  add check ((video_permission_id is null) = (video_url is null)),
  add check (video_url is null or embed_url is null);

create or replace view public.published_highlights as
select c.id, c.game_id, c.title, coalesce(c.video_url,c.embed_url) as embed_url,
  c.created_at, g.opponent, g.date, c.inline_player
from public.game_clips c
left join public.approved_games g on g.id = c.game_id
where coalesce(c.video_url,c.embed_url) is not null;
commit;
