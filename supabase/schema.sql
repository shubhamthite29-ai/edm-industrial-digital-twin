-- ==============================================================================
-- EDM INDUSTRIAL DIGITAL TWIN — SECURE DATABASE & RLS SCHEMA
-- Target Database: Supabase PostgreSQL (Standard Free Tier Compatible)
-- ==============================================================================

-- 1. ENUMS & EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('administrator', 'hod', 'research');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. USER ROLES TABLE
-- Maps Supabase Auth users to their assigned EDM roles.
-- Roles are NEVER stored in public frontend storage; they are resolved server-side.
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'research',
  display_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Mechatronics Engineering',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_role UNIQUE (user_id)
);

-- 3. PHYSICAL EXPERIMENTS TABLE (PRIVATE RESEARCH DATA)
-- Contains the authentic 48 physical cuts on Ti-6Al-4V from Rajarambapu Institute of Technology.
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
  is_verified BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. MACHINE AUDIT LOGS TABLE
-- Records significant machine-control events, parameter changes, and safety actions.
CREATE TABLE IF NOT EXISTS public.machine_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL, -- e.g., 'MACHINE_START', 'EMERGENCY_STOP', 'PARAM_APPLY'
  level TEXT NOT NULL DEFAULT 'INFO',
  parameters_snapshot JSONB,
  client_ip TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Get calling user's verified role
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS app_role AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- USER_ROLES POLICIES
-- Users can read their own role. Administrators and HODs can view all roles.
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.get_current_role() IN ('administrator', 'hod'));

CREATE POLICY "Only Administrators can modify roles"
  ON public.user_roles FOR ALL
  USING (public.get_current_role() = 'administrator')
  WITH CHECK (public.get_current_role() = 'administrator');

-- PHYSICAL_EXPERIMENTS POLICIES
-- Administrators and HODs have full read/write access.
-- Research team has read-only access.
-- Guests and unauthenticated users have ZERO access (rejected at database level).
CREATE POLICY "Authorized research access for physical experiments"
  ON public.physical_experiments FOR SELECT
  USING (public.get_current_role() IN ('administrator', 'hod', 'research'));

CREATE POLICY "Admin and HOD write access for physical experiments"
  ON public.physical_experiments FOR ALL
  USING (public.get_current_role() IN ('administrator', 'hod'))
  WITH CHECK (public.get_current_role() IN ('administrator', 'hod'));

-- MACHINE_AUDIT_LOGS POLICIES
-- Only Administrators and HODs can read audit logs.
CREATE POLICY "Admin and HOD read audit logs"
  ON public.machine_audit_logs FOR SELECT
  USING (public.get_current_role() IN ('administrator', 'hod'));

CREATE POLICY "Authenticated users can write audit records"
  ON public.machine_audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================================
-- 6. INITIAL PROVISIONING TEMPLATE
-- Run this block after inviting users through the Supabase Authentication dashboard:
-- ==============================================================================
/*
-- Step A: In Supabase Dashboard -> Authentication -> Users -> Add User (Create user with password)
-- Example:
-- 1. admin@edm-digitaltwin.local (Administrator)
-- 2. hod@ritindia.edu (HOD)
-- 3. research1@ritindia.edu (Research Team Member 1)
-- 4. research2@ritindia.edu (Research Team Member 2)

-- Step B: Insert the roles linked to their Supabase user IDs:
INSERT INTO public.user_roles (user_id, role, display_name, department)
VALUES
  ('USER_ID_ADMIN_HERE', 'administrator', 'Lead Digital Twin Engineer', 'Mechatronics Engineering'),
  ('USER_ID_HOD_HERE', 'hod', 'Dr. Department Head', 'Mechatronics Engineering'),
  ('USER_ID_RESEARCH_1_HERE', 'research', 'Research Associate 1', 'Mechatronics Engineering'),
  ('USER_ID_RESEARCH_2_HERE', 'research', 'Research Associate 2', 'Mechatronics Engineering')
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
*/
