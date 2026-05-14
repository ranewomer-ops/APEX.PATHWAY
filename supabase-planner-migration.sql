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
