-- Run this if you already created the tables from schema.sql
alter table public.projects add column if not exists gc_emails jsonb default '[]';
