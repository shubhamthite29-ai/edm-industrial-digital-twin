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
 * Standardized Authentication Service
 * Seamlessly interfaces with Supabase Auth when configured,
 * while maintaining a robust client-side session and verification layer.
 */
class AuthService {
  private currentSession: AuthSession | null = null;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor() {
    this.supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
    this.supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";
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
   * Authenticate with email and password.
   */
  async signIn(email: string, password: string): Promise<AuthSession> {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error("Please enter both email and password.");
    }

    // 1. If Supabase is configured in environment, authenticate through Supabase Auth
    if (this.isSupabaseConfigured()) {
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

        // Fetch user role from public.user_roles
        const roleResponse = await fetch(`${this.supabaseUrl}/rest/v1/user_roles?user_id=eq.${data.user.id}&select=*`, {
          headers: {
            apikey: this.supabaseAnonKey,
            Authorization: `Bearer ${data.access_token}`,
          },
        });

        const roleRows = await roleResponse.json();
        const roleRecord = roleRows?.[0];
        const assignedRole: AuthRole = roleRecord?.role ?? "research";

        const session: AuthSession = {
          token: data.access_token,
          user: {
            id: data.user.id,
            email: data.user.email,
            displayName: roleRecord?.display_name || data.user.user_metadata?.display_name || cleanEmail.split("@")[0],
            role: assignedRole,
            department: roleRecord?.department || "Mechatronics Engineering",
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

    // 2. Standalone Provisioned Profiles (For development and testing before cloud linkage)
    // Supports verified institutional roles
    const demoAccounts: Record<string, { role: AuthRole; displayName: string; defaultPass: string }> = {
      "admin@edm.local": {
        role: "administrator",
        displayName: "Lead Digital Twin Engineer (Admin)",
        defaultPass: "Admin@EDM2026",
      },
      "hod@ritindia.edu": {
        role: "hod",
        displayName: "Dr. Shailesh Shirguppikar (HOD)",
        defaultPass: "HOD@RIT2026",
      },
      "research@ritindia.edu": {
        role: "research",
        displayName: "EDM Research Fellow",
        defaultPass: "Research@2026",
      },
    };

    const matched = demoAccounts[cleanEmail];
    if (matched && password === matched.defaultPass) {
      const session: AuthSession = {
        token: `local-auth-token-${matched.role}-${Date.now()}`,
        user: {
          id: `local-usr-${matched.role}`,
          email: cleanEmail,
          displayName: matched.displayName,
          role: matched.role,
          department: "Mechatronics Engineering",
          lastLogin: new Date().toISOString(),
        },
        expiresAt: Date.now() + AUTH_SESSION_DURATION_MS,
      };

      this.persistSession(session);
      return session;
    }

    throw new Error("Invalid email or password. Please verify your credentials or enter as Guest Demo.");
  }

  /**
   * Password reset request.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Please enter your registered institutional email address.");
    }

    if (this.isSupabaseConfigured()) {
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

    // Local simulation response
    return {
      success: true,
      message: `Password reset instructions sent for ${cleanEmail}. Please check your institutional inbox.`,
    };
  }

  /**
   * Terminate active session and clear storage.
   */
  signOut(): void {
    this.currentSession = null;
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
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
      sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
      localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    } catch (err) {
      console.warn("[AuthService] Failed to persist session in browser storage:", err);
    }
    notifyListeners(session);
  }

  private restoreSession(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;

      const parsed: AuthSession = JSON.parse(raw);
      if (parsed && parsed.expiresAt && Date.now() < parsed.expiresAt) {
        this.currentSession = parsed;
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (err) {
      console.warn("[AuthService] Error parsing persisted session:", err);
    }
  }
}

export const authService = new AuthService();
