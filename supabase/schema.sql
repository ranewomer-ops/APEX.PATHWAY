-- Apex Pathway — full database schema (core + planner templates).
-- Run this entire file once in the Supabase SQL Editor on a new project.
-- Source: merged supabase-schema.sql + supabase-planner-migration.sql

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  password_reference text not null default 'supabase_auth',
  created_at timestamptz not null default now()
);

create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  car_model text not null,
  budget_total numeric(12,2) not null default 0,
  status text not null default 'planning' check (status in ('planning', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  category text not null default 'General',
  status text not null default 'planned' check (status in ('planned', 'ordered', 'installed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds(id) on delete cascade,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_items (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds(id) on delete cascade,
  item text not null,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  interval_km integer check (interval_km is null or interval_km >= 0),
  interval_months integer check (interval_months is null or interval_months >= 0),
  last_done_date date,
  next_due_date date,
  status text not null default 'up_to_date' check (status in ('up_to_date', 'due', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_history (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds(id) on delete cascade,
  maintenance_item_id uuid references public.maintenance_items(id) on delete set null,
  item text not null,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  done_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_builds_user_id on public.builds(user_id);
create index if not exists idx_parts_build_id on public.parts(build_id);
create index if not exists idx_timeline_build_id on public.timeline_events(build_id);
create index if not exists idx_maintenance_items_build_id on public.maintenance_items(build_id);
create index if not exists idx_maintenance_history_build_id on public.maintenance_history(build_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_builds_updated_at on public.builds;
create trigger touch_builds_updated_at
before update on public.builds
for each row execute function public.touch_updated_at();

drop trigger if exists touch_parts_updated_at on public.parts;
create trigger touch_parts_updated_at
before update on public.parts
for each row execute function public.touch_updated_at();

drop trigger if exists touch_maintenance_updated_at on public.maintenance_items;
create trigger touch_maintenance_updated_at
before update on public.maintenance_items
for each row execute function public.touch_updated_at();

create or replace function public.refresh_build_budget(p_build_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.builds
  set budget_total = coalesce((
    select sum(price)
    from public.parts
    where build_id = p_build_id
  ), 0)
  where id = p_build_id;
end;
$$;

create or replace function public.parts_budget_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.build_id is distinct from new.build_id then
    perform public.refresh_build_budget(old.build_id);
    perform public.refresh_build_budget(new.build_id);
    return new;
  end if;

  perform public.refresh_build_budget(coalesce(new.build_id, old.build_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists parts_refresh_budget on public.parts;
create trigger parts_refresh_budget
after insert or update or delete on public.parts
for each row execute function public.parts_budget_trigger();

create or replace function public.part_status_timeline_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  phase_label text;
begin
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  phase_label := case new.status
    when 'planned' then 'Planning phase'
    when 'ordered' then 'Parts Ordered phase'
    when 'installed' then 'Installation phase'
    when 'completed' then 'Build Completed'
    else 'Build update'
  end;

  insert into public.timeline_events (build_id, event_type, message)
  values (
    new.build_id,
    phase_label,
    new.name || ' moved to ' || phase_label || '.'
  );

  return new;
end;
$$;

drop trigger if exists parts_generate_timeline on public.parts;
create trigger parts_generate_timeline
after insert or update of status on public.parts
for each row execute function public.part_status_timeline_trigger();

create or replace function public.set_maintenance_status()
returns trigger
language plpgsql
as $$
begin
  if new.next_due_date is null then
    new.status = 'up_to_date';
  elsif new.next_due_date < current_date then
    new.status = 'overdue';
  elsif new.next_due_date <= current_date + 14 then
    new.status = 'due';
  else
    new.status = 'up_to_date';
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_set_status on public.maintenance_items;
create trigger maintenance_set_status
before insert or update on public.maintenance_items
for each row execute function public.set_maintenance_status();

create or replace function public.complete_maintenance_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  computed_next_due date;
begin
  select mi.*, b.user_id
  into target
  from public.maintenance_items mi
  join public.builds b on b.id = mi.build_id
  where mi.id = p_item_id
    and b.user_id = auth.uid();

  if not found then
    raise exception 'Maintenance item not found';
  end if;

  insert into public.maintenance_history (
    build_id,
    maintenance_item_id,
    item,
    cost,
    done_date
  )
  values (
    target.build_id,
    target.id,
    target.item,
    target.cost,
    current_date
  );

  computed_next_due := case
    when target.interval_months is not null and target.interval_months > 0
      then current_date + make_interval(months => target.interval_months)
    else target.next_due_date
  end;

  update public.maintenance_items
  set last_done_date = current_date,
      next_due_date = computed_next_due
  where id = target.id;
end;
$$;

alter table public.users enable row level security;
alter table public.builds enable row level security;
alter table public.parts enable row level security;
alter table public.timeline_events enable row level security;
alter table public.maintenance_items enable row level security;
alter table public.maintenance_history enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
on public.users for select
using (id = auth.uid());

drop policy if exists "builds_all_own" on public.builds;
create policy "builds_all_own"
on public.builds for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "parts_all_own_build" on public.parts;
create policy "parts_all_own_build"
on public.parts for all
using (
  exists (
    select 1 from public.builds
    where builds.id = parts.build_id
      and builds.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.builds
    where builds.id = parts.build_id
      and builds.user_id = auth.uid()
  )
);

drop policy if exists "timeline_select_own_build" on public.timeline_events;
create policy "timeline_select_own_build"
on public.timeline_events for select
using (
  exists (
    select 1 from public.builds
    where builds.id = timeline_events.build_id
      and builds.user_id = auth.uid()
  )
);

drop policy if exists "maintenance_items_all_own_build" on public.maintenance_items;
create policy "maintenance_items_all_own_build"
on public.maintenance_items for all
using (
  exists (
    select 1 from public.builds
    where builds.id = maintenance_items.build_id
      and builds.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.builds
    where builds.id = maintenance_items.build_id
      and builds.user_id = auth.uid()
  )
);

drop policy if exists "maintenance_history_select_own_build" on public.maintenance_history;
create policy "maintenance_history_select_own_build"
on public.maintenance_history for select
using (
  exists (
    select 1 from public.builds
    where builds.id = maintenance_history.build_id
      and builds.user_id = auth.uid()
  )
);

do $$
declare
  t text;
  tables text[] := array['builds', 'parts', 'timeline_events', 'maintenance_items', 'maintenance_history'];
begin
  foreach t in array tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- --- Planner extension (templates) ---

alter table public.builds
  add column if not exists customer_brief text,
  add column if not exists package_name text,
  add column if not exists stock_hp integer,
  add column if not exists estimated_hp_low integer,
  add column if not exists estimated_hp_high integer,
  add column if not exists estimated_gain_low integer,
  add column if not exists estimated_gain_high integer,
  add column if not exists estimated_time_weeks text,
  add column if not exists plan_notes text,
  add column if not exists plan_milestones jsonb not null default '[]'::jsonb;

create table if not exists public.build_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  package_name text not null,
  car_model text not null,
  customer_summary text not null,
  stock_hp integer not null,
  estimated_hp_low integer not null,
  estimated_hp_high integer not null,
  estimated_gain_low integer not null,
  estimated_gain_high integer not null,
  estimated_time_weeks text not null,
  plan_notes text not null,
  match_keywords text[] not null default '{}',
  milestones jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.template_parts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_templates(id) on delete cascade,
  name text not null,
  category text not null default 'General',
  price numeric(12,2) not null default 0 check (price >= 0),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.build_templates enable row level security;
alter table public.template_parts enable row level security;

drop policy if exists "templates_select_authenticated" on public.build_templates;
create policy "templates_select_authenticated"
on public.build_templates for select
using (auth.role() = 'authenticated');

drop policy if exists "template_parts_select_authenticated" on public.template_parts;
create policy "template_parts_select_authenticated"
on public.template_parts for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.build_templates
    where build_templates.id = template_parts.template_id
      and build_templates.is_active = true
  )
);

insert into public.build_templates (
  id,
  slug,
  package_name,
  car_model,
  customer_summary,
  stock_hp,
  estimated_hp_low,
  estimated_hp_high,
  estimated_gain_low,
  estimated_gain_high,
  estimated_time_weeks,
  plan_notes,
  match_keywords,
  milestones,
  is_active
)
values (
  '11111111-1111-4111-8111-111111111111',
  'bmw-m340i-b58-stage-2',
  'BMW M340i B58 Stage 2 Power Package',
  'BMW M340i / G20 B58',
  'For a customer who wants an M340i to make stronger turbo power with a Stage 2 tune, supporting hardware, cooling, and reliability checks.',
  382,
  470,
  520,
  88,
  138,
  '3-5 weeks',
  'This plan assumes a healthy B58, quality fuel, conservative calibration, datalog review, and no drivetrain faults. Hybrid turbo work is listed as optional because it usually moves the car beyond normal Stage 2 scope.',
  array['bmw','m340i','b58','stage 2','stage2','turbo','tune','downpipe','more power','upgrade'],
  '[
    {"label":"Week 1","title":"Inspection and baseline","detail":"Compression/health scan, stock logs, fuel quality check, and parts confirmation."},
    {"label":"Week 1-2","title":"Hardware install","detail":"Downpipe, charge pipe, intake, plugs, and cooling support."},
    {"label":"Week 2-3","title":"Calibration","detail":"Stage 2 ECU tune, transmission tune, dyno or road datalogging."},
    {"label":"Week 3-5","title":"Validation","detail":"Heat soak checks, boost leak check, customer handoff, and optional hybrid turbo decision."}
  ]'::jsonb,
  true
)
on conflict (slug) do update
set package_name = excluded.package_name,
    car_model = excluded.car_model,
    customer_summary = excluded.customer_summary,
    stock_hp = excluded.stock_hp,
    estimated_hp_low = excluded.estimated_hp_low,
    estimated_hp_high = excluded.estimated_hp_high,
    estimated_gain_low = excluded.estimated_gain_low,
    estimated_gain_high = excluded.estimated_gain_high,
    estimated_time_weeks = excluded.estimated_time_weeks,
    plan_notes = excluded.plan_notes,
    match_keywords = excluded.match_keywords,
    milestones = excluded.milestones,
    is_active = excluded.is_active;

delete from public.template_parts
where template_id = '11111111-1111-4111-8111-111111111111';

insert into public.template_parts (template_id, name, category, price, sort_order, notes)
values
  ('11111111-1111-4111-8111-111111111111', 'Pre-build inspection and diagnostic scan', 'Inspection', 180, 10, 'Health scan, smoke test, baseline logs, and fault review before modifications.'),
  ('11111111-1111-4111-8111-111111111111', 'High-flow catted downpipe', 'Exhaust', 950, 20, 'Stage 2 power requires reduced exhaust restriction. Confirm emissions rules locally.'),
  ('11111111-1111-4111-8111-111111111111', 'Stage 2 ECU calibration', 'Tuning', 850, 30, 'Calibrated for the selected fuel and hardware. Includes datalog revisions.'),
  ('11111111-1111-4111-8111-111111111111', 'xHP transmission tune', 'Drivetrain', 450, 40, 'Improves shift strategy and torque handling for the ZF8.'),
  ('11111111-1111-4111-8111-111111111111', 'Upgraded charge pipe', 'Intake', 320, 50, 'Reduces failure risk under higher boost.'),
  ('11111111-1111-4111-8111-111111111111', 'High-flow intake or panel filter', 'Intake', 420, 60, 'Supports airflow and improves serviceability.'),
  ('11111111-1111-4111-8111-111111111111', 'Upgraded heat exchanger / cooling support', 'Cooling', 900, 70, 'Recommended for repeated pulls and hot climate reliability.'),
  ('11111111-1111-4111-8111-111111111111', 'One-step-colder spark plugs', 'Ignition', 180, 80, 'Gap plugs to tuner recommendation before calibration.'),
  ('11111111-1111-4111-8111-111111111111', 'Ignition coils inspection / replacement allowance', 'Ignition', 280, 90, 'Replace only if age, misfires, or logs justify it.'),
  ('11111111-1111-4111-8111-111111111111', 'Dyno session and datalog validation', 'Validation', 500, 100, 'Power verification, AFR/knock/boost review, and final customer report.'),
  ('11111111-1111-4111-8111-111111111111', 'Optional upgraded HPFP for ethanol blend', 'Fuel System', 950, 110, 'Only needed for ethanol blends or Stage 2+ targets.'),
  ('11111111-1111-4111-8111-111111111111', 'Optional hybrid turbo upgrade path', 'Turbo Upgrade', 3200, 120, 'Moves beyond normal Stage 2. Requires deeper fueling, cooling, and tuning review.');
