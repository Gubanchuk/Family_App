-- One photo for a family recipe, a wish or a goal. The file lives in the family folder,
-- <household>/photos/<kind>/<id>/<time>.jpg, and the row keeps its path. Who may change the row
-- (its RLS and guard trigger) is who may change its photo.
alter table public.recipes add column photo_path text
  check (photo_path is null or (household_id is not null and photo_path like household_id::text || '/photos/%'));
alter table public.wishes add column photo_path text
  check (photo_path is null or photo_path like household_id::text || '/photos/%');
alter table public.goals add column photo_path text
  check (photo_path is null or photo_path like household_id::text || '/photos/%');

-- Anyone in the family uploads into its photos folder; removing a file stays with its uploader
-- (the policy from 20261015000200).
create policy "family media: photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and (storage.foldername(name))[2] = 'photos'
  );
