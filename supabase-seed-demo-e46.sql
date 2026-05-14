-- Optional: run AFTER you create the Auth user (Dashboard > Authentication > Users > Add user)
-- Email must be: e46_client@apex-pathway.local
-- Password: turbo123
--
-- This file mirrors tools/seed-demo-e46.ps1 for teams who prefer SQL Editor only.
-- Prefer the PowerShell seed script when possible (it creates the Auth user for you).

begin;

do $$
declare
  v_user uuid;
  v_build uuid;
begin
  select id into v_user from auth.users where email = 'e46_client@apex-pathway.local' limit 1;
  if v_user is null then
    raise exception 'Create auth user e46_client@apex-pathway.local first (Authentication > Users).';
  end if;

  insert into public.users (id, username, password_reference)
  values (v_user, 'e46_client', 'supabase_auth')
  on conflict (id) do update
    set username = excluded.username,
        password_reference = excluded.password_reference;

  delete from public.builds
  where user_id = v_user
    and name = 'E46 Street/Track Turbo';

  insert into public.builds (
    user_id,
    name,
    car_model,
    status,
    customer_brief,
    package_name,
    stock_hp,
    estimated_hp_low,
    estimated_hp_high,
    estimated_gain_low,
    estimated_gain_high,
    estimated_time_weeks,
    plan_notes,
    plan_milestones
  )
  values (
    v_user,
    'E46 Street/Track Turbo',
    'BMW E46 330i',
    'active',
    'Customer wants a reliable daily-drivable turbo setup with aggressive performance.',
    'Street / Track',
    228,
    418,
    422,
    190,
    194,
    '6-8 weeks',
    'Target ~420 hp with a reliable, daily-drivable turbo path: fueling, cooling, tuning, and validation time included.',
    '[
      {"label":"Milestone 1","title":"Vehicle received","detail":"Vehicle received and logged into the shop queue."},
      {"label":"Milestone 2","title":"Inspection completed","detail":"Health check, baseline logs, and build scope confirmed."},
      {"label":"Milestone 3","title":"Suspension installed","detail":"Coilovers installed and corner-balanced."},
      {"label":"Milestone 4","title":"Turbo parts ordered","detail":"Turbo hardware and supporting components ordered."}
    ]'::jsonb
  )
  returning id into v_build;

  insert into public.parts (build_id, name, category, price, status) values
    (v_build, 'Cold air intake', 'Intake', 675, 'installed'),
    (v_build, 'Long tube headers', 'Exhaust', 675, 'installed'),
    (v_build, 'Coilovers', 'Suspension', 675, 'installed'),
    (v_build, 'Stage 2 clutch', 'Drivetrain', 675, 'installed'),
    (v_build, 'Turbo installation', 'Forced induction', 1100, 'planned'),
    (v_build, 'Dyno tuning', 'Tuning', 1100, 'planned'),
    (v_build, 'Fuel system upgrade', 'Fuel system', 1100, 'planned');

  insert into public.timeline_events (build_id, event_type, message, created_at) values
    (v_build, 'Shop milestone', 'Vehicle received.', (now() at time zone 'utc') + interval '10 minutes'),
    (v_build, 'Shop milestone', 'Inspection completed.', (now() at time zone 'utc') + interval '11 minutes'),
    (v_build, 'Shop milestone', 'Suspension installed.', (now() at time zone 'utc') + interval '12 minutes'),
    (v_build, 'Shop milestone', 'Turbo parts ordered.', (now() at time zone 'utc') + interval '13 minutes');
end $$;

commit;
