alter table public.commitments
  add column if not exists desired_outcome text,
  add column if not exists estimated_minutes smallint,
  add column if not exists source text not null default 'manual',
  add column if not exists coach_revision integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.commitments
set
  desired_outcome = coalesce(desired_outcome, title),
  estimated_minutes = coalesce(estimated_minutes, 15)
where desired_outcome is null or estimated_minutes is null;

alter table public.commitments
  alter column desired_outcome set not null,
  alter column estimated_minutes set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commitments_estimated_minutes_check'
  ) then
    alter table public.commitments
      add constraint commitments_estimated_minutes_check
      check (estimated_minutes between 5 and 30);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'commitments_source_check'
  ) then
    alter table public.commitments
      add constraint commitments_source_check
      check (source in ('manual', 'coach', 'review'));
  end if;
end;
$$;

create index if not exists commitments_user_open_updated_idx
  on public.commitments (user_id, updated_at desc)
  where status = 'open';
