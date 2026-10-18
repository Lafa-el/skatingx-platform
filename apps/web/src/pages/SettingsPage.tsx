import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { FormEvent, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { LanguageSetting } from "@/components/LanguageSetting";
import { useLanguageSetting } from "@/hooks/useLanguageSetting";
import { useLocale } from "@/hooks/useLocale";
import { formatAuthError } from "@/shared/i18n/auth-messages";
import { type SettingsPageMessageKey, tSettingsPage } from "@/shared/i18n/settings-page-messages";
import type { Locale } from "@/shared/i18n/translator";

/** A document path shown as it is written. An identifier, not copy. */
const SETTINGS_DOC_PATH = "settings/main";

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
      <span className="font-medium text-brand-navy">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-control border border-brand-navy/50 px-3 py-2 text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-flame"
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
  const languageSetting = useLanguageSetting();
  const locale: Locale = useLocale();
  const t = (key: SettingsPageMessageKey, params?: Record<string, string | number>) =>
    tSettingsPage(locale, key, params);

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
      // Deliberately not handled here: AuthProvider has already shown the reason (authError) and
      // logged the error code, and rethrows only so this form keeps what was typed.
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
      // Deliberately not handled here: AuthProvider has already shown the reason (authError) and
      // logged the error code, and rethrows only so this form keeps what was typed.
    } finally {
      setFormBusy(false);
    }
  }

  async function handleLogout() {
    const confirmed = window.confirm(t("settings.signOut.confirm"));
    if (!confirmed) return;
    setFormBusy(true);
    try {
      await logout();
    } finally {
      setFormBusy(false);
    }
  }

  const accountLabel = loading
    ? t("settings.account.loading")
    : !firebaseReady
      ? t("settings.account.notConfigured")
      : isAnonymous
        ? t("settings.account.guest")
        : t("settings.account.registered");

  const emailDisplay = user?.email ?? "—";

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-brand-navy">
        {t("settings.page.title")}
      </h1>
      <p className="mt-1 text-brand-navy/80">{t("settings.page.intro")}</p>

      <LanguageSetting
        language={languageSetting.language}
        disabled={languageSetting.disabled}
        failed={languageSetting.failed}
        onChange={languageSetting.setLanguage}
      />

      <Card variant="raised" title={t("settings.parent.title")} className="mt-4">
        <p className="text-sm text-brand-navy/80">
          {t("settings.parent.noteBefore")}
          <code className="text-xs">{SETTINGS_DOC_PATH}</code>
          {t("settings.parent.noteAfter")}
        </p>
      </Card>

      <Card variant="raised" title={t("settings.account.title")} className="mt-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.status")}</dt>
            <dd className="font-medium text-brand-navy">{accountLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.uid")}</dt>
            <dd className="font-mono text-xs text-brand-navy break-all">
              {loading ? "…" : (uid ?? "—")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.anonymous")}</dt>
            <dd className="font-medium text-brand-navy">
              {loading
                ? "…"
                : t(isAnonymous ? "settings.account.yes" : "settings.account.no")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.email")}</dt>
            <dd className="font-medium text-brand-navy">{emailDisplay}</dd>
          </div>
        </dl>
      </Card>

      {authError ? (
        <ErrorNotice className="mt-4">{formatAuthError(authError, locale)}</ErrorNotice>
      ) : null}

      {firebaseReady && isAnonymous && !loading ? (
        <Card variant="raised" title={t("settings.link.title")} className="mt-4">
          <p className="mb-4 text-sm text-brand-navy/80">
            {t("settings.link.help")}
          </p>
          <form className="grid gap-3" onSubmit={handleBindSubmit}>
            <AuthField
              id="bind-email"
              label={t("settings.field.email")}
              type="email"
              value={bindEmail}
              onChange={setBindEmail}
              autoComplete="email"
            />
            <AuthField
              id="bind-password"
              label={t("settings.field.password")}
              type="password"
              value={bindPassword}
              onChange={setBindPassword}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              variant="brand"
              disabled={formBusy || !bindEmail || bindPassword.length < 6}
            >
              {formBusy ? t("settings.link.busy") : t("settings.link.submit")}
            </Button>
          </form>
        </Card>
      ) : null}

      {firebaseReady && !loading ? (
        <Card variant="raised" title={t("settings.signIn.title")} className="mt-4">
          <p className="mb-4 text-sm text-brand-navy/80">
            {t("settings.signIn.help")}
          </p>
          <form className="grid gap-3" onSubmit={handleSignInSubmit}>
            <AuthField
              id="signin-email"
              label={t("settings.field.email")}
              type="email"
              value={signInEmail}
              onChange={setSignInEmail}
              autoComplete="email"
            />
            <AuthField
              id="signin-password"
              label={t("settings.field.password")}
              type="password"
              value={signInPassword}
              onChange={setSignInPassword}
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={formBusy || !signInEmail || !signInPassword}
            >
              {formBusy ? t("settings.signIn.busy") : t("settings.signIn.submit")}
            </Button>
          </form>
        </Card>
      ) : null}

      {firebaseReady && user && !isAnonymous && !loading ? (
        <div className="mt-4">
          <Button
            variant="danger-outline"
            disabled={formBusy}
            onClick={handleLogout}
          >
            {t("settings.signOut.button")}
          </Button>
        </div>
      ) : null}

      {firebaseReady && user && isAnonymous && !loading ? (
        <p className="mt-6 text-xs text-brand-navy/70">
          {t("settings.account.guestUid", { uid: uid?.slice(0, 8) ?? "—" })}
        </p>
      ) : null}
    </section>
  );
}
