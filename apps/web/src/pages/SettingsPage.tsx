import { Button, Card } from "@skatingx/ui";
import { FormEvent, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";

function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="font-medium text-slate-700">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </label>
  );
}

export function SettingsPage() {
  const {
    user,
    uid,
    isAnonymous,
    loading,
    authError,
    firebaseReady,
    clearAuthError,
    linkEmailPassword,
    signInEmailPassword,
    logout,
  } = useAuth();

  const [bindEmail, setBindEmail] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  async function handleBindSubmit(event: FormEvent) {
    event.preventDefault();
    if (bindPassword.length < 6) {
      return;
    }
    setFormBusy(true);
    clearAuthError();
    try {
      await linkEmailPassword(bindEmail, bindPassword);
      setBindEmail("");
      setBindPassword("");
    } catch {
      // authError set in provider
    } finally {
      setFormBusy(false);
    }
  }

  async function handleSignInSubmit(event: FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    clearAuthError();
    try {
      await signInEmailPassword(signInEmail, signInPassword);
      setSignInEmail("");
      setSignInPassword("");
    } catch {
      // authError set in provider
    } finally {
      setFormBusy(false);
    }
  }

  async function handleLogout() {
    const confirmed = window.confirm(
      "Sign out? You will return to a new guest session. Unsaved guest data on this device will not carry over to a registered account unless you linked first.",
    );
    if (!confirmed) return;
    setFormBusy(true);
    try {
      await logout();
    } finally {
      setFormBusy(false);
    }
  }

  const accountLabel = loading
    ? "Loading…"
    : !firebaseReady
      ? "Firebase not configured"
      : isAnonymous
        ? "Guest (anonymous)"
        : "Registered User";

  const emailDisplay = user?.email ?? "—";

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-slate-600">
        Account and authentication. Profile and athlete data sync come in a
        later phase.
      </p>

      <Card title="Current user" className="mt-6">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">{accountLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">UID</dt>
            <dd className="font-mono text-xs text-slate-800 break-all">
              {loading ? "…" : (uid ?? "—")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Anonymous</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : isAnonymous ? "Yes" : "No"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{emailDisplay}</dd>
          </div>
        </dl>
      </Card>

      {authError ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {authError}
        </p>
      ) : null}

      {firebaseReady && isAnonymous && !loading ? (
        <Card title="Link email & password" className="mt-4">
          <p className="mb-4 text-sm text-slate-600">
            Turn this guest session into a permanent account. Password must be
            at least 6 characters.
          </p>
          <form className="grid gap-3" onSubmit={handleBindSubmit}>
            <AuthField
              id="bind-email"
              label="Email"
              type="email"
              value={bindEmail}
              onChange={setBindEmail}
              autoComplete="email"
            />
            <AuthField
              id="bind-password"
              label="Password"
              type="password"
              value={bindPassword}
              onChange={setBindPassword}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              disabled={formBusy || !bindEmail || bindPassword.length < 6}
            >
              {formBusy ? "Linking…" : "Link account"}
            </Button>
          </form>
        </Card>
      ) : null}

      {firebaseReady && !loading ? (
        <Card title="Sign in to existing account" className="mt-4">
          <p className="mb-4 text-sm text-slate-600">
            Use a registered email and password. Signing in replaces the
            current session (guest data is not merged automatically).
          </p>
          <form className="grid gap-3" onSubmit={handleSignInSubmit}>
            <AuthField
              id="signin-email"
              label="Email"
              type="email"
              value={signInEmail}
              onChange={setSignInEmail}
              autoComplete="email"
            />
            <AuthField
              id="signin-password"
              label="Password"
              type="password"
              value={signInPassword}
              onChange={setSignInPassword}
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="ghost"
              className="border border-slate-300"
              disabled={formBusy || !signInEmail || !signInPassword}
            >
              {formBusy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      ) : null}

      {firebaseReady && user && !isAnonymous && !loading ? (
        <div className="mt-4">
          <Button
            variant="ghost"
            className="border border-slate-300 text-red-700 hover:bg-red-50"
            disabled={formBusy}
            onClick={handleLogout}
          >
            Sign out
          </Button>
        </div>
      ) : null}

      {firebaseReady && user && isAnonymous && !loading ? (
        <p className="mt-6 text-xs text-slate-500">
          Guest UID (first 8 chars): {uid?.slice(0, 8) ?? "—"}
        </p>
      ) : null}
    </section>
  );
}
