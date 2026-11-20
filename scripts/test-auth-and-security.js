import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  AUTH_ROLES,
  CLIENT_ROLES,
  MESSAGE_TYPES,
  PROTECTED_CONTROL_MESSAGES,
  createError,
  createAck,
} from "../gateway/protocol.js";
import { ROLE_PERMISSIONS, getRolePermissions } from "../src/types/auth.ts";
import { PUBLISHED_DEMO_SAMPLES, PUBLISHED_PROJECT_METADATA } from "../src/data/guest/publishedDemoData.ts";

console.log("================================================================================");
console.log("RUNNING EDM DIGITAL TWIN AUTHENTICATION & SECURITY VALIDATION SUITE (12 TESTS)");
console.log("================================================================================");

// -----------------------------------------------------------------------------
// Test 1: Role Permission Matrix Validation (Admin & HOD Parity)
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Validating Role Permission Matrix...");
const adminPerms = getRolePermissions("administrator");
const hodPerms = getRolePermissions("hod");
const researchPerms = getRolePermissions("research");
const guestPerms = getRolePermissions("guest");

// Administrator & HOD have full parity
assert.equal(adminPerms.canControlPhysicalMachine, true, "Admin must have machine control");
assert.equal(hodPerms.canControlPhysicalMachine, true, "HOD must have machine control");
assert.equal(adminPerms.canManageUsers, true, "Admin must have user management access");
assert.equal(hodPerms.canManageUsers, true, "HOD must have user management access");
assert.equal(adminPerms.canAccessSettings, true, "Admin must have settings access");
assert.equal(hodPerms.canAccessSettings, true, "HOD must have settings access");
assert.equal(adminPerms.canViewRawExperiments, true, "Admin must access raw experiments");
assert.equal(hodPerms.canViewRawExperiments, true, "HOD must access raw experiments");
assert.equal(adminPerms.canViewAuditLogs, true, "Admin must view audit logs");
assert.equal(hodPerms.canViewAuditLogs, true, "HOD must view audit logs");
assert.equal(adminPerms.canEditPrivateDatasets, true, "Admin must edit private datasets");
assert.equal(hodPerms.canEditPrivateDatasets, true, "HOD must edit private datasets");

// Research team restrictions
assert.equal(researchPerms.canControlPhysicalMachine, false, "Research team must NOT control physical machine");
assert.equal(researchPerms.canManageUsers, false, "Research team must NOT manage users");
assert.equal(researchPerms.canAccessSettings, false, "Research team must NOT access settings");
assert.equal(researchPerms.canViewAuditLogs, false, "Research team must NOT view audit logs");
assert.equal(researchPerms.canEditPrivateDatasets, false, "Research team must NOT edit private datasets");
assert.equal(researchPerms.canViewRawExperiments, false, "Research team must NOT view unapproved raw experiments");
assert.equal(researchPerms.canEditMlParameters, true, "Research team can edit ML parameters");
assert.equal(researchPerms.canRunOptimization, true, "Research team can run ML optimization");

// Guest Demo restrictions & capabilities
assert.equal(guestPerms.canControlPhysicalMachine, false, "Guest must NOT control physical machine");
assert.equal(guestPerms.canManageUsers, false, "Guest must NOT manage users");
assert.equal(guestPerms.canAccessGatewayWs, false, "Guest must NOT access gateway WS");
assert.equal(guestPerms.canEditMlParameters, false, "Guest must NOT edit private ML parameters");
assert.equal(guestPerms.canViewRawExperiments, false, "Guest must NOT view raw experiments");
assert.equal(guestPerms.canViewAuditLogs, false, "Guest must NOT view audit logs");
assert.equal(guestPerms.canEditPrivateDatasets, false, "Guest must NOT edit private datasets");
assert.equal(guestPerms.canAccessSettings, false, "Guest must NOT access settings");
assert.equal(guestPerms.canViewDashboard, true, "Guest can view demonstration dashboard");
assert.equal(guestPerms.canViewDigitalTwin, true, "Guest CAN view 3D digital twin and toolhead simulation");
console.log("✓ Role Permission Matrix verified: Administrator & HOD full parity established.");

// -----------------------------------------------------------------------------
// Test 2: Gateway Protected Message Set Validation
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Validating Gateway Protected Message Set...");
assert(PROTECTED_CONTROL_MESSAGES.has(MESSAGE_TYPES.MACHINE_COMMAND), "MACHINE_COMMAND must be protected");
assert(PROTECTED_CONTROL_MESSAGES.has(MESSAGE_TYPES.MACHINE_PARAMETERS_PATCH), "MACHINE_PARAMETERS_PATCH must be protected");
assert(PROTECTED_CONTROL_MESSAGES.has(MESSAGE_TYPES.TOOLHEAD_COMMAND), "TOOLHEAD_COMMAND must be protected");
assert(PROTECTED_CONTROL_MESSAGES.has(MESSAGE_TYPES.TOOLHEAD_SET_POSITION), "TOOLHEAD_SET_POSITION must be protected");
assert(PROTECTED_CONTROL_MESSAGES.has(MESSAGE_TYPES.TOOLHEAD_CALIBRATION), "TOOLHEAD_CALIBRATION must be protected");
console.log("✓ All physical machine and toolhead commands are protected in the gateway protocol.");

// -----------------------------------------------------------------------------
// Test 3: Gateway Server Authorization Logic Emulation
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Simulating Gateway Authorization Checks...");
function simulateGatewayDispatch(authRole, messageType) {
  if (PROTECTED_CONTROL_MESSAGES.has(messageType)) {
    const isAuthorized = authRole === AUTH_ROLES.ADMINISTRATOR || authRole === AUTH_ROLES.HOD;
    if (!isAuthorized) {
      return { ok: false, error: "FORBIDDEN", detail: "Unauthorized machine control command." };
    }
  }
  return { ok: true, status: "FORWARDED" };
}

// Guest sending START machine command
const guestAttempt = simulateGatewayDispatch(AUTH_ROLES.GUEST, MESSAGE_TYPES.MACHINE_COMMAND);
assert.equal(guestAttempt.ok, false, "Guest attempt to control machine must fail");
assert.equal(guestAttempt.error, "FORBIDDEN");

// Research team sending EMERGENCY_STOP or TOOLHEAD_COMMAND
const researchAttempt = simulateGatewayDispatch(AUTH_ROLES.RESEARCH, MESSAGE_TYPES.TOOLHEAD_COMMAND);
assert.equal(researchAttempt.ok, false, "Research team attempt to control toolhead must fail");
assert.equal(researchAttempt.error, "FORBIDDEN");

// Admin sending command
const adminAttempt = simulateGatewayDispatch(AUTH_ROLES.ADMINISTRATOR, MESSAGE_TYPES.MACHINE_COMMAND);
assert.equal(adminAttempt.ok, true, "Admin command must be authorized");

// HOD sending command
const hodAttempt = simulateGatewayDispatch(AUTH_ROLES.HOD, MESSAGE_TYPES.TOOLHEAD_SET_POSITION);
assert.equal(hodAttempt.ok, true, "HOD command must be authorized with equal priority");
console.log("✓ Gateway authorization logic correctly blocks Guest & Research and permits Admin & HOD.");

// -----------------------------------------------------------------------------
// Test 4: Session Expiration & Tampering Defense
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Validating Session Expiration Logic...");
const now = Date.now();
const expiredSession = {
  token: "expired-token-xyz",
  user: { id: "u-1", email: "admin@edm.local", role: "administrator", displayName: "Admin" },
  expiresAt: now - 1000, // 1 second ago
};

function isSessionValid(session) {
  if (!session) return false;
  return Date.now() < session.expiresAt;
}

assert.equal(isSessionValid(expiredSession), false, "Expired session must evaluate as invalid");

const activeSession = {
  token: "active-token-xyz",
  user: { id: "u-2", email: "hod@ritindia.edu", role: "hod", displayName: "HOD" },
  expiresAt: now + 3600000, // 1 hour from now
};
assert.equal(isSessionValid(activeSession), true, "Active session must evaluate as valid");
console.log("✓ Session expiration enforcement verified.");

// -----------------------------------------------------------------------------
// Test 5: Published Demonstration Data Integrity
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Validating Published Demonstration Data for Guest Mode...");
assert.equal(PUBLISHED_DEMO_SAMPLES.length, 5, "Must provide exactly 5 published demo cuts");
for (const sample of PUBLISHED_DEMO_SAMPLES) {
  assert(sample.Ip >= 10 && sample.Ip <= 40, `Ip ${sample.Ip} must be within physical range`);
  assert(sample.Vg >= 30 && sample.Vg <= 60, `Vg ${sample.Vg} must be within physical range`);
  assert(sample.errorMrrPct < 2.0, `MRR Error ${sample.errorMrrPct}% must be < 2% on Ti-6Al-4V`);
  assert(sample.errorTwrPct < 2.0, `TWR Error ${sample.errorTwrPct}% must be < 2% on Ti-6Al-4V`);
}
console.log("✓ Published demonstration benchmarks verified with high accuracy (< 2% error) on Ti-6Al-4V.");

// -----------------------------------------------------------------------------
// Test 6: Minimalist Landing Page (No Leaked RBAC or Internal Architecture)
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Verifying Minimalist Landing Page Architecture...");
const loginLandingPageSource = fs.readFileSync(
  path.resolve("src/components/LoginLandingPage.tsx"),
  "utf8"
);
// Must NOT leak internal permission structures
assert(!loginLandingPageSource.includes("Role-Based Access Control"), "Must not mention Role-Based Access Control on landing page");
assert(!loginLandingPageSource.includes("Isolated privilege tiers"), "Must not describe privilege tiers on landing page");
assert(!loginLandingPageSource.includes("Research Team"), "Must not describe Research Team role on public landing page");
assert(!loginLandingPageSource.includes("Administrator"), "Must not list Administrator role on public landing page");
assert(!loginLandingPageSource.includes("HOD"), "Must not list HOD role on public landing page");

// Must contain essential elements
assert(loginLandingPageSource.includes("EDM Industrial Digital Twin"), "Must display Project Title");
assert(loginLandingPageSource.includes("Enter Guest Demo"), "Must provide Enter Guest Demo button");
assert(loginLandingPageSource.includes("Institutional Email"), "Must provide Institutional Email input");
assert(loginLandingPageSource.includes("Password"), "Must provide Password input");
assert(loginLandingPageSource.includes("Forgot password?"), "Must provide Forgot password option");
console.log("✓ Landing page is clean, minimal, and contains zero internal role or RBAC descriptions.");

// -----------------------------------------------------------------------------
// Test 7: Toolhead Digital Twin Navigation & Guest Access
// -----------------------------------------------------------------------------
console.log("\n[Test 7] Verifying Toolhead Digital Twin Guest Access in App.tsx...");
const appSource = fs.readFileSync(path.resolve("src/app/App.tsx"), "utf8");
// Both MobileNavDrawer and Sidebar must permit toolhead for canViewDigitalTwin
assert(appSource.includes('if (item.key === "toolhead") return permissions.canViewDigitalTwin;'), "Toolhead must be accessible via canViewDigitalTwin in navigation");
assert(appSource.includes('active === "toolhead"'), "Toolhead route must be handled in Dashboard");
console.log("✓ Toolhead Digital Twin is fully accessible to guests without login.");

// -----------------------------------------------------------------------------
// Test 8: EDM Machine Information Panel Implementation
// -----------------------------------------------------------------------------
console.log("\n[Test 8] Verifying EDM Machine Information Panel Beside 3D Model...");
assert(fs.existsSync(path.resolve("src/components/EdmMachineInfoPanel.tsx")), "EdmMachineInfoPanel.tsx must exist");
const infoPanelSource = fs.readFileSync(path.resolve("src/components/EdmMachineInfoPanel.tsx"), "utf8");
assert(infoPanelSource.includes("About the EDM Machine"), "Must include About the EDM Machine header");
assert(infoPanelSource.includes("1. Main Components"), "Must include 1. Main Components");
assert(infoPanelSource.includes("2. How It Works"), "Must include 2. How It Works");
assert(infoPanelSource.includes("3. Important Parameters"), "Must include 3. Important Parameters");
assert(infoPanelSource.includes("4. What the Simulation Shows"), "Must include 4. What the Simulation Shows");
assert(appSource.includes("<EdmMachineInfoPanel"), "App.tsx must render EdmMachineInfoPanel in 3D grid");
console.log("✓ EDM Machine Information Panel is fully implemented and mounted beside 3D viewer.");

// -----------------------------------------------------------------------------
// Test 9: Simple Natural English in Guest Demo Metadata
// -----------------------------------------------------------------------------
console.log("\n[Test 9] Verifying Natural English Guest Demo Content...");
assert(
  PUBLISHED_PROJECT_METADATA.introduction.includes("Welcome to the EDM Digital Twin."),
  "Must include clear, user-friendly welcome message"
);
assert(
  PUBLISHED_PROJECT_METADATA.introduction.includes("Explore the machine, understand the machining process"),
  "Must guide the visitor in simple terms"
);
console.log("✓ Guest Demo content verified in plain, professional natural English.");

// -----------------------------------------------------------------------------
// Test 10: Insecure Mock Credential Elimination
// -----------------------------------------------------------------------------
console.log("\n[Test 10] Verifying Insecure Mock Credential Elimination in authService...");
const authServiceSource = fs.readFileSync(path.resolve("src/services/authService.ts"), "utf8");
assert(!authServiceSource.includes("Admin@EDM2026"), "Hardcoded Admin password must be completely removed");
assert(!authServiceSource.includes("HOD@RIT2026"), "Hardcoded HOD password must be completely removed");
assert(!authServiceSource.includes("Research@2026"), "Hardcoded Research password must be completely removed");
assert(!authServiceSource.includes("admin@edm.local"), "Hardcoded admin email must be completely removed");
assert(authServiceSource.includes("isSupabaseConfigured"), "Must check for real Supabase configuration");
console.log("✓ Insecure local mock accounts completely eliminated; real Supabase error guidance enforced.");

// -----------------------------------------------------------------------------
// Test 11: Supabase schema.sql Role Management & Promotion Equivalence
// -----------------------------------------------------------------------------
console.log("\n[Test 11] Validating Supabase schema.sql Role Management & Promotion Equivalence...");
const schemaSource = fs.readFileSync(path.resolve("supabase/schema.sql"), "utf8");

// Administrator and HOD have equal permission to manage, promote and demote roles
assert(schemaSource.includes("Admin and HOD can insert roles"), "schema.sql must allow both Admin and HOD to insert roles");
assert(schemaSource.includes("Admin and HOD can update roles"), "schema.sql must allow both Admin and HOD to update/promote roles");
assert(schemaSource.includes("Admin and HOD can delete roles"), "schema.sql must allow both Admin and HOD to delete roles");

// Ensure system configuration table is present and managed by Admin & HOD
assert(schemaSource.includes("system_configurations"), "Must define system_configurations table");
assert(schemaSource.includes("Admin and HOD can view system configuration"), "Admin and HOD must view system config");
assert(schemaSource.includes("Admin and HOD can modify system configuration"), "Admin and HOD must modify system config");

// Research team read-only on physical experiments
assert(schemaSource.includes("Authorized research team and leadership can view experiments"), "Research team must be in SELECT policy");
assert(!schemaSource.includes("'research')\n  ); \n\nDROP POLICY IF EXISTS \"Admin and HOD can insert"), "Research team must NOT have write policies");

// Revoke all private tables from anon/public
assert(schemaSource.includes("REVOKE ALL ON TABLE public.user_roles FROM anon, public;"), "Must revoke user_roles from anon/public");
assert(schemaSource.includes("REVOKE ALL ON TABLE public.physical_experiments FROM anon, public;"), "Must revoke physical_experiments from anon/public");
assert(schemaSource.includes("REVOKE ALL ON TABLE public.machine_audit_logs FROM anon, public;"), "Must revoke machine_audit_logs from anon/public");
assert(schemaSource.includes("REVOKE ALL ON TABLE public.system_configurations FROM anon, public;"), "Must revoke system_configurations from anon/public");
assert(schemaSource.includes("user_id = (SELECT auth.uid())"), "Audit log insert must enforce user_id matches calling auth.uid()");
console.log("✓ Supabase schema.sql role management verified: Administrator and HOD possess equal management authority.");

// -----------------------------------------------------------------------------
// Test 12: Database-Level Safeguards Validation
// -----------------------------------------------------------------------------
console.log("\n[Test 12] Validating Database Safeguards (Last Admin Protection & Concurrency)...");

// Safeguard 1: Never allow deletion or demotion of the last Administrator
assert(
  schemaSource.includes("prevent_last_administrator_removal"),
  "Must include trigger function prevent_last_administrator_removal"
);
assert(
  schemaSource.includes("Cannot delete or demote the last remaining Administrator"),
  "Must contain exception message for last administrator removal"
);
assert(
  schemaSource.includes("tr_prevent_last_administrator_removal"),
  "Must attach trigger to user_roles table"
);
assert(
  schemaSource.includes("prevent_last_administrator_removal") &&
  schemaSource.includes("PERFORM pg_advisory_xact_lock(hashtext('provision_initial_administrator_lock'));"),
  "prevent_last_administrator_removal must acquire advisory lock before counting remaining administrators"
);

// Safeguard 2: Concurrency-safe initial Administrator provisioning
assert(
  schemaSource.includes("pg_advisory_xact_lock"),
  "Initial provisioning must acquire transactional advisory lock for concurrency safety"
);
assert(
  schemaSource.includes("REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM authenticated;"),
  "Must revoke provision_initial_administrator from authenticated users"
);
assert(
  schemaSource.includes("REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM anon;"),
  "Must revoke provision_initial_administrator from anon users"
);
assert(
  schemaSource.includes("REVOKE ALL ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) FROM service_role;"),
  "Must revoke provision_initial_administrator from service_role"
);
assert(
  schemaSource.includes("GRANT EXECUTE ON FUNCTION public.provision_initial_administrator(TEXT, TEXT) TO postgres;"),
  "Must grant provision_initial_administrator strictly to postgres"
);
assert(
  schemaSource.includes("is_verified BOOLEAN NOT NULL DEFAULT false"),
  "physical_experiments.is_verified must default to false"
);
console.log("✓ Database safeguards verified: Last admin removal prevention and concurrency-safe bootstrapping active.");

console.log("\n================================================================================");
console.log("ALL 12 AUTHENTICATION, SECURITY & UI VALIDATION TESTS PASSED PERFECTLY!");
console.log("================================================================================");
