-- Radar Estratégico Empresarial
-- Estrutura inicial de autenticação, segregação de leads e versionamento.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'consultant');
create type public.lead_status as enum ('draft', 'in_progress', 'completed', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role public.app_role not null default 'consultant',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null,
  trade_name text,
  cnae text,
  city text,
  state char(2),
  tax_regime text,
  registration_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  status public.lead_status not null default 'draft',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_owner_user_id_idx on public.leads(owner_user_id);
create index leads_company_id_idx on public.leads(company_id);

create table public.strategic_assessments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  version integer not null check (version > 0),
  data jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2) not null default 0 check (confidence_score between 0 and 100),
  methodology_version text not null default 'v0.1',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (lead_id, version)
);

create index strategic_assessments_lead_id_idx on public.strategic_assessments(lead_id);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assessment_id uuid not null references public.strategic_assessments(id) on delete cascade,
  scenario_type text not null,
  name text not null,
  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  ruleset_version text,
  eligible boolean,
  eligibility_notes jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index scenarios_lead_id_idx on public.scenarios(lead_id);
create index scenarios_assessment_id_idx on public.scenarios(assessment_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assessment_id uuid not null references public.strategic_assessments(id) on delete restrict,
  version integer not null check (version > 0),
  report_type text not null default 'strategic_opinion',
  snapshot jsonb not null,
  storage_path text,
  file_hash text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (lead_id, version)
);

create index reports_lead_id_idx on public.reports(lead_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_lead_id_idx on public.audit_events(lead_id);
create index audit_events_actor_user_id_idx on public.audit_events(actor_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active = true
  );
$$;

create or replace function public.can_access_lead(target_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.leads
    where id = target_lead_id
      and owner_user_id = auth.uid()
      and archived = false
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;
alter table public.strategic_assessments enable row level security;
alter table public.scenarios enable row level security;
alter table public.reports enable row level security;
alter table public.audit_events enable row level security;

-- Profiles
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Companies
create policy "companies_select_accessible"
on public.companies for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.leads
    where leads.company_id = companies.id
      and leads.owner_user_id = auth.uid()
      and leads.archived = false
  )
);

create policy "companies_insert_authenticated"
on public.companies for insert
to authenticated
with check (auth.uid() is not null);

create policy "companies_update_accessible"
on public.companies for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.leads
    where leads.company_id = companies.id
      and leads.owner_user_id = auth.uid()
      and leads.archived = false
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.leads
    where leads.company_id = companies.id
      and leads.owner_user_id = auth.uid()
      and leads.archived = false
  )
);

-- Leads
create policy "leads_select_owner_or_admin"
on public.leads for select
to authenticated
using (public.is_admin() or owner_user_id = auth.uid());

create policy "leads_insert_own"
on public.leads for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy "leads_update_owner_or_admin"
on public.leads for update
to authenticated
using (public.is_admin() or owner_user_id = auth.uid())
with check (public.is_admin() or owner_user_id = auth.uid());

-- Strategic assessments
create policy "assessments_select_accessible"
on public.strategic_assessments for select
to authenticated
using (public.can_access_lead(lead_id));

create policy "assessments_insert_accessible"
on public.strategic_assessments for insert
to authenticated
with check (public.can_access_lead(lead_id) and created_by = auth.uid());

create policy "assessments_update_accessible"
on public.strategic_assessments for update
to authenticated
using (public.can_access_lead(lead_id))
with check (public.can_access_lead(lead_id));

-- Scenarios
create policy "scenarios_select_accessible"
on public.scenarios for select
to authenticated
using (public.can_access_lead(lead_id));

create policy "scenarios_insert_accessible"
on public.scenarios for insert
to authenticated
with check (public.can_access_lead(lead_id) and created_by = auth.uid());

create policy "scenarios_update_accessible"
on public.scenarios for update
to authenticated
using (public.can_access_lead(lead_id))
with check (public.can_access_lead(lead_id));

-- Reports
create policy "reports_select_accessible"
on public.reports for select
to authenticated
using (public.can_access_lead(lead_id));

create policy "reports_insert_accessible"
on public.reports for insert
to authenticated
with check (public.can_access_lead(lead_id) and created_by = auth.uid());

-- Audit events
create policy "audit_select_own_or_admin"
on public.audit_events for select
to authenticated
using (
  public.is_admin()
  or actor_user_id = auth.uid()
  or (lead_id is not null and public.can_access_lead(lead_id))
);

create policy "audit_insert_own"
on public.audit_events for insert
to authenticated
with check (actor_user_id = auth.uid());

-- Após o primeiro login do administrador, promover manualmente o perfil:
-- update public.profiles set role = 'admin' where email = 'SEU_EMAIL_GOOGLE';
