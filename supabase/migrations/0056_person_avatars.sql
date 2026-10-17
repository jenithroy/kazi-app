-- ============================================================================
-- 0056_person_avatars.sql
--
-- Profile pictures.
--
-- The picture lives in its own small table instead of a column on `people`.
-- That keeps it clear of two things that are easy to get wrong:
--   * `people` has a self-update guard waiting to be applied (0055) that only lets
--     a person change their phone and address. A picture column there would have
--     meant widening that guard, and a column added to the `fs_employees` view
--     can only ever be appended to a definition this repo may not match.
--   * The directory view masks phone, address and pay for everybody else. A
--     picture is the one thing about a colleague that is meant to be seen, so it
--     should not ride on those masks.
--
-- Anyone signed in can see every picture. A person can set or remove only their
-- own; HR (edit on Employees) can manage anyone's. The file itself goes in the
-- public `avatars` bucket under a folder named for the person's id, and the
-- storage rules say the same thing: you may only write inside your own folder.
-- Each upload gets a new file name, so a changed picture is a new URL and no
-- browser or CDN keeps showing the old one.
--
-- Safe to run twice.
-- ============================================================================

create table if not exists public.person_avatars (
  person_id  uuid primary key references public.people(id) on delete cascade,
  url        text not null,
  updated_at timestamptz not null default now(),
  -- Only a file in our own avatars bucket: stops a person pointing the picture
  -- at somebody else's server (a tracking image, or a link that changes later).
  constraint person_avatars_url_in_bucket
    check (url like '%/storage/v1/object/public/avatars/%')
);

alter table public.person_avatars enable row level security;

drop policy if exists "read_all" on public.person_avatars;
create policy "read_all" on public.person_avatars
  as permissive for select
  to authenticated
  using (app_person_id() is not null);

drop policy if exists "own_write" on public.person_avatars;
create policy "own_write" on public.person_avatars
  as permissive for all
  to authenticated
  using (person_id = app_person_id())
  with check (person_id = app_person_id());

drop policy if exists "hr_write" on public.person_avatars;
create policy "hr_write" on public.person_avatars
  as permissive for all
  to authenticated
  using (app_can_edit('employees'))
  with check (app_can_edit('employees'));

drop policy if exists "require_known_issuer" on public.person_avatars;
create policy "require_known_issuer" on public.person_avatars
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

grant select, insert, update, delete on public.person_avatars to authenticated;
grant select, insert, update, delete on public.person_avatars to service_role;


-- ─── the bucket ──────────────────────────────────────────────────────────────
-- Public, like the other upload buckets (see 0043): a picture's URL is a plain,
-- durable link. The app shrinks every picture to a small square before it is
-- uploaded; the 2 MB and file-type limits here are a backstop for anything that
-- skips the app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A person writes inside the folder named for their own id; HR can write anywhere.
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = app_person_id()::text or app_can_edit('employees'))
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = app_person_id()::text or app_can_edit('employees'))
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = app_person_id()::text or app_can_edit('employees'))
  );

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = app_person_id()::text or app_can_edit('employees'))
  );
