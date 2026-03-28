ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'real_with_pet'
  CHECK (profile_visibility IN ('real_only', 'real_with_pet', 'pet_only'));

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_date_of_birth boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_nationality boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_qr_code boolean NOT NULL DEFAULT false;
