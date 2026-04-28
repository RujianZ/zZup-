-- =============================================================================
-- 53_handle_new_user.sql (rewritten 2026-04-17)
--
-- Auto-creates a profile row when a new auth.users row is inserted (signup).
--
-- Changes from original:
--   - Use `drop trigger if exists + create trigger` instead of
--     `create or replace trigger` for compatibility with older PG versions
--     and consistency with other migrations
--
-- NOT changed:
--   - SECURITY DEFINER bypasses column-level INSERT restrictions
--     on profiles (set in migration 25)
--   - Failed profile insert rolls back the auth.users insert (no orphans)
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, personal_email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
