-- =====================================================
-- PlayHub: run this whole file in Supabase SQL Editor
-- =====================================================

-- 1. Profiles table: one row per user, stores progress
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  points int not null default 0,
  games_played int not null default 0,
  best_score int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Row Level Security
alter table public.profiles enable row level security;

-- Any logged-in user can read all profiles (needed for the sidebar)
create policy "Logged-in users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

-- A user can only change their own row
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Automatically create a profile when someone signs up
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