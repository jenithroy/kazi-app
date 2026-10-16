-- ============================================================================
-- 0055_people_self_update_guard.sql
--
-- Staff can now edit their own profile from the card behind the avatar in the top
-- bar. That edit is a plain UPDATE of their own `people` row, and it exposed
-- something that was already true of the database:
--
--   people_self_update lets any signed-in person UPDATE their own row, and a
--   row-level policy cannot say which COLUMNS. (0012's note that its policy is
--   limited "via the column list, to this column alone" does not describe what
--   Postgres does; there is no column list on a policy.) So anyone could, with
--   their own login and a request of their own making, change their own
--   position_id to a director's, their basic_salary_npr, their bank_account,
--   their status, who they report to — everything except what the app's screens
--   happened to offer.
--
-- This closes that. A trigger now checks every UPDATE that arrives through the
-- API as a signed-in person: unless they have edit access to Employees (HR, who
-- could always do all of it), only these columns may change —
--
--     phone, address        the profile card's two fields
--     fcm_token             push registration (AuthContext does this on sign-in)
--     updated_at            bookkeeping
--
-- Anything else raises an error that says so. The default is deny: a column
-- added to `people` later is protected until someone decides otherwise here.
--
-- Not affected, deliberately:
--   - HR and anyone with Employees edit (people_hr_write): unchanged.
--   - The SQL editor, migrations and the service role (provision-auth.cjs, the
--     Cloud Functions, the bots): they are not the `authenticated` role.
--   - Reads. fs_employees still masks phone/address from everyone but the person
--     and HR, so the card can show them and a colleague's cannot.
--
-- Saving the same value is not a change, so a client that sends the whole row
-- back with only an allowed field edited is accepted.
--
-- Safe to run more than once. Nothing here runs by itself: paste it into the
-- Supabase SQL editor.
-- ============================================================================

create or replace function public.guard_people_self_update()
returns trigger
language plpgsql
as $$
declare
  -- The only columns a person may change on their own row.
  own_columns constant text[] := array['phone', 'address', 'fcm_token', 'updated_at'];
begin
  -- Only requests made through the API as a signed-in person are checked.
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- HR may change anything, as before.
  if app_can_edit('employees') then
    return new;
  end if;

  if (to_jsonb(new) - own_columns) is distinct from (to_jsonb(old) - own_columns) then
    raise exception
      'You can change your phone number and address here. Your name, position, pay and everything else is changed by HR.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_people_self_update on public.people;
create trigger guard_people_self_update
  before update on public.people
  for each row execute function public.guard_people_self_update();

comment on function public.guard_people_self_update() is
  'Limits what a signed-in person without Employees edit access may change on a people row to phone, address, fcm_token and updated_at. See 0055.';
