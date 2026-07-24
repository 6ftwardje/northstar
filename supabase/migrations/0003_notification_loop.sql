create type public.notification_action_kind as enum (
  'morning_impact',
  'evening_review',
  'evening_followup',
  'commitment',
  'weekly_review',
  'test'
);

create type public.notification_action_status as enum (
  'pending',
  'processing',
  'sent',
  'skipped',
  'failed',
  'cancelled'
);

create type public.notification_delivery_status as enum (
  'sent',
  'failed',
  'expired'
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null default 'Europe/Brussels',
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  morning_enabled boolean not null default true,
  morning_time time not null default '08:30',
  evening_enabled boolean not null default true,
  evening_time time not null default '21:00',
  evening_followup_enabled boolean not null default true,
  evening_followup_minutes smallint not null default 45
    check (evening_followup_minutes between 10 and 180),
  weekly_enabled boolean not null default true,
  weekly_day smallint not null default 0 check (weekly_day between 0 and 6),
  weekly_time time not null default '19:00',
  private_lock_screen boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, revoked_at);

create table public.scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_action_kind not null,
  status public.notification_action_status not null default 'pending',
  due_at timestamptz not null,
  title text not null,
  body text not null,
  deep_link text not null default '/',
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index scheduled_actions_due_idx
  on public.scheduled_actions (status, due_at)
  where status in ('pending', 'processing');

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.scheduled_actions(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  channel text not null check (channel in ('push', 'email')),
  status public.notification_delivery_status not null,
  attempt smallint not null default 1 check (attempt > 0),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  unique (action_id, subscription_id, channel, attempt)
);

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.scheduled_actions enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "Users manage their own notification preferences"
  on public.notification_preferences for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read their own scheduled actions"
  on public.scheduled_actions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own notification deliveries"
  on public.notification_deliveries for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_actions action
      where action.id = action_id
        and action.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete
  on public.notification_preferences,
     public.push_subscriptions
  to authenticated;

grant select
  on public.scheduled_actions,
     public.notification_deliveries
  to authenticated;

create trigger notification_preferences_touch_updated_at
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

create trigger push_subscriptions_touch_updated_at
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

create trigger scheduled_actions_touch_updated_at
  before update on public.scheduled_actions
  for each row execute function public.touch_updated_at();

insert into public.notification_preferences (user_id, timezone, evening_time)
select id, timezone, evening_check_in_time
from public.profiles
on conflict (user_id) do nothing;

create or replace function private.handle_new_notification_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.notification_preferences (
    user_id,
    timezone,
    evening_time
  )
  values (
    new.id,
    new.timezone,
    new.evening_check_in_time
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_profile_created_create_notification_preferences
  after insert on public.profiles
  for each row execute function private.handle_new_notification_profile();

create or replace function public.claim_due_notification_actions(
  batch_size integer default 25
)
returns setof public.scheduled_actions
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.scheduled_actions
  set
    status = 'processing',
    processing_started_at = now(),
    attempt_count = attempt_count + 1,
    updated_at = now()
  where id in (
    select id
    from public.scheduled_actions
    where
      (
        status = 'pending'
        and due_at <= now()
      )
      or (
        status = 'processing'
        and processing_started_at < now() - interval '10 minutes'
      )
    order by due_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  returning *;
end;
$$;

revoke all on function public.claim_due_notification_actions(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_notification_actions(integer)
  to service_role;
