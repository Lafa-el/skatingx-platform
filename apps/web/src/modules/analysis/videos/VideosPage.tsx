import {
  VIDEO_TAGS,
  createVideo,
  deleteVideo,
  getFirestoreDb,
  subscribeToSavedAnalyses,
  subscribeToVideos,
  updateVideo,
  type SavedAnalysisSource,
  type VideoEntryInput,
  type VideoEntryRecord,
  type VideoTag,
  type VideoWriteFailure,
} from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { activeAthleteIdOf } from "@/shared/activeAthleteId";
import { tAnalysis, type AnalysisMessageKey } from "@/shared/i18n/analysis-messages";
import { useLocale } from "@/hooks/useLocale";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const TAG_LABEL: Record<VideoTag, AnalysisMessageKey> = {
  edge: "analysis.videos.tag.edge",
  turn: "analysis.videos.tag.turn",
  jump: "analysis.videos.tag.jump",
  spin: "analysis.videos.tag.spin",
  footwork: "analysis.videos.tag.footwork",
  flow: "analysis.videos.tag.flow",
  step_sequence: "analysis.videos.tag.stepSequence",
  combo: "analysis.videos.tag.combo",
  alignment: "analysis.videos.tag.alignment",
  speed: "analysis.videos.tag.speed",
  other: "analysis.videos.tag.other",
};

type StatusFilter = "all" | "analyzed" | "unanalyzed";
type Editor = { mode: "create" } | { mode: "edit"; id: string };

function isTag(value: string): value is VideoTag {
  return (VIDEO_TAGS as readonly string[]).includes(value);
}

function isWebUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function byCreatedDesc(a: VideoEntryRecord, b: VideoEntryRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function latestAnalysisByVideo(sources: readonly SavedAnalysisSource[]): Map<string, string> {
  const ordered = [...sources].sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  const found = new Map<string, string>();
  for (const source of ordered) {
    if (source.kind !== "biomech" || !source.videoId || found.has(source.videoId)) continue;
    found.set(source.videoId, source.id);
  }
  return found;
}

export function VideosPage() {
  const locale = useLocale();
  const t = (key: AnalysisMessageKey) => tAnalysis(locale, key);
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const athleteId = activeAthleteIdOf(settings);
  const db = getFirestoreDb();
  const [videos, setVideos] = useState<readonly VideoEntryRecord[] | null>(null);
  const [analyses, setAnalyses] = useState<readonly SavedAnalysisSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<VideoTag | "all">("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    if (!uid || !db) return;
    setFailed(false);
    setVideos(null);
    const fail = (error: unknown) => {
      logActionFailure("videos", "read", error);
      setFailed(true);
    };
    return subscribeToVideos(db, uid, (snapshot) => setVideos(snapshot.videos), fail);
  }, [uid, db, retry]);

  useEffect(() => {
    if (!uid || !db || !athleteId) {
      setAnalyses([]);
      return;
    }
    setAnalyses(null);
    return subscribeToSavedAnalyses(
      db,
      uid,
      athleteId,
      (sources) => setAnalyses(sources),
      (error) => {
        logActionFailure("videos", "analyses", error);
        setFailed(true);
      },
    );
  }, [uid, db, athleteId, retry]);

  const analysisByVideo = useMemo(() => latestAnalysisByVideo(analyses ?? []), [analyses]);
  const visible = useMemo(() => {
    return [...(videos ?? [])].sort(byCreatedDesc).filter((video) => {
      const analyzed = analysisByVideo.has(video.id);
      if (statusFilter === "analyzed" && !analyzed) return false;
      if (statusFilter === "unanalyzed" && analyzed) return false;
      if (tagFilter !== "all" && !video.technicalTags?.includes(tagFilter)) return false;
      return true;
    });
  }, [videos, analysisByVideo, statusFilter, tagFilter]);

  const ready = videos !== null && analyses !== null;
  const loading = Boolean(uid && db && !failed && !ready);
  const editing = editor?.mode === "edit" ? videos?.find((video) => video.id === editor.id) : undefined;

  async function save(input: VideoEntryInput): Promise<{ ok: true } | { ok: false; field: VideoWriteFailure }> {
    if (!db || !uid || !editor) return { ok: false, field: "title" };
    const now = new Date().toISOString();
    const result =
      editor.mode === "edit"
        ? await updateVideo(db, uid, editor.id, input, now)
        : await createVideo(db, uid, input, now);
    if (result.ok) setEditor(null);
    return result.ok ? { ok: true } : result;
  }

  async function confirmDelete() {
    if (!db || !uid || !pendingDelete) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteVideo(db, uid, pendingDelete);
      if (editor?.mode === "edit" && editor.id === pendingDelete) setEditor(null);
      setPendingDelete(null);
    } catch (error) {
      logActionFailure("videos", "delete", error);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("analysis.videos.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("analysis.videos.subtitle")}</p>

      {!uid ? (
        <p className="mt-4">{t("analysis.videos.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("analysis.videos.unavailable")}</p>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("analysis.videos.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("analysis.videos.retry")}
          </Button>
        </div>
      ) : loading ? (
        <p className="mt-4" aria-busy="true">
          {t("analysis.videos.loading")}
        </p>
      ) : (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setEditor({ mode: "create" })}>
            {t("analysis.videos.action.add")}
          </Button>
          <FilterBar
            statusFilter={statusFilter}
            tagFilter={tagFilter}
            onStatus={setStatusFilter}
            onTag={setTagFilter}
          />
          {editor ? (
            <VideoForm
              key={editor.mode === "edit" ? editor.id : "create"}
              mode={editor.mode}
              video={editing}
              onCancel={() => setEditor(null)}
              onSubmit={save}
            />
          ) : null}
          {videos?.length === 0 ? (
            <p className="mt-4">{t("analysis.videos.empty")}</p>
          ) : visible.length === 0 ? (
            <p className="mt-4">{t("analysis.videos.filteredEmpty")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {visible.map((video) => {
                const analysisId = analysisByVideo.get(video.id);
                return (
                  <li key={video.id}>
                    <Card title={video.title}>
                      {video.fileName ? <p>{video.fileName}</p> : null}
                      {video.externalUrl ? (
                        isWebUrl(video.externalUrl) ? (
                          <p className="mt-2">
                            <a href={video.externalUrl} target="_blank" rel="noreferrer" className="underline">
                              {video.externalUrl}
                            </a>
                          </p>
                        ) : (
                          <p className="mt-2">{video.externalUrl}</p>
                        )
                      ) : null}
                      {video.technicalTags && video.technicalTags.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("analysis.videos.field.tags")}>
                          {video.technicalTags.filter(isTag).map((tag) => (
                            <li
                              key={tag}
                              className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                            >
                              {t(TAG_LABEL[tag])}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {video.linkedSessionId ? <p className="mt-2">{video.linkedSessionId}</p> : null}
                      {video.notes ? <p className="mt-2 whitespace-pre-wrap">{video.notes}</p> : null}
                      <p className="mt-2">{t(analysisId ? "analysis.videos.status.analyzed" : "analysis.videos.status.unanalyzed")}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {analysisId ? (
                          <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline" to={`/analysis/biomechanics/${analysisId}`}>
                            {t("analysis.videos.action.view")}
                          </Link>
                        ) : null}
                        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline" to={`/analysis/biomechanics?video=${video.id}`}>
                          {t("analysis.videos.action.analyze")}
                        </Link>
                        <Button variant="outline" onClick={() => setEditor({ mode: "edit", id: video.id })}>
                          {t("analysis.videos.action.edit")}
                        </Button>
                        <Button
                          variant="danger-outline"
                          onClick={() => {
                            setDeleteFailed(false);
                            setPendingDelete(video.id);
                          }}
                        >
                          {t("analysis.videos.action.delete")}
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
          {pendingDelete ? (
            <div role="alertdialog" aria-labelledby="video-delete-title" className="mt-6 rounded-card border border-status-danger/40 p-4">
              <h2 id="video-delete-title" className="text-lg font-semibold text-status-danger">
                {t("analysis.videos.delete.title")}
              </h2>
              <p className="mt-2 text-sm text-brand-navy">{t("analysis.videos.delete.body")}</p>
              {deleteFailed ? <ErrorNotice className="mt-3">{t("analysis.videos.delete.failed")}</ErrorNotice> : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger-outline" disabled={deleting} onClick={() => void confirmDelete()}>
                  {deleting ? t("analysis.videos.delete.busy") : t("analysis.videos.delete.confirm")}
                </Button>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() => {
                    setPendingDelete(null);
                    setDeleteFailed(false);
                  }}
                >
                  {t("analysis.videos.delete.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FilterBar({
  statusFilter,
  tagFilter,
  onStatus,
  onTag,
}: {
  statusFilter: StatusFilter;
  tagFilter: VideoTag | "all";
  onStatus: (value: StatusFilter) => void;
  onTag: (value: VideoTag | "all") => void;
}) {
  const locale = useLocale();
  const t = (key: AnalysisMessageKey) => tAnalysis(locale, key);
  const statuses: { value: StatusFilter; labelKey: AnalysisMessageKey }[] = [
    { value: "all", labelKey: "analysis.videos.filter.all" },
    { value: "analyzed", labelKey: "analysis.videos.filter.analyzed" },
    { value: "unanalyzed", labelKey: "analysis.videos.filter.unanalyzed" },
  ];
  return (
    <div className="mt-4 space-y-3">
      <div role="group" aria-label={t("analysis.videos.filter.status")} className="flex flex-wrap gap-2">
        {statuses.map((item) => (
          <Button key={item.value} variant={statusFilter === item.value ? "brand" : "outline"} aria-pressed={statusFilter === item.value} onClick={() => onStatus(item.value)}>
            {t(item.labelKey)}
          </Button>
        ))}
      </div>
      <div role="group" aria-label={t("analysis.videos.filter.tags")} className="flex flex-wrap gap-2">
        <Button variant={tagFilter === "all" ? "brand" : "outline"} aria-pressed={tagFilter === "all"} onClick={() => onTag("all")}>
          {t("analysis.videos.filter.all")}
        </Button>
        {VIDEO_TAGS.map((tag) => (
          <Button key={tag} variant={tagFilter === tag ? "brand" : "outline"} aria-pressed={tagFilter === tag} onClick={() => onTag(tag)}>
            {t(TAG_LABEL[tag])}
          </Button>
        ))}
      </div>
    </div>
  );
}

function VideoForm({
  mode,
  video,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  video?: VideoEntryRecord;
  onCancel: () => void;
  onSubmit: (input: VideoEntryInput) => Promise<{ ok: true } | { ok: false; field: VideoWriteFailure }>;
}) {
  const locale = useLocale();
  const t = (key: AnalysisMessageKey) => tAnalysis(locale, key);
  const [title, setTitle] = useState(video?.title ?? "");
  const [fileName, setFileName] = useState(video?.fileName ?? "");
  const [externalUrl, setExternalUrl] = useState(video?.externalUrl ?? "");
  const [tags, setTags] = useState<readonly string[]>(video?.technicalTags ?? []);
  const [linkedSessionId, setLinkedSessionId] = useState(video?.linkedSessionId ?? "");
  const [notes, setNotes] = useState(video?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<VideoWriteFailure | null>(null);
  const [failed, setFailed] = useState(false);

  function toggleTag(tag: VideoTag) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFieldError(null);
    setFailed(false);
    try {
      const result = await onSubmit({
        title,
        fileName,
        externalUrl,
        technicalTags: VIDEO_TAGS.filter((tag) => tags.includes(tag)),
        linkedSessionId,
        notes,
      });
      if (!result.ok) {
        setFieldError(result.field);
        setBusy(false);
      }
    } catch (error) {
      logActionFailure("videos", "save", error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="video-form-title" className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
      <h2 id="video-form-title" className="text-lg font-semibold text-brand-navy">
        {t(mode === "create" ? "analysis.videos.form.create" : "analysis.videos.form.edit")}
      </h2>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="video-title">
        {t("analysis.videos.field.title")}
        <input id="video-title" className={`${CONTROL} mt-1`} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="video-file">
        {t("analysis.videos.field.fileName")}
        <input id="video-file" className={`${CONTROL} mt-1`} value={fileName} onChange={(event) => setFileName(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="video-url">
        {t("analysis.videos.field.url")}
        <input id="video-url" className={`${CONTROL} mt-1`} value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-brand-navy">{t("analysis.videos.field.tags")}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {VIDEO_TAGS.map((tag) => (
            <label key={tag} className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-navy">
              <input type="checkbox" checked={tags.includes(tag)} onChange={() => toggleTag(tag)} />
              {t(TAG_LABEL[tag])}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="video-session">
        {t("analysis.videos.field.session")}
        <input id="video-session" className={`${CONTROL} mt-1`} value={linkedSessionId} onChange={(event) => setLinkedSessionId(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="video-notes">
        {t("analysis.videos.field.notes")}
        <textarea id="video-notes" className={`${CONTROL} mt-1 min-h-24 py-2`} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {fieldError === "title" ? <ErrorNotice>{t("analysis.videos.form.titleInvalid")}</ErrorNotice> : null}
      {fieldError === "externalUrl" ? <ErrorNotice>{t("analysis.videos.form.urlInvalid")}</ErrorNotice> : null}
      {failed ? <ErrorNotice>{t("analysis.videos.form.failed")}</ErrorNotice> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("analysis.videos.form.saving") : t("analysis.videos.form.save")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {t("analysis.videos.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
