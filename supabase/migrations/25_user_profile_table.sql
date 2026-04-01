drop function if exists add_xp(uuid, integer);
drop table if exists profiles cascade;
drop sequence if exists sudo_id_seq;
create sequence sudo_id_seq start 1;
create table profiles (
  id                      uuid references auth.users on delete cascade primary key,
  sudo_id                 text unique default lpad(nextval('sudo_id_seq')::text, 5, '0'),
  real_name               text,
  bio                     text,
  avatar_url              text,
  qr_code_url             text,
  date_of_birth           date,
  nationality             text,
  region                  text,
  university              text,
  personal_email          text unique,
  personal_email_verified boolean default false,
  edu_email               text unique,
  edu_verified            boolean default false,
  pet_name                text,
  pet_avatar_url          text,
  pet_bio                 text,
  pet_level               integer default 1,
  pet_xp                  integer default 0,
  identity_mode           text default 'real' check (identity_mode in ('real', 'pet')),
  location_sharing        text default 'fuzzy' check (location_sharing in ('precise', 'fuzzy', 'off')),
  ranking_opt_in          boolean default false,
  ranking_identity_mode   text default 'real' check (ranking_identity_mode in ('real', 'pet')),
  created_at              timestamptz default now()
);
alter table profiles enable row level security;
create policy "Profiles are viewable by logged in users"
  on profiles for select using (auth.uid() is not null);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users can delete own profile"
  on profiles for delete using (auth.uid() = id);

create or replace function add_xp(p_user_id uuid, p_xp integer)
returns void as $$
begin
  update profiles
  set
    pet_xp    = pet_xp + p_xp,
    pet_level = floor((pet_xp + p_xp) / 100) + 1
  where id = p_user_id;
end;
$$ language plpgsql security definer;
