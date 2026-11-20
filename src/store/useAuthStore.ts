import { create } from "zustand";
import { authService } from "../services/authService";
import {
  type AuthRole,
  type AuthSession,
  type AuthUser,
  type RolePermissions,
  getRolePermissions,
} from "../types/auth";

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  role: AuthRole;
  permissions: RolePermissions;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  error: string | null;

  signIn: (email: string, pass: string) => Promise<void>;
  enterGuestDemo: () => void;
  signOut: () => void;
  requestPasswordReset: (email: string) => Promise<string>;
  clearError: () => void;
}

const initialSession = authService.getCurrentSession();
const initialUser = initialSession?.user ?? null;
const initialRole: AuthRole = initialUser?.role ?? "guest";

export const useAuthStore = create<AuthState>((set) => {
  // Sync with service-level auth events
  authService.onAuthStateChange((session) => {
    if (session) {
      set({
        session,
        user: session.user,
        role: session.user.role,
        permissions: getRolePermissions(session.user.role),
        status: "authenticated",
        error: null,
      });
    } else {
      set({
        session: null,
        user: null,
        role: "guest",
        permissions: getRolePermissions("guest"),
        status: "unauthenticated",
      });
    }
  });

  return {
    user: initialUser,
    session: initialSession,
    role: initialRole,
    permissions: getRolePermissions(initialRole),
    status: initialSession ? "authenticated" : "unauthenticated",
    error: null,

    signIn: async (email, pass) => {
      set({ status: "loading", error: null });
      try {
        const session = await authService.signIn(email, pass);
        set({
          session,
          user: session.user,
          role: session.user.role,
          permissions: getRolePermissions(session.user.role),
          status: "authenticated",
          error: null,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Authentication failed.";
        set({
          status: "unauthenticated",
          error: message,
        });
        throw err;
      }
    },

    enterGuestDemo: () => {
      const session = authService.enterGuestDemo();
      set({
        session,
        user: session.user,
        role: "guest",
        permissions: getRolePermissions("guest"),
        status: "authenticated",
        error: null,
      });
    },

    signOut: () => {
      authService.signOut();
      set({
        session: null,
        user: null,
        role: "guest",
        permissions: getRolePermissions("guest"),
        status: "unauthenticated",
        error: null,
      });
    },

    requestPasswordReset: async (email) => {
      const result = await authService.requestPasswordReset(email);
      return result.message;
    },

    clearError: () => set({ error: null }),
  };
});
