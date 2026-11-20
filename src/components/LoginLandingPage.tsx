import React, { useState } from "react";
import {
  Boxes,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

export const LoginLandingPage: React.FC = () => {
  const { signIn, enterGuestDemo, requestPasswordReset, status, error, clearError } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await signIn(email, password);
    } catch {
      // Error message is stored and displayed from authStore
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage(null);
    try {
      const msg = await requestPasswordReset(resetEmail);
      setResetMessage(msg);
    } catch (err: unknown) {
      setResetMessage(err instanceof Error ? err.message : "Password reset failed.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between bg-plant-void font-sans text-plant-text">
      {/* Background industrial grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, #1f2937 1px, transparent 1px), linear-gradient(to bottom, #1f2937 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Top institution bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between border-b border-plant-line/70 bg-plant-deck/80 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-plant-cyan/40 bg-plant-cyan/10 text-plant-cyan">
            <Boxes size={20} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-plant-text">
              Rajarambapu Institute of Technology
            </div>
            <div className="text-[10px] uppercase tracking-widest text-plant-muted">
              Department of Mechatronics Engineering
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 font-mono text-xs text-plant-cyan sm:flex">
          <span className="h-2 w-2 rounded-full bg-plant-green animate-pulse" />
          <span>ELEKTRA PULS S-50 ZNC</span>
        </div>
      </header>

      {/* Centered minimalist industrial login container */}
      <main className="relative z-10 mx-auto my-auto flex w-full max-w-md flex-col p-4">
        <div className="rounded-xl border border-plant-line bg-plant-panel/95 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          {/* Project Title and single description */}
          <div className="border-b border-plant-line pb-4 text-center">
            <h1 className="text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
              EDM Industrial Digital Twin
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-plant-muted">
              Digital twin platform for Electrical Discharge Machining (EDM) process visualization, parameter monitoring, and experimental performance prediction.
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-plant-red/50 bg-plant-red/10 p-3 text-xs text-plant-red leading-relaxed" role="alert">
              {error}
            </div>
          ) : null}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-plant-muted" htmlFor="login-email">
                Email Address
              </label>
              <div className="mt-1.5 flex items-center rounded-lg border border-plant-line bg-plant-void px-3 py-2 focus-within:border-plant-cyan">
                <Mail size={16} className="text-plant-muted shrink-0" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@ritindia.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ml-2.5 w-full bg-transparent font-mono text-xs text-plant-text outline-none placeholder:text-plant-muted/60"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-plant-muted" htmlFor="login-password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setIsResetOpen(true)}
                  className="text-[11px] text-plant-cyan hover:underline focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
              <div className="mt-1.5 flex items-center rounded-lg border border-plant-line bg-plant-void px-3 py-2 focus-within:border-plant-cyan">
                <Lock size={16} className="text-plant-muted shrink-0" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ml-2.5 w-full bg-transparent font-mono text-xs text-plant-text outline-none placeholder:text-plant-muted/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="text-plant-muted hover:text-plant-text focus:outline-none"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-plant-cyan font-semibold uppercase tracking-wider text-plant-void shadow-lg transition hover:bg-plant-cyan/90 disabled:opacity-50"
            >
              {status === "loading" ? "Authenticating..." : "Sign In"}
            </button>
          </form>

          {/* Guest Demo Section */}
          <div className="mt-6 border-t border-plant-line pt-6">
            <button
              type="button"
              onClick={enterGuestDemo}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-plant-cyan/50 bg-plant-cyan/10 font-bold uppercase tracking-wider text-plant-cyan transition hover:bg-plant-cyan/20 active:scale-[0.99]"
            >
              <Sparkles size={16} />
              Enter Guest Demo
            </button>
            <p className="mt-2 text-center text-[11px] text-plant-muted leading-relaxed">
              Instant read-only access to 3D visualizations, toolhead simulation and experimental results. No login required.
            </p>
          </div>
        </div>
      </main>

      {/* Forgot Password Modal */}
      {isResetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-plant-line bg-plant-deck p-6 shadow-2xl">
            <h3 className="text-base font-bold uppercase tracking-wide text-white">
              Password Recovery
            </h3>
            <p className="mt-1 text-xs text-plant-muted leading-relaxed">
              Enter your registered email address to receive recovery instructions.
            </p>

            {resetMessage ? (
              <div className="mt-3 rounded border border-plant-cyan/40 bg-plant-cyan/10 p-2.5 text-xs text-plant-cyan leading-relaxed">
                {resetMessage}
              </div>
            ) : null}

            <form onSubmit={handlePasswordReset} className="mt-4 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-plant-muted" htmlFor="reset-email">
                  Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@ritindia.edu"
                  className="mt-1 h-10 w-full rounded border border-plant-line bg-plant-void px-3 text-xs text-plant-text outline-none focus:border-plant-cyan"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetOpen(false);
                    setResetMessage(null);
                  }}
                  className="h-9 rounded px-3 text-xs font-semibold text-plant-muted hover:text-plant-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="h-9 rounded bg-plant-cyan px-4 text-xs font-semibold uppercase text-plant-void hover:bg-plant-cyan/90 disabled:opacity-50"
                >
                  {resetLoading ? "Sending..." : "Request Reset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <footer className="relative z-10 border-t border-plant-line/70 bg-plant-deck/60 px-4 py-3 text-center text-[10px] uppercase tracking-wider text-plant-muted">
        <span>EDM Industrial Digital Twin / Department of Mechatronics Engineering</span>
      </footer>
    </div>
  );
};
