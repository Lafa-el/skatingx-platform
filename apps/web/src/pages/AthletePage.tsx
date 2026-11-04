import { deleteAthlete, getFirestoreDb } from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { AthleteFacts } from "@/components/AthleteFacts";
import { Avatar } from "@/components/Avatar";
import { AthleteProfileForm } from "@/components/AthleteProfileForm";
import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { NoAthleteNotice } from "@/components/NoAthleteNotice";
import {
  useActiveAthlete,
  useAthleteProfile,
  useUserSettings,
} from "@/hooks/firestore";
import { useAthletePhotoUrl } from "@/hooks/useAthletePhotoUrl";
import { useParentPinGuard } from "@/hooks/useParentPinGuard";
import { useLocale } from "@/hooks/useLocale";
import { formatSport, tAthlete } from "@/shared/i18n/athlete-messages";
import { formatCalendarDate } from "@/shared/i18n/format";
import { logActionFailure } from "@/shared/utils/logActionFailure";

export function AthletePage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const { athleteId, loading: activeLoading, error: activeError } =
    useActiveAthlete();
  const { data: profile, loading: profileLoading, error: profileError } =
    useAthleteProfile();
  const { data: settings, loading: settingsLoading, error: settingsError } =
    useUserSettings();
  const { guard: guardParentPin, dialog: pinDialog } = useParentPinGuard();

  const loading = activeLoading || profileLoading || settingsLoading;
  const error = activeError ?? profileError ?? settingsError;
  const [panel, setPanel] = useState<"closed" | "edit" | "add">("closed");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const canAdd = !loading && error == null && uid != null;
  const canEdit = canAdd && !profileLoading && profileError == null && profile != null && athleteId != null;
  const canDelete = canAdd && athleteId != null;

  useEffect(() => {
    setPanel("closed");
    setConfirming(false);
    setDeleteFailed(false);
  }, [athleteId]);

  async function runDelete() {
    if (!uid || !athleteId) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setDeleteFailed(true);
      return;
    }
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteAthlete(db, uid, athleteId);
      setConfirming(false);
    } catch (caught) {
      logActionFailure("athlete", "delete", caught);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  const empty = !loading && settingsError == null && athleteId == null;
  const photoUrl = useAthletePhotoUrl(profile?.avatarStoragePath);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            {tAthlete(locale, "athlete.title")}
          </h1>
          <p className="mt-1 text-brand-navy/70">
            {tAthlete(locale, "athlete.subtitle")}
          </p>
        </div>
      </div>

      <FirestoreStatusBanner className="mt-4" />

      {error ? (
        <ErrorNotice className="mt-4">{error}</ErrorNotice>
      ) : null}

      {empty ? (
        <Card title={tAthlete(locale, "athlete.empty.title")} variant="raised" className="mt-6">
          <NoAthleteNotice heading={false} />
        </Card>
      ) : (
        <Card title={tAthlete(locale, "athlete.profile.title")} variant="raised" className="mt-6">
          <div className="mb-4">
            <Avatar
              letter={loading ? "…" : (profile?.displayName ?? "…").charAt(0)}
              photoUrl={photoUrl}
              size="lg"
            />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-brand-navy/70">{tAthlete(locale, "athlete.field.name")}</dt>
              <dd className="font-medium text-brand-navy">
                {loading ? "…" : (profile?.displayName ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-brand-navy/70">
                {tAthlete(locale, "athlete.field.birthDate")}
              </dt>
              <dd className="font-medium text-brand-navy">
                {loading
                  ? "…"
                  : profile?.birthDate
                    ? formatCalendarDate(profile.birthDate, locale)
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-brand-navy/70">{tAthlete(locale, "athlete.field.sport")}</dt>
              <dd className="font-medium text-brand-navy">
                {loading
                  ? "…"
                  : profile?.sport
                    ? formatSport(profile.sport, locale)
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-brand-navy/70">
                {tAthlete(locale, "athlete.field.country")}
              </dt>
              <dd className="font-medium text-brand-navy">
                {loading ? "…" : (profile?.country ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-brand-navy/70">
                {tAthlete(locale, "athlete.field.activeId")}
              </dt>
              <dd className="font-medium text-brand-navy">
                {loading ? "…" : (settings?.activeAthleteId ?? athleteId ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-brand-navy/70">
                {tAthlete(locale, "athlete.field.accountUid")}
              </dt>
              <dd className="font-mono text-xs text-brand-navy break-all">
                {uid ?? "—"}
              </dd>
            </div>
            <AthleteFacts profile={profile} loading={loading} locale={locale} />
          </dl>
        </Card>
      )}

      {canAdd && !empty && panel === "closed" && !confirming ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {canEdit ? (
            <Button variant="outline" onClick={() => setPanel("edit")}>
              {tAthlete(locale, "athlete.action.edit")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setPanel("add")}>
            {tAthlete(locale, "athlete.action.add")}
          </Button>
        </div>
      ) : null}

      {canDelete && panel === "closed" && !confirming ? (
        <div className="mt-8 border-t border-status-danger/30 pt-4">
          <Button variant="danger-outline" onClick={() => setConfirming(true)}>
            {tAthlete(locale, "athlete.action.delete")}
          </Button>
        </div>
      ) : null}

      {confirming ? (
        <div role="alertdialog" aria-labelledby="athlete-delete-title" className="mt-6 rounded-card border border-status-danger/40 p-4">
          <h2 id="athlete-delete-title" className="text-lg font-semibold text-status-danger">
            {tAthlete(locale, "athlete.delete.title")}
          </h2>
          <p className="mt-2 text-sm text-brand-navy">{tAthlete(locale, "athlete.delete.scope")}</p>
          {deleteFailed ? (
            <ErrorNotice className="mt-3">{tAthlete(locale, "athlete.delete.failed")}</ErrorNotice>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="danger-outline" disabled={deleting} onClick={() => guardParentPin("deleteAthlete", () => void runDelete())}>
              {deleting ? tAthlete(locale, "athlete.delete.busy") : tAthlete(locale, "athlete.delete.confirm")}
            </Button>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirming(false)}>
              {tAthlete(locale, "athlete.delete.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {pinDialog}

      {canEdit && panel === "edit" && profile && uid && athleteId ? (
        <AthleteProfileForm
          profile={profile}
          userId={uid}
          athleteId={athleteId}
          locale={locale}
          onCancel={() => setPanel("closed")}
          onSaved={() => setPanel("closed")}
        />
      ) : null}
      {canAdd && panel === "add" && uid ? (
        <AthleteProfileForm
          userId={uid}
          locale={locale}
          onCancel={() => setPanel("closed")}
          onSaved={() => setPanel("closed")}
        />
      ) : null}
    </section>
  );
}
