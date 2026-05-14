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
