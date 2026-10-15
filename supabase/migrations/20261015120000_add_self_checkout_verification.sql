create table if not exists public.self_checkout_challenges (
  id uuid primary key,
  owner_id uuid not null references public.workspaces (owner_id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 6),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists self_checkout_challenges_guest_created_idx
  on public.self_checkout_challenges (guest_id, created_at desc);

alter table public.self_checkout_challenges enable row level security;

create or replace function public.create_self_checkout_challenge(
  reception_token uuid,
  visitor_email text,
  challenge_id uuid,
  verification_hash text
)
returns table(created_challenge_id uuid, visitor_name text, send_code boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_owner_id uuid;
  matched_guest public.guests%rowtype;
  existing_challenge_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the server can request self-checkout codes.';
  end if;

  select w.owner_id into workspace_owner_id
  from public.workspaces as w
  where w.reception_token = $1;

  if workspace_owner_id is null then
    return;
  end if;

  select g.* into matched_guest
  from public.guests as g
  where g.owner_id = workspace_owner_id
    and lower(g.email) = lower(btrim(visitor_email))
    and g.status = 'checked_in'
  order by g.checked_in_at desc
  limit 1
  for update;

  if matched_guest.id is null then
    return;
  end if;

  if exists (
    select 1
    from public.self_checkout_challenges as existing
    where existing.guest_id = matched_guest.id
      and existing.created_at > now() - interval '1 minute'
  ) then
    select existing.id into existing_challenge_id
    from public.self_checkout_challenges as existing
    where existing.guest_id = matched_guest.id
      and existing.created_at > now() - interval '1 minute'
      and existing.expires_at > now()
      and existing.consumed_at is null
      and existing.attempts < 6
    order by existing.created_at desc
    limit 1;
    if existing_challenge_id is not null then
      return query select existing_challenge_id, matched_guest.name, false;
    end if;
    return;
  end if;

  if (
    select count(*)
    from public.self_checkout_challenges as existing
    where existing.guest_id = matched_guest.id
      and existing.created_at > now() - interval '10 minutes'
  ) >= 3 then
    select existing.id into existing_challenge_id
    from public.self_checkout_challenges as existing
    where existing.guest_id = matched_guest.id
      and existing.expires_at > now()
      and existing.consumed_at is null
      and existing.attempts < 6
    order by existing.created_at desc
    limit 1;
    if existing_challenge_id is not null then
      return query select existing_challenge_id, matched_guest.name, false;
    end if;
    return;
  end if;

  insert into public.self_checkout_challenges (
    id, owner_id, guest_id, code_hash, expires_at
  )
  values (
    $3, workspace_owner_id, matched_guest.id, $4, now() + interval '10 minutes'
  );

  return query select $3, matched_guest.name, true;
end;
$$;

create or replace function public.verify_self_checkout_code(
  challenge_id uuid,
  verification_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_challenge public.self_checkout_challenges%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the server can verify self-checkout codes.';
  end if;

  select c.* into checkout_challenge
  from public.self_checkout_challenges as c
  where c.id = $1
  for update;

  if checkout_challenge.id is null
    or checkout_challenge.consumed_at is not null
    or checkout_challenge.expires_at <= now()
    or checkout_challenge.attempts >= 6
  then
    return false;
  end if;

  if checkout_challenge.code_hash <> $2 then
    update public.self_checkout_challenges
    set attempts = attempts + 1
    where id = checkout_challenge.id;
    return false;
  end if;

  update public.guests
  set status = 'checked_out',
      checked_out_at = now()
  where id = checkout_challenge.guest_id
    and owner_id = checkout_challenge.owner_id
    and status = 'checked_in';

  if not found then
    update public.self_checkout_challenges
    set consumed_at = now()
    where id = checkout_challenge.id;
    return false;
  end if;

  update public.self_checkout_challenges
  set consumed_at = now()
  where id = checkout_challenge.id;

  return true;
end;
$$;

revoke all on function public.create_self_checkout_challenge(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_self_checkout_challenge(uuid, text, uuid, text) to service_role;

revoke all on function public.verify_self_checkout_code(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_self_checkout_code(uuid, text) to service_role;
