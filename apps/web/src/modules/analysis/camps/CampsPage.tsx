import {
  CAMP_TYPES,
  createCamp,
  deleteCamp,
  getFirestoreDb,
  subscribeToCamps,
  updateCamp,
  type CampInput,
  type CampRecord,
  type CampWriteFailure,
} from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis, type AnalysisMessageKey } from "@/shared/i18n/analysis-messages";
import { formatCalendarDate } from "@/shared/i18n/format";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";
const LINK_CLASS =
  "inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2";

type Editor = { mode: "create" } | { mode: "edit"; id: string };

function byStartDesc(a: CampRecord, b: CampRecord): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function CampsPage() {
  const locale = useLocale();
  const t = (key: AnalysisMessageKey, params?: Record<string, string | number>) => tAnalysis(locale, key, params);
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const [camps, setCamps] = useState<readonly CampRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    if (!uid || !db) return;
    setFailed(false);
    setCamps(null);
    return subscribeToCamps(
      db,
      uid,
      (snapshot) => setCamps(snapshot.camps),
      (error) => {
        logActionFailure("camps", "read", error);
        setFailed(true);
      },
    );
  }, [uid, db, retry]);

  const visible = useMemo(() => [...(camps ?? [])].sort(byStartDesc), [camps]);
  const editing = editor?.mode === "edit" ? camps?.find((camp) => camp.id === editor.id) : undefined;
  const loading = Boolean(uid && db && !failed && camps === null);

  async function save(input: CampInput): Promise<{ ok: true } | { ok: false; field: CampWriteFailure }> {
    if (!db || !uid || !editor) return { ok: false, field: "name" };
    const now = new Date().toISOString();
    const result =
      editor.mode === "edit" ? await updateCamp(db, uid, editor.id, input, now) : await createCamp(db, uid, input, now);
    if (result.ok) setEditor(null);
    return result.ok ? { ok: true } : result;
  }

  async function confirmDelete() {
    if (!db || !uid || !pendingDelete) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteCamp(db, uid, pendingDelete);
      if (editor?.mode === "edit" && editor.id === pendingDelete) setEditor(null);
      setPendingDelete(null);
    } catch (error) {
      logActionFailure("camps", "delete", error);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("analysis.camps.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("analysis.camps.subtitle")}</p>
      {!uid ? (
        <p className="mt-4">{t("analysis.camps.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("analysis.camps.unavailable")}</p>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("analysis.camps.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("analysis.camps.retry")}
          </Button>
        </div>
      ) : loading ? (
        <p className="mt-4" aria-busy="true">
          {t("analysis.camps.loading")}
        </p>
      ) : (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setEditor({ mode: "create" })}>
            {t("analysis.camps.action.add")}
          </Button>
          {editor ? (
            <CampForm
              key={editor.mode === "edit" ? editor.id : "create"}
              mode={editor.mode}
              camp={editing}
              onCancel={() => setEditor(null)}
              onSubmit={save}
            />
          ) : null}
          {camps?.length === 0 ? (
            <p className="mt-4">{t("analysis.camps.empty")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {visible.map((camp) => (
                <li key={camp.id}>
                  <Card title={camp.name}>
                    <p>{camp.type}</p>
                    <p className="mt-2">
                      {t("analysis.camps.range", {
                        start: formatCalendarDate(camp.startDate, locale),
                        end: formatCalendarDate(camp.endDate, locale),
                      })}
                    </p>
                    {camp.location ? <p className="mt-2">{camp.location}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link className={LINK_CLASS} to={`/analysis/camps/${camp.id}`}>
                        {t("analysis.camps.action.stats")}
                      </Link>
                      <Button variant="outline" onClick={() => setEditor({ mode: "edit", id: camp.id })}>
                        {t("analysis.camps.action.edit")}
                      </Button>
                      <Button
                        variant="danger-outline"
                        onClick={() => {
                          setDeleteFailed(false);
                          setPendingDelete(camp.id);
                        }}
                      >
                        {t("analysis.camps.action.delete")}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {pendingDelete ? (
            <div role="alertdialog" aria-labelledby="camp-delete-title" className="mt-6 rounded-card border border-status-danger/40 p-4">
              <h2 id="camp-delete-title" className="text-lg font-semibold text-status-danger">
                {t("analysis.camps.delete.title")}
              </h2>
              <p className="mt-2 text-sm text-brand-navy">{t("analysis.camps.delete.body")}</p>
              {deleteFailed ? <ErrorNotice className="mt-3">{t("analysis.camps.delete.failed")}</ErrorNotice> : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger-outline" disabled={deleting} onClick={() => void confirmDelete()}>
                  {deleting ? t("analysis.camps.delete.busy") : t("analysis.camps.delete.confirm")}
                </Button>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() => {
                    setPendingDelete(null);
                    setDeleteFailed(false);
                  }}
                >
                  {t("analysis.camps.delete.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CampForm({
  mode,
  camp,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  camp?: CampRecord;
  onCancel: () => void;
  onSubmit: (input: CampInput) => Promise<{ ok: true } | { ok: false; field: CampWriteFailure }>;
}) {
  const locale = useLocale();
  const t = (key: AnalysisMessageKey) => tAnalysis(locale, key);
  const [name, setName] = useState(camp?.name ?? "");
  const [type, setType] = useState(camp?.type ?? "");
  const [startDate, setStartDate] = useState(camp?.startDate ?? "");
  const [endDate, setEndDate] = useState(camp?.endDate ?? "");
  const [location, setLocation] = useState(camp?.location ?? "");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<CampWriteFailure | null>(null);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFieldError(null);
    setFailed(false);
    try {
      const result = await onSubmit({ name, type, startDate, endDate, location });
      if (!result.ok) {
        setFieldError(result.field);
        setBusy(false);
      }
    } catch (error) {
      logActionFailure("camps", "save", error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="camp-form-title" className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
      <h2 id="camp-form-title" className="text-lg font-semibold text-brand-navy">
        {t(mode === "create" ? "analysis.camps.form.create" : "analysis.camps.form.edit")}
      </h2>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="camp-name">
        {t("analysis.camps.field.name")}
        <input id="camp-name" className={`${CONTROL} mt-1`} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="camp-type">
        {t("analysis.camps.field.type")}
        <input
          id="camp-type"
          className={`${CONTROL} mt-1`}
          list="camp-type-suggestions"
          value={type}
          onChange={(event) => setType(event.target.value)}
        />
      </label>
      <datalist id="camp-type-suggestions">
        {CAMP_TYPES.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="camp-start">
        {t("analysis.camps.field.start")}
        <input id="camp-start" type="date" className={`${CONTROL} mt-1`} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="camp-end">
        {t("analysis.camps.field.end")}
        <input id="camp-end" type="date" className={`${CONTROL} mt-1`} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="camp-location">
        {t("analysis.camps.field.location")}
        <input
          id="camp-location"
          className={`${CONTROL} mt-1`}
          maxLength={200}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </label>
      {fieldError === "name" ? <ErrorNotice>{t("analysis.camps.form.nameInvalid")}</ErrorNotice> : null}
      {fieldError === "type" ? <ErrorNotice>{t("analysis.camps.form.typeInvalid")}</ErrorNotice> : null}
      {fieldError === "dates" ? <ErrorNotice>{t("analysis.camps.form.datesInvalid")}</ErrorNotice> : null}
      {fieldError === "location" ? <ErrorNotice>{t("analysis.camps.form.locationInvalid")}</ErrorNotice> : null}
      {failed ? <ErrorNotice>{t("analysis.camps.form.failed")}</ErrorNotice> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("analysis.camps.form.saving") : t("analysis.camps.form.save")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {t("analysis.camps.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
