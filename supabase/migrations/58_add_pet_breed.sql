-- Add pet_breed column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pet_breed text;

-- Grant permissions for authenticated users to select and update the new column
GRANT SELECT, UPDATE(pet_breed) ON public.profiles TO authenticated;
