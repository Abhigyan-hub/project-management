-- Auditable, append-only team credit ledger.
create table public.team_credits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  source text not null check (source in ('task', 'commendation', 'adjustment')),
  points integer not null check (points <> 0),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  task_id uuid references public.tasks(id) on delete set null,
  awarded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index team_credits_task_once_idx on public.team_credits(task_id)
  where source = 'task' and task_id is not null;
create index team_credits_profile_date_idx on public.team_credits(profile_id, created_at desc);
create index team_credits_team_date_idx on public.team_credits(team_id, created_at desc);

alter table public.team_credits enable row level security;
create policy team_credits_select on public.team_credits
  for select to authenticated using (
    public.is_admin()
    or profile_id = public.current_profile_id()
    or team_id in (select p.team_id from public.profiles p where p.id = public.current_profile_id())
    or exists (select 1 from public.teams t where t.id = team_credits.team_id and t.leader_id = public.current_profile_id())
  );
grant select on public.team_credits to authenticated;
-- No direct client writes: inserts go through guarded security-definer functions.

create or replace function public.get_team_credit_totals()
returns table(profile_id uuid, lifetime_points integer)
language sql stable security definer set search_path = public
as $$
  select c.profile_id, sum(c.points)::integer
  from public.team_credits c
  join public.profiles p on p.id = c.profile_id
  where public.is_admin()
     or p.id = public.current_profile_id()
     or p.team_id in (select self.team_id from public.profiles self where self.id = public.current_profile_id())
     or exists (select 1 from public.teams t where t.id = p.team_id and t.leader_id = public.current_profile_id())
  group by c.profile_id
$$;
revoke all on function public.get_team_credit_totals() from public, anon;
grant execute on function public.get_team_credit_totals() to authenticated;

create or replace function public.add_team_credit(
  target_profile uuid,
  target_team uuid,
  credit_source text,
  requested_points integer,
  credit_reason text,
  source_task uuid default null,
  credit_actor uuid default null
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  other_highest integer;
  target_total integer;
  allowed_total integer;
  final_points integer;
begin
  if requested_points <= 0 then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_team::text, 0));
  select coalesce(max(score), 0) into other_highest from (
    select profile_id, sum(points)::integer as score
    from public.team_credits
    where team_id = target_team and profile_id <> target_profile
    group by profile_id
  ) scores;
  select coalesce(sum(points), 0)::integer into target_total
    from public.team_credits where team_id = target_team and profile_id = target_profile;
  final_points := requested_points;
  if other_highest > 0 then
    allowed_total := floor(other_highest * 1.2)::integer;
    final_points := least(requested_points, greatest(0, allowed_total - target_total));
  end if;
  if final_points > 0 then
    insert into public.team_credits(profile_id, team_id, source, points, reason, task_id, awarded_by)
    values(target_profile, target_team, credit_source, final_points, credit_reason, source_task, credit_actor);
  end if;
  return final_points;
end;
$$;

create or replace function public.award_completed_task_credit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  member_team uuid;
  task_points integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.assigned_member_id is not null
     and not exists (select 1 from public.team_credits where task_id = new.id and source = 'task') then
    select team_id into member_team from public.profiles where id = new.assigned_member_id;
    if member_team is not null then
      task_points := case new.priority when 'low' then 1 when 'medium' then 2 when 'high' then 3 when 'critical' then 5 else 1 end;
      perform public.add_team_credit(new.assigned_member_id, member_team, 'task', task_points,
        left('Completed task: ' || new.title, 500), new.id, public.current_profile_id());
    end if;
  end if;
  return new;
end;
$$;
create trigger tasks_award_credit_after_completion
  after update of status on public.tasks
  for each row execute function public.award_completed_task_credit();

create or replace function public.commend_team_member(target_profile uuid, credit_reason text)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  actor_profile uuid := public.current_profile_id();
  actor_team uuid;
  recipient_team uuid;
begin
  if public.current_role() <> 'member' then raise exception 'Only team members can commend peers'; end if;
  if char_length(trim(coalesce(credit_reason, ''))) not between 1 and 500 then raise exception 'A reason of 1 to 500 characters is required'; end if;
  if target_profile = actor_profile then raise exception 'You cannot commend yourself'; end if;
  select team_id into actor_team from public.profiles where id = actor_profile;
  select team_id into recipient_team from public.profiles where id = target_profile;
  if actor_team is null or recipient_team is distinct from actor_team then raise exception 'You can only commend a teammate'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_team::text, 0));
  if exists(select 1 from public.team_credits where source = 'commendation' and awarded_by = actor_profile
      and profile_id = target_profile and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') then
    raise exception 'You already commended this teammate this month';
  end if;
  return public.add_team_credit(target_profile, actor_team, 'commendation', 1, trim(credit_reason), null, actor_profile);
end;
$$;

create or replace function public.correct_team_credit(target_profile uuid, requested_points integer, credit_reason text)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  target_team uuid;
  actual_points integer;
begin
  if not public.is_admin() then raise exception 'Only admins can correct credits'; end if;
  if requested_points = 0 or char_length(trim(coalesce(credit_reason, ''))) not between 1 and 500 then raise exception 'Enter a non-zero adjustment and a reason'; end if;
  select team_id into target_team from public.profiles where id = target_profile;
  if target_team is null then raise exception 'The person must belong to a team to adjust credits'; end if;
  if requested_points < 0 then
    perform pg_advisory_xact_lock(hashtextextended(target_team::text, 0));
    requested_points := greatest(requested_points, -coalesce((
      select sum(points)::integer from public.team_credits
      where profile_id = target_profile and team_id = target_team
    ), 0));
    if requested_points = 0 then return 0; end if;
    insert into public.team_credits(profile_id, team_id, source, points, reason, awarded_by)
    values(target_profile, target_team, 'adjustment', requested_points, trim(credit_reason), public.current_profile_id());
    return requested_points;
  end if;
  actual_points := public.add_team_credit(target_profile, target_team, 'adjustment', requested_points, trim(credit_reason), null, public.current_profile_id());
  return actual_points;
end;
$$;

revoke all on function public.add_team_credit(uuid, uuid, text, integer, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.award_completed_task_credit() from public, anon, authenticated;
revoke all on function public.commend_team_member(uuid, text) from public, anon;
revoke all on function public.correct_team_credit(uuid, integer, text) from public, anon;
grant execute on function public.commend_team_member(uuid, text) to authenticated;
grant execute on function public.correct_team_credit(uuid, integer, text) to authenticated;
