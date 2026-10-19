import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";
import {
  buildEquipmentChecklist,
  buildEquipmentHistoryRecord,
  formatDecimalDisplay,
  type EquipmentAdjustmentCode,
  type EquipmentFeedbackCode,
  type EquipmentGaugePoint,
  type EquipmentHistoryRecord,
  type EquipmentSymptomKey,
} from "@skatingx/skating-domain";
import {
  deleteEquipmentHistoryRecord,
  getFirestoreDb,
  saveEquipmentHistoryRecord,
  subscribeToEquipmentHistory,
} from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice, Notice } from "@skatingx/ui";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis } from "@/shared/i18n/analysis-messages";
import { tEquipment, type EquipmentMessageKey } from "@/shared/i18n/equipment-messages";
import type { Locale } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { forgetEquipmentRecord, mergeEquipmentHistory, readEquipmentArchive, rememberEquipmentRecord } from "./equipment-archive";
import { compareEquipmentRecords } from "./equipment-compare";

const INPUT_CLASS =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const ROCKER_POINTS = Array.from({ length: 21 }, (_, index) => index - 10);

const SYMPTOMS = [
  { key: "slide", labelKey: "equipment.symptom.slide", textKey: "equipment.symptom.slide.text" },
  { key: "boot-out", labelKey: "equipment.symptom.bootOut", textKey: "equipment.symptom.bootOut.text" },
  { key: "unstable", labelKey: "equipment.symptom.unstable", textKey: "equipment.symptom.unstable.text" },
  { key: "ankle", labelKey: "equipment.symptom.ankle", textKey: "equipment.symptom.ankle.text" },
  { key: "release", labelKey: "equipment.symptom.release", textKey: "equipment.symptom.release.text" },
  { key: "asymmetry", labelKey: "equipment.symptom.asymmetry", textKey: "equipment.symptom.asymmetry.text" },
] as const satisfies readonly { key: EquipmentSymptomKey; labelKey: EquipmentMessageKey; textKey: EquipmentMessageKey }[];

const ADJUSTMENTS = [
  { code: "unchanged", labelKey: "equipment.adjustment.unchanged" },
  { code: "radius-rocker", labelKey: "equipment.adjustment.radius" },
  { code: "offset", labelKey: "equipment.adjustment.offset" },
  { code: "bend", labelKey: "equipment.adjustment.bend" },
  { code: "blade-change", labelKey: "equipment.adjustment.blade" },
  { code: "boot-change", labelKey: "equipment.adjustment.boot" },
  { code: "combined", labelKey: "equipment.adjustment.combined" },
] as const satisfies readonly { code: EquipmentAdjustmentCode; labelKey: EquipmentMessageKey }[];

const FEEDBACK = [
  { code: "not-skated", labelKey: "equipment.feedback.notSkated" },
  { code: "clear-improvement", labelKey: "equipment.feedback.clear" },
  { code: "slight-improvement", labelKey: "equipment.feedback.slight" },
  { code: "no-change", labelKey: "equipment.feedback.none" },
  { code: "worse-revert", labelKey: "equipment.feedback.worse" },
] as const satisfies readonly { code: EquipmentFeedbackCode; labelKey: EquipmentMessageKey }[];

const ADVICE = {
  slide: {
    focus: "equipment.advice.slide.focus",
    rocker: "equipment.advice.slide.rocker",
    offset: "equipment.advice.slide.offset",
  },
  "boot-out": {
    focus: "equipment.advice.bootOut.focus",
    rocker: "equipment.advice.bootOut.rocker",
    offset: "equipment.advice.bootOut.offset",
  },
  unstable: {
    focus: "equipment.advice.unstable.focus",
    rocker: "equipment.advice.unstable.rocker",
    offset: "equipment.advice.unstable.offset",
  },
  ankle: {
    focus: "equipment.advice.ankle.focus",
    rocker: "equipment.advice.ankle.rocker",
    offset: "equipment.advice.ankle.offset",
  },
  release: {
    focus: "equipment.advice.release.focus",
    rocker: "equipment.advice.release.rocker",
    offset: "equipment.advice.release.offset",
  },
  asymmetry: {
    focus: "equipment.advice.asymmetry.focus",
    rocker: "equipment.advice.asymmetry.rocker",
    offset: "equipment.advice.asymmetry.offset",
  },
} as const satisfies Record<
  EquipmentSymptomKey,
  { focus: EquipmentMessageKey; rocker: EquipmentMessageKey; offset: EquipmentMessageKey }
>;

const dateLocale = { zh: "zh-CN", en: "en-US" } as const;

type Draft = {
  symptomKey: EquipmentSymptomKey;
  symptomText: string;
  height: string;
  weight: string;
  bladeLength: string;
  leftRocker: EquipmentGaugePoint[];
  rightRocker: EquipmentGaugePoint[];
  offsets: EquipmentHistoryRecord["offsets"];
  bend: EquipmentHistoryRecord["bend"];
  adjustmentType: EquipmentAdjustmentCode;
  feedbackRating: EquipmentFeedbackCode;
  adjustmentNotes: string;
  missingCore: boolean;
  ruleHints: readonly string[];
};

function blankRocker(): Record<string, string> {
  return Object.fromEntries(ROCKER_POINTS.map((point) => [String(point), ""]));
}

function readingsOf(values: Record<string, string>): EquipmentGaugePoint[] {
  return ROCKER_POINTS.flatMap((point) => {
    const value = values[String(point)]?.trim() ?? "";
    return value ? [{ point, value }] : [];
  });
}

function pointName(locale: Locale, point: number): string {
  const shown = point > 0 ? `+${point}` : String(point);
  const key = Math.abs(point) >= 9 ? "equipment.rocker.optional" : "equipment.rocker.point";
  return tEquipment(locale, key, { point: shown });
}

function labelFor(
  locale: Locale,
  code: string,
  rows: readonly { code: string; labelKey: EquipmentMessageKey }[],
): string {
  const row = rows.find((entry) => entry.code === code);
  return row ? tEquipment(locale, row.labelKey) : tEquipment(locale, "equipment.history.unrecorded");
}

function rockerLine(locale: Locale, label: string, readings: readonly EquipmentGaugePoint[]): string {
  if (!readings.length) {
    return tEquipment(locale, "equipment.rocker.empty", { label });
  }
  const textAt = (wanted: (point: number) => boolean) =>
    readings
      .filter((entry) => wanted(entry.point))
      .sort((a, b) => a.point - b.point)
      .map((entry) => `${entry.point > 0 ? "+" : ""}${entry.point}:${entry.value}`)
      .join(" / ") || tEquipment(locale, "equipment.history.unrecorded");
  const center = readings.find((entry) => entry.point === 0)?.value || tEquipment(locale, "equipment.history.unrecorded");
  return tEquipment(locale, "equipment.rocker.line", {
    label,
    center,
    toe: textAt((point) => point > 0),
    tail: textAt((point) => point < 0),
  });
}

function formatWhen(locale: Locale, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return tEquipment(locale, "equipment.history.unrecorded");
  return new Intl.DateTimeFormat(dateLocale[locale], { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function EquipmentPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const [symptomKey, setSymptomKey] = useState<EquipmentSymptomKey>("slide");
  const [symptomText, setSymptomText] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bladeLength, setBladeLength] = useState("");
  const [leftRocker, setLeftRocker] = useState(blankRocker);
  const [rightRocker, setRightRocker] = useState(blankRocker);
  const [offsets, setOffsets] = useState({ leftFront: "", leftRear: "", rightFront: "", rightRear: "" });
  const [bend, setBend] = useState({ front: "", middle: "", rear: "" });
  const [adjustmentType, setAdjustmentType] = useState<EquipmentAdjustmentCode>("unchanged");
  const [feedbackRating, setFeedbackRating] = useState<EquipmentFeedbackCode>("not-skated");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [statusKey, setStatusKey] = useState<EquipmentMessageKey>("equipment.status.needChecklist");
  const [statusError, setStatusError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cloudHistory, setCloudHistory] = useState<readonly EquipmentHistoryRecord[]>([]);
  const [localHistory, setLocalHistory] = useState<readonly EquipmentHistoryRecord[]>([]);
  const [synced, setSynced] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [comparison, setComparison] = useState<string[] | null>(null);
  const history = useMemo(
    () => mergeEquipmentHistory(cloudHistory, localHistory),
    [cloudHistory, localHistory],
  );
  const localOnly = useMemo(
    () => localHistory.filter((record) => !cloudHistory.some((cloud) => cloud.id === record.id)),
    [cloudHistory, localHistory],
  );
  const selectedA = history.some((record) => record.id === compareA) ? compareA : (history[0]?.id ?? "");
  const selectedB = history.some((record) => record.id === compareB) ? compareB : (history[1]?.id ?? history[0]?.id ?? "");

  useEffect(() => {
    if (!uid) {
      setLocalHistory([]);
      return;
    }
    setLocalHistory(readEquipmentArchive(window.localStorage, uid));
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setCloudHistory([]);
      setSynced(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setSynced(false);
      return;
    }
    const unsubscribe = subscribeToEquipmentHistory(
      db,
      uid,
      DEFAULT_ATHLETE_ID,
      (records) => {
        setCloudHistory(records);
        setSynced(true);
      },
      (error) => {
        logActionFailure("equipment", "subscribe", error);
        setSynced(false);
      },
    );
    return () => {
      unsubscribe();
    };
  }, [uid]);

  const unrecorded = tEquipment(locale, "equipment.history.unrecorded");

  const generate = () => {
    const left = readingsOf(leftRocker);
    const right = readingsOf(rightRocker);
    const offsetValues = {
      leftFront: offsets.leftFront.trim(),
      leftRear: offsets.leftRear.trim(),
      rightFront: offsets.rightFront.trim(),
      rightRear: offsets.rightRear.trim(),
    };
    const bendValues = { front: bend.front.trim(), middle: bend.middle.trim(), rear: bend.rear.trim() };
    const checklist = buildEquipmentChecklist({
      weightRaw: weight.trim(),
      leftReadings: left,
      rightReadings: right,
      offsets: offsetValues,
      bend: bendValues,
    });
    setDraft({
      symptomKey,
      symptomText: symptomText.trim(),
      height: height.trim(),
      weight: weight.trim(),
      bladeLength: bladeLength.trim(),
      leftRocker: left,
      rightRocker: right,
      offsets: offsetValues,
      bend: bendValues,
      adjustmentType,
      feedbackRating,
      adjustmentNotes: adjustmentNotes.trim(),
      missingCore: checklist.missingCore,
      ruleHints: checklist.hints,
    });
    setStatusError(false);
    setStatusKey("equipment.status.ready");
  };

  const save = async () => {
    if (!draft) {
      setStatusError(false);
      setStatusKey("equipment.status.needFirst");
      return;
    }
    if (!uid) {
      setStatusError(true);
      setStatusKey("equipment.status.signedOut");
      return;
    }
    const record = buildEquipmentHistoryRecord({
      id: `equip-${crypto.randomUUID()}`,
      ownerUserId: uid,
      createdAt: new Date().toISOString(),
      ...draft,
    });
    const keepLocal = (message: EquipmentMessageKey) => {
      try {
        setLocalHistory(rememberEquipmentRecord(window.localStorage, uid, record));
        setStatusError(false);
        setStatusKey(message);
      } catch (error) {
        logActionFailure("equipment", "local-archive", error);
        setStatusError(true);
        setStatusKey("equipment.status.saveFailed");
      }
    };
    const db = getFirestoreDb();
    if (!db) {
      keepLocal("equipment.status.savedLocal");
      return;
    }
    setSaving(true);
    setStatusError(false);
    setStatusKey("equipment.status.saving");
    try {
      await saveEquipmentHistoryRecord(db, record);
      setStatusKey("equipment.status.saved");
    } catch (error) {
      logActionFailure("equipment", "save", error);
      keepLocal("equipment.status.savedLocalAfterFailure");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (recordId: string) => {
    if (!window.confirm(tEquipment(locale, "equipment.confirm.delete"))) return;
    const storedLocally = localHistory.some((record) => record.id === recordId);
    if (storedLocally && uid) {
      try {
        setLocalHistory(forgetEquipmentRecord(window.localStorage, uid, recordId));
      } catch (error) {
        logActionFailure("equipment", "local-archive", error);
        setStatusError(true);
        setStatusKey("equipment.status.deleteFailed");
        return;
      }
    }
    const storedInCloud = cloudHistory.some((record) => record.id === recordId);
    if (!storedInCloud) return;
    if (!uid) {
      setStatusError(true);
      setStatusKey("equipment.status.signedOut");
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setStatusError(true);
      setStatusKey("equipment.status.unavailable");
      return;
    }
    try {
      await deleteEquipmentHistoryRecord(db, uid, DEFAULT_ATHLETE_ID, recordId);
      setCloudHistory((current) => current.filter((record) => record.id !== recordId));
    } catch (error) {
      logActionFailure("equipment", "delete", error);
      setStatusError(true);
      setStatusKey("equipment.status.deleteFailed");
    }
  };

  const compare = () => {
    const recordA = history.find((record) => record.id === selectedA);
    const recordB = history.find((record) => record.id === selectedB);
    if (!recordA || !recordB || recordA.id === recordB.id) {
      setComparison([tEquipment(locale, "equipment.compare.needTwo")]);
      return;
    }
    setComparison(
      compareEquipmentRecords(
        locale,
        recordA,
        recordB,
        (record) => labelFor(locale, record.adjustmentType, ADJUSTMENTS),
        (record) => labelFor(locale, record.feedbackRating, FEEDBACK),
      ),
    );
  };

  const advice = ADVICE[draft?.symptomKey ?? "slide"];

  return (
    <section className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <h1 className="text-2xl font-bold text-brand-navy">{tAnalysis(locale, "analysis.equipment.title")}</h1>
        <h2 className="mt-3 text-lg font-bold text-brand-navy">{tEquipment(locale, "equipment.intro.title")}</h2>
        <p className="mt-1 text-sm text-brand-navy/80">{tEquipment(locale, "equipment.intro.body")}</p>

        <div className="mt-4">
          <label htmlFor="equip-symptom" className="mb-1 block text-sm font-semibold text-brand-navy">
            {tEquipment(locale, "equipment.symptom.label")}
          </label>
          <textarea
            id="equip-symptom"
            rows={3}
            value={symptomText}
            placeholder={tEquipment(locale, "equipment.symptom.placeholder")}
            onChange={(event) => setSymptomText(event.target.value)}
            className={INPUT_CLASS}
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SYMPTOMS.map((item) => (
              <Button
                key={item.key}
                variant={symptomKey === item.key && symptomText ? "brand" : "outline"}
                className="w-full"
                aria-pressed={symptomKey === item.key && symptomText.length > 0}
                onClick={() => {
                  setSymptomKey(item.key);
                  setSymptomText(tEquipment(locale, item.textKey));
                }}
              >
                {tEquipment(locale, item.labelKey)}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="equip-weight" className="mb-1 block text-sm font-semibold text-brand-navy">
              {tEquipment(locale, "equipment.field.weight")}
            </label>
            <input
              id="equip-weight"
              inputMode="decimal"
              value={formatDecimalDisplay(weight)}
              onChange={(event) => setWeight(formatDecimalDisplay(event.target.value))}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="equip-height" className="mb-1 block text-sm font-semibold text-brand-navy">
              {tEquipment(locale, "equipment.field.height")}
            </label>
            <input
              id="equip-height"
              inputMode="decimal"
              value={formatDecimalDisplay(height)}
              onChange={(event) => setHeight(formatDecimalDisplay(event.target.value))}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="equip-blade" className="mb-1 block text-sm font-semibold text-brand-navy">
              {tEquipment(locale, "equipment.field.blade")}
            </label>
            <input
              id="equip-blade"
              type="text"
              value={bladeLength}
              placeholder={tEquipment(locale, "equipment.field.bladePlaceholder")}
              onChange={(event) => setBladeLength(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-card border border-brand-navy/10 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-brand-navy/70">{tEquipment(locale, "equipment.discipline.label")}</p>
            <p className="text-sm font-semibold text-brand-navy">{tEquipment(locale, "equipment.discipline.value")}</p>
          </div>
          <span className="rounded-control border border-brand-navy/20 px-2 py-1 text-xs font-semibold text-brand-navy">
            {tEquipment(locale, "equipment.discipline.badge")}
          </span>
        </div>

        <Help title={tEquipment(locale, "equipment.rocker.helpTitle")} body={tEquipment(locale, "equipment.rocker.help")} />
        <RockerGrid
          locale={locale}
          title={tEquipment(locale, "equipment.rocker.left")}
          side="left"
          values={leftRocker}
          onChange={setLeftRocker}
        />
        <RockerGrid
          locale={locale}
          title={tEquipment(locale, "equipment.rocker.right")}
          side="right"
          values={rightRocker}
          onChange={setRightRocker}
        />

        <Help title={tEquipment(locale, "equipment.offset.helpTitle")} body={tEquipment(locale, "equipment.offset.help")} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            id="equip-offset-lf"
            label={tEquipment(locale, "equipment.offset.leftFront")}
            value={offsets.leftFront}
            placeholder={tEquipment(locale, "equipment.offset.frontPlaceholder")}
            onChange={(value) => setOffsets((current) => ({ ...current, leftFront: value }))}
          />
          <TextField
            id="equip-offset-lr"
            label={tEquipment(locale, "equipment.offset.leftRear")}
            value={offsets.leftRear}
            placeholder={tEquipment(locale, "equipment.offset.rearPlaceholder")}
            onChange={(value) => setOffsets((current) => ({ ...current, leftRear: value }))}
          />
          <TextField
            id="equip-offset-rf"
            label={tEquipment(locale, "equipment.offset.rightFront")}
            value={offsets.rightFront}
            placeholder={tEquipment(locale, "equipment.offset.frontPlaceholder")}
            onChange={(value) => setOffsets((current) => ({ ...current, rightFront: value }))}
          />
          <TextField
            id="equip-offset-rr"
            label={tEquipment(locale, "equipment.offset.rightRear")}
            value={offsets.rightRear}
            placeholder={tEquipment(locale, "equipment.offset.frontPlaceholder")}
            onChange={(value) => setOffsets((current) => ({ ...current, rightRear: value }))}
          />
        </div>

        <Help title={tEquipment(locale, "equipment.bend.helpTitle")} body={tEquipment(locale, "equipment.bend.help")} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField
            id="equip-bend-front"
            label={tEquipment(locale, "equipment.bend.front")}
            value={bend.front}
            placeholder={tEquipment(locale, "equipment.bend.frontPlaceholder")}
            onChange={(value) => setBend((current) => ({ ...current, front: value }))}
          />
          <TextField
            id="equip-bend-middle"
            label={tEquipment(locale, "equipment.bend.middle")}
            value={bend.middle}
            placeholder={tEquipment(locale, "equipment.bend.middlePlaceholder")}
            onChange={(value) => setBend((current) => ({ ...current, middle: value }))}
          />
          <TextField
            id="equip-bend-rear"
            label={tEquipment(locale, "equipment.bend.rear")}
            value={bend.rear}
            placeholder={tEquipment(locale, "equipment.bend.rearPlaceholder")}
            onChange={(value) => setBend((current) => ({ ...current, rear: value }))}
          />
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-brand-navy">{tEquipment(locale, "equipment.event.title")}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="equip-adjustment" className="mb-1 block text-sm font-semibold text-brand-navy">
                {tEquipment(locale, "equipment.event.type")}
              </label>
              <select
                id="equip-adjustment"
                value={adjustmentType}
                onChange={(event) => setAdjustmentType(event.target.value as EquipmentAdjustmentCode)}
                className={INPUT_CLASS}
              >
                {ADJUSTMENTS.map((item) => (
                  <option key={item.code} value={item.code}>
                    {tEquipment(locale, item.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="equip-feedback" className="mb-1 block text-sm font-semibold text-brand-navy">
                {tEquipment(locale, "equipment.event.feedback")}
              </label>
              <select
                id="equip-feedback"
                value={feedbackRating}
                onChange={(event) => setFeedbackRating(event.target.value as EquipmentFeedbackCode)}
                className={INPUT_CLASS}
              >
                {FEEDBACK.map((item) => (
                  <option key={item.code} value={item.code}>
                    {tEquipment(locale, item.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="equip-notes" className="sr-only">
            {tEquipment(locale, "equipment.event.notesPlaceholder")}
          </label>
          <textarea
            id="equip-notes"
            rows={2}
            value={adjustmentNotes}
            placeholder={tEquipment(locale, "equipment.event.notesPlaceholder")}
            onChange={(event) => setAdjustmentNotes(event.target.value)}
            className={`${INPUT_CLASS} mt-3`}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button className="w-full" onClick={generate}>
            {tEquipment(locale, "equipment.action.generate")}
          </Button>
          <Button variant="outline" className="w-full" disabled={!draft || saving} onClick={() => save()}>
            {tEquipment(locale, "equipment.action.save")}
          </Button>
        </div>
        {statusError ? (
          <ErrorNotice className="mt-3">{tEquipment(locale, statusKey)}</ErrorNotice>
        ) : (
          <p className="mt-3 text-center text-sm text-brand-navy/80" role="status">
            {tEquipment(locale, statusKey)}
          </p>
        )}
      </div>

      <div className="space-y-4 lg:col-span-7">
        {draft ? (
          <Card title={tEquipment(locale, "equipment.report.title")}>
            <p>
              {tEquipment(locale, "equipment.report.direction", {
                focus: tEquipment(locale, advice.focus),
              })}
            </p>
            <p className="mt-2 font-semibold text-brand-navy">
              {draft.missingCore
                ? tEquipment(locale, "equipment.badge.incomplete")
                : tEquipment(locale, "equipment.badge.ready")}
            </p>
            <h4 className="mt-4 font-semibold text-brand-navy">{tEquipment(locale, "equipment.report.summaryTitle")}</h4>
            <p className="mt-2 whitespace-pre-wrap">
              {tEquipment(locale, "equipment.report.body", {
                discipline: tEquipment(locale, "equipment.discipline.value"),
                symptom: draft.symptomText || tEquipment(locale, "equipment.symptom.empty"),
                height: draft.height ? `${draft.height}cm` : unrecorded,
                weight: draft.weight ? `${formatDecimalDisplay(draft.weight)}kg` : unrecorded,
                blade: draft.bladeLength || unrecorded,
                adjustment: labelFor(locale, draft.adjustmentType, ADJUSTMENTS),
                feedback: labelFor(locale, draft.feedbackRating, FEEDBACK),
                notes: draft.adjustmentNotes || unrecorded,
                rocker: `${rockerLine(locale, tEquipment(locale, "equipment.compare.leftFoot"), draft.leftRocker)} ${rockerLine(locale, tEquipment(locale, "equipment.compare.rightFoot"), draft.rightRocker)}`,
                offset: tEquipment(locale, "equipment.offset.summary", {
                  leftFront: draft.offsets.leftFront || unrecorded,
                  leftRear: draft.offsets.leftRear || unrecorded,
                  rightFront: draft.offsets.rightFront || unrecorded,
                  rightRear: draft.offsets.rightRear || unrecorded,
                }),
                bend: tEquipment(locale, "equipment.bend.summary", {
                  front: draft.bend.front || unrecorded,
                  middle: draft.bend.middle || unrecorded,
                  rear: draft.bend.rear || unrecorded,
                }),
              })}
            </p>
            <p className="mt-2">{tEquipment(locale, "equipment.report.hints")}</p>
            <ul className="mt-1 list-disc pl-5">
              {draft.ruleHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            {draft.missingCore ? <p className="mt-2">{tEquipment(locale, "equipment.report.incomplete")}</p> : null}
            <h4 className="mt-4 font-semibold text-brand-navy">{tEquipment(locale, "equipment.checklist.title")}</h4>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card title={tEquipment(locale, "equipment.action.rocker.title")}>
                <p className="font-semibold text-brand-navy">
                  {draft.missingCore
                    ? tEquipment(locale, "equipment.action.rocker.valueIncomplete")
                    : tEquipment(locale, "equipment.action.rocker.valueReady")}
                </p>
                <p className="mt-1">{tEquipment(locale, "equipment.action.rocker.detail")}</p>
                <p className="mt-1">
                  {tEquipment(locale, "equipment.action.rocker.advice", {
                    advice: tEquipment(locale, advice.rocker),
                  })}
                </p>
              </Card>
              <Card title={tEquipment(locale, "equipment.action.offset.title")}>
                <p className="font-semibold text-brand-navy">{tEquipment(locale, "equipment.action.offset.value")}</p>
                <p className="mt-1">{tEquipment(locale, "equipment.action.offset.detail")}</p>
                <p className="mt-1">
                  {tEquipment(locale, "equipment.action.offset.advice", {
                    advice: tEquipment(locale, advice.offset),
                  })}
                </p>
              </Card>
            </div>
            <Notice tone="pending" title={tEquipment(locale, "equipment.warning.label")} className="mt-4">
              {tEquipment(locale, "equipment.warning")}
            </Notice>
          </Card>
        ) : (
          <Card title={tEquipment(locale, "equipment.empty.title")}>
            <p>{tEquipment(locale, "equipment.empty.body")}</p>
            <p className="mt-2">
              {tEquipment(locale, "equipment.report.direction", {
                focus: tEquipment(locale, "equipment.report.pending"),
              })}
            </p>
          </Card>
        )}

        <Card title={tEquipment(locale, "equipment.history.title")}>
          <p>{tEquipment(locale, "equipment.history.body")}</p>
          {synced ? <p className="mt-2 font-semibold">{tEquipment(locale, "equipment.history.cloud")}</p> : null}
          {localOnly.length > 0 ? (
            <p className="mt-2 font-semibold">{tEquipment(locale, "equipment.history.local")}</p>
          ) : null}
          {history.length === 0 ? (
            <p className="mt-3">{tEquipment(locale, "equipment.history.empty")}</p>
          ) : (
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {history.map((record) => (
                <li key={record.id} className="rounded-card border border-brand-navy/10 p-3">
                  <p className="font-semibold text-brand-navy">
                    {tEquipment(locale, ADVICE[record.symptomKey].focus)}
                  </p>
                  <p className="text-xs">{formatWhen(locale, record.createdAt)}</p>
                  <p className="mt-1">{labelFor(locale, record.adjustmentType, ADJUSTMENTS)}</p>
                  <p>{record.symptomText || tEquipment(locale, "equipment.symptom.empty")}</p>
                  <p className="mt-2">{tEquipment(locale, "equipment.history.blade", { value: record.bladeLength || unrecorded })}</p>
                  <p>{tEquipment(locale, "equipment.history.weight", { value: formatDecimalDisplay(record.weight) || unrecorded })}</p>
                  <p>{labelFor(locale, record.feedbackRating, FEEDBACK)}</p>
                  <Button variant="danger-outline" className="mt-3" onClick={() => void remove(record.id)}>
                    {tEquipment(locale, "equipment.action.delete")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="equip-compare-a" className="mb-1 block text-sm font-semibold text-brand-navy">
                {tEquipment(locale, "equipment.history.compareA")}
              </label>
              <select id="equip-compare-a" value={selectedA} onChange={(event) => setCompareA(event.target.value)} className={INPUT_CLASS}>
                {history.length === 0 ? <option value="">{tEquipment(locale, "equipment.history.none")}</option> : null}
                {history.map((record) => (
                  <option key={record.id} value={record.id}>
                    {formatWhen(locale, record.createdAt)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="equip-compare-b" className="mb-1 block text-sm font-semibold text-brand-navy">
                {tEquipment(locale, "equipment.history.compareB")}
              </label>
              <select id="equip-compare-b" value={selectedB} onChange={(event) => setCompareB(event.target.value)} className={INPUT_CLASS}>
                {history.length === 0 ? <option value="">{tEquipment(locale, "equipment.history.none")}</option> : null}
                {history.map((record) => (
                  <option key={record.id} value={record.id}>
                    {formatWhen(locale, record.createdAt)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button variant="outline" className="mt-3" onClick={compare}>
            {tEquipment(locale, "equipment.action.compare")}
          </Button>
          {comparison ? (
            <div className="mt-3">
              <h4 className="font-semibold text-brand-navy">{tEquipment(locale, "equipment.compare.title")}</h4>
              <ul className="mt-2 list-disc pl-5">
                {comparison.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2">{tEquipment(locale, "equipment.compare.note")}</p>
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

function Help({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-card border border-brand-navy/10 p-3">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      <p className="mt-1 text-sm text-brand-navy/80">{body}</p>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-brand-navy">
        {label}
      </label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS} />
    </div>
  );
}

function RockerGrid({
  locale,
  title,
  side,
  values,
  onChange,
}: {
  locale: Locale;
  title: string;
  side: "left" | "right";
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-7">
        {ROCKER_POINTS.map((point) => {
          const id = `equip-rocker-${side}-${point}`;
          const name = pointName(locale, point);
          return (
            <div key={id}>
              <label htmlFor={id} className="sr-only">
                {name}
              </label>
              <input
                id={id}
                inputMode="decimal"
                value={values[String(point)] ?? ""}
                placeholder={name}
                onChange={(event) => onChange({ ...values, [String(point)]: event.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
