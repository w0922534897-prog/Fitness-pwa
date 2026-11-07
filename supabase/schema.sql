-- Execute once in the project's SQL editor. No public credentials belong in this file.
create table if not exists public.fitflow_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint fitflow_document check (
    jsonb_typeof(data) = 'object'
    and data ?& array['version','history','plans','exercises','settings','cycle','cursor','due','events','active']
    and data->>'version' = '1'
    and jsonb_typeof(data->'history') = 'array'
    and jsonb_typeof(data->'plans') = 'array'
    and jsonb_typeof(data->'exercises') = 'array'
  )
);
alter table public.fitflow_workspaces enable row level security;
revoke all on public.fitflow_workspaces from anon, authenticated;
grant select on public.fitflow_workspaces to authenticated;
drop policy if exists fitflow_owner_read on public.fitflow_workspaces;
create policy fitflow_owner_read on public.fitflow_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

-- All writes use optimistic concurrency. A stale device receives 40001 and must reread.
create or replace function public.fitflow_save(expected_revision bigint, document jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  next_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or document is null
      or octet_length(document::text) > 16777216 then
    raise exception 'Invalid document' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.fitflow_workspaces(user_id,revision,data)
      values(owner_id,1,document) on conflict (user_id) do nothing returning revision into next_revision;
  else
    update public.fitflow_workspaces set data=document, revision=revision+1, updated_at=now()
      where user_id=owner_id and revision=expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Revision conflict' using errcode = '40001'; end if;
  return next_revision;
end;
$$;
revoke all on function public.fitflow_save(bigint,jsonb) from public, anon;
grant execute on function public.fitflow_save(bigint,jsonb) to authenticated;
