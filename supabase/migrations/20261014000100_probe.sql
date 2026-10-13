-- A 64 KB row: proves that responses larger than the ~16 KB cut seen on some Russian networks arrive whole.
create table public.probe_payload (id int primary key, body text not null);
insert into public.probe_payload (id, body) values (1, repeat('0123456789abcdef', 4096));
alter table public.probe_payload enable row level security;
create policy "probe is public" on public.probe_payload for select to anon, authenticated using (true);
grant select on public.probe_payload to anon, authenticated;
