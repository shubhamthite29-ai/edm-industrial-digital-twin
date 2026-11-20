-- ==============================================================================
-- EDM INDUSTRIAL DIGITAL TWIN — HARDENED POSTGRESQL & RLS SECURITY SCHEMA
-- Target Database: Supabase PostgreSQL (Standard Free Tier Compatible)
-- Safely Repeatable (Idempotent): Can be executed multiple times without errors.
-- Approved Permission Model:
--   - Administrator and HOD have equivalent management permissions.
--   - Both can create, update, promote, demote, and delete user roles (including Administrator).
--   - Safeguard 1: Database-level trigger prevents deletion/demotion of the last Administrator.
--   - Safeguard 2: Concurrency-safe initial Administrator provisioning with exclusive advisory locks.
--   - Research Team: Strictly read-only on physical experiment records.
--   - Guests / Unauthenticated: Complete isolation from all private tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS & ROLE TYPE DEFINITION
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('administrator', 'hod', 'research');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABLE DEFINITIONS
-- ------------------------------------------------------------------------------

-- Table: public.user_roles
-- Stores trusted authorization roles mapped to Supabase auth.users.
-- Roles are resolved server-side; clients cannot tamper with roles in JWT or storage.
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'research',
  display_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Mechatronics Engineering',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_role UNIQUE (user_id)
);

-- Table: public.physical_experiments
-- Stores authentic physical cuts on Titanium Alloy (Ti-6Al-4V) from ELEKTRA PULS S-50 ZNC.
-- Confidential research data: accessible strictly by Administrator, HOD, and Research Team.
CREATE TABLE IF NOT EXISTS public.physical_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_no INT NOT NULL,
  ip_a NUMERIC(6, 2) NOT NULL,
  vg_v NUMERIC(6, 2) NOT NULL,
  ton_us NUMERIC(8, 2) NOT NULL,
  toff_us NUMERIC(8, 2) NOT NULL,
  doc_mm NUMERIC(6, 3) NOT NULL,
  time_min NUMERIC(6, 2) NOT NULL,
  actual_mrr_g_min NUMERIC(8, 5) NOT NULL,
  actual_twr_g_min NUMERIC(8, 5) NOT NULL,
  workpiece_material TEXT NOT NULL DEFAULT 'Ti-6Al-4V',
  electrode_material TEXT NOT NULL DEFAULT 'Copper',
  machine_model TEXT NOT NULL DEFAULT 'ELEKTRA PULS S-50 ZNC',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: public.machine_audit_logs
-- Append-only telemetry and operation log recording machine commands, parameter modifications, and safety trips.
CREATE TABLE IF NOT EXISTS public.machine_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  action_type TEXT NOT NULL, -- e.g. 'MACHINE_START', 'EMERGENCY_STOP', 'PARAM_PATCH'
  level TEXT NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARN', 'CRITICAL'
  parameters_snapshot JSONB,
  client_ip TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: public.system_configurations
-- Stores plant parameters, integration URLs, calibration factors, and safety threshold limits.
-- Managed exclusively by Administrator and HOD.
CREATE TABLE IF NOT EXISTS public.system_configurations (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2b. IDEMPOTENT SCHEMA ALIGNMENT FOR PRE-EXISTING TABLES
-- PostgreSQL's 'CREATE TABLE IF NOT EXISTS' does not alter or add missing columns
-- to tables created in prior iterations. The statements below guarantee schema parity.
-- ------------------------------------------------------------------------------
ALTER TABLE public.physical_experiments ADD COLUMN IF NOT EXISTS workpiece_material TEXT NOT NULL DEFAULT 'Ti-6Al-4V';
ALTER TABLE public.physical_experiments ADD COLUMN IF NOT EXISTS electrode_material TEXT NOT NULL DEFAULT 'Copper';
ALTER TABLE public.physical_experiments ADD COLUMN IF NOT EXISTS machine_model TEXT NOT NULL DEFAULT 'ELEKTRA PULS S-50 ZNC';
ALTER TABLE public.physical_experiments ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.physical_experiments ALTER COLUMN is_verified SET DEFAULT false;
ALTER TABLE public.physical_experiments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.physical_experiments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'Mechatronics Engineering';

ALTER TABLE public.machine_audit_logs ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'INFO';
ALTER TABLE public.machine_audit_logs ADD COLUMN IF NOT EXISTS parameters_snapshot JSONB;
ALTER TABLE public.machine_audit_logs ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- ------------------------------------------------------------------------------
-- 3. INDEXES FOR PERFORMANCE & LOOKUP OPTIMIZATION
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_physical_experiments_sr_no ON public.physical_experiments(sr_no);
CREATE INDEX IF NOT EXISTS idx_physical_experiments_created_at ON public.physical_experiments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_audit_logs_timestamp ON public.machine_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_machine_audit_logs_user_id ON public.machine_audit_logs(user_id);

-- ------------------------------------------------------------------------------
-- 4. HARDENED HELPER FUNCTIONS (SECURITY DEFINER + SAFE SEARCH PATH)
-- ------------------------------------------------------------------------------

-- Trigger function: Automatically updates updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER tr_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_system_configurations_updated_at ON public.system_configurations;
CREATE TRIGGER tr_system_configurations_updated_at
  BEFORE UPDATE ON public.system_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Hardened Role Resolution Function
-- Evaluates calling user's verified role directly from public.user_roles.
-- 1. SECURITY DEFINER ensures execution with table owner privileges, avoiding infinite recursion in RLS.
-- 2. SET search_path = '' prevents search-path hijacking attacks.
-- 3. STABLE allows PostgreSQL query planner to cache the result per statement.
-- 4. (SELECT auth.uid()) evaluates cleanly within subqueries.
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 5. DATABASE SAFEGUARD 1: PREVENT REMOVAL OR DEMOTION OF LAST ADMINISTRATOR
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_last_administrator_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  remaining_admin_count INT;
BEGIN
  -- Only evaluate when an administrator record is being modified or deleted
  IF OLD.role = 'administrator' THEN
    -- Check if record is being deleted OR demoted to another role
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.role != 'administrator') THEN
      -- Concurrency safeguard: acquire the shared transaction-level advisory lock
      -- Serializes concurrent role modifications and prevents race conditions from removing the last Administrator
      PERFORM pg_advisory_xact_lock(hashtext('provision_initial_administrator_lock'));

      SELECT COUNT(*) INTO remaining_admin_count
      FROM public.user_roles
      WHERE role = 'administrator'
        AND id != OLD.id;

      IF remaining_admin_count = 0 THEN
        RAISE EXCEPTION 'Operation rejected: Cannot delete or demote the last remaining Administrator in the system.';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_last_administrator_removal ON public.user_roles;
CREATE TRIGGER tr_prevent_last_administrator_removal
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_administrator_removal();

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) ACTIVATION
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_configurations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7. POLICIES: public.user_roles
-- Both Administrator and HOD have full parity to manage user roles:
--   - View all user roles.
--   - Assign new user roles.
--   - Promote users (including assigning Administrator privileges).
--   - Demote users (subject to last-administrator safeguard).
--   - Delete user roles (subject to last-administrator safeguard).
-- Individual authenticated users can view their own role.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Admin and HOD can insert roles" ON public.user_roles;
CREATE POLICY "Admin and HOD can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Admin and HOD can update roles" ON public.user_roles;
CREATE POLICY "Admin and HOD can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  )
  WITH CHECK (
    public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Admin and HOD can delete roles" ON public.user_roles;
CREATE POLICY "Admin and HOD can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  );

-- ------------------------------------------------------------------------------
-- 8. POLICIES: public.physical_experiments
-- Administrator & HOD: Full read/write/update/delete.
-- Research Team: Strictly read-only access.
-- Guests & Unauthenticated: Zero access (blocked at database level).
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authorized research team and leadership can view experiments" ON public.physical_experiments;
CREATE POLICY "Authorized research team and leadership can view experiments"
  ON public.physical_experiments
  FOR SELECT
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod', 'research')
  );

DROP POLICY IF EXISTS "Admin and HOD can insert experiments" ON public.physical_experiments;
CREATE POLICY "Admin and HOD can insert experiments"
  ON public.physical_experiments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Admin and HOD can update experiments" ON public.physical_experiments;
CREATE POLICY "Admin and HOD can update experiments"
  ON public.physical_experiments
  FOR UPDATE
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  )
  WITH CHECK (
    public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Admin and HOD can delete experiments" ON public.physical_experiments;
CREATE POLICY "Admin and HOD can delete experiments"
  ON public.physical_experiments
  FOR DELETE
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  );

-- ------------------------------------------------------------------------------
-- 9. POLICIES: public.machine_audit_logs
-- Authenticated users can insert their own actions (cannot attribute to other users).
-- Only Administrator and HOD can view audit logs.
-- Updating and deleting logs is prohibited for all roles (audit immutability).
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin and HOD can view machine audit records" ON public.machine_audit_logs;
CREATE POLICY "Admin and HOD can view machine audit records"
  ON public.machine_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Authenticated users can record own machine actions" ON public.machine_audit_logs;
CREATE POLICY "Authenticated users can record own machine actions"
  ON public.machine_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 10. POLICIES: public.system_configurations
-- Managed exclusively by Administrator and HOD.
-- Research and Guest roles have no access.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin and HOD can view system configuration" ON public.system_configurations;
CREATE POLICY "Admin and HOD can view system configuration"
  ON public.system_configurations
  FOR SELECT
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  );

DROP POLICY IF EXISTS "Admin and HOD can modify system configuration" ON public.system_configurations;
CREATE POLICY "Admin and HOD can modify system configuration"
  ON public.system_configurations
  FOR ALL
  TO authenticated
  USING (
    public.get_current_role() IN ('administrator', 'hod')
  )
  WITH CHECK (
    public.get_current_role() IN ('administrator', 'hod')
  );

-- ------------------------------------------------------------------------------
-- 11. PERMISSIONS & DATABASE GRANTS
-- Strictly isolate tables from anonymous/public roles.
-- Grant explicit table access only to authenticated users and backend service_role.
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Revoke all table and function permissions from unauthenticated (anon) users
REVOKE ALL ON TABLE public.user_roles FROM anon, public;
REVOKE ALL ON TABLE public.physical_experiments FROM anon, public;
REVOKE ALL ON TABLE public.machine_audit_logs FROM anon, public;
REVOKE ALL ON TABLE public.system_configurations FROM anon, public;
REVOKE ALL ON FUNCTION public.get_current_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_role() FROM anon;

-- Explicit table permissions for authenticated users (enforced via RLS above)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.physical_experiments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.machine_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_configurations TO authenticated;

-- Execution grant for role resolution
GRANT EXECUTE ON FUNCTION public.get_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_role() TO service_role;

-- Complete access for background backend tasks / administrative scripts
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON TABLE public.physical_experiments TO service_role;
GRANT ALL ON TABLE public.machine_audit_logs TO service_role;
GRANT ALL ON TABLE public.system_configurations TO service_role;

-- ------------------------------------------------------------------------------
-- 12. DATABASE SAFEGUARD 2: CONCURRENCY-SAFE INITIAL ADMINISTRATOR PROVISIONING
-- Serialized via exclusive transaction-level advisory locking.
-- Inaccessible to ordinary authenticated or anonymous users (PostgREST execution revoked).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_initial_administrator(
  admin_email TEXT,
  admin_display_name TEXT DEFAULT 'Lead Digital Twin Engineer'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id UUID;
  existing_admin_count INT;
BEGIN
  -- Concurrency safeguard: acquire an exclusive transaction-level advisory lock
  -- Serializes simultaneous bootstrap invocations and prevents race conditions
  PERFORM pg_advisory_xact_lock(hashtext('provision_initial_administrator_lock'));

  -- Verify whether an administrator is already provisioned
  SELECT COUNT(*) INTO existing_admin_count
  FROM public.user_roles
  WHERE role = 'administrator';

  IF existing_admin_count > 0 THEN
    RAISE EXCEPTION 'An Administrator is already provisioned. Subsequent user roles must be managed by the Administrator or HOD.';
  END IF;

  -- Look up target user in auth.users by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(admin_email));

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User "%" not found in auth.users. Please create the user account in Supabase Authentication first.', admin_email;
  END IF;

  -- Provision initial administrator record
  INSERT INTO public.user_roles (user_id, role, display_name, department)
  VALUES (
    target_user_id,
    'administrator',
    admin_display_name,
    'Department of Mechatronics Engineering'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'administrator',
      display_name = admin_display_name,
      updated_at = timezone('utc'::text, now());

  RETURN 'Successfully provisioned ' || admin_email || ' as Initial Administrator.';
END;
$$;

-- Restrict helper function strictly to database superuser / postgres session (Supabase SQL Editor)
-- Inaccessible to ordinary authenticated, anonymous users, or PostgREST service_role
REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) TO postgres;

-- ==============================================================================
-- 13. INSTRUCTIONS FOR INITIAL ADMINISTRATOR PROVISIONING
-- ==============================================================================
/*
STEP 1: Create your user account in Supabase:
  - In your Supabase Dashboard, navigate to: Authentication -> Users
  - Click "Add user" -> "Create user"
  - Enter your institutional email (e.g. admin@ritindia.edu) and a strong password
  - Check "Auto Confirm User" and click "Create User"

STEP 2: Provision your Administrator role in the Supabase SQL Editor:
  Option A (Recommended — Concurrency-safe helper function):
    SELECT public.provision_initial_administrator('admin@ritindia.edu', 'Shubham Thite');

  Option B (Direct SQL insert using your User UID from Authentication -> Users):
    INSERT INTO public.user_roles (user_id, role, display_name, department)
    VALUES (
      '<PASTE_USER_UUID_FROM_AUTH_USERS_HERE>',
      'administrator',
      'Shubham Thite',
      'Department of Mechatronics Engineering'
    )
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'administrator',
        display_name = EXCLUDED.display_name,
        updated_at = timezone('utc'::text, now());

STEP 3: Add subsequent institutional users (HOD and Research Team):
  - Add user accounts in Supabase Authentication -> Users
  - As Administrator or HOD, assign their roles via the application UI or run:
    INSERT INTO public.user_roles (user_id, role, display_name, department)
    VALUES
      ('<HOD_USER_UUID>', 'hod', 'Dr. Shailesh Shirguppikar', 'Department of Mechatronics Engineering'),
      ('<RESEARCHER_USER_UUID>', 'research', 'Research Associate', 'Department of Mechatronics Engineering');
*/
