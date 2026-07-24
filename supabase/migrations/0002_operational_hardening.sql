create unique index if not exists journal_entries_user_client_id_idx
  on public.journal_entries (user_id, (metadata ->> 'client_entry_id'))
  where metadata ->> 'client_entry_id' is not null;
