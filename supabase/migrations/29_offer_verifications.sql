-- =============================================================================
-- 29_offer_verifications.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - Column-level INSERT limited to (user_id, screenshot_url)
--     Prevents users from forging 'verified' status, AI extraction fields, etc.
--     The verify-offer Edge Function (service_role) writes everything else.
--   - Index (user_id, submitted_at desc) for latest-status queries
--   - Partial index (expires_at) where deleted_at is null
--     for the screenshot cleanup cron job (V7 task 114)
--
-- NOT changed:
--   - No UPDATE / DELETE policy for authenticated (Edge Function uses
--     service_role to set status / extracted fields / deleted_at)
--   - Unique partial index "one pending per user" (prevents dup submissions)
--   - 24-hour expires_at default (cleanup cron deletes screenshot file
--     and sets deleted_at, but DB row stays for audit)
-- =============================================================================

drop table if exists public.offer_verifications cascade;
drop index if exists public.one_pending_per_user;

create table public.offer_verifications (
  id                        uuid default gen_random_uuid() primary key,
  user_id                   uuid references public.profiles(id) on delete cascade not null,
  screenshot_url            text not null,
  status                    text default 'pending' check (status in ('pending', 'verified', 'rejected')),
  university_extracted      text,
  program_extracted         text,
  enrollment_year_extracted integer,
  ai_confidence             text check (ai_confidence in ('high', 'medium', 'low')),
  rejection_reason          text,
  submitted_at              timestamptz default now(),
  expires_at                timestamptz default (now() + interval '24 hours'),
  deleted_at                timestamptz
);

-- One pending verification per user (prevents duplicate submissions)
create unique index one_pending_per_user
  on public.offer_verifications(user_id)
  where status = 'pending';

-- Latest-status lookup (used by getVerificationStatus)
create index offer_verifications_user_id_submitted_at_idx
  on public.offer_verifications(user_id, submitted_at desc);

-- Cleanup cron: WHERE expires_at < now() AND deleted_at IS NULL
create index offer_verifications_pending_cleanup_idx
  on public.offer_verifications(expires_at)
  where deleted_at is null;

alter table public.offer_verifications enable row level security;

create policy "owner_can_select"
  on public.offer_verifications for select
  using (auth.uid() = user_id);

create policy "owner_can_insert"
  on public.offer_verifications for insert
  with check (auth.uid() = user_id);

-- Column-level privileges
-- Users can read their own row (all 12 columns) but can only INSERT
-- (user_id, screenshot_url). Status / AI extraction / cleanup fields
-- are written exclusively by the verify-offer Edge Function via service_role.
revoke all on public.offer_verifications from authenticated;
revoke all on public.offer_verifications from anon;
grant select on public.offer_verifications to authenticated;
grant insert (user_id, screenshot_url) on public.offer_verifications to authenticated;
