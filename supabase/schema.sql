-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists public.projects (
  id                  text primary key,
  user_id             uuid references auth.users(id) on delete cascade not null,
  name                text not null,
  address             text default '',
  client_name         text default '',
  gc_name             text default '',
  superintendent_name text default '',
  template            text default 'standard',
  sample_report_text  text,
  gc_emails           jsonb default '[]',
  created_at          timestamptz default now()
);

create table if not exists public.reports (
  id                text primary key,
  project_id        text not null,
  user_id           uuid references auth.users(id) on delete cascade not null,
  project_name      text not null,
  date              text not null,
  raw_input         text default '',
  crew_count        integer default 0,
  weather_condition text default '',
  temperature       text default '',
  sections          jsonb not null default '{}',
  status            text default 'draft',
  subs              jsonb default '[]',
  visitors          jsonb default '[]',
  template          text,
  created_at        timestamptz default now()
);

alter table public.projects enable row level security;
alter table public.reports  enable row level security;

create policy "Users own their projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users own their reports" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
