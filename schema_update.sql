-- Run this in Supabase SQL Editor (safe to run on existing DB)

-- Add new columns to profiles
alter table profiles add column if not exists salary_day integer default 1;
alter table profiles add column if not exists opening_balance numeric default 0;
alter table profiles add column if not exists savings_as_of date default current_date;

-- Add new columns to goals
alter table goals add column if not exists sort_order integer default 0;
alter table goals add column if not exists goal_type text default 'savings'; -- 'savings' | 'lifestyle'
alter table goals add column if not exists lifestyle_cap numeric default 0;
alter table goals add column if not exists lifestyle_balance numeric default 0;

-- Side hustle / irregular income table
create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  description text not null,
  amount numeric not null,
  date date default current_date,
  is_recurring boolean default false,
  recurrence text default null, -- 'bi-weekly' | 'monthly' | 'weekly'
  created_at timestamptz default now()
);

-- Add recurring flag to expenses
alter table expenses add column if not exists is_recurring boolean default false;
alter table expenses add column if not exists recurrence text default null;

-- Enable realtime on new table
alter publication supabase_realtime add table income_entries;
