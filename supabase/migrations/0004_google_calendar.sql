create type public.calendar_connection_status as enum (
  'active',
  'reconnect_required',
  'disconnected'
);

create type public.calendar_proposal_action as enum ('create', 'update');

create type public.calendar_proposal_status as enum (
  'pending_confirmation',
  'executing',
  'applied',
  'cancelled',
  'expired',
  'stale',
  'failed'
);

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_subject text not null,
  google_email text not null,
  display_name text,
  status public.calendar_connection_status not null default 'active',
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_connected_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (google_subject, user_id)
);

create table public.calendar_credentials (
  connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  google_calendar_id text not null,
  summary text not null,
  timezone text,
  access_role text not null,
  primary_calendar boolean not null default false,
  selected boolean not null default false,
  write_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, google_calendar_id)
);

create table public.calendar_oauth_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  pkce_verifier text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.calendar_action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  source_entry_id uuid references public.journal_entries(id) on delete set null,
  action public.calendar_proposal_action not null,
  status public.calendar_proposal_status not null default 'pending_confirmation',
  version integer not null default 1,
  target_calendar_id text not null,
  target_calendar_summary text not null,
  google_event_id text,
  event_etag text,
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  event_timezone text not null,
  location text,
  rationale text not null default '',
  before_snapshot jsonb,
  conflict_snapshot jsonb not null default '[]'::jsonb,
  risk_flags text[] not null default '{}',
  idempotency_key uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  confirmed_at timestamptz,
  executed_at timestamptz,
  last_error_code text,
  google_event_html_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (user_id, idempotency_key)
);

create table public.calendar_action_executions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.calendar_action_proposals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('started', 'applied', 'failed', 'stale')),
  attempt integer not null default 1,
  google_event_id text,
  error_code text,
  provider_request_id text,
  created_at timestamptz not null default now()
);

create index calendar_sources_user_selected_idx
  on public.calendar_sources(user_id, selected);
create index calendar_proposals_user_status_idx
  on public.calendar_action_proposals(user_id, status, created_at desc);
create index calendar_oauth_expiry_idx
  on public.calendar_oauth_transactions(expires_at);

create trigger calendar_connections_touch_updated_at
before update on public.calendar_connections
for each row execute function public.touch_updated_at();

create trigger calendar_sources_touch_updated_at
before update on public.calendar_sources
for each row execute function public.touch_updated_at();

create trigger calendar_proposals_touch_updated_at
before update on public.calendar_action_proposals
for each row execute function public.touch_updated_at();

alter table public.calendar_connections enable row level security;
alter table public.calendar_credentials enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.calendar_oauth_transactions enable row level security;
alter table public.calendar_action_proposals enable row level security;
alter table public.calendar_action_executions enable row level security;

create policy "Users can read their calendar connection"
on public.calendar_connections for select
using (auth.uid() = user_id);

create policy "Users can read their calendar sources"
on public.calendar_sources for select
using (auth.uid() = user_id);

create policy "Users can read their calendar proposals"
on public.calendar_action_proposals for select
using (auth.uid() = user_id);

create policy "Users can read their calendar executions"
on public.calendar_action_executions for select
using (auth.uid() = user_id);

grant select on public.calendar_connections to authenticated;
grant select on public.calendar_sources to authenticated;
grant select on public.calendar_action_proposals to authenticated;
grant select on public.calendar_action_executions to authenticated;

revoke all on public.calendar_credentials from anon, authenticated;
revoke all on public.calendar_oauth_transactions from anon, authenticated;
revoke insert, update, delete on public.calendar_connections from authenticated;
revoke insert, update, delete on public.calendar_sources from authenticated;
revoke insert, update, delete on public.calendar_action_proposals from authenticated;
revoke insert, update, delete on public.calendar_action_executions from authenticated;
