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
import { useAcademyImport } from "@/hooks/useAcademyImport";
import { useTrainingState, useUserSettings } from "@/app/providers/FirestoreProvider";

const WEEKDAYS: { key: WeekdayKey; labelZh: string; labelEn: string }[] = [
  { key: "monday", labelZh: "周一", labelEn: "Mon" },
  { key: "tuesday", labelZh: "周二", labelEn: "Tue" },
  { key: "wednesday", labelZh: "周三", labelEn: "Wed" },
  { key: "thursday", labelZh: "周四", labelEn: "Thu" },
  { key: "friday", labelZh: "周五", labelEn: "Fri" },
  { key: "saturday", labelZh: "周六", labelEn: "Sat" },
  { key: "sunday", labelZh: "周日", labelEn: "Sun" },
];

const stages = getAcademyStages();

export function TrainingAcademyPage() {
  const { data: settings } = useUserSettings();
  const { data: rawState, loading: tasksLoading } = useTrainingState();
  const isPro = Boolean(settings?.isPro);
  const {
    importItem,
    importDayPlan,
    importWeekdayRoutine,
    busy,
    actionError,
    lastResult,
    clearActionError,
    clearLastResult,
    language,
  } = useAcademyImport();

  const [stageId, setStageId] = useState(stages[0]?.id ?? "age4_6");
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(
    stages[0]?.modules[0]?.id ?? null,
  );
  const [routineWeekday, setRoutineWeekday] = useState<WeekdayKey>("tuesday");

  const isEn = language === "en";
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
    if (!stage) {
      return;
    }
    clearActionError();
    clearLastResult();
    await importDayPlan(stage, planId);
  }

  async function handleImportWeekday() {
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
        <p className="text-sm text-slate-600">Academy content is not available.</p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">BLAZE SKATE Academy</h1>
      <p className="mt-1 text-slate-600">
        {isEn
          ? "Professional dryland training — import items into today’s task list."
          : "全周期速滑专业陆地训练 — 将训练项导入今日任务。"}
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {actionError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {lastResult ? (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {isEn
            ? `Imported ${lastResult.imported}, skipped ${lastResult.skipped} (already on today’s list).`
            : `已导入 ${lastResult.imported} 项，跳过 ${lastResult.skipped} 项（今日已存在）。`}
          <Link to="/training/tasks" className="ml-2 font-medium underline">
            {isEn ? "View tasks" : "查看任务"}
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
                ? "rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {s.ageRange}
          </button>
        ))}
      </div>

      <Card title={localizeStageLabel(stage, language)} className="mt-4">
        <p className="text-sm text-slate-600">
          {isEn ? stage.overviewEn : stage.overviewZh}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-500">
              {isEn ? "Duration" : "时长"}
            </dt>
            <dd>{isEn ? stage.durationEn : stage.durationZh}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">
              {isEn ? "Frequency" : "频率"}
            </dt>
            <dd>{isEn ? stage.frequencyEn : stage.frequencyZh}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">
              {isEn ? "Focus" : "风格"}
            </dt>
            <dd>{isEn ? stage.coreFocusEn : stage.coreFocusZh}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {isEn ? "Training modules" : "训练模块"}
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
                {isEn ? module.titleEn : module.titleZh}
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
                            {item.category}
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
                            className="!px-3 !py-1.5 text-xs"
                          >
                            {alreadyAdded
                              ? isEn
                                ? "Added"
                                : "已添加"
                              : busy
                                ? "…"
                                : isEn
                                  ? "Add to today"
                                  : "导入今日"}
                          </Button>
                        </div>
                        {item.tags.length > 0 ? (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {item.tags.join(" · ")}
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
          {isEn ? stage.weeklyRoutine.titleEn : stage.weeklyRoutine.titleZh}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {isEn
            ? "Reference weekly plans — import one day at a time into today’s tasks."
            : "参考周计划 — 按天导入到今日任务（不会一次性导入整周）。"}
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="font-medium text-slate-700">
              {isEn ? "Import weekday routine" : "导入指定星期"}
            </span>
            <select
              value={routineWeekday}
              onChange={(e) => setRoutineWeekday(e.target.value as WeekdayKey)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            >
              {WEEKDAYS.map((d) => (
                <option key={d.key} value={d.key}>
                  {isEn ? d.labelEn : d.labelZh}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleImportWeekday()}
          >
            {busy
              ? isEn
                ? "Importing…"
                : "导入中…"
              : isEn
                ? "Import day"
                : "导入该日"}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {stage.weeklyRoutine.dayPlans.map((plan) => (
            <Card key={plan.id} title={`${isEn ? plan.dayLabelEn : plan.dayLabelZh} · ${isEn ? plan.titleEn : plan.titleZh}`}>
              <p className="text-xs text-slate-500">
                {isEn ? plan.durationEn : plan.durationZh}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {plan.taskLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <Button
                type="button"
                className="mt-3 w-full sm:w-auto"
                disabled={busy}
                onClick={() => void handleImportDayPlan(plan.id)}
              >
                {busy
                  ? isEn
                    ? "Importing…"
                    : "导入中…"
                  : isEn
                    ? "Import this plan to today"
                    : "导入本日到今日任务"}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <Card title={isEn ? "PRO features (coming later)" : "PRO 功能（即将推出）"} className="mt-8">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>{isEn ? "Advanced routines & custom plans" : "高阶训练计划与自定义方案"}</li>
          <li>{isEn ? "AI Coach integration" : "AI 教练联动"}</li>
          <li>{isEn ? "Custom reward management" : "自定义奖励管理"}</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          {isPro
            ? isEn
              ? "PRO flag is on (dev). Academy import remains available in M6."
              : "PRO 已开启（开发）。M6 学院导入功能仍可使用。"
            : isEn
              ? "Enable PRO in Settings for development testing. Payment not integrated."
              : "可在设置中开启 PRO 进行开发测试，支付尚未接入。"}
        </p>
      </Card>
    </section>
  );
}
