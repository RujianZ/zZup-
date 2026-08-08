-- Fix: pet growth-form (Closet) changes failed with "permission denied for column pet_stage".
-- Migration 25's column-level GRANT UPDATE list on public.profiles omitted pet_stage,
-- so updateProfile({ pet_stage }) from the client was rejected. Grant it here.
GRANT UPDATE (pet_stage) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
