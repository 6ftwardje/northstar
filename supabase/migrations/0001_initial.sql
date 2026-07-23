create extension if not exists pgcrypto;
create extension if not exists vector;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.memory_kind as enum (
  'fact',
  'preference',
  'goal',
  'commitment',
  'pattern',
  'relationship',
  'project'
);

create type public.memory_status as enum (
  'candidate',
  'active',
  'superseded',
  'archived'
);

create type public.entry_kind as enum (
  'text',
  'voice',
  'evening_review',
  'coach_message'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Brussels',
  evening_check_in_time time not null default '21:00',
  coach_settings jsonb not null default jsonb_build_object(
    'language', 'nl',
    'directness', 0.85,
    'warmth', 0.7,
    'proactivity', 0.85
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.entry_kind not null default 'text',
  content text not null check (char_length(content) > 0),
  transcript text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_entries_user_occurred_idx
  on public.journal_entries (user_id, occurred_at desc);

create table public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_date date not null,
  status text not null default 'open'
    check (status in ('open', 'expected', 'completed', 'missed')),
  impact_summary text,
  coach_summary text,
  energy smallint check (energy between 1 and 10),
  mood smallint check (mood between 1 and 10),
  focus smallint check (focus between 1 and 10),
  satisfaction smallint check (satisfaction between 1 and 10),
  movement boolean,
  cannabis_used boolean,
  sleep_intention text,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  domain text not null check (domain in ('business', 'health', 'relationships', 'life')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  target jsonb not null default '{}'::jsonb,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  source_entry_id uuid references public.journal_entries(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'done', 'missed', 'cancelled')),
  impact_domain text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commitments_user_status_due_idx
  on public.commitments (user_id, status, due_at);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.memory_kind not null,
  status public.memory_status not null default 'candidate',
  title text not null,
  content text not null,
  confidence numeric(4, 3) not null default 0.5
    check (confidence between 0 and 1),
  importance numeric(4, 3) not null default 0.5
    check (importance between 0 and 1),
  evidence_count integer not null default 1 check (evidence_count >= 0),
  explicit boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  last_confirmed_at timestamptz,
  superseded_by uuid references public.memories(id) on delete set null,
  tags text[] not null default '{}',
  embedding vector,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memories_user_status_kind_idx
  on public.memories (user_id, status, kind);

create index memories_tags_idx
  on public.memories using gin (tags);

create table public.memory_sources (
  memory_id uuid not null references public.memories(id) on delete cascade,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  evidence_excerpt text,
  created_at timestamptz not null default now(),
  primary key (memory_id, entry_id)
);

create table public.context_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid references public.journal_entries(id) on delete set null,
  memory_ids uuid[] not null default '{}',
  commitment_ids uuid[] not null default '{}',
  context_manifest jsonb not null,
  model text,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

create index context_runs_user_created_idx
  on public.context_runs (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.journal_entries enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.goals enable row level security;
alter table public.commitments enable row level security;
alter table public.memories enable row level security;
alter table public.memory_sources enable row level security;
alter table public.context_runs enable row level security;

create policy "Users manage their own profile"
  on public.profiles for all
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users manage their own entries"
  on public.journal_entries for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own daily reviews"
  on public.daily_reviews for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own goals"
  on public.goals for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own commitments"
  on public.commitments for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own memories"
  on public.memories for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage sources for their own memories"
  on public.memory_sources for all
  to authenticated
  using (
    exists (
      select 1
      from public.memories memory
      where memory.id = memory_id
        and memory.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.memories memory
      where memory.id = memory_id
        and memory.user_id = (select auth.uid())
    )
  );

create policy "Users read their own context runs"
  on public.context_runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger entries_touch_updated_at
  before update on public.journal_entries
  for each row execute function public.touch_updated_at();

create trigger daily_reviews_touch_updated_at
  before update on public.daily_reviews
  for each row execute function public.touch_updated_at();

create trigger goals_touch_updated_at
  before update on public.goals
  for each row execute function public.touch_updated_at();

create trigger commitments_touch_updated_at
  before update on public.commitments
  for each row execute function public.touch_updated_at();

create trigger memories_touch_updated_at
  before update on public.memories
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete
  on public.profiles,
     public.journal_entries,
     public.daily_reviews,
     public.goals,
     public.commitments,
     public.memories,
     public.memory_sources
  to authenticated;

grant select on public.context_runs to authenticated;
