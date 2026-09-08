-- HALCON-TORO: online rooms + game state sync
-- Run in Supabase Dashboard → SQL Editor after 001_profiles.sql

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  host_id uuid not null references auth.users (id) on delete cascade,
  guest_id uuid references auth.users (id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished', 'abandoned')),
  created_at timestamptz not null default now(),
  constraint rooms_code_unique unique (code),
  constraint rooms_code_format check (code ~ '^[A-Z0-9]{6}$')
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms (id) on delete cascade,
  state jsonb not null,
  version int not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_host_id_idx on public.rooms (host_id);
create index if not exists rooms_guest_id_idx on public.rooms (guest_id);
create index if not exists rooms_code_idx on public.rooms (code);

alter table public.rooms enable row level security;
alter table public.games enable row level security;

drop policy if exists "Rooms readable by participants" on public.rooms;
create policy "Rooms readable by participants"
  on public.rooms
  for select
  using (auth.uid() = host_id or auth.uid() = guest_id);

drop policy if exists "Authenticated users can create rooms" on public.rooms;
create policy "Authenticated users can create rooms"
  on public.rooms
  for insert
  with check (
    auth.uid() = host_id
    and guest_id is null
    and status = 'waiting'
  );

drop policy if exists "Participants can update rooms" on public.rooms;
create policy "Participants can update rooms"
  on public.rooms
  for update
  using (auth.uid() = host_id or auth.uid() = guest_id)
  with check (auth.uid() = host_id or auth.uid() = guest_id);

drop policy if exists "Host can delete waiting room" on public.rooms;
create policy "Host can delete waiting room"
  on public.rooms
  for delete
  using (auth.uid() = host_id and status = 'waiting');

drop policy if exists "Games readable by room participants" on public.games;
create policy "Games readable by room participants"
  on public.games
  for select
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

drop policy if exists "Host can create game row" on public.games;
create policy "Host can create game row"
  on public.games
  for insert
  with check (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and r.host_id = auth.uid()
    )
  );

drop policy if exists "Participants can update games" on public.games;
create policy "Participants can update games"
  on public.games
  for update
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

create or replace function public.join_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.rooms%rowtype;
  g public.games%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into r
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'room_not_found';
  end if;

  if r.host_id = v_uid then
    raise exception 'cannot_join_own_room';
  end if;

  if r.status = 'playing' and r.guest_id = v_uid then
    select * into g from public.games where room_id = r.id;
    return jsonb_build_object(
      'room', to_jsonb(r),
      'game', to_jsonb(g)
    );
  end if;

  if r.status <> 'waiting' or r.guest_id is not null then
    raise exception 'room_not_joinable';
  end if;

  update public.rooms
  set guest_id = v_uid,
      status = 'playing'
  where id = r.id
  returning * into r;

  select * into g from public.games where room_id = r.id;
  if not found then
    raise exception 'game_missing';
  end if;

  return jsonb_build_object(
    'room', to_jsonb(r),
    'game', to_jsonb(g)
  );
end;
$$;

revoke all on function public.join_room(text) from public;
grant execute on function public.join_room(text) to authenticated;

-- Realtime (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when duplicate_object then null;
end;
$$;
