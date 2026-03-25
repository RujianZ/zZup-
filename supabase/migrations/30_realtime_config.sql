do $$
begin
  alter publication supabase_realtime drop table messages;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime drop table posts;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime drop table likes;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime drop table comments;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime drop table user_locations;
exception when others then null;
end $$;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table likes;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table user_locations;
