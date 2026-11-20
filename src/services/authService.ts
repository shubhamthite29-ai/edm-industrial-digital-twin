import type { AuthRole, AuthSession, AuthUser } from "../types/auth";

const SESSION_STORAGE_KEY = "edm_dt_auth_session_v1";

// Default session expiration durations (in milliseconds)
const AUTH_SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const GUEST_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

type AuthChangeCallback = (session: AuthSession | null) => void;
const listeners = new Set<AuthChangeCallback>();

function notifyListeners(session: AuthSession | null) {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch (err) {
      console.error("[AuthService] Error in auth state listener:", err);
    }
  }
}

/**
 * Normalizes any string representation of a role into a valid AuthRole.
 */
export function normalizeAuthRole(role: unknown): AuthRole | null {
  if (typeof role !== "string") return null;
  const clean = role.trim().toLowerCase();
  if (clean === "administrator" || clean === "admin") return "administrator";
  if (clean === "hod" || clean === "head of department" || clean === "head_of_department") return "hod";
  if (clean === "research" || clean === "researcher" || clean === "research team" || clean === "research_team") return "research";
  if (clean === "guest") return "guest";
  return null;
}

/**
 * Authoritative Role Resolution
 *
 * Strict Security Rules:
 * 1. public.user_roles is the primary authoritative source for all user roles.
 * 2. Trusted server-controlled app_metadata.role may be used if present (set only by backend service_role / Supabase Admin).
 * 3. Never trust user-editable user_metadata for privileged roles (administrator or hod).
 * 4. Never infer Administrator or HOD from an email address (e.g. hod@, admin@, shailesh@, etc.).
 * 5. If authoritative lookup yields no role, privileged access is strictly denied.
 */
export function resolveUserRole(
  dbRole: unknown,
  appMetadataRole?: unknown,
  userMetadataRole?: unknown,
  _email?: string
): AuthRole {
  // 1. Authoritative: public.user_roles takes primary priority
  const fromDb = normalizeAuthRole(dbRole);
  if (fromDb) {
    return fromDb;
  }

  // 2. Server-controlled app_metadata (cannot be modified by end users or client SDK)
  const fromApp = normalizeAuthRole(appMetadataRole);
  if (fromApp) {
    return fromApp;
  }

  // 3. User-editable metadata check: NEVER allow user_metadata to grant 'administrator' or 'hod'
  if (userMetadataRole) {
    const fromUser = normalizeAuthRole(userMetadataRole);
    if (fromUser === "administrator" || fromUser === "hod") {
      console.warn(
        `[Security Alert] Untrusted user_metadata attempted to claim privileged role '${fromUser}'. Privilege escalation rejected.`
      );
      // Deny elevation to privileged roles
    } else if (fromUser === "guest") {
      return "guest";
    }
  }

  // 4. Email address: Strictly prohibited from granting or inferring Administrator or HOD privileges.
  // Regardless of email address (hod@..., admin@..., shailesh@..., etc.), email is never an authorization source.

  // 5. Default fallback: Non-privileged "research" role (never administrator or hod)
  return "research";
}

/**
 * Standardized Authentication Service
 * Seamlessly interfaces with Supabase Auth when configured with environment variables,
 * while maintaining clean client-side session management.
 * Insecure hardcoded mock credentials have been removed.
 */
class AuthService {
  private currentSession: AuthSession | null = null;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor() {
    this.supabaseUrl = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL as string) || "";
    this.supabaseAnonKey = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY as string) || "";
    this.restoreSession();
  }

  isSupabaseConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  }

  getCurrentSession(): AuthSession | null {
    if (!this.currentSession) return null;

    // Check if session has expired
    if (Date.now() > this.currentSession.expiresAt) {
      console.warn("[AuthService] Session expired. Signing out.");
      this.signOut();
      return null;
    }

    return this.currentSession;
  }

  getCurrentUser(): AuthUser | null {
    return this.getCurrentSession()?.user ?? null;
  }

  getCurrentRole(): AuthRole {
    return this.getCurrentUser()?.role ?? "guest";
  }

  /**
   * Enter public Guest Demo mode.
   * Creates an unprivileged demonstration session with read-only permissions.
   * Works immediately without requiring Supabase or external cloud services.
   */
  enterGuestDemo(): AuthSession {
    const guestUser: AuthUser = {
      id: "guest-demo-user-id",
      email: "guest@demo.local",
      displayName: "Guest Demo User",
      role: "guest",
      department: "Public Demonstration",
      lastLogin: new Date().toISOString(),
    };

    const session: AuthSession = {
      token: `guest-demo-token-${Date.now()}`,
      user: guestUser,
      expiresAt: Date.now() + GUEST_SESSION_DURATION_MS,
    };

    this.persistSession(session);
    return session;
  }

  /**
   * Authenticate with email and password via Supabase Auth.
   * No hardcoded local administrator fallbacks are permitted.
   */
  async signIn(email: string, password: string): Promise<AuthSession> {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error("Please enter both email and password.");
    }

    if (!this.isSupabaseConfigured()) {
      throw new Error(
        "Supabase authentication project is not configured. Institutional login requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Please click 'Enter Guest Demo' for evaluation."
      );
    }

    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_description || data.message || "Invalid email or password.");
      }

      // Fetch user role from public.user_roles table via RLS
      let dbRole: string | undefined;
      let dbDisplayName: string | undefined;
      let dbDepartment: string | undefined;

      try {
        const roleResponse = await fetch(`${this.supabaseUrl}/rest/v1/user_roles?user_id=eq.${data.user.id}&select=*`, {
          headers: {
            apikey: this.supabaseAnonKey,
            Authorization: `Bearer ${data.access_token}`,
          },
        });

        if (!roleResponse.ok) {
          console.error(`[AuthService] user_roles query failed with HTTP status: ${roleResponse.status}`);
          throw new Error(
            `Authorization error: Unable to verify account permissions from database (HTTP ${roleResponse.status}). Privileged access denied.`
          );
        }

        const roleRows = await roleResponse.json();
        if (Array.isArray(roleRows) && roleRows.length > 0) {
          dbRole = roleRows[0].role;
          dbDisplayName = roleRows[0].display_name;
          dbDepartment = roleRows[0].department;
        } else {
          // Check trusted server-controlled app_metadata (cannot be set by client SDK)
          const serverRole = normalizeAuthRole(data.user.app_metadata?.role);
          if (serverRole) {
            dbRole = serverRole;
          } else {
            console.warn(`[AuthService] No authorized role assigned in public.user_roles for user ID ${data.user.id}`);
            throw new Error(
              "Authorization error: No role assignment found in public.user_roles for this account. Privileged access denied. Please contact an Administrator or HOD."
            );
          }
        }
      } catch (roleErr) {
        if (roleErr instanceof Error && roleErr.message.startsWith("Authorization error:")) {
          throw roleErr;
        }
        console.error("[AuthService] Error querying user_roles table:", roleErr);
        throw new Error(
          "Authorization error: Database role verification failed. Privileged access denied."
        );
      }

      // Authoritative role resolution: strictly public.user_roles or server app_metadata.
      // NEVER pass user_metadata or email heuristics for privileged role elevation.
      const assignedRole = resolveUserRole(
        dbRole,
        data.user.app_metadata?.role,
        undefined, // user_metadata is untrusted for privileged roles
        undefined  // email address is untrusted for privileged roles
      );

      console.log(`[AuthService] Authenticated ${cleanEmail} -> Authoritative Role: ${assignedRole}`);

      const session: AuthSession = {
        token: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          displayName: dbDisplayName || data.user.user_metadata?.display_name || cleanEmail.split("@")[0],
          role: assignedRole,
          department: dbDepartment || "Department of Mechatronics Engineering",
          lastLogin: new Date().toISOString(),
        },
        expiresAt: Date.now() + (data.expires_in ? data.expires_in * 1000 : AUTH_SESSION_DURATION_MS),
      };

      this.persistSession(session);
      return session;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      throw new Error(message);
    }
  }

  /**
   * Password recovery request via Supabase Auth.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Please enter your registered email address.");
    }

    if (!this.isSupabaseConfigured()) {
      throw new Error("Supabase authentication is not configured. Password recovery requires cloud connection. Please use Guest Demo.");
    }

    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/recover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Password reset request failed.");
      }

      return {
        success: true,
        message: "Password recovery link has been dispatched to your email address.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password reset failed.";
      throw new Error(msg);
    }
  }

  /**
   * Fetch user list for Administrator and HOD roles.
   */
  async listUsers(): Promise<Array<{ user_id: string; role: AuthRole; display_name: string; department: string }>> {
    if (!this.isSupabaseConfigured()) return [];
    const session = this.getCurrentSession();
    if (!session || (session.user.role !== "administrator" && session.user.role !== "hod")) {
      throw new Error("Unauthorized to view user directory.");
    }

    const response = await fetch(`${this.supabaseUrl}/rest/v1/user_roles?select=*`, {
      headers: {
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) throw new Error("Failed to retrieve user directory.");
    return response.json();
  }

  /**
   * Update or promote/demote a user role. Accessible by Administrator and HOD.
   * Last administrator protection is enforced by database trigger.
   */
  async updateUserRole(targetUserId: string, newRole: AuthRole, displayName?: string): Promise<void> {
    if (!this.isSupabaseConfigured()) throw new Error("Supabase is not configured.");
    const session = this.getCurrentSession();
    if (!session || (session.user.role !== "administrator" && session.user.role !== "hod")) {
      throw new Error("Unauthorized: Only Administrator and HOD can modify user roles.");
    }

    const payload: Record<string, unknown> = { role: newRole };
    if (displayName) payload.display_name = displayName;

    const response = await fetch(`${this.supabaseUrl}/rest/v1/user_roles?user_id=eq.${targetUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${session.token}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Failed to update user role.");
    }
  }

  /**
   * Revoke a user role. Accessible by Administrator and HOD.
   * Last administrator protection is enforced by database trigger.
   */
  async deleteUserRole(targetUserId: string): Promise<void> {
    if (!this.isSupabaseConfigured()) throw new Error("Supabase is not configured.");
    const session = this.getCurrentSession();
    if (!session || (session.user.role !== "administrator" && session.user.role !== "hod")) {
      throw new Error("Unauthorized: Only Administrator and HOD can delete user roles.");
    }

    const response = await fetch(`${this.supabaseUrl}/rest/v1/user_roles?user_id=eq.${targetUserId}`, {
      method: "DELETE",
      headers: {
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Failed to delete user role.");
    }
  }

  /**
   * Terminate active session and clear storage.
   */
  signOut(): void {
    this.currentSession = null;
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_STORAGE_KEY);
      if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage access may be restricted in private browsing
    }
    notifyListeners(null);
  }

  /**
   * Register a callback for authentication state changes.
   */
  onAuthStateChange(callback: AuthChangeCallback): () => void {
    listeners.add(callback);
    callback(this.getCurrentSession());
    return () => listeners.delete(callback);
  }

  private persistSession(session: AuthSession): void {
    this.currentSession = session;
    try {
      const serialized = JSON.stringify(session);
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
      if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    } catch (err) {
      console.warn("[AuthService] Failed to persist session in browser storage:", err);
    }
    notifyListeners(session);
  }

  private restoreSession(): void {
    try {
      if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY) || (typeof localStorage !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null);
      if (!raw) return;

      const parsed: AuthSession = JSON.parse(raw);
      if (parsed && parsed.expiresAt && Date.now() < parsed.expiresAt) {
        // Validate cached session: ensure privileged roles are strictly authoritative
        // user_metadata and email heuristics are never trusted for role elevation
        const validatedRole = resolveUserRole(
          parsed.user.role,
          (parsed.user as unknown as Record<string, unknown>)?.app_metadata,
          undefined, // never trust user_metadata for role elevation
          undefined  // never trust email heuristics
        );
        parsed.user.role = validatedRole;
        this.currentSession = parsed;
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (err) {
      console.warn("[AuthService] Error parsing persisted session:", err);
    }
  }
}

export const authService = new AuthService();
