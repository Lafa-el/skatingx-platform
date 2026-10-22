import { getFirebaseAuth, requestPasswordResetEmail } from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice, StatusTag } from "@skatingx/ui";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useReloadUserSettings } from "@/app/providers/FirestoreProvider";
import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { LanguageSetting } from "@/components/LanguageSetting";
import { ParentPinManager } from "@/components/ParentPinManager";
import { useAthleteProfile } from "@/hooks/firestore";
import { useIsPro } from "@/hooks/useIsPro";
import { useLanguageSetting } from "@/hooks/useLanguageSetting";
import { useParentPinGuard } from "@/hooks/useParentPinGuard";
import { useLocale } from "@/hooks/useLocale";
import { APP_VERSION } from "@/shared/appVersion";
import {
  authErrorCode,
  formatAuthError,
  toAuthErrorNote,
  type AuthErrorNote,
} from "@/shared/i18n/auth-messages";
import { type SettingsPageMessageKey, tSettingsPage } from "@/shared/i18n/settings-page-messages";
import type { Locale } from "@/shared/i18n/translator";

/** A document path shown as it is written. An identifier, not copy. */
const SETTINGS_DOC_PATH = "settings/main";

const PLAN_BENEFITS = [
  "settings.plan.benefit.videos",
  "settings.plan.benefit.analysis",
  "settings.plan.benefit.feedback",
] as const satisfies readonly SettingsPageMessageKey[];

type ResetFailure = { kind: "auth"; note: AuthErrorNote } | { kind: "copy"; key: SettingsPageMessageKey };

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

function PlanBenefits({
  locale,
  locked,
}: {
  locale: Locale;
  locked: boolean;
}) {
  return (
    <ul
      aria-label={tSettingsPage(locale, "settings.plan.benefits")}
      data-locked={locked ? "true" : "false"}
      className={
        locked
          ? "mt-3 grid list-disc gap-1 pl-5 text-brand-navy/70"
          : "mt-3 grid list-disc gap-1 pl-5 font-medium text-brand-navy"
      }
    >
      {PLAN_BENEFITS.map((key) => (
        <li key={key}>{tSettingsPage(locale, key)}</li>
      ))}
    </ul>
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
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetFailure, setResetFailure] = useState<ResetFailure | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotFailure, setForgotFailure] = useState<ResetFailure | null>(null);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const { guard, dialog: pinDialog } = useParentPinGuard();
  const languageSetting = useLanguageSetting();
  const locale: Locale = useLocale();
  const t = (key: SettingsPageMessageKey, params?: Record<string, string | number>) =>
    tSettingsPage(locale, key, params);
  const { isPro, loading: planLoading, error: planError, settings } = useIsPro();
  const { data: profile, loading: profileLoading } = useAthleteProfile();
  const reloadSettings = useReloadUserSettings();

  const registered = firebaseReady && Boolean(user) && !isAnonymous && !loading;
  const activeAthleteId =
    typeof settings?.activeAthleteId === "string" && settings.activeAthleteId.length > 0
      ? settings.activeAthleteId
      : null;

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

  async function handleForgotPassword() {
    const email = signInEmail.trim();
    setForgotSent(false);
    setForgotFailure(null);
    if (!email) {
      setForgotFailure({ kind: "copy", key: "settings.signIn.forgotNeedEmail" });
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setForgotFailure({ kind: "auth", note: { key: "auth.error.notConfigured" } });
      return;
    }
    setForgotBusy(true);
    try {
      await requestPasswordResetEmail(auth, email);
      setForgotSent(true);
    } catch (error) {
      console.error("[settings] sending the password reset failed", { code: authErrorCode(error) });
      setForgotFailure({ kind: "auth", note: toAuthErrorNote(error) });
    } finally {
      setForgotBusy(false);
    }
  }

  function handlePasswordReset() {
    guard("passwordReset", () => {
      void sendPasswordReset();
    });
  }

  function requestPlanChange() {
    guard("planChange", () => {
      setPlanConfirmed(true);
    });
  }

  async function sendPasswordReset() {
    const email = user?.email?.trim() ?? "";
    setResetSent(false);
    setResetFailure(null);
    clearAuthError();
    if (!email) {
      setResetFailure({ kind: "copy", key: "settings.passwordReset.noEmail" });
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setResetFailure({ kind: "auth", note: { key: "auth.error.notConfigured" } });
      return;
    }
    setResetBusy(true);
    try {
      await requestPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (error) {
      console.error("[settings] sending the password reset failed", { code: authErrorCode(error) });
      setResetFailure({ kind: "auth", note: toAuthErrorNote(error) });
    } finally {
      setResetBusy(false);
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
  const failureText = (failure: ResetFailure | null) =>
    failure?.kind === "auth" ? formatAuthError(failure.note, locale) : failure ? t(failure.key) : null;
  const resetFailureText = failureText(resetFailure);
  const forgotFailureText = failureText(forgotFailure);

  return (
    <section className="grid max-w-lg gap-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold text-brand-navy">{t("settings.page.title")}</h1>
        <p className="text-brand-navy/80">{t("settings.page.intro")}</p>
      </header>

      <FirestoreStatusBanner />

      <Card variant="raised" title={t("settings.group.account")}>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.status")}</dt>
            <dd className="font-medium text-brand-navy">{accountLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.uid")}</dt>
            <dd className="break-all font-mono text-xs text-brand-navy">{loading ? "…" : (uid ?? "—")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.anonymous")}</dt>
            <dd className="font-medium text-brand-navy">
              {loading ? "…" : t(isAnonymous ? "settings.account.yes" : "settings.account.no")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.account.email")}</dt>
            <dd className="font-medium text-brand-navy">{emailDisplay}</dd>
          </div>
        </dl>

        <ParentPinManager />

        {authError ? <ErrorNotice className="mt-4">{formatAuthError(authError, locale)}</ErrorNotice> : null}

        {registered ? (
          <div className="mt-4 grid gap-2">
            <Button type="button" variant="outline" disabled={resetBusy || formBusy} onClick={handlePasswordReset}>
              {resetBusy ? t("settings.passwordReset.busy") : t("settings.passwordReset.button")}
            </Button>
            {resetSent ? (
              <p role="status" className="text-sm font-medium text-brand-navy">
                {t("settings.passwordReset.sent")}
              </p>
            ) : null}
            {resetFailureText ? <ErrorNotice>{resetFailureText}</ErrorNotice> : null}
          </div>
        ) : null}

        {firebaseReady && isAnonymous && !loading ? (
          <form className="mt-4 grid gap-3" onSubmit={handleBindSubmit}>
            <h4 className="text-sm font-semibold text-brand-navy">{t("settings.link.title")}</h4>
            <p className="text-sm text-brand-navy/80">{t("settings.link.help")}</p>
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
            <Button type="submit" variant="brand" disabled={formBusy || !bindEmail || bindPassword.length < 6}>
              {formBusy ? t("settings.link.busy") : t("settings.link.submit")}
            </Button>
          </form>
        ) : null}

        {firebaseReady && !loading && !registered ? (
          <form className="mt-4 grid gap-3" onSubmit={handleSignInSubmit}>
            <h4 className="text-sm font-semibold text-brand-navy">{t("settings.signIn.title")}</h4>
            <p className="text-sm text-brand-navy/80">{t("settings.signIn.help")}</p>
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
            <Button type="submit" variant="outline" disabled={formBusy || forgotBusy || !signInEmail || !signInPassword}>
              {formBusy ? t("settings.signIn.busy") : t("settings.signIn.submit")}
            </Button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-start text-sm font-semibold text-brand-navy underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
              disabled={forgotBusy || formBusy}
              onClick={handleForgotPassword}
            >
              {forgotBusy ? t("settings.passwordReset.busy") : t("settings.signIn.forgot")}
            </button>
            {forgotSent ? (
              <p role="status" className="text-sm font-medium text-brand-navy">
                {t("settings.passwordReset.sent")}
              </p>
            ) : null}
            {forgotFailureText ? <ErrorNotice>{forgotFailureText}</ErrorNotice> : null}
          </form>
        ) : null}

        {registered ? (
          <div className="mt-4">
            <Button variant="danger-outline" disabled={formBusy} onClick={handleLogout}>
              {t("settings.signOut.button")}
            </Button>
          </div>
        ) : null}

        {firebaseReady && user && isAnonymous && !loading ? (
          <p className="mt-4 text-xs text-brand-navy/70">{t("settings.account.guestUid", { uid: uid?.slice(0, 8) ?? "—" })}</p>
        ) : null}
      </Card>

      <Card variant="raised" title={t("settings.group.athlete")}>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.athlete.name")}</dt>
            <dd className="font-medium text-brand-navy">{profileLoading ? "…" : (profile?.displayName ?? "—")}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-brand-navy/70">{t("settings.athlete.id")}</dt>
            <dd className="font-mono text-xs text-brand-navy">{planLoading ? "…" : (activeAthleteId ?? "—")}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <StatusTag tone="brand">{t("settings.athlete.current")}</StatusTag>
        </div>
        <Link
          to="/athlete"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2"
        >
          {t("settings.athlete.open")}
        </Link>
      </Card>

      <Card variant="raised" title={t("settings.group.plan")}>
        {planError ? (
          <div className="grid gap-3">
            <ErrorNotice>{t("settings.plan.error")}</ErrorNotice>
            <Button type="button" variant="outline" onClick={reloadSettings}>
              {t("settings.plan.retry")}
            </Button>
          </div>
        ) : planLoading ? (
          <p role="status" className="text-sm text-brand-navy/80">
            {t("settings.plan.preparing")}
          </p>
        ) : isPro ? (
          <div>
            <StatusTag tone="brand">{t("settings.plan.proTag")}</StatusTag>
            <p className="mt-3 text-lg font-semibold text-brand-navy">{t("settings.plan.proTitle")}</p>
            <PlanBenefits locale={locale} locked={false} />
            <Button type="button" variant="outline" className="mt-4" onClick={requestPlanChange}>
              {t("settings.plan.change")}
            </Button>
            {planConfirmed ? <p className="mt-2 text-sm font-medium text-brand-navy">{t("settings.plan.confirmed")}</p> : null}
          </div>
        ) : (
          <div>
            <StatusTag tone="neutral">{t("settings.plan.freeTag")}</StatusTag>
            <PlanBenefits locale={locale} locked />
            <p className="mt-3 text-lg font-semibold text-brand-navy">{t("settings.plan.price")}</p>
            <p className="mt-1 text-sm text-brand-navy/80">{t("settings.plan.manual")}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={requestPlanChange}>
              {t("settings.plan.start")}
            </Button>
            {planConfirmed ? <p className="mt-2 text-sm font-medium text-brand-navy">{t("settings.plan.confirmed")}</p> : null}
          </div>
        )}
      </Card>

      <Card variant="raised" title={t("settings.group.preferences")}>
        <LanguageSetting
          embedded
          language={languageSetting.language}
          disabled={languageSetting.disabled}
          failed={languageSetting.failed}
          onChange={languageSetting.setLanguage}
        />
        <h4 className="mt-4 text-sm font-semibold text-brand-navy">{t("settings.parent.title")}</h4>
        <p className="mt-1 text-sm text-brand-navy/80">
          {t("settings.parent.noteBefore")}
          <code className="text-xs">{SETTINGS_DOC_PATH}</code>
          {t("settings.parent.noteAfter")}
        </p>
      </Card>

      <p className="text-xs text-brand-navy/70">{t("settings.footer.version", { version: APP_VERSION })}</p>
      {pinDialog}
    </section>
  );
}
