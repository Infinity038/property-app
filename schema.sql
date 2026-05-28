-- Run this in Supabase SQL Editor

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_salary numeric default 0,
  pay_frequency text default 'Monthly',
  bonus numeric default 0,
  created_at timestamptz default now()
);

create table if not exists rental_income (
  id uuid primary key default gen_random_uuid(),
  total_monthly numeric default 0,
  updated_at timestamptz default now()
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  status text default 'Rented',
  rent_income numeric default 0,
  mortgage numeric default 0,
  insurance_tax numeric default 0,
  purchase_price numeric default 0,
  current_value numeric default 0,
  loan_balance numeric default 0,
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  category text not null,
  date date default current_date,
  receipt_url text,
  property_id uuid references properties(id),
  created_at timestamptz default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target numeric not null,
  saved numeric default 0,
  monthly_allocation numeric default 0,
  icon text default 'ti-target',
  color text default '#1D9E75',
  completed boolean default false,
  created_at timestamptz default now()
);

-- Seed default profiles
insert into profiles (name, monthly_salary, pay_frequency, bonus) values
  ('Jovannie Ducay', 0, 'Monthly', 0),
  ('Melody Ducay', 0, 'Monthly', 0)
on conflict do nothing;

-- Seed default rental income row
insert into rental_income (total_monthly) values (0)
on conflict do nothing;

-- Enable realtime
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table properties;
alter publication supabase_realtime add table rental_income;
