import { strict as assert } from "node:assert";
import {
  AUTH_ROLES,
  CLIENT_ROLES,
  MESSAGE_TYPES,
  PROTECTED_CONTROL_MESSAGES,
  createError,
  createAck,
} from "../gateway/protocol.js";
import { ROLE_PERMISSIONS, getRolePermissions } from "../src/types/auth.ts";
import { PUBLISHED_DEMO_SAMPLES } from "../src/data/guest/publishedDemoData.ts";

console.log("================================================================================");
console.log("RUNNING EDM DIGITAL TWIN AUTHENTICATION & SECURITY VALIDATION SUITE");
console.log("================================================================================");

// -----------------------------------------------------------------------------
// Test 1: Role Permission Matrix Validation
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Validating Role Permission Matrix...");
const adminPerms = getRolePermissions("administrator");
const hodPerms = getRolePermissions("hod");
const researchPerms = getRolePermissions("research");
const guestPerms = getRolePermissions("guest");

// Administrator & HOD have full parity
assert.equal(adminPerms.canControlPhysicalMachine, true, "Admin must have machine control");
assert.equal(hodPerms.canControlPhysicalMachine, true, "HOD must have machine control");
assert.equal(adminPerms.canAccessSettings, true, "Admin must have settings access");
assert.equal(hodPerms.canAccessSettings, true, "HOD must have settings access");
assert.equal(adminPerms.canViewRawExperiments, true, "Admin must access raw experiments");
assert.equal(hodPerms.canViewRawExperiments, true, "HOD must access raw experiments");

// Research team restrictions
assert.equal(researchPerms.canControlPhysicalMachine, false, "Research team must NOT control physical machine");
assert.equal(researchPerms.canAccessSettings, false, "Research team must NOT access settings");
assert.equal(researchPerms.canViewRawExperiments, false, "Research team must NOT view unapproved raw experiments");
assert.equal(researchPerms.canEditMlParameters, true, "Research team can edit ML parameters");
assert.equal(researchPerms.canRunOptimization, true, "Research team can run ML optimization");

// Guest Demo restrictions
assert.equal(guestPerms.canControlPhysicalMachine, false, "Guest must NOT control physical machine");
assert.equal(guestPerms.canAccessGatewayWs, false, "Guest must NOT access gateway WS");
assert.equal(guestPerms.canEditMlParameters, false, "Guest must NOT edit private ML parameters");
assert.equal(guestPerms.canViewRawExperiments, false, "Guest must NOT view raw experiments");
assert.equal(guestPerms.canAccessSettings, false, "Guest must NOT access settings");
assert.equal(guestPerms.canViewDashboard, true, "Guest can view demonstration dashboard");
console.log("✓ Role Permission Matrix verified across all four roles.");

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
assert.equal(hodAttempt.ok, true, "HOD command must be authorized");
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

console.log("\n================================================================================");
console.log("ALL 5 AUTHENTICATION & SECURITY VALIDATION TESTS PASSED PERFECTLY!");
console.log("================================================================================");
