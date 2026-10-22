-- Read-only inspection; NOT a migration and NOT proof of hosted project identity.
-- First verify project ref kqjqcahysbmsaxlaipub in the authenticated platform UI
-- and CLI link. Inspect migration history separately with `migration list --linked`.
begin read only;

select current_database() as database_name, current_user as inspection_role,
       to_regclass('public.profiles') as profiles_table,
       to_regclass('supabase_migrations.schema_migrations') as migration_history;

select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = to_regclass('public.profiles')
order by conname;

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'profiles'
order by policyname;

-- Include PUBLIC and custom role grants so unexpected access is visible.
select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'profiles'
order by grantee, privilege_type;

select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
order by grantee, column_name, privilege_type;

commit;
