-- Run this once in Supabase SQL Editor

create table if not exists bot_journal (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  symbol text,
  stage text,
  status text,
  message text,
  payload jsonb
);

create table if not exists bot_scans (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  symbol text,
  bias text,
  has_setup boolean default false,
  setup jsonb,
  log jsonb
);

create table if not exists bot_trades (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  symbol text,
  symbol_name text,
  side text,
  entry double precision,
  sl double precision,
  tp double precision,
  rr double precision,
  stake double precision,
  status text,
  contract_id text,
  score int,
  note text
);

create index if not exists bot_journal_at_idx on bot_journal (at desc);
create index if not exists bot_scans_at_idx on bot_scans (at desc);
create index if not exists bot_trades_status_idx on bot_trades (status);
create index if not exists bot_trades_at_idx on bot_trades (at desc);

-- Allow anon key to read/write (demo). Tighten RLS for production.
alter table bot_journal enable row level security;
alter table bot_scans enable row level security;
alter table bot_trades enable row level security;

create policy "anon all journal" on bot_journal for all using (true) with check (true);
create policy "anon all scans" on bot_scans for all using (true) with check (true);
create policy "anon all trades" on bot_trades for all using (true) with check (true);
