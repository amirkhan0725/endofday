-- Migration: add GC report acknowledgment tracking
-- Run this in the Supabase SQL editor if you've already run schema.sql

create table if not exists public.report_acknowledgments (
  id             uuid        default gen_random_uuid() primary key,
  report_id      text        not null,
  acknowledged_by   text     not null,
  acknowledged_email text,
  acknowledged_at   timestamptz default now() not null
);

-- Index for fast lookups by report
create index if not exists idx_report_ack_report_id on public.report_acknowledgments(report_id);

-- Public read: anyone with the project feed URL can see acknowledgments
-- Public insert: GCs can acknowledge without logging in (report_id acts as an access token)
alter table public.report_acknowledgments enable row level security;
create policy "public read" on public.report_acknowledgments for select using (true);
create policy "public insert" on public.report_acknowledgments for insert with check (true);
