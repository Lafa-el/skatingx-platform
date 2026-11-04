import {
  avatarFileProblem,
  createAthlete,
  deleteAthleteAvatar,
  getFirebaseStorage,
  getFirestoreDb,
  updateAthleteProfile,
  uploadAthleteAvatar,
} from "@skatingx/firebase-client";
import type { AthleteProfile } from "@skatingx/schema";
import {
  validateAthleteProfileForm,
  type AthleteProfileFormErrors,
} from "@skatingx/skating-domain";
import { Button, ErrorNotice, StatusGlyph } from "@skatingx/ui";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { Avatar } from "@/components/Avatar";
import { useAthletePhotoUrl } from "@/hooks/useAthletePhotoUrl";

import { tAthlete, type AthleteMessageKey } from "@/shared/i18n/athlete-messages";
import type { Locale } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const SHORT_TRACK = "short_track_speed_skating";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const FIELD_ERROR: Record<keyof AthleteProfileFormErrors, AthleteMessageKey> = {
  displayName: "athlete.error.nameRequired",
  birthDate: "athlete.error.dateInvalid",
  skatingStartDate: "athlete.error.dateInvalid",
  country: "athlete.error.countryRequired",
  bio: "athlete.error.bioTooLong",
};

type AthleteProfileFormProps = {
  /** Absent when the form is creating an athlete. */
  profile?: AthleteProfile;
  userId: string;
  athleteId?: string;
  locale: Locale;
  onCancel: () => void;
  onSaved: () => void;
};

export function AthleteProfileForm({
  profile,
  userId,
  athleteId,
  locale,
  onCancel,
  onSaved,
}: AthleteProfileFormProps) {
  const creating = profile == null;
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? "");
  const [skatingStartDate, setSkatingStartDate] = useState(profile?.skatingStartDate ?? "");
  const [sport, setSport] = useState(profile?.sport || SHORT_TRACK);
  const [country, setCountry] = useState(profile?.country ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [errors, setErrors] = useState<AthleteProfileFormErrors>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatarStoragePath ?? null);
  const [avatarNote, setAvatarNote] = useState<AthleteMessageKey | null>(null);
  const [avatarBusy, setAvatarBusy] = useState<"upload" | "remove" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = useAthletePhotoUrl(creating ? null : avatarPath);

  const t = (key: AthleteMessageKey) => tAthlete(locale, key);
  const sportOptions = sport === SHORT_TRACK ? [SHORT_TRACK] : [sport, SHORT_TRACK];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateAthleteProfileForm({
      displayName,
      birthDate,
      skatingStartDate,
      country,
      bio,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setSaveFailed(false);
    const db = getFirestoreDb();
    if (!db || (!creating && !athleteId)) {
      logActionFailure("athlete-profile", creating ? "create" : "update", { code: "unavailable" });
      setSaveFailed(true);
      return;
    }
    const formPatch = { displayName, birthDate, skatingStartDate, sport, country, bio };
    setSaving(true);
    try {
      if (creating) {
        await createAthlete(db, userId, formPatch);
      } else {
        await updateAthleteProfile(db, userId, athleteId as string, formPatch);
      }
      onSaved();
    } catch (error) {
      logActionFailure("athlete-profile", creating ? "create" : "update", error);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file || !athleteId) {
      return;
    }
    const problem = avatarFileProblem(file);
    if (problem) {
      setAvatarNote(problem === "type" ? "athlete.avatar.type" : "athlete.avatar.size");
      return;
    }
    const db = getFirestoreDb();
    const storage = getFirebaseStorage();
    if (!db || !storage) {
      setAvatarNote("athlete.avatar.failed");
      return;
    }
    setAvatarNote(null);
    setAvatarBusy("upload");
    try {
      const path = await uploadAthleteAvatar(db, storage, userId, athleteId, file);
      setAvatarPath(path);
    } catch (error) {
      logActionFailure("athlete-avatar", "upload", error);
      setAvatarNote("athlete.avatar.failed");
    } finally {
      setAvatarBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemoveAvatar() {
    if (!athleteId) {
      return;
    }
    const db = getFirestoreDb();
    const storage = getFirebaseStorage();
    if (!db || !storage) {
      setAvatarNote("athlete.avatar.failed");
      return;
    }
    setAvatarNote(null);
    setAvatarBusy("remove");
    try {
      await deleteAthleteAvatar(db, storage, userId, athleteId);
      setAvatarPath(null);
    } catch (error) {
      logActionFailure("athlete-avatar", "remove", error);
      setAvatarNote("athlete.avatar.failed");
    } finally {
      setAvatarBusy(null);
    }
  }

  return (
    <form className="mt-4 grid gap-4" noValidate onSubmit={onSubmit}>
      {creating || !athleteId ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Avatar letter={(displayName.trim() || "…").charAt(0)} photoUrl={photoUrl} size="lg" />
          <div className="grid gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t(avatarPath ? "athlete.avatar.replace" : "athlete.avatar.upload")}
              onChange={(event) => void onPickAvatar(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              disabled={avatarBusy != null}
              onClick={() => fileRef.current?.click()}
            >
              {avatarBusy === "upload"
                ? t("athlete.avatar.uploading")
                : t(avatarPath ? "athlete.avatar.replace" : "athlete.avatar.upload")}
            </Button>
            {avatarPath ? (
              <Button
                type="button"
                variant="danger-outline"
                disabled={avatarBusy != null}
                onClick={() => void onRemoveAvatar()}
              >
                {avatarBusy === "remove" ? t("athlete.avatar.removing") : t("athlete.avatar.remove")}
              </Button>
            ) : null}
          </div>
          {avatarNote ? (
            <p className="flex w-full items-start gap-1.5 text-sm font-medium text-status-danger">
              <StatusGlyph tone="danger" className="mt-0.5 size-4 shrink-0" />
              <span>{t(avatarNote)}</span>
            </p>
          ) : null}
        </div>
      )}
      <Field
        id="athlete-name"
        label={t("athlete.field.name")}
        error={errors.displayName ? t(FIELD_ERROR.displayName) : null}
      >
        <input
          id="athlete-name"
          className={CONTROL}
          value={displayName}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={errors.displayName ? "athlete-name-error" : undefined}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </Field>
      <Field
        id="athlete-birth"
        label={t("athlete.field.birthDate")}
        error={errors.birthDate ? t(FIELD_ERROR.birthDate) : null}
      >
        <input
          id="athlete-birth"
          type="date"
          className={CONTROL}
          value={birthDate}
          aria-invalid={errors.birthDate ? true : undefined}
          aria-describedby={errors.birthDate ? "athlete-birth-error" : undefined}
          onChange={(event) => setBirthDate(event.target.value)}
        />
      </Field>
      <Field
        id="athlete-start"
        label={t("athlete.field.skatingStartDate")}
        error={errors.skatingStartDate ? t(FIELD_ERROR.skatingStartDate) : null}
      >
        <input
          id="athlete-start"
          type="date"
          className={CONTROL}
          value={skatingStartDate}
          aria-invalid={errors.skatingStartDate ? true : undefined}
          aria-describedby={errors.skatingStartDate ? "athlete-start-error" : undefined}
          onChange={(event) => setSkatingStartDate(event.target.value)}
        />
      </Field>
      <Field id="athlete-sport" label={t("athlete.field.sport")} error={null}>
        <select
          id="athlete-sport"
          className={CONTROL}
          value={sport}
          onChange={(event) => setSport(event.target.value)}
        >
          {sportOptions.map((code) => (
            <option key={code} value={code}>
              {code === SHORT_TRACK ? t("athlete.sport.shortTrack") : code}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id="athlete-country"
        label={t("athlete.field.country")}
        error={errors.country ? t(FIELD_ERROR.country) : null}
      >
        <input
          id="athlete-country"
          className={CONTROL}
          value={country}
          aria-invalid={errors.country ? true : undefined}
          aria-describedby={errors.country ? "athlete-country-error" : undefined}
          onChange={(event) => setCountry(event.target.value)}
        />
      </Field>
      <Field
        id="athlete-bio"
        label={t("athlete.field.bio")}
        error={errors.bio ? t(FIELD_ERROR.bio) : null}
      >
        <textarea
          id="athlete-bio"
          className={CONTROL}
          rows={4}
          value={bio}
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby={errors.bio ? "athlete-bio-error" : undefined}
          onChange={(event) => setBio(event.target.value)}
        />
        <p className="text-right text-xs text-brand-navy/70">
          {tAthlete(locale, "athlete.form.bioCount", { count: bio.length })}
        </p>
      </Field>
      {saveFailed ? (
        <ErrorNotice>{t(creating ? "athlete.error.createFailed" : "athlete.error.saveFailed")}</ErrorNotice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {t("athlete.action.save")}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {t("athlete.action.cancel")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-sm text-brand-navy" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm font-medium text-status-danger">
          <StatusGlyph tone="danger" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
