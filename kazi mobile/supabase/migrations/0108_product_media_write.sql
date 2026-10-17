-- Library images — fabric swatches, tech pack sketches and scanned pages — live
-- in the public `product-media` bucket. Until now they could only be READ from
-- either app: the bucket was filled once by the Firestore→Postgres migration
-- running as the service role, `storage.objects` has RLS on, and the only
-- policies on it are the three `bucket_id = 'chat-media'` ones from 0105/0107.
-- So an authenticated upload to `product-media` was refused with no policy to
-- allow it, and the mobile library editors could never replace a swatch.
--
-- Additive and scoped to this one bucket, so nothing the web app does changes:
--   - reads are unaffected either way (a public bucket is served by the public
--     endpoint, which never consults RLS) — the select policy just makes an
--     authenticated `list` work too;
--   - writing is gated on the same grant that already gates the rows these
--     images belong to, `library`, so whoever may edit a fabric may replace its
--     swatch and nobody else can.
--
-- `app_can_edit` is the same helper 0004 uses, and it reads `app_jwt_sub()`
-- rather than `auth.uid()` (see 0101) — do not reintroduce `auth.uid()` here.

create policy product_media_read on storage.objects for select to authenticated
  using (bucket_id = 'product-media');

create policy product_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and app_can_edit('library'));

-- Update as well as insert: an upload with `upsert` replaces an existing object
-- rather than inserting, and a failed half-upload should be re-writable.
create policy product_media_update on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and app_can_edit('library'))
  with check (bucket_id = 'product-media' and app_can_edit('library'));

create policy product_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and app_can_edit('library'));
