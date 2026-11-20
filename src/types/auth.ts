export type AuthRole = "administrator" | "hod" | "research" | "guest";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: AuthRole;
  department?: string;
  lastLogin?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAt: number; // Unix timestamp in ms
}

export interface RolePermissions {
  canViewDashboard: boolean;
  canViewDigitalTwin: boolean;
  canViewResearchMl: boolean;
  canEditMlParameters: boolean;
  canRunOptimization: boolean;
  canViewRawExperiments: boolean;
  canExportReports: boolean;
  canControlPhysicalMachine: boolean;
  canAccessGatewayWs: boolean;
  canManageUsers: boolean;
  canAccessSettings: boolean;
}

export const ROLE_PERMISSIONS: Record<AuthRole, RolePermissions> = {
  administrator: {
    canViewDashboard: true,
    canViewDigitalTwin: true,
    canViewResearchMl: true,
    canEditMlParameters: true,
    canRunOptimization: true,
    canViewRawExperiments: true,
    canExportReports: true,
    canControlPhysicalMachine: true,
    canAccessGatewayWs: true,
    canManageUsers: true,
    canAccessSettings: true,
  },
  hod: {
    canViewDashboard: true,
    canViewDigitalTwin: true,
    canViewResearchMl: true,
    canEditMlParameters: true,
    canRunOptimization: true,
    canViewRawExperiments: true,
    canExportReports: true,
    canControlPhysicalMachine: true,
    canAccessGatewayWs: true,
    canManageUsers: true,
    canAccessSettings: true,
  },
  research: {
    canViewDashboard: true,
    canViewDigitalTwin: true,
    canViewResearchMl: true,
    canEditMlParameters: true,
    canRunOptimization: true,
    canViewRawExperiments: false, // Restricted from raw unapproved physical cuts
    canExportReports: true,
    canControlPhysicalMachine: false, // Physical control disabled
    canAccessGatewayWs: false,
    canManageUsers: false,
    canAccessSettings: false,
  },
  guest: {
    canViewDashboard: true,
    canViewDigitalTwin: true,
    canViewResearchMl: true, // Curated demonstration view only
    canEditMlParameters: false, // Read-only demonstration presets
    canRunOptimization: false,
    canViewRawExperiments: false,
    canExportReports: false,
    canControlPhysicalMachine: false,
    canAccessGatewayWs: false,
    canManageUsers: false,
    canAccessSettings: false,
  },
};

export function getRolePermissions(role: AuthRole): RolePermissions {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.guest;
}

export function roleDisplayLabel(role: AuthRole): string {
  switch (role) {
    case "administrator":
      return "Administrator";
    case "hod":
      return "Head of Department (HOD)";
    case "research":
      return "Research Team";
    case "guest":
      return "Guest Demo";
    default:
      return "Guest";
  }
}
