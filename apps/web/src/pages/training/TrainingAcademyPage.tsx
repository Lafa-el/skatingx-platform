import {
  getAcademyStages,
  localizeAcademyItem,
  localizeStageLabel,
  type AcademyItem,
  type WeekdayKey,
} from "@skatingx/content";
import { hasAcademyItemImportedToday } from "@skatingx/skating-domain";
import { Button, Card } from "@skatingx/ui";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { ProLockedCard, ProPlanBanner } from "@/components/ProPlanBanner";
import { useAcademyImport } from "@/hooks/useAcademyImport";
import { useIsPro } from "@/hooks/useIsPro";
import { useTrainingState } from "@/app/providers/FirestoreProvider";
import {
  type AcademyMessageKey,
  formatAcademyCategory,
  tAcademy,
} from "@/shared/i18n/academy-messages";
import { localized } from "@/shared/i18n/localized";

/** Weekdays in the order of the week; the label of each is looked up by its key. */
const WEEKDAYS: { key: WeekdayKey; labelKey: AcademyMessageKey }[] = [
  { key: "monday", labelKey: "academy.weekday.monday" },
  { key: "tuesday", labelKey: "academy.weekday.tuesday" },
  { key: "wednesday", labelKey: "academy.weekday.wednesday" },
  { key: "thursday", labelKey: "academy.weekday.thursday" },
  { key: "friday", labelKey: "academy.weekday.friday" },
  { key: "saturday", labelKey: "academy.weekday.saturday" },
  { key: "sunday", labelKey: "academy.weekday.sunday" },
];

const stages = getAcademyStages();

export function TrainingAcademyPage() {
  const { isPro, language } = useIsPro();
  const t = (key: AcademyMessageKey, params?: Record<string, string | number>) =>
    tAcademy(language, key, params);
  const { data: rawState, loading: tasksLoading } = useTrainingState();
  const {
    importItem,
    importDayPlan,
    importWeekdayRoutine,
    busy,
    actionError,
    lastResult,
    clearActionError,
    clearLastResult,
  } = useAcademyImport();

  const [stageId, setStageId] = useState(stages[0]?.id ?? "age4_6");
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(
    stages[0]?.modules[0]?.id ?? null,
  );
  const [routineWeekday, setRoutineWeekday] = useState<WeekdayKey>("tuesday");

  const todayTasks = rawState?.todayTasks ?? [];

  const stage = useMemo(
    () => stages.find((s) => s.id === stageId) ?? stages[0],
    [stageId],
  );

  async function handleImportItem(item: AcademyItem) {
    clearActionError();
    clearLastResult();
    await importItem(item);
  }

  async function handleImportDayPlan(planId: string) {
    if (!isPro) {
      return;
    }
    if (!stage) {
      return;
    }
    clearActionError();
    clearLastResult();
    await importDayPlan(stage, planId);
  }

  async function handleImportWeekday() {
    if (!isPro) {
      return;
    }
    if (!stage) {
      return;
    }
    clearActionError();
    clearLastResult();
    await importWeekdayRoutine(stage, routineWeekday);
  }

  if (!stage) {
    return (
      <section>
        <p className="text-sm text-slate-600">{t("academy.unavailable")}</p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">{t("academy.title")}</h1>
      <p className="mt-1 text-slate-600">{t("academy.subtitle")}</p>

      <FirestoreStatusBanner className="mt-4" />
      <ProPlanBanner isPro={isPro} locale={language} className="mt-4" />

      {actionError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {lastResult ? (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {t("academy.import.result", {
            imported: lastResult.imported,
            skipped: lastResult.skipped,
          })}
          <Link to="/training/tasks" className="ml-2 inline-flex min-h-11 items-center font-medium underline">
            {t("academy.import.viewTasks")}
          </Link>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {stages.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setStageId(s.id);
              setExpandedModuleId(s.modules[0]?.id ?? null);
            }}
            className={
              stageId === s.id
                ? "min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                : "min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {localized(language, { zh: s.ageRangeZh, en: s.ageRangeEn })}
          </button>
        ))}
      </div>

      <Card title={localizeStageLabel(stage, language)} className="mt-4">
        <p className="text-sm text-slate-600">
          {localized(language, { zh: stage.overviewZh, en: stage.overviewEn })}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-500">{t("academy.stage.duration")}</dt>
            <dd>{localized(language, { zh: stage.durationZh, en: stage.durationEn })}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">{t("academy.stage.frequency")}</dt>
            <dd>{localized(language, { zh: stage.frequencyZh, en: stage.frequencyEn })}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">{t("academy.stage.focus")}</dt>
            <dd>{localized(language, { zh: stage.coreFocusZh, en: stage.coreFocusEn })}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("academy.modules.title")}
        </h2>
        {stage.modules.map((module) => {
          const expanded = expandedModuleId === module.id;
          return (
            <div
              key={module.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                onClick={() =>
                  setExpandedModuleId(expanded ? null : module.id)
                }
              >
                {localized(language, { zh: module.titleZh, en: module.titleEn })}
                <span className="text-slate-400">{expanded ? "−" : "+"}</span>
              </button>
              {expanded ? (
                <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-2">
                  {module.items.map((item) => {
                    const localized = localizeAcademyItem(item, language);
                    const alreadyAdded = hasAcademyItemImportedToday(
                      todayTasks,
                      item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">
                              {localized.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {localized.description}
                            </p>
                          </div>
                          <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-sky-800 ring-1 ring-slate-200">
                            {formatAcademyCategory(item.category, language)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-sky-700">
                            {localized.target}
                          </span>
                          <Button
                            type="button"
                            disabled={busy || alreadyAdded || tasksLoading}
                            onClick={() => void handleImportItem(item)}
                            className="min-h-11 !px-3 !py-1.5 text-xs"
                          >
                            {alreadyAdded
                              ? t("academy.item.added")
                              : busy
                                ? "…"
                                : t("academy.item.add")}
                          </Button>
                        </div>
                        {localized.tags.length > 0 ? (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {localized.tags.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-8 border-t border-dashed border-slate-200 pt-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {localized(language, {
            zh: stage.weeklyRoutine.titleZh,
            en: stage.weeklyRoutine.titleEn,
          })}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {t("academy.routine.proTag")}
          </span>
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("academy.routine.intro")}</p>

        {!isPro ? (
          <ProLockedCard
            locale={language}
            message={t("academy.routine.lock")}
            className="mt-4"
          />
        ) : null}

        <div className={!isPro ? "mt-4 pointer-events-none opacity-50" : "mt-4"}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="font-medium text-slate-700">
                {t("academy.routine.weekday")}
              </span>
              <select
                value={routineWeekday}
                disabled={!isPro}
                onChange={(e) => setRoutineWeekday(e.target.value as WeekdayKey)}
                className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {t(d.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || !isPro}
              onClick={() => void handleImportWeekday()}
            >
              {busy ? t("academy.routine.importing") : t("academy.routine.importDay")}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {stage.weeklyRoutine.dayPlans.map((plan) => (
              <Card
                key={plan.id}
                title={`${localized(language, { zh: plan.dayLabelZh, en: plan.dayLabelEn })} · ${localized(language, { zh: plan.titleZh, en: plan.titleEn })}`}
              >
                <p className="text-xs text-slate-500">
                  {localized(language, { zh: plan.durationZh, en: plan.durationEn })}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {localized(language, { zh: plan.taskLabelsZh, en: plan.taskLabelsEn }).map((label, index) => (
                    <span
                      // The Chinese label is the stable key: the English ones need not be unique.
                      key={plan.taskLabelsZh[index]}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <Button
                  type="button"
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={busy || !isPro}
                  onClick={() => void handleImportDayPlan(plan.id)}
                >
                  {busy ? t("academy.routine.importing") : t("academy.routine.importPlan")}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {isPro ? (
        <Card title={t("academy.pro.title")} className="mt-8">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>{t("academy.pro.import")}</li>
            <li>{t("academy.pro.custom")}</li>
            <li>{t("academy.pro.coach")}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">{t("academy.pro.note")}</p>
        </Card>
      ) : null}
    </section>
  );
}
