-- Initial schema for the subscription tracker.
-- Money: integer minor units (bigint). Currency: ISO 4217 code (3 uppercase letters).
-- next_renewal / paid_on / renewal_date are calendar dates (no time zone); timestamps are timestamptz (UTC).
-- Every user table has user_id + RLS. Shared reference data (exchange_rates) is read-only for users.


-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  home_currency char(3) not null default 'PHP' check (home_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id) -- lets child tables enforce same-owner via composite FK
);

-- ---------------------------------------------------------- payment_methods
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ----------------------------------------------------------- subscriptions
-- ON DELETE RESTRICT on category / payment method: nothing can be orphaned.
-- Use public.delete_category / public.delete_payment_method to reassign + delete.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  cycle text not null check (cycle in ('weekly', 'monthly', 'yearly', 'custom')),
  -- For weekly/monthly/yearly this is the multiplier (e.g. every 2 months).
  -- For 'custom' it is the number of days between renewals.
  interval_count integer not null default 1 check (interval_count between 1 and 3650),
  next_renewal date not null,
  -- Original day-of-month, so Jan 31 -> Feb 28 -> Mar 31 does not drift to the 28th.
  anchor_day integer check (anchor_day between 1 and 31),
  category_id uuid not null,
  payment_method_id uuid not null,
  status text not null default 'active' check (status in ('active', 'trial', 'paused', 'cancelled')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete restrict
);
create index subscriptions_user_renewal_idx on public.subscriptions (user_id, next_renewal);
create index subscriptions_renewal_idx on public.subscriptions (next_renewal) where status in ('active', 'trial');

-- ---------------------------------------------------------------- payments
-- One row per (subscription, renewal date). The unique key makes the daily roll-forward idempotent.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  paid_on date not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (subscription_id, paid_on)
);
create index payments_user_idx on public.payments (user_id, paid_on desc);

-- --------------------------------------------------------------- reminders
-- Per-user reminder settings: one row per enabled "days before renewal" value.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  days_before integer not null check (days_before in (1, 3, 7)),
  created_at timestamptz not null default now(),
  unique (user_id, days_before)
);

-- ------------------------------------------------------------ reminder_log
-- The unique key is the idempotency guarantee: a reminder is claimed by inserting here first.
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  renewal_date date not null,
  days_before integer not null check (days_before in (1, 3, 7)),
  driver text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, renewal_date, days_before)
);
create index reminder_log_user_idx on public.reminder_log (user_id, created_at desc);

-- ---------------------------------------------------------- exchange_rates
-- Shared cache, not per-user. rate = units of `currency` per 1 unit of `base_currency`.
-- The last stored rate is kept (upsert), so it can be used as a stale fallback.
create table public.exchange_rates (
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  rate numeric not null check (rate > 0),
  rate_date date not null,
  fetched_at timestamptz not null default now(),
  primary key (base_currency, currency)
);

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.payment_methods enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_log enable row level security;
alter table public.exchange_rates enable row level security;

-- profiles: id is the owner key
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- insert is done by the signup trigger; delete cascades from auth.users.

-- categories / payment_methods / subscriptions / reminders: full CRUD on own rows
create policy categories_all on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy payment_methods_all on public.payment_methods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy subscriptions_all on public.subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reminders_all on public.reminders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- payments / reminder_log: users read their own; only the service role (cron) writes.
create policy payments_select on public.payments for select to authenticated using (user_id = (select auth.uid()));
create policy reminder_log_select on public.reminder_log for select to authenticated using (user_id = (select auth.uid()));

-- exchange_rates: any signed-in user can read; only the service role writes.
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (true);

-- ------------------------------------------------------------ new-user setup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, name)
  select new.id, n from unnest(array[
    'Entertainment', 'Music', 'Software', 'Cloud & Storage', 'Utilities',
    'Health & Fitness', 'News & Reading', 'Education', 'Other'
  ]) as n;

  insert into public.payment_methods (user_id, name)
  select new.id, n from unnest(array['Credit card', 'Debit card', 'E-wallet', 'Bank transfer', 'Other']) as n;

  insert into public.reminders (user_id, days_before) values (new.id, 1), (new.id, 3), (new.id, 7);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------- reassign-then-delete RPCs
-- SECURITY INVOKER: RLS applies, so a user can only touch their own rows.
create or replace function public.delete_category(p_id uuid, p_reassign_to uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_id = p_reassign_to then
    raise exception 'Choose a different category to reassign to';
  end if;
  if not exists (select 1 from public.categories where id = p_reassign_to) then
    raise exception 'Reassignment category not found';
  end if;
  update public.subscriptions set category_id = p_reassign_to, updated_at = now() where category_id = p_id;
  delete from public.categories where id = p_id;
end;
$$;

create or replace function public.delete_payment_method(p_id uuid, p_reassign_to uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_id = p_reassign_to then
    raise exception 'Choose a different payment method to reassign to';
  end if;
  if not exists (select 1 from public.payment_methods where id = p_reassign_to) then
    raise exception 'Reassignment payment method not found';
  end if;
  update public.subscriptions set payment_method_id = p_reassign_to, updated_at = now() where payment_method_id = p_id;
  delete from public.payment_methods where id = p_id;
end;
$$;

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Lock down function execution: only signed-in users may call the RPCs.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.delete_category(uuid, uuid) from public, anon;
revoke execute on function public.delete_payment_method(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
grant execute on function public.delete_payment_method(uuid, uuid) to authenticated;
