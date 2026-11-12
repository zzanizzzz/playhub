-- =====================================================
-- PlayHub database setup. Run the whole file in the Supabase SQL Editor.
-- Safe to run again.
-- =====================================================

-- 1. Profiles: one row per user, with their totals
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  points int not null default 0,
  games_played int not null default 0,
  best_score int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Rounds: one row per round, with its history
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'started'
    check (status in ('started', 'finished', 'rejected')),
  score int,
  duration_seconds numeric,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists rounds_user_history_idx
  on public.rounds (user_id, finished_at desc);

-- 3. Row Level Security: nothing is visible unless a policy allows it
alter table public.profiles enable row level security;
alter table public.rounds enable row level security;

drop policy if exists "Logged-in users can view all profiles" on public.profiles;
create policy "Logged-in users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Logged-in users can view rounds" on public.rounds;
create policy "Logged-in users can view rounds"
  on public.rounds for select
  to authenticated
  using (true);

-- Rounds are written only by the backend (service key), so there are no
-- insert or update policies for browsers. Browsers can't fake scores directly.

-- 4. Create a profile automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();