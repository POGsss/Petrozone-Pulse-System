# Supabase Project Migration Guide (Schema Only)

## Goal
Migrate this project from the current Supabase project (old account) to a new Supabase project (new account), preserving schema and database behavior, without copying existing data.

This guide is tailored for this codebase and includes required checks for:
- Tables and relations
- RPC/functions
- RLS policies
- Triggers
- Storage bucket setup
- Environment cutover

---

## Migration Scope
Included:
- Public schema objects (tables, views, functions, triggers, RLS, indexes, constraints)
- Auth/storage schema customizations (if any custom SQL exists there)

Not included by default:
- Existing table data
- Existing auth users/sessions
- Existing storage objects/files
- Some dashboard-level project settings unless manually copied

---

## Project-Specific Dependencies (Must Exist in New Project)

### Required RPC/functions used by backend
- get_user_full_data
- log_admin_action
- log_auth_event
- update_user_branches
- update_user_roles

### Storage requirement
- Bucket: purchase-order-receipts

### Critical environment variable usage
Backend requires:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY

Frontend currently uses backend API, but has Supabase env values configured too:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

---

## Prerequisites
1. Install Supabase CLI.
2. Install Docker Desktop (required by some CLI diff commands).
3. Ensure psql is available in PATH.
4. Prepare these values:
   - OLD_PROJECT_REF
   - OLD_DB_URL
   - NEW_PROJECT_REF
   - NEW_DB_URL
5. Work from repository root.

---

## Phase 1 - Export Old Project Schema

1. Authenticate CLI:

```powershell
supabase login
```

2. Export schema-only dump from old project:

```powershell
supabase db dump --db-url "OLD_DB_URL" -f schema.sql
```

3. Verify dump contains critical objects:

```powershell
Select-String -Path schema.sql -Pattern "get_user_full_data|log_admin_action|log_auth_event|update_user_branches|update_user_roles"
Select-String -Path schema.sql -Pattern "CREATE POLICY|ALTER POLICY|ENABLE ROW LEVEL SECURITY"
Select-String -Path schema.sql -Pattern "CREATE TRIGGER"
```

If these return no relevant results, stop and validate OLD_DB_URL.

---

## Phase 2 - Capture Auth/Storage Schema Customizations

This is only for custom SQL in auth/storage schemas (policies, triggers, functions, etc.).

1. Link to old project:

```powershell
supabase link --project-ref OLD_PROJECT_REF
```

2. Generate diff for auth and storage schemas:

```powershell
supabase db diff --linked --schema auth,storage > auth_storage_changes.sql
```

3. Review auth_storage_changes.sql.
- If almost empty, there are likely no custom auth/storage schema changes.
- If non-empty, apply it later in Phase 4.

---

## Phase 3 - Create and Configure New Supabase Project

In Supabase Dashboard (new account):
1. Create new project.
2. Copy and prepare:
   - Project URL
   - anon key
   - service_role key
   - DB password and NEW_DB_URL
3. Replicate important Auth settings from old project:
   - Site URL
   - Redirect URLs
   - Email templates
   - SMTP settings (if used)
   - OAuth provider settings (if used)
4. Review storage settings for bucket visibility and limits.

---

## Phase 4 - Import Schema to New Project

1. Apply main schema dump:

```powershell
psql --single-transaction --variable ON_ERROR_STOP=1 --file schema.sql --dbname "NEW_DB_URL"
```

2. If auth_storage_changes.sql has real changes, apply it:

```powershell
psql --single-transaction --variable ON_ERROR_STOP=1 --file auth_storage_changes.sql --dbname "NEW_DB_URL"
```

---

## Phase 5 - Ensure Storage Bucket Exists

The backend can create purchase-order-receipts automatically on first upload, but pre-check is recommended.

1. Check bucket in new project:

```powershell
psql "NEW_DB_URL" -c "select id,name,public from storage.buckets where id='purchase-order-receipts';"
```

2. If missing, either:
- Create via dashboard manually, or
- Let backend create on first upload request.

---

## Phase 6 - Switch App to New Project

1. Update backend environment values:
- backend/.env
  - SUPABASE_URL
  - SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY

2. Update frontend environment values:
- frontend/.env
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY

3. Update deployment environment variables (Vercel or hosting provider).
4. Restart backend and frontend services.

---

## Phase 7 - Post-Migration Verification (SQL)

Run against NEW_DB_URL.

1. Verify required RPC/functions:

```powershell
psql "NEW_DB_URL" -c "select routine_schema,routine_name from information_schema.routines where routine_schema='public' and routine_name in ('get_user_full_data','log_admin_action','log_auth_event','update_user_branches','update_user_roles') order by routine_name;"
```

2. Verify RLS policies:

```powershell
psql "NEW_DB_URL" -c "select schemaname,tablename,policyname from pg_policies where schemaname in ('public','auth','storage') order by schemaname,tablename,policyname;"
```

3. Verify triggers:

```powershell
psql "NEW_DB_URL" -c "select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage') order by 1,2,3;"
```

4. Verify key public tables:

```powershell
psql "NEW_DB_URL" -c "select table_name from information_schema.tables where table_schema='public' and table_name in ('user_profiles','user_roles','user_branch_assignments','branches','customers','vehicles','job_orders','job_order_lines','inventory_items','purchase_orders','audit_logs') order by table_name;"
```

---

## Phase 8 - Application Smoke Tests

Perform in app UI/API:
1. Login/logout.
2. Profile read/update.
3. Role and branch assignment paths.
4. Customer and vehicle create/update.
5. Job order create/update/status transition.
6. Inventory movement flow.
7. Purchase order receipt upload.
8. Audit log creation checks.

---

## Phase 9 - Cutover and Hardening

1. Confirm app is stable on new project.
2. Rotate old project keys immediately.
3. Remove old project secrets from local and deployed environments.
4. Keep schema.sql and auth_storage_changes.sql archived for rollback reference.
5. Optional but recommended: start tracking DB changes via versioned migrations in repo.

---

## Quick Rollback Plan

If new project fails critical checks:
1. Restore old env vars in backend/.env and frontend/.env.
2. Restore old deployment secrets.
3. Restart services.
4. Re-open migration after fixing missing schema objects.

---

## Notes
- Schema-only migration is suitable for your request.
- Existing auth users and storage files are not migrated in this flow.
- You can recreate users and begin with empty storage in the new project.
